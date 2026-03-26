import { describe, expect, it } from 'vitest'

import { assertAllowedEndpoint, maskEndpointForDisplay } from '../endpoint'

describe('assertAllowedEndpoint', () => {
  it('allows localhost, loopback, and private IPv4 endpoints', () => {
    expect(() => assertAllowedEndpoint('http://localhost:11434')).not.toThrow()
    expect(() => assertAllowedEndpoint('http://127.0.0.1:1234')).not.toThrow()
    expect(() => assertAllowedEndpoint('http://192.168.1.10:8080')).not.toThrow()
    expect(() => assertAllowedEndpoint('http://172.16.0.12:8080')).not.toThrow()
    expect(() => assertAllowedEndpoint('https://10.0.0.5:8080')).not.toThrow()
  })

  it('rejects non-local hosts and invalid protocols', () => {
    expect(() => assertAllowedEndpoint('https://api.openai.com')).toThrow(
      'LLM endpoint blocked: only localhost, loopback, or private IPv4 hosts are allowed',
    )
    expect(() => assertAllowedEndpoint('ftp://localhost:21')).toThrow(
      'LLM endpoint blocked: only http:// and https:// endpoints are allowed',
    )
  })

  it('allows public hosts when explicitly enabled', () => {
    expect(() => assertAllowedEndpoint('https://api.openai.com', {
      allowPublicHosts: true,
    })).not.toThrow()
  })
})

describe('maskEndpointForDisplay', () => {
  it('returns host and port only', () => {
    expect(maskEndpointForDisplay('http://localhost:11434/v1/models')).toBe('localhost:11434')
  })
})
