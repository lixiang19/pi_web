export interface FileLock {
  withLock: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
}

export const createFileLock = (): FileLock => {
  const locks = new Map<string, Promise<unknown>>();

  const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const chain = locks.get(key);

    const promise = chain
      ? chain.then(() => runLocked())
      : runLocked();

    locks.set(key, promise);

    async function runLocked(): Promise<T> {
      try {
        return await fn();
      } finally {
        const current = locks.get(key);
        if (current === promise) {
          locks.delete(key);
        }
      }
    }

    return promise as Promise<T>;
  };

  return {
    withLock,
  };
};
