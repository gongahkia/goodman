import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '@providers/openai';
import { ClaudeProvider } from '@providers/claude';
import { GeminiProvider } from '@providers/gemini';
import { OllamaProvider } from '@providers/ollama';
import { CustomEndpointProvider } from '@providers/custom';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('provider request deadlines', () => {
  it.each([
    new OpenAIProvider('synthetic'),
    new ClaudeProvider('synthetic'),
    new GeminiProvider('synthetic'),
    new OllamaProvider('http://127.0.0.1:11434'),
    new CustomEndpointProvider('http://127.0.0.1:11434'),
  ])('$name settles and aborts a hung transport', async (provider) => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          })
      )
    );
    let settled = false;
    const pending = provider
      .summarize('Synthetic terms.', {
        model: '',
        systemPrompt: 'Review terms.',
        temperature: 0,
        maxTokens: 100,
      })
      .then((result) => {
        settled = true;
        return result;
      });
    await vi.advanceTimersByTimeAsync(65_000);
    expect(settled).toBe(true);
    expect(aborted).toBe(true);
    expect((await pending).ok).toBe(false);
  });
});
