import { describe, expect, it, vi } from 'vitest';
import { waitWithAbort } from '@shared/cancellation';

describe('abortable waiting', () => {
  it('releases a superseded IPC wait promptly and observes a late failure', async () => {
    const controller = new AbortController();
    let rejectLate!: (error: Error) => void;
    const pending = waitWithAbort(
      new Promise((_, reject) => {
        rejectLate = reject;
      }),
      controller.signal
    );
    const assertion = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort();
    await assertion;
    rejectLate(new Error('late IPC failure'));
    await Promise.resolve();
  });

  it('removes its abort handler after a successful response', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(
      waitWithAbort(Promise.resolve('current response'), controller.signal)
    ).resolves.toBe('current response');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
  });
});
