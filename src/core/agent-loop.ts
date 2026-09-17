import { SchemaError, validateArgs } from "./schema.ts";
import { assertToolAllowed, assertToolBudget, PolicyError } from "./policy.ts";
import { id, nowIso } from "./ids.ts";
import type {
  AgentEvent,
  AgentTool,
  CompletionResult,
  Message,
  ModelProvider,
  PolicyConfig,
  ToolCall,
  ToolResult,
} from "./types.ts";

export interface LoopInput {
  sessionId: string;
  runId: string;
  system: string;
  messages: Message[];
  tools: AgentTool[];
  policy: PolicyConfig;
  provider: ModelProvider;
  userConfirmed: boolean;
  signal?: AbortSignal;
}

function toolSpecs(tools: AgentTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function chunkText(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/(\s+)/);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    buf += part;
    if (buf.length >= 18) {
      chunks.push(buf);
      buf = "";
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function findTool(tools: AgentTool[], name: string): AgentTool | undefined {
  return tools.find((tool) => tool.name === name);
}

function errorResult(message: string): ToolResult {
  return { content: message, isError: true, details: { error: message } };
}

export async function* agentLoop(input: LoopInput): AsyncGenerator<AgentEvent> {
  const { sessionId, runId, system, tools, policy, provider, signal } = input;
  const messages = [...input.messages];
  yield { type: "agent_start", runId, sessionId };

  for (let turn = 1; turn <= policy.maxTurns; turn += 1) {
    yield { type: "turn_start", turn };
    let completion: CompletionResult;
    try {
      completion = await provider.complete({
        system,
        messages,
        tools: toolSpecs(tools),
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield { type: "error", message };
      yield { type: "agent_end", runId, sessionId };
      return;
    }

    const assistant: Message = {
      id: id("msg"),
      role: "assistant",
      content: completion.text ?? "",
      toolCalls: completion.toolCalls?.length ? completion.toolCalls : undefined,
      createdAt: nowIso(),
    };
    messages.push(assistant);
    for (const chunk of chunkText(assistant.content)) {
      yield { type: "text_delta", text: chunk };
    }
    yield { type: "message", message: assistant };

    const calls = completion.toolCalls ?? [];
    if (!calls.length) {
      yield { type: "turn_end", turn };
      yield { type: "agent_end", runId, sessionId };
      return { messages };
    }

    let budgetError: string | undefined;
    try {
      assertToolBudget(policy, calls);
    } catch (error) {
      budgetError = error instanceof Error ? error.message : String(error);
    }

    const toRun: ToolCall[] = budgetError ? [] : calls;
    if (budgetError) {
      const toolMessage: Message = {
        id: id("msg"),
        role: "tool",
        toolName: "policy",
        content: budgetError,
        createdAt: nowIso(),
      };
      messages.push(toolMessage);
      yield { type: "message", message: toolMessage };
    }

    for (const call of toRun) {
      const toolCallId = call.id || id("call");
      yield { type: "tool_execution_start", toolCallId, toolName: call.name, args: call.arguments };
      let result: ToolResult;
      let isError = false;
      try {
        assertToolAllowed(policy, call.name);
        const tool = findTool(tools, call.name);
        if (!tool) throw new PolicyError(`Unknown tool ${call.name}`);
        if (tool.sensitive && !input.userConfirmed) {
          throw new PolicyError(
            `Tool "${call.name}" is sensitive and needs explicit customer confirmation (e.g. "yes, place the order").`,
          );
        }
        const args = validateArgs(tool.parameters, call.arguments ?? {});
        result = await tool.execute(args, { sessionId, runId, toolCallId, signal });
        isError = Boolean(result.isError);
      } catch (error) {
        isError = true;
        const message =
          error instanceof SchemaError || error instanceof PolicyError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        result = errorResult(message);
      }
      yield { type: "tool_execution_end", toolCallId, toolName: call.name, result, isError };
      const toolMessage: Message = {
        id: id("msg"),
        role: "tool",
        toolCallId,
        toolName: call.name,
        content: result.content,
        createdAt: nowIso(),
      };
      messages.push(toolMessage);
      yield { type: "message", message: toolMessage };
      if (result.terminate) {
        yield { type: "turn_end", turn };
        yield { type: "agent_end", runId, sessionId };
        return { messages };
      }
    }
    yield { type: "turn_end", turn };
  }

  yield {
    type: "error",
    message: "This conversation hit the workflow turn limit. A teammate can pick it up from the audit log.",
  };
  yield { type: "agent_end", runId, sessionId };
  return { messages };
}

export function looksLikeConfirmation(text: string): boolean {
  return /\b(yes|yeah|yep|yup|confirm|confirmed|place( the)? order|pay|go ahead|do it|that's right|that is right|looks good|please proceed|submit)\b/i.test(
    text,
  );
}
