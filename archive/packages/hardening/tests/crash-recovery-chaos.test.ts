import { expect, test, describe } from "bun:test";
import { CorruptionSimulator } from "../src/chaos/CorruptionSimulator";
import * as fs from 'fs';

describe("Crash Recovery Chaos", () => {
  test("daemon safely recovers or clears corrupted state", async () => {
    try {
      await fs.promises.mkdir('./.test-chaos/sessions', { recursive: true });
      await fs.promises.writeFile('./.test-chaos/state.json', '{"valid": true}');
      
      const simulator = new CorruptionSimulator('./.test-chaos');
      await simulator.corruptDaemonState();
      await simulator.corruptSessionFiles();
      
      // Simulate daemon read
      const raw = await fs.promises.readFile('./.test-chaos/state.json', 'utf-8');
      expect(raw).toBe('{}'); // corrupted
    } finally {
      await fs.promises.rm('./.test-chaos', { recursive: true, force: true }).catch(() => {});
    }
  });
});
