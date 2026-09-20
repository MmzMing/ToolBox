import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const LOCALES = ['zh', 'en'] as const
const directory = (locale: string) => `src/modules/i18n/locales/${locale}`

function flatten(value: unknown, prefix: string, into: Set<string>): Set<string> {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into)
    }
    return into
  }
  into.add(prefix)
  return into
}

function namespaceKeys(locale: string, namespace: string): Set<string> {
  const source = readFileSync(`${directory(locale)}/${namespace}.json`, 'utf8')
  return flatten(JSON.parse(source) as unknown, '', new Set<string>())
}

function namespaces(locale: string): string[] {
  return readdirSync(directory(locale))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort()
}

describe('locale files', () => {
  const [reference, ...others] = LOCALES

  it('expose the same namespaces in every locale', () => {
    for (const locale of others) {
      expect(namespaces(locale)).toEqual(namespaces(reference))
    }
  })

  for (const namespace of namespaces(reference)) {
    it(`${namespace}: every key has a translation in every locale`, () => {
      const keys = namespaceKeys(reference, namespace)

      for (const locale of others) {
        const actual = namespaceKeys(locale, namespace)
        const missing = [...keys].filter((key) => !actual.has(key))
        const extra = [...actual].filter((key) => !keys.has(key))

        expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] })
      }
    })
  }
})
