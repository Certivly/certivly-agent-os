import { expect, test, describe } from "bun:test";
import { TaskGraph } from "../src/coordinator/TaskGraph";

describe("Task Graph", () => {
  test("adds nodes and edges properly", () => {
    const graph = new TaskGraph();
    
    graph.addNode({ id: "A", agent: "Search", dependencies: [], status: "pending", task: { id: "A", type: "T", payload: {} } });
    graph.addNode({ id: "B", agent: "Search", dependencies: [], status: "pending", task: { id: "B", type: "T", payload: {} } });
    
    graph.addEdge("A", "B");
    
    expect(graph.nodes.get("B")?.dependencies).toContain("A");
    expect(graph.getIncomingEdges("B")).toEqual(["A"]);
    expect(graph.getOutgoingEdges("A")).toEqual(["B"]);
  });

  test("computes ready nodes based on completion status", () => {
    const graph = new TaskGraph();
    
    graph.addNode({ id: "A", agent: "A", dependencies: [], status: "completed", task: { id: "A", type: "T", payload: {} } });
    graph.addNode({ id: "B", agent: "B", dependencies: ["A"], status: "pending", task: { id: "B", type: "T", payload: {} } });
    graph.addNode({ id: "C", agent: "C", dependencies: ["B"], status: "pending", task: { id: "C", type: "T", payload: {} } });
    
    graph.addEdge("A", "B");
    graph.addEdge("B", "C");

    const ready = graph.getReadyNodes();
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("B");
  });
});
