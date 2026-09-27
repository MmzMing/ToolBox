import { describe, expect, it } from 'vitest'

import type { CanonicalKey } from '@/tools/crypto/key-generator/keypair.service'

import { base64ToBytes, bytesToBase64 } from '@/utils/base64'
import { bytesToHex, concatBytes, hexToBytes } from '@/utils/bytes'
import { generateKeyPair } from '@/tools/crypto/key-generator/keypair.service'
import { sshFingerprint } from '@/tools/crypto/key-generator/fingerprint.service'
import {
  readSshPrivateKey,
  sshPrivateKeyFile,
  sshPublicKeyLine,
  sshPublicBlob,
} from '@/tools/crypto/key-generator/ssh.service'

/**
 * 期望值全部来自本机 OpenSSH 实测（命令记录见 docs/plans/2026-09-27-key-generator-design.md §5.3）：
 *   ssh-keygen -q -N "" -t ed25519 -C probe-ed25519 -f sk_ed25519   # 以及 ecdsa -b 256 / rsa -b 2048
 *   ssh-keygen -lf sk_xxx.pub   与   ssh-keygen -lf sk_xxx.pub -E md5
 * 任何一条断言失败都意味着产出的密钥会被真实工具拒收。
 */
const ED25519_SEED = hexToBytes('a464c5529fc8ba7f98cfa787e0fa1f0b4491ef5f1d636b4a506037627f206f81')
const ED25519_PUBLIC = hexToBytes(
  '00128672675b341428ffc60c0591f9f70faea457db7b104f51f1a80e03b4c873',
)
const ED25519_CHECK = hexToBytes('f472aafe')
const ED25519_PRIVATE_PEM = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACAAEoZyZ1s0FCj/xgwFkfn3D66kV9t7EE9R8agOA7TIcwAAAJD0cqr+9HKq
/gAAAAtzc2gtZWQyNTUxOQAAACAAEoZyZ1s0FCj/xgwFkfn3D66kV9t7EE9R8agOA7TIcw
AAAECkZMVSn8i6f5jPp4fg+h8LRJHvXx1ja0pQYDdifyBvgQAShnJnWzQUKP/GDAWR+fcP
rqRX23sQT1HxqA4DtMhzAAAADXByb2JlLWVkMjU1MTk=
-----END OPENSSH PRIVATE KEY-----
`
const ED25519_PUBLIC_LINE =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAShnJnWzQUKP/GDAWR+fcPrqRX23sQT1HxqA4DtMhz probe-ed25519'
const RSA_BLOB_B64 =
  'AAAAB3NzaC1yc2EAAAADAQABAAABAQDa61tkubCg5+oxkBzatmqLGVZ05lI6+X+p40bR9fZ0Ir9ufo7yBA3hNcIoZ7o59itr+NvJXrtJipg9y7JW0fOflKr5y/lZjb5QU1z3O1iWt3Pn7V9xqt7hKsuNnj82U+AXzAHSfeSFoCMnDJTmmqqrF6I1FSAk7DKk6qdg4uODU38IO3zR1Cf41ZE/Wfps5iPmxK55GedQ5ockRog1cRJdin1Wv/b9Tq2/rQQnSthM9xh+dHvBTcgeB+gRKvDrOnUtwe4K+kMvnKCLM4mxkLh0Yr93qlp6Mf6pwzMo+7PspUMoYHjgLzOSydAITvM1/iBBQLHWfxKb+4uSDYadpB0x'
const ECDSA_BLOB_B64 =
  'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBN8wFNJvySn6WO89qGrYcnYv5sQUrzvjgLWsd5N8JKCorugB1GLdtybB0+zX7FDpNOiiePofi7C+yHZtCxQvSGM='

function fixtureKey(): CanonicalKey {
  return {
    algorithm: 'ed25519',
    pkcs8Der: new Uint8Array(0),
    spkiDer: new Uint8Array(0),
    privateJwk: { kty: 'OKP' },
    publicJwk: { kty: 'OKP' },
    raw: { seed: ED25519_SEED, publicKey: ED25519_PUBLIC },
  }
}

/** 读 SSH string / mpint 字段序列 */
function fieldReader(bytes: Uint8Array) {
  let offset = 0
  return {
    next(): Uint8Array {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
      offset += 4
      const value = bytes.subarray(offset, offset + length)
      offset += length
      return value
    },
    done: () => offset >= bytes.length,
  }
}

const toBigInt = (bytes: Uint8Array) => BigInt(`0x${bytesToHex(bytes) || '0'}`)

describe('sshPrivateKeyFile', () => {
  it('reproduces a real ssh-keygen ed25519 file byte for byte', () => {
    expect(sshPrivateKeyFile(fixtureKey(), 'probe-ed25519', { check: ED25519_CHECK })).toBe(
      ED25519_PRIVATE_PEM,
    )
  })

  it.each(['rsa', 'ecdsa', 'ed25519'] as const)(
    'round-trips a generated %s key through the reader',
    async (algorithm) => {
      const key = await generateKeyPair({ algorithm, bits: 2048, curve: 'P-256' })
      const shell = readSshPrivateKey(sshPrivateKeyFile(key, 'round-trip'))
      expect(shell.comment).toBe('round-trip')
      expect(bytesToHex(shell.publicBlob)).toBe(bytesToHex(sshPublicBlob(key)))
    },
  )

  it('pads the private section to the 8-byte block size when the comment forces it', () => {
    // ed25519 裸段长度恰好对齐时填充为 0，这里用注释把长度推偏，覆盖 1..7 分支
    const comment = 'x'.repeat(63)
    const file = sshPrivateKeyFile(fixtureKey(), comment, { check: ED25519_CHECK })
    const der = base64ToBytes(file.replace(/-{5}[^-]*-{5}/g, '').replace(/\s+/g, ''))
    const sectionLength = new DataView(der.buffer, der.byteOffset + 94, 4).getUint32(0)
    expect(sectionLength % 8).toBe(0)
    expect(readSshPrivateKey(file).comment).toBe(comment)
  })

  it('writes RSA private fields as n,e,d,iqmp,p,q — verified by the key math itself', async () => {
    const key = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    const shell = readSshPrivateKey(sshPrivateKeyFile(key, 'order'))
    const fields = fieldReader(shell.privateFields)
    const n = toBigInt(fields.next())
    const e = toBigInt(fields.next())
    fields.next()
    const iqmp = toBigInt(fields.next())
    const p = toBigInt(fields.next())
    const q = toBigInt(fields.next())
    expect(fields.done()).toBe(true)
    expect(e).toBe(65537n)
    expect(n).toBe(p * q)
    expect((q * iqmp) % p).toBe(1n)
  })

  it('refuses OpenSSH output for X25519, which has no single-key SSH type', async () => {
    const key = await generateKeyPair({ algorithm: 'x25519' })
    expect(() => sshPrivateKeyFile(key, 'x')).toThrowError(/no OpenSSH representation/)
    expect(() => sshPublicKeyLine(key, 'x')).toThrowError(/no OpenSSH representation/)
  })
})

describe('sshPublicKeyLine', () => {
  it('matches the ssh-keygen authorized_keys line', () => {
    expect(sshPublicKeyLine(fixtureKey(), 'probe-ed25519')).toBe(ED25519_PUBLIC_LINE)
  })

  it('drops the trailing space when there is no comment', () => {
    expect(sshPublicKeyLine(fixtureKey(), '')).toBe(
      ED25519_PUBLIC_LINE.replace(/ probe-ed25519$/, ''),
    )
  })
})

describe('sshFingerprint', () => {
  it('reproduces ssh-keygen output for ed25519 in SHA256 and MD5', async () => {
    const blob = sshPublicBlob(fixtureKey())
    expect(await sshFingerprint(blob, 'SHA256')).toBe(
      'SHA256:KYVFypdPtVjNUBKEgUk8k5iybiz3dy88tNyuY/2K7hU',
    )
    expect(await sshFingerprint(blob, 'MD5')).toBe(
      'MD5:01:6a:30:e8:7c:a4:bf:85:5d:6b:15:cb:a1:1c:3b:cf',
    )
  })

  it('keeps the + and / of standard base64 for RSA and ECDSA blobs', async () => {
    expect(await sshFingerprint(base64ToBytes(RSA_BLOB_B64), 'SHA256')).toBe(
      'SHA256:EE2AJpO5+VhIufG1fgh4MxQYqZBX4VEOjXtNX7Ro/+Q',
    )
    expect(await sshFingerprint(base64ToBytes(ECDSA_BLOB_B64), 'SHA256')).toBe(
      'SHA256:t2bCS63yEbyvIO7qYurjN5vD2cNyZfW8Sky3ParVeWY',
    )
    expect(await sshFingerprint(base64ToBytes(RSA_BLOB_B64), 'MD5')).toBe(
      'MD5:c1:7e:44:f4:bb:9a:d5:0e:e5:d4:b3:f3:45:41:89:5d',
    )
  })
})

describe('readSshPrivateKey', () => {
  it('reads the fixture written by ssh-keygen', () => {
    const shell = readSshPrivateKey(ED25519_PRIVATE_PEM)
    expect(shell.keyType).toBe('ssh-ed25519')
    expect(shell.comment).toBe('probe-ed25519')
    expect(bytesToHex(shell.publicBlob)).toBe(bytesToHex(sshPublicBlob(fixtureKey())))
  })

  it('rejects passphrase-protected keys instead of returning garbage', () => {
    const encrypted = concatBytes(
      new TextEncoder().encode('openssh-key-v1\0'),
      new Uint8Array([0, 0, 0, 10, ...new TextEncoder().encode('aes256-ctr')]),
      new Uint8Array([0, 0, 0, 12, ...new TextEncoder().encode('bcrypt-pbkdf')]),
      new Uint8Array([0, 0, 0, 0]),
      new Uint8Array([0, 0, 0, 1]),
      new Uint8Array([0, 0, 0, 2, 1, 2]),
      new Uint8Array([0, 0, 0, 8]),
      new Uint8Array(8),
    )
    const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${bytesToBase64(encrypted)}\n-----END OPENSSH PRIVATE KEY-----\n`
    expect(() => readSshPrivateKey(pem)).toThrowError(/Passphrase-protected OpenSSH keys/)
  })
})
