import { agentLoop, looksLikeConfirmation } from "./agent-loop.ts";
import { AuditLog } from "./audit.ts";
import { id } from "./ids.ts";
import { nowIso } from "./ids.ts";
import type { SessionStore } from "./session.ts";
import type { AgentEvent, GuestSession, Message, ModelProvider } from "./types.ts";
import type { Workflow, WorkflowRegistry } from "./workflow.ts";

export interface RuntimeOptions {
  registry: WorkflowRegistry;
  sessions: SessionStore;
  audit: AuditLog;
  provider: ModelProvider;
}

export class RhoRuntime {
  constructor(private readonly options: RuntimeOptions) {}

  startSession(workflowId: string, channel: GuestSession["channel"] = "web"): GuestSession {
    const workflow = this.options.registry.get(workflowId);
    const session = this.options.sessions.create(workflowId, workflow.createState(), channel);
    this.options.audit.record({
      at: nowIso(),
      sessionId: session.id,
      type: "session_started",
      summary: `Started ${workflow.name} session on ${channel}`,
    });
    return session;
  }

  getSession(sessionId: string): GuestSession {
    return this.options.sessions.get(sessionId);
  }

  workflowFor(session: GuestSession): Workflow {
    return this.options.registry.get(session.workflowId);
  }

  publicState(session: GuestSession): unknown {
    const workflow = this.workflowFor(session);
    return workflow.publicState ? workflow.publicState(session.state) : session.state;
  }

  async *chat(sessionId: string, userText: string): AsyncGenerator<AgentEvent> {
    const session = this.options.sessions.get(sessionId);
    const workflow = this.workflowFor(session);
    const runId = id("run");
    const userMessage: Message = {
      id: id("msg"),
      role: "user",
      content: userText,
      createdAt: nowIso(),
    };
    session.messages.push(userMessage);
    this.options.sessions.save(session);
    yield { type: "message", message: userMessage };

    const ctx = {
      session,
      state: session.state,
      save: () => {
        this.options.sessions.save(session);
      },
    };
    const tools = workflow.tools(ctx);
    const system = workflow.systemPrompt(ctx);

    this.options.audit.record({
      at: nowIso(),
      sessionId,
      runId,
      type: "user_message",
      summary: "Customer message received",
    });

    for await (const event of agentLoop({
      sessionId,
      runId,
      system,
      messages: session.messages,
      tools,
      policy: workflow.policy,
      provider: this.options.provider,
      userConfirmed: looksLikeConfirmation(userText),
    })) {
      if (event.type === "message" && event.message.role !== "user") {
        session.messages.push(event.message);
        this.options.sessions.save(session);
      }
      if (event.type === "tool_execution_end") {
        const auditEvent = this.options.audit.record({
          at: nowIso(),
          sessionId,
          runId,
          type: event.isError ? "tool_error" : "tool_success",
          toolName: event.toolName,
          summary: `${event.toolName} ${event.isError ? "failed" : "completed"}`,
          data: { args: event.result.details ?? event.result.content },
        });
        yield { type: "audit", event: auditEvent };
        yield { type: "state", state: this.publicState(session) };
      }
      yield event;
    }
    this.options.sessions.save(session);
  }
}
