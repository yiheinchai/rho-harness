import type { AgentTool, Brand, GuestSession, PolicyConfig } from "./types.ts";
import { defaultPolicy } from "./policy.ts";

export interface WorkflowContext<TState> {
  session: GuestSession<TState>;
  state: TState;
  save(): void;
}

export interface Workflow<TState = Record<string, unknown>> {
  id: string;
  name: string;
  description: string;
  brand: Brand;
  suggestedPrompts: string[];
  policy: PolicyConfig;
  createState: () => TState;
  tools: (ctx: WorkflowContext<TState>) => AgentTool[];
  systemPrompt: (ctx: WorkflowContext<TState>) => string;
  publicState?: (state: TState) => unknown;
}

export function defineWorkflow<TState>(config: Omit<Workflow<TState>, "policy"> & { policy?: Partial<PolicyConfig> }): Workflow<TState> {
  const toolsProbe = config.tools({
    session: {
      id: "probe",
      workflowId: config.id,
      channel: "api",
      createdAt: "",
      updatedAt: "",
      messages: [],
      state: config.createState(),
    },
    state: config.createState(),
    save() {},
  });
  return {
    ...config,
    suggestedPrompts: config.suggestedPrompts ?? [],
    policy: defaultPolicy(
      config.policy?.allowedTools ?? toolsProbe.map((tool) => tool.name),
      config.policy,
    ),
  };
}

export class WorkflowRegistry {
  private workflows = new Map<string, Workflow<any>>();

  register(workflow: Workflow<any>): void {
    this.workflows.set(workflow.id, workflow);
  }

  get<TState = Record<string, unknown>>(id: string): Workflow<TState> {
    const workflow = this.workflows.get(id);
    if (!workflow) throw new Error(`Unknown workflow "${id}"`);
    return workflow as Workflow<TState>;
  }

  list(): Workflow[] {
    return [...this.workflows.values()];
  }
}
