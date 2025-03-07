import { promiseAllWithConcurrency } from "./async-utils";

describe("promiseAllWithConcurrency", () => {
  it("should resolve all tasks with the specified concurrency", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const concurrency = 2;
    const results = await promiseAllWithConcurrency(tasks, concurrency);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should handle tasks that resolve at different times", async () => {
    const tasks = [
      () => new Promise((resolve) => setTimeout(() => resolve(1), 100)),
      () => new Promise((resolve) => setTimeout(() => resolve(2), 50)),
      () => new Promise((resolve) => setTimeout(() => resolve(3), 150)),
    ];
    const concurrency = 2;
    const results = await promiseAllWithConcurrency(tasks, concurrency);
    expect(results).toEqual([1, 2, 3]);
  });

  it("should handle tasks that reject", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error("Task failed")),
      () => Promise.resolve(3),
    ];
    const concurrency = 2;
    await expect(promiseAllWithConcurrency(tasks, concurrency)).rejects.toThrow(
      "Task failed",
    );
  });

  it("should respect the concurrency limit", async () => {
    const tasks = [
      () => new Promise((resolve) => setTimeout(() => resolve(1), 100)),
      () => new Promise((resolve) => setTimeout(() => resolve(2), 100)),
      () => new Promise((resolve) => setTimeout(() => resolve(3), 100)),
      () => new Promise((resolve) => setTimeout(() => resolve(4), 100)),
    ];
    const concurrency = 2;
    const start = Date.now();
    await promiseAllWithConcurrency(tasks, concurrency);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(200);
  });
});
