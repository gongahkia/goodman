import { afterEach, describe, expect, it, vi } from 'vitest';
import { startObserver, stopObserver } from '@content/detectors/observer';

describe('startObserver', () => {
  afterEach(() => {
    stopObserver();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('detects a dynamically injected checkbox within the debounce window', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    startObserver(callback);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<input type="checkbox" id="agree">';
    document.body.appendChild(wrapper);

    await Promise.resolve();
    vi.advanceTimersByTime(550);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores TC Guard overlay mutations', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    startObserver(callback);

    const overlayHost = document.createElement('div');
    overlayHost.id = 'tc-guard-overlay-host';
    document.body.appendChild(overlayHost);

    await Promise.resolve();
    vi.advanceTimersByTime(550);

    expect(callback).not.toHaveBeenCalled();
  });

  it('batches rapid DOM mutations into a single callback', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    startObserver(callback);

    document.body.appendChild(document.createElement('div'));
    document.body.appendChild(document.createElement('section'));

    await Promise.resolve();
    vi.advanceTimersByTime(550);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
