import { AgentError, ErrorCode } from './error-handler'

const IPV4_PRIVATE_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
]

export function assertAllowedEndpoint(
  endpoint: string,
  options: { allowPublicHosts?: boolean } = {},
): void {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new AgentError(
      ErrorCode.LlmError,
      'LLM endpoint blocked: enter a valid http:// or https:// URL',
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AgentError(
      ErrorCode.LlmError,
      'LLM endpoint blocked: only http:// and https:// endpoints are allowed',
    )
  }

  if (options.allowPublicHosts) return

  const hostname = url.hostname.toLowerCase()
  const isLoopbackIpv6 = hostname === '[::1]' || hostname === '::1'
  const isAllowedIpv4 = IPV4_PRIVATE_PATTERNS.some((pattern) => pattern.test(hostname))

  if (hostname !== 'localhost' && !isLoopbackIpv6 && !isAllowedIpv4) {
    throw new AgentError(
      ErrorCode.LlmError,
      'LLM endpoint blocked: only localhost, loopback, or private IPv4 hosts are allowed',
    )
  }
}

export function maskEndpointForDisplay(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return url.port ? `${url.hostname}:${url.port}` : url.hostname
  } catch {
    return endpoint
  }
}
