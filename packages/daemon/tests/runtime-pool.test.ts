import { expect, test, describe } from "bun:test";
import { RuntimePool } from "../src/sessions/RuntimePool";

describe("RuntimePool", () => {
  test("acquires and releases runtimes", () => {
    const pool = new RuntimePool(2);
    
    const rt1 = pool.acquireRuntime("s1");
    expect(rt1.id).toBe("s1");
    
    const rt2 = pool.acquireRuntime("s2");
    expect(rt2.id).toBe("s2");
    
    expect(() => pool.acquireRuntime("s3")).toThrow("Runtime pool exhausted");
    
    pool.releaseRuntime("s1");
    const rt3 = pool.acquireRuntime("s3");
    expect(rt3.id).toBe("s3");
  });
});
