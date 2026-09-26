import { describe, expect, it } from 'vitest'

import { installGuideKeys } from '@/utils/install-guide'
import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import {
  mysqlInstallGuide,
  postgresInstallGuide,
  sqlMemoGroups,
  sqlMemoItemKeys,
} from '@/tools/cheatsheet/sql-memo/sql-memo.service'

const allItems = sqlMemoGroups.flatMap((group) => group.items)

function pick(section: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      section,
    )
}

describe('sqlMemoGroups', () => {
  it('covers query through operations in display order', () => {
    expect(sqlMemoGroups.map((group) => group.id)).toEqual([
      'concepts',
      'select',
      'operator',
      'join',
      'group',
      'agg',
      'window',
      'subquery',
      'string',
      'math',
      'date',
      'cond',
      'json',
      'type',
      'charset',
      'dml',
      'ddl',
      'constraint',
      'index',
      'view',
      'txn',
      'dcl',
      'routine',
      'meta',
      'perf',
      'backup',
      'dialect',
      'postgres',
      'practice',
    ])
  })

  it('keeps every group substantial but scannable', () => {
    for (const group of sqlMemoGroups) {
      expect(group.items.length, group.id).toBeGreaterThanOrEqual(4)
      expect(group.items.length, group.id).toBeLessThanOrEqual(16)
    }
  })

  it('derives four prefixed i18n keys per item and keeps them unique', () => {
    const titleKeys = allItems.map((item) => item.titleKey)
    expect(new Set(titleKeys).size).toBe(titleKeys.length)
    for (const item of allItems) {
      expect(item.code.trim().length, item.titleKey).toBeGreaterThan(0)
      expect(item.titleKey.endsWith('-title'), item.titleKey).toBe(true)
      expect(item.descKey, item.titleKey).toBe(item.titleKey.replace(/-title$/, '-desc'))
      expect(
        item.noteKey === undefined || item.noteKey === `${item.titleKey.slice(0, -6)}-note`,
      ).toBe(true)
      expect(
        item.diffKey === undefined || item.diffKey === `${item.titleKey.slice(0, -6)}-diff`,
      ).toBe(true)
    }
  })

  it('lists MySQL paging before the dialect matrix entry', () => {
    const paging = allItems.find((item) => item.titleKey === 'd-paging-title')
    expect(paging?.diffKey).toBeUndefined()
    expect(paging?.noteKey).toBe('d-paging-note')
  })

  it('ships at least 200 syntax entries', () => {
    expect(allItems.length).toBeGreaterThanOrEqual(200)
  })
})

describe('install guides', () => {
  it('walks MySQL from download through troubleshooting', () => {
    expect(mysqlInstallGuide.map((step) => step.id)).toEqual([
      'my-download',
      'my-extract',
      'my-path',
      'my-ini',
      'my-init',
      'my-service',
      'my-login',
      'my-verify',
      'my-docker',
      'my-trouble',
    ])
  })

  it('walks PostgreSQL from download through troubleshooting', () => {
    expect(postgresInstallGuide.map((step) => step.id)).toEqual([
      'pg-download',
      'pg-installer',
      'pg-path',
      'pg-initdb',
      'pg-psql',
      'pg-conf',
      'pg-reload',
      'pg-remote',
      'pg-docker',
      'pg-trouble',
    ])
  })

  it('points the downloads at the official MySQL and EDB pages', () => {
    const urls = [...mysqlInstallGuide, ...postgresInstallGuide].flatMap((step) =>
      (step.blocks ?? [])
        .filter((block) => block.kind === 'link')
        .map((block) => (block.kind === 'link' ? block.url : '')),
    )
    expect(urls).toContain('https://dev.mysql.com/downloads/mysql/')
    expect(urls).toContain('https://www.enterprisedb.com/downloads/postgres-postgresql-downloads')
  })
})

describe('sql-memo i18n', () => {
  const expected = [
    'title',
    'description',
    'diffLabel',
    'group-mysql-install',
    'group-postgres-install',
    ...sqlMemoGroups.map((group) => `group-${group.id}`),
    ...sqlMemoItemKeys(allItems),
    ...installGuideKeys(mysqlInstallGuide),
    ...installGuideKeys(postgresInstallGuide),
  ]

  for (const [locale, messages] of [
    ['zh', zhCheatsheet],
    ['en', enCheatsheet],
  ] as const) {
    it(`defines every key in ${locale}`, () => {
      const section = messages['sql-memo']
      for (const key of expected) {
        expect(pick(section, key), key).toBeTruthy()
      }
    })

    it(`has no leftover placeholder in ${locale}`, () => {
      const section = messages['sql-memo']
      for (const key of expected) {
        const value = pick(section, key)
        if (typeof value === 'string') {
          expect(value, key).not.toMatch(/TODO|FIXME/)
        }
      }
    })
  }

  it('has the same key sets in both locales', () => {
    const zhKeys = Object.keys(zhCheatsheet['sql-memo'].guide ?? {}).sort()
    const enKeys = Object.keys(enCheatsheet['sql-memo'].guide ?? {}).sort()
    expect(zhKeys).toEqual(enKeys)
  })
})
