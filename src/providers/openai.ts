import type { CompletionRequest, CompletionResult, Message, ModelProvider, ToolCall } from "../core/types.ts";
import { id } from "../core/ids.ts";
import { MockProvider } from "./mock.ts";

interface OpenAIToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

function toOpenAI(messages: Message[]): OpenAIMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId ?? "tool",
          content: message.content,
        };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
          })),
        } as OpenAIMessage;
      }
      return { role: message.role, content: message.content };
    });
}

export class OpenAIProvider implements ModelProvider {
  id = "openai";

  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY ?? "",
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    private readonly model = process.env.RHO_MODEL ?? "gpt-4o-mini",
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        messages: [{ role: "system", content: req.system }, ...toOpenAI(req.messages)],
        tools: req.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters ?? { type: "object", properties: {} },
          },
        })),
      }),
      signal: req.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI-compatible provider failed (${response.status}): ${body.slice(0, 400)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: OpenAIMessage }>;
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Provider returned no message");
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function?.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return {
        id: call.id ?? id("call"),
        name: call.function?.name ?? "unknown",
        arguments: parsed,
      };
    });
    return { text: message.content ?? "", toolCalls };
  }
}

export function createProvider(): ModelProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAIProvider();
  return new MockProvider();
}

export { MockProvider } from "./mock.ts";
