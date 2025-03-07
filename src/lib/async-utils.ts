export const promiseAllWithConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> => {
  const results: T[] = [];
  const executing: Promise<T>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      executing.splice(executing.indexOf(promise), 1); // Remove from queue
      return result;
    });

    // Limit the number of concurrent promises
    results.push(await promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing); // Wait for one to finish
    }
  }

  return results;
};
