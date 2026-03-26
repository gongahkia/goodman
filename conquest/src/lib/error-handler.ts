export enum ErrorCode {
  CaptureCancelled = 'CAPTURE_CANCELLED',
  CaptureFailed = 'CAPTURE_FAILED',
  LlmUnavailable = 'LLM_UNAVAILABLE',
  LlmError = 'LLM_ERROR',
  LlmTimeout = 'LLM_TIMEOUT',
  ParseFailed = 'PARSE_FAILED',
  StorageError = 'STORAGE_ERROR',
}

export class AgentError extends Error {
  readonly code: ErrorCode
  readonly userMessage: string

  constructor(code: ErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage)
    this.name = 'AgentError'
    this.code = code
    this.userMessage = userMessage
    if (cause) this.cause = cause
  }
}

export function handleError(error: unknown): AgentError {
  if (error instanceof AgentError) return error

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new AgentError(
      ErrorCode.LlmUnavailable,
      'LLM endpoint unreachable: check that your local server is running',
      error,
    )
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AgentError(
      ErrorCode.LlmTimeout,
      'LLM timeout: no response after configured timeout',
      error,
    )
  }

  if (error instanceof Error) {
    return new AgentError(ErrorCode.LlmError, error.message, error)
  }

  return new AgentError(ErrorCode.LlmError, String(error))
}
