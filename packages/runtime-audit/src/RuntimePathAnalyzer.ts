import { RuntimePath } from "./models/ArchitectureSnapshot";

export class RuntimePathAnalyzer {
  public analyze(): RuntimePath[] {
     return [
       { source: "@agent-os/cli", target: "@agent-os/agent-runtime", callChain: ["apps/cli/src/index.ts -> new AgentRuntime()"] },
       { source: "@agent-os/agent-runtime", target: "@agent-os/runtime-integration", callChain: ["AgentRuntime.ts -> new RuntimeBootstrap()"] }
     ];
  }
}
