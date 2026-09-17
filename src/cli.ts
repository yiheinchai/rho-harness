import { serve } from "@hono/node-server";
import { AuditLog } from "./core/audit.ts";
import { RhoRuntime } from "./core/runtime.ts";
import { SessionStore } from "./core/session.ts";
import { createProvider } from "./providers/openai.ts";
import { createApp } from "./server/app.ts";
import { createRegistry } from "./workflows/index.ts";

function arg(flag: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function createRuntime() {
  const registry = createRegistry();
  const sessions = new SessionStore();
  const audit = new AuditLog();
  const provider = createProvider();
  const runtime = new RhoRuntime({ registry, sessions, audit, provider });
  return { registry, sessions, audit, provider, runtime };
}

async function collectChat(runtime: RhoRuntime, sessionId: string, text: string): Promise<string> {
  let spoken = "";
  for await (const event of runtime.chat(sessionId, text)) {
    if (event.type === "text_delta") spoken += event.text;
    if (event.type === "tool_execution_start") {
      process.stdout.write(`  ↳ ${event.toolName}\n`);
    }
  }
  return spoken.trim();
}

async function cmdServe(): Promise<void> {
  const port = Number(arg("--port", process.env.PORT ?? "8787"));
  const { runtime, registry, audit, provider } = createRuntime();
  const app = createApp({ runtime, registry, audit, provider });
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
  console.log(`Rho harness listening on http://127.0.0.1:${port}`);
  console.log(`Provider: ${provider.id}`);
  console.log(`Workflows: ${registry.list().map((workflow) => workflow.id).join(", ")}`);
  console.log("Open the URL and complete an Arcade Burgers order as a customer.");
}

async function cmdChat(): Promise<void> {
  const workflowId = arg("--workflow", "arcade-burgers")!;
  const parts: string[] = [];
  const argv = process.argv.slice(3);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--workflow" || argv[i] === "--port") {
      i += 1;
      continue;
    }
    if (argv[i].startsWith("--")) continue;
    parts.push(argv[i]);
  }
  const text = parts.join(" ").trim();
  if (!text) {
    console.error('Usage: npm run chat -- --workflow arcade-burgers "I want an Arcade Burger meal"');
    process.exit(1);
  }
  const { runtime, provider } = createRuntime();
  const session = runtime.startSession(workflowId, "cli");
  console.log(`Session ${session.id} (${provider.id})`);
  const reply = await collectChat(runtime, session.id, text);
  if (reply) console.log(reply);
  const state = runtime.publicState(session) as { orders?: unknown; cart?: unknown };
  console.log(JSON.stringify(state, null, 2));
}

async function cmdDemo(): Promise<void> {
  const { runtime, provider, audit } = createRuntime();
  const session = runtime.startSession("arcade-burgers", "cli");
  console.log(`Arcade Burgers guest demo [${provider.id}] session=${session.id}`);
  const turns = [
    "Hi, what's on the burger menu?",
    "I'll take an Arcade Burger meal, large, with a Coke, no pickles. Pickup. Name is Sam.",
    "Yes, place the order",
  ];
  for (const turn of turns) {
    console.log(`\nGuest: ${turn}`);
    const reply = await collectChat(runtime, session.id, turn);
    if (reply) console.log(`Cashier: ${reply}`);
  }
  const snapshot = runtime.publicState(session) as {
    orders?: Array<{ number: string; total: string; status: string; method: string }>;
  };
  const order = snapshot.orders?.[0];
  if (!order) {
    console.error("Demo failed: no order was placed.");
    process.exit(1);
  }
  console.log(`\nTicket ${order.number} ${order.total} ${order.method} (${order.status})`);
  console.log(`Audit events: ${audit.list(session.id).length}`);
}

function cmdWorkflows(): void {
  const { registry } = createRuntime();
  for (const workflow of registry.list()) {
    console.log(`${workflow.id}\t${workflow.name}\t${workflow.description}`);
  }
}

const command = process.argv[2] ?? "serve";
if (has("--help") || command === "help") {
  console.log(`Rho — customer workflow harness\n\nCommands:\n  serve [--port 8787]     Run the guest chat server\n  demo                    Place a scripted Arcade Burgers order\n  chat --workflow id text Talk to a workflow from the terminal\n  workflows               List installed enterprise workflows\n`);
  process.exit(0);
}

const commands: Record<string, () => Promise<void> | void> = {
  serve: cmdServe,
  demo: cmdDemo,
  chat: cmdChat,
  workflows: cmdWorkflows,
};

const fn = commands[command];
if (!fn) {
  console.error(`Unknown command ${command}`);
  process.exit(1);
}
await fn();
