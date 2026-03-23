export class TCGuardError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'TCGuardError';
  }
}

export class NetworkError extends TCGuardError {
  constructor(provider: string) {
    super(
      `Network error connecting to ${provider}`,
      `Could not connect to ${provider}. Check your internet connection.`,
      'NETWORK_ERROR'
    );
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends TCGuardError {
  constructor(provider: string, public readonly retryAfterSeconds: number) {
    super(
      `Rate limited by ${provider}`,
      `Rate limited by ${provider}. Please wait ${retryAfterSeconds} seconds.`,
      'RATE_LIMIT'
    );
    this.name = 'RateLimitError';
  }
}

export class InvalidResponseError extends TCGuardError {
  constructor(detail: string) {
    super(
      `Invalid LLM response: ${detail}`,
      'The AI returned an unexpected response. Retrying...',
      'INVALID_RESPONSE'
    );
    this.name = 'InvalidResponseError';
  }
}

export class ProviderError extends TCGuardError {
  constructor(provider: string, detail: string) {
    super(
      `${provider} error: ${detail}`,
      `${provider} encountered an error. Try again or switch providers.`,
      'PROVIDER_ERROR'
    );
    this.name = 'ProviderError';
  }
}

export class ServiceUnavailableError extends TCGuardError {
  constructor(service: string, detail = 'The service is temporarily unavailable.') {
    super(
      `${service} unavailable: ${detail}`,
      `${service} is temporarily unavailable. Please try again shortly.`,
      'SERVICE_UNAVAILABLE'
    );
    this.name = 'ServiceUnavailableError';
  }
}

export class ExtractionError extends TCGuardError {
  constructor(detail: string) {
    super(
      `Extraction failed: ${detail}`,
      'Could not extract text from this page. The page structure may be unsupported.',
      'EXTRACTION_ERROR'
    );
    this.name = 'ExtractionError';
  }
}
