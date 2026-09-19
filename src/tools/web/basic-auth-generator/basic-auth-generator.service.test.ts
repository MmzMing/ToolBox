import { describe, expect, it } from 'vitest'

import { buildBasicAuthCredentials, buildBasicAuthHeader } from './basic-auth-generator.service'

describe('buildBasicAuthCredentials', () => {
  it('encodes username:password as base64', () => {
    expect(buildBasicAuthCredentials('username', 'password')).toBe('dXNlcm5hbWU6cGFzc3dvcmQ=')
    expect(buildBasicAuthCredentials('admin', '123456')).toBe('YWRtaW46MTIzNDU2')
  })

  it('supports utf-8 passwords (multi-byte characters)', () => {
    // "user:中文" 的 UTF-8 字节序列对应的 Base64
    expect(buildBasicAuthCredentials('user', '中文')).toBe('dXNlcjrkuK3mloc=')
  })

  it('supports empty username and password', () => {
    expect(buildBasicAuthCredentials('', '')).toBe('Og==')
  })

  it('keeps colons inside username/password fields unescaped per RFC 7617', () => {
    expect(buildBasicAuthCredentials('a:b', 'c')).toBe(btoa(`a:b:c`))
  })
})

describe('buildBasicAuthHeader', () => {
  it('prefixes the credentials with the Authorization scheme', () => {
    expect(buildBasicAuthHeader('username', 'password')).toBe(
      'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
    )
  })

  it('stays consistent with buildBasicAuthCredentials', () => {
    expect(buildBasicAuthHeader('u', '中')).toBe(
      `Authorization: Basic ${buildBasicAuthCredentials('u', '中')}`,
    )
  })
})
