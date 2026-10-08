import { expect, test, describe } from "bun:test";
import { DependencyResolver } from "../src/coordinator/DependencyResolver";
import { TaskGraph } from "../src/coordinator/TaskGraph";

describe("Dependency Resolver", () => {
  test("sorts valid DAG correctly", () => {
    const graph = new TaskGraph();
    graph.addNode({ id: "A", agent: "A", dependencies: [], status: "pending", task: { id: "A", type: "T", payload: {} } });
    graph.addNode({ id: "B", agent: "B", dependencies: [], status: "pending", task: { id: "B", type: "T", payload: {} } });
    graph.addNode({ id: "C", agent: "C", dependencies: [], status: "pending", task: { id: "C", type: "T", payload: {} } });
    
    graph.addEdge("A", "B");
    graph.addEdge("B", "C");

    const resolver = new DependencyResolver();
    const sorted = resolver.resolve(graph);
    
    expect(sorted).toEqual(["A", "B", "C"]);
  });

  test("throws on cycle A -> B -> C -> A", () => {
    const graph = new TaskGraph();
    graph.addNode({ id: "A", agent: "A", dependencies: [], status: "pending", task: { id: "A", type: "T", payload: {} } });
    graph.addNode({ id: "B", agent: "B", dependencies: [], status: "pending", task: { id: "B", type: "T", payload: {} } });
    graph.addNode({ id: "C", agent: "C", dependencies: [], status: "pending", task: { id: "C", type: "T", payload: {} } });
    
    graph.addEdge("A", "B");
    graph.addEdge("B", "C");
    graph.addEdge("C", "A");

    const resolver = new DependencyResolver();
    expect(() => resolver.resolve(graph)).toThrow("Cycle detected involving node A");
  });
});
