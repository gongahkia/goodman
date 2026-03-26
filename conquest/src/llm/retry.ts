import { AgentError, ErrorCode } from '../lib/error-handler'

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  backoffMultiplier: number
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // Do NOT retry on client errors (4xx)
      if (isClientError(err)) throw err

      // Do NOT retry on final attempt
      if (attempt === options.maxRetries) throw err

      const delay = options.baseDelayMs * (options.backoffMultiplier ** attempt)
      await sleep(delay)
    }
  }

  throw lastError
}

function isClientError(err: unknown): boolean {
  if (err instanceof AgentError && err.code === ErrorCode.ParseFailed) return true
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    return status >= 400 && status < 500
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
