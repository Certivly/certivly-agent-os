import { expect, test, describe } from "bun:test";
import { JobQueue, BackgroundJobType } from "../src/background/JobQueue";
import { JobExecutor } from "../src/background/JobExecutor";
import { BackgroundWorker } from "../src/background/BackgroundWorker";
import { EventBus } from "../src/streaming/EventBus";

describe("BackgroundWorker", () => {
  test("enqueues and executes background jobs", async () => {
    const queue = new JobQueue();
    const bus = new EventBus();
    const executor = new JobExecutor(bus);
    const worker = new BackgroundWorker(queue, executor, 10); // 10ms poll
    
    worker.start();
    queue.enqueue(BackgroundJobType.MEMORY_DISTILLATION, {});
    
    expect(queue.getLength()).toBe(1);

    // Wait for the worker to poll and process
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(queue.getLength()).toBe(0);
    worker.stop();
  });
});
