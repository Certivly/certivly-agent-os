import { describe, it, expect } from "bun:test";
import { TaskGraph } from "../src/TaskGraph";
import { TaskNode, TaskType } from "../src/models";

describe("TaskGraph", () => {
  it("should build a graph and determine ready nodes", () => {
    const graph = new TaskGraph();

    const task1: TaskNode = { id: "1", type: TaskType.ANALYZE, title: "T1", dependencies: [], status: "pending" };
    const task2: TaskNode = { id: "2", type: TaskType.SEARCH, title: "T2", dependencies: ["1"], status: "pending" };
    
    graph.addNode(task1);
    graph.addNode(task2);
    graph.addDependency({ fromTaskId: "1", toTaskId: "2" });

    // T1 is ready, T2 is not
    let ready = graph.getReadyNodes();
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("1");

    // Complete T1
    graph.updateNodeStatus("1", "completed");

    // Now T2 is ready
    ready = graph.getReadyNodes();
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("2");
  });

  it("should detect cycles in the DAG", () => {
    const graph = new TaskGraph();

    const task1: TaskNode = { id: "1", type: TaskType.ANALYZE, title: "T1", dependencies: ["2"], status: "pending" };
    const task2: TaskNode = { id: "2", type: TaskType.SEARCH, title: "T2", dependencies: ["1"], status: "pending" };
    
    graph.addNode(task1);
    graph.addNode(task2);
    graph.addDependency({ fromTaskId: "1", toTaskId: "2" });
    graph.addDependency({ fromTaskId: "2", toTaskId: "1" });

    expect(graph.detectCycles()).toBe(true);
  });
});
