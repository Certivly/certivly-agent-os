import { expect, test, describe } from "bun:test";
import { ClientManager } from "../src/clients/ClientManager";
import { ClientConnection } from "../src/clients/ClientSession";

describe("ClientManager", () => {
  test("registers and unregisters clients", async () => {
    const manager = new ClientManager();
    const client: ClientConnection = {
      id: "cli-1",
      type: "cli",
      send: async () => {},
      receive: async () => {}
    };

    await manager.registerClient(client);
    expect(manager.getClient("cli-1")).toBeDefined();

    await manager.unregisterClient("cli-1");
    expect(manager.getClient("cli-1")).toBeUndefined();
  });
});
