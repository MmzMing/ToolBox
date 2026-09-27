import { describe, expect, it } from 'vitest'

import { bytesToHex, hexToBytes } from '@/utils/bytes'
import { toPem } from '@/utils/pem'
import { unwrapPrivateKeyInfo } from '@/tools/crypto/key-generator/key-components.service'
import { renderKeyFormats } from '@/tools/crypto/key-generator/key-formats.service'
import { KEY_FORMAT_IDS } from '@/tools/crypto/key-generator/key-formats.service'
import {
  curve25519KeyFromSeed,
  generateKeyPair,
} from '@/tools/crypto/key-generator/keypair.service'
import {
  sshPublicKeyLine,
  sshPublicBlob,
  readSshPrivateKey,
} from '@/tools/crypto/key-generator/ssh.service'

const SEED = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
const OPTIONS = { comment: 'probe@toolbox', kid: 'key-1' }

describe('renderKeyFormats', () => {
  it('emits every applicable row once, with non-empty text', async () => {
    for (const algorithm of ['rsa', 'ecdsa', 'ed25519', 'x25519'] as const) {
      const key = await generateKeyPair({ algorithm, bits: 2048, curve: 'P-256' })
      const { outputs, unavailable } = await renderKeyFormats(key, OPTIONS)
      const ids = outputs.map((output) => output.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toEqual(
        expect.arrayContaining(
          [...KEY_FORMAT_IDS].filter((id) => !unavailable.some((u) => u.id === id)),
        ),
      )
      for (const output of outputs) {
        expect(output.text.length).toBeGreaterThan(0)
        expect(KEY_FORMAT_IDS).toContain(output.id)
      }
    }
  })

  it('derives the traditional PEM by unwrapping PKCS#8, not by re-encoding', async () => {
    const key = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    const { outputs } = await renderKeyFormats(key, OPTIONS)
    const traditional = outputs.find((output) => output.id === 'traditional-pem')
    expect(traditional?.role).toBe('private')
    expect(traditional?.text).toBe(
      toPem('RSA PRIVATE KEY', unwrapPrivateKeyInfo(key.pkcs8Der).innerDer),
    )
    expect(traditional?.text).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
  })

  it('marks Ed25519 as having no traditional format but full SSH support', async () => {
    const key = curve25519KeyFromSeed('ed25519', SEED)
    const { outputs, unavailable } = await renderKeyFormats(key, OPTIONS)
    expect(unavailable).toEqual([{ id: 'traditional-pem', reason: 'no-traditional-pem' }])
    expect(outputs.find((output) => output.id === 'ssh-public')?.text).toBe(
      sshPublicKeyLine(key, OPTIONS.comment),
    )
    // 私钥文件里有一对随机 check 字节，因此比对解析结果而不是原始字符串
    const sshPrivate = readSshPrivateKey(
      outputs.find((output) => output.id === 'ssh-private')!.text,
    )
    expect(sshPrivate.comment).toBe(OPTIONS.comment)
    expect(bytesToHex(sshPrivate.publicBlob)).toBe(bytesToHex(sshPublicBlob(key)))
    expect(outputs.find((output) => output.id === 'private-raw-hex')?.text).toBe(bytesToHex(SEED))
  })

  it('drops every SSH-derived row for X25519', async () => {
    const key = await generateKeyPair({ algorithm: 'x25519' })
    const { outputs, unavailable } = await renderKeyFormats(key, OPTIONS)
    const unavailableIds = unavailable.map((entry) => entry.id)
    expect(unavailableIds).toEqual(
      expect.arrayContaining([
        'ssh-public',
        'ssh-private',
        'fingerprint-sha256',
        'fingerprint-md5',
        'traditional-pem',
      ]),
    )
    expect(outputs.some((output) => output.id.startsWith('ssh-'))).toBe(false)
  })

  it('normalises JWK members: no alg in the private JWK, JWA names in the public ones', async () => {
    const ed = curve25519KeyFromSeed('ed25519', SEED)
    const { outputs } = await renderKeyFormats(ed, OPTIONS)
    const read = (id: string) => JSON.parse(outputs.find((output) => output.id === id)!.text)
    expect(read('jwk-private').alg).toBeUndefined()
    expect(read('jwk-private').key_ops).toBeUndefined()
    expect(read('jwk-private').d).toBeDefined()
    expect(read('jwk-public')).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
      kid: 'key-1',
    })
    expect(read('jwks')).toEqual({ keys: [read('jwk-public')] })
  })

  it('names RSA and ECDSA signing algs correctly for JWT consumers', async () => {
    const rsa = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    const ec = await generateKeyPair({ algorithm: 'ecdsa', curve: 'P-384' })
    const rsaJwks = JSON.parse(
      (await renderKeyFormats(rsa, OPTIONS)).outputs.find((o) => o.id === 'jwks')!.text,
    )
    const ecJwks = JSON.parse(
      (await renderKeyFormats(ec, OPTIONS)).outputs.find((o) => o.id === 'jwks')!.text,
    )
    expect(rsaJwks.keys[0].alg).toBe('RS256')
    expect(ecJwks.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-384', alg: 'ES384' })
  })

  it('rejects an unknown format id so the matrix cannot silently grow', async () => {
    const key = curve25519KeyFromSeed('ed25519', SEED)
    const { outputs } = await renderKeyFormats(key, OPTIONS)
    expect(
      outputs.every((output) => (KEY_FORMAT_IDS as readonly string[]).includes(output.id)),
    ).toBe(true)
  })
})
