import { CancelledError } from './errors';

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CancelledError();
  }
}

export function isCancelledError(error: unknown): boolean {
  return (
    error instanceof CancelledError ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function sleepWithAbort(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = (): void => {
      cleanup();
      reject(new CancelledError());
    };

    const cleanup = (): void => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
