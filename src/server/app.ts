import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import type { RhoRuntime } from "../core/runtime.ts";
import type { WorkflowRegistry } from "../core/workflow.ts";
import type { AuditLog } from "../core/audit.ts";
import type { ModelProvider } from "../core/types.ts";

export function createApp(options: {
  runtime: RhoRuntime;
  registry: WorkflowRegistry;
  audit: AuditLog;
  provider: ModelProvider;
}): Hono {
  const app = new Hono();
  const { runtime, registry, audit, provider } = options;

  app.use("/api/*", cors());

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "rho-harness",
      provider: provider.id,
      workflows: registry.list().map((workflow) => workflow.id),
    }),
  );

  app.get("/api/workflows", (c) =>
    c.json({
      workflows: registry.list().map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        brand: workflow.brand,
        suggestedPrompts: workflow.suggestedPrompts,
        tools: workflow.policy.allowedTools,
      })),
    }),
  );

  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { workflowId?: string; channel?: "web" | "api" };
    const workflowId = body.workflowId ?? "arcade-burgers";
    const session = runtime.startSession(workflowId, body.channel ?? "web");
    const workflow = runtime.workflowFor(session);
    return c.json({
      session,
      brand: workflow.brand,
      suggestedPrompts: workflow.suggestedPrompts,
      state: runtime.publicState(session),
      provider: provider.id,
    });
  });

  app.get("/api/sessions/:id", (c) => {
    const session = runtime.getSession(c.req.param("id"));
    const workflow = runtime.workflowFor(session);
    return c.json({
      session: { ...session, state: runtime.publicState(session) },
      brand: workflow.brand,
      suggestedPrompts: workflow.suggestedPrompts,
      provider: provider.id,
    });
  });

  app.get("/api/sessions/:id/audit", (c) => c.json({ events: audit.list(c.req.param("id")) }));

  app.post("/api/sessions/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const body = (await c.req.json()) as { content?: string };
    const content = body.content?.trim();
    if (!content) return c.json({ error: "content is required" }, 400);

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of runtime.chat(sessionId, content)) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await stream.writeSSE({ event: "error", data: JSON.stringify({ type: "error", message }) });
      }
    });
  });

  app.get("/", (c) => c.html(readFileSync(join(process.cwd(), "web/index.html"), "utf8")));
  app.use("/*", serveStatic({ root: "./web" }));
  return app;
}
