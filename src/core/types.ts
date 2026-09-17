export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface ToolResult {
  content: string;
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}

export interface ToolExecuteContext {
  sessionId: string;
  runId: string;
  toolCallId: string;
  signal?: AbortSignal;
}

export interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: import("./schema.ts").JsonSchema;
  sensitive?: boolean;
  pii?: boolean;
  executionMode?: "sequential" | "parallel";
  execute: (args: Record<string, unknown>, ctx: ToolExecuteContext) => Promise<ToolResult>;
}

export type ToolSpec = Pick<AgentTool, "name" | "description" | "parameters">;

export interface CompletionRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface ModelProvider {
  id: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface PolicyConfig {
  allowedTools: string[];
  deniedTools?: string[];
  maxTurns: number;
  maxToolCallsPerTurn: number;
  sensitiveTools?: string[];
  piiTools?: string[];
}

export interface AuditEvent {
  at: string;
  sessionId: string;
  runId?: string;
  type: string;
  toolName?: string;
  summary: string;
  data?: unknown;
}

export interface Brand {
  name: string;
  tagline: string;
  tone: string;
  disclaimer?: string;
  colors: {
    bg: string;
    panel: string;
    primary: string;
    accent: string;
    text: string;
    muted: string;
  };
}

export interface GuestSession<TState = Record<string, unknown>> {
  id: string;
  workflowId: string;
  channel: "web" | "cli" | "api";
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  state: TState;
}

export type AgentEvent =
  | { type: "agent_start"; runId: string; sessionId: string }
  | { type: "agent_end"; runId: string; sessionId: string }
  | { type: "turn_start"; turn: number }
  | { type: "turn_end"; turn: number }
  | { type: "text_delta"; text: string }
  | { type: "message"; message: Message }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: ToolResult;
      isError: boolean;
    }
  | { type: "state"; state: unknown }
  | { type: "audit"; event: AuditEvent }
  | { type: "error"; message: string };
