import { describe, expect, it } from 'vitest'

import { hexToBytes } from '@/utils/bytes'
import {
  IV_KINDS,
  IV_KIND_LIST,
  SYMMETRIC_KEY_KINDS,
  SYMMETRIC_KEY_KIND_LIST,
  generateInitializationVector,
  generateSalt,
  generateSymmetricKey,
  secretSnippets,
} from '@/tools/crypto/key-generator/symmetric.service'

describe('generateSymmetricKey', () => {
  it.each(SYMMETRIC_KEY_KIND_LIST)('%s yields exactly %i bytes', (kind) => {
    const secret = generateSymmetricKey(kind)
    expect(hexToBytes(secret.hex)).toHaveLength(SYMMETRIC_KEY_KINDS[kind])
  })

  it('rejects an unknown kind instead of guessing a length', () => {
    expect(() => generateSymmetricKey('des-cbc' as never)).toThrowError(
      /Unknown symmetric key kind/,
    )
  })

  it('never repeats a key', () => {
    expect(generateSymmetricKey('aes-256').hex).not.toBe(generateSymmetricKey('aes-256').hex)
  })
})

describe('generateInitializationVector', () => {
  it.each(IV_KIND_LIST)('%s is %i bytes', (kind) => {
    expect(hexToBytes(generateInitializationVector(kind).hex)).toHaveLength(IV_KINDS[kind])
  })

  it('rejects an unknown mode', () => {
    expect(() => generateInitializationVector('rc4' as never)).toThrowError(/Unknown IV kind/)
  })
})

describe('generateSalt', () => {
  it('defaults to 16 bytes and honours explicit sizes', () => {
    expect(hexToBytes(generateSalt().hex)).toHaveLength(16)
    expect(hexToBytes(generateSalt(32).hex)).toHaveLength(32)
  })

  it('rejects absurd salt lengths', () => {
    expect(() => generateSalt(4)).toThrowError(/between 8 and 128/)
    expect(() => generateSalt(129)).toThrowError(/between 8 and 128/)
    expect(() => generateSalt(16.5)).toThrowError(/between 8 and 128/)
  })
})

describe('secretSnippets', () => {
  const secret = generateSymmetricKey('aes-128')

  it('emits an env line with the url-safe form and an upper-cased name', () => {
    expect(secretSnippets('api_key', secret).env).toBe(`API_KEY=${secret.base64Url}`)
  })

  it('camel-cases javascript names and snake-cases go names', () => {
    const snippets = secretSnippets('SESSION_SECRET_KEY', secret)
    expect(snippets.javascript).toBe(`const sessionSecretKey = Buffer.from('${secret.hex}', 'hex')`)
    expect(snippets.go).toBe(`session_secret_key, _ := hex.DecodeString("${secret.hex}")`)
  })

  it('writes java byte literals with the 0x prefix per element', () => {
    const snippets = secretSnippets('aes_key', generateSymmetricKey('aes-128'))
    const literals = snippets.java.match(/0x[0-9a-f]{2}/g) ?? []
    expect(literals).toHaveLength(16)
    expect(snippets.java).toMatch(/^byte\[\] aesKey = new byte\[\] \{ 0x/)
  })
})
