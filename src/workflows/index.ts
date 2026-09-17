import { arcadeBurgersWorkflow } from "./arcade-burgers/index.ts";
import { harborHealthWorkflow } from "./harbor-health/index.ts";
import { WorkflowRegistry } from "../core/workflow.ts";

export function createRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();
  registry.register(arcadeBurgersWorkflow);
  registry.register(harborHealthWorkflow);
  return registry;
}

export { arcadeBurgersWorkflow, harborHealthWorkflow };
