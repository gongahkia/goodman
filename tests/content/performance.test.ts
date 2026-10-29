import { afterEach, expect, it, vi } from 'vitest';
import { detectModals } from '@content/detectors/modal';
import { positionOverlay } from '@content/ui/positioning';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

it('does not measure styles for thousands of unrelated page nodes', () => {
  document.body.innerHTML = '<main>' + '<p>Product information</p>'.repeat(3000) + '</main>';
  const styles = vi.spyOn(window, 'getComputedStyle');
  expect(detectModals(document.body)).toEqual([]);
  expect(styles).not.toHaveBeenCalled();
});

it('bounds geometry work and avoids DOM queries on scroll', () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<button id="anchor">Review</button>' + '<button>Control</button>'.repeat(1500);
  const anchor = document.getElementById('anchor')!;
  const overlay = document.createElement('div');
  document.body.append(overlay);
  const geometry = vi.spyOn(Element.prototype, 'getBoundingClientRect');
  const queries = vi.spyOn(Element.prototype, 'querySelectorAll');
  const cleanup = positionOverlay(overlay, anchor);
  geometry.mockClear();
  queries.mockClear();
  for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(20);
  expect(geometry.mock.calls.length).toBeGreaterThan(0);
  expect(geometry.mock.calls.length).toBeLessThanOrEqual(102);
  expect(queries).not.toHaveBeenCalled();
  cleanup();
  geometry.mockClear();
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(20);
  expect(geometry).not.toHaveBeenCalled();
});
