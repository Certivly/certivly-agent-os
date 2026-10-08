import { describe, it, expect } from "bun:test";
import { PatternReplay } from "../src/PatternReplay";

describe("PatternReplay", () => {
  it("should reconstruct snapshot from events", async () => {
    const mockStore = {
      query: async () => [{ type: "pattern.snapshot.created", payload: {} }]
    };
    const replay = new PatternReplay(mockStore);
    const snapshot = await replay.reconstructSnapshot("snap-1");
    expect(snapshot.repositoryVersion).toBe("reconstructed");
  });
});
