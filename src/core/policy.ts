import type { PolicyConfig, ToolCall } from "./types.ts";

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export function assertToolAllowed(policy: PolicyConfig, name: string): void {
  if (policy.deniedTools?.includes(name) || !policy.allowedTools.includes(name)) {
    throw new PolicyError(`Tool "${name}" is not on this workflow allowlist`);
  }
}

export function assertToolBudget(policy: PolicyConfig, calls: ToolCall[]): void {
  if (calls.length > policy.maxToolCallsPerTurn) {
    throw new PolicyError(
      `Model requested ${calls.length} tools; max per turn is ${policy.maxToolCallsPerTurn}`,
    );
  }
}

export function defaultPolicy(allowedTools: string[], extras: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    allowedTools,
    deniedTools: ["bash", "read", "write", "edit", "shell", "python"],
    maxTurns: 8,
    maxToolCallsPerTurn: 6,
    sensitiveTools: [],
    piiTools: [],
    ...extras,
  };
}
