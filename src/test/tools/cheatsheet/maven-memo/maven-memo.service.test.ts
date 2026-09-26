import { describe, expect, it } from 'vitest'

import { installGuideKeys } from '@/utils/install-guide'
import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import {
  mavenInstallGuide,
  mavenMemoGroups,
} from '@/tools/cheatsheet/maven-memo/maven-memo.service'

const allItems = mavenMemoGroups.flatMap((group) => group.items)

function pick(section: object, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      section,
    )
}

describe('mavenInstallGuide', () => {
  it('walks download through IDE wiring in order', () => {
    expect(mavenInstallGuide.map((step) => step.id)).toEqual([
      'download',
      'extract',
      'env',
      'verify',
      'settings',
      'idea',
    ])
  })

  it('carries the download link and the environment variable rows', () => {
    const [download, , env] = mavenInstallGuide
    const link = download?.blocks?.find((block) => block.kind === 'link')
    expect(link && link.kind === 'link' ? link.url : '').toBe(
      'https://maven.apache.org/download.cgi',
    )
    const rows = env?.blocks?.flatMap((block) => (block.kind === 'kv' ? block.rows : [])) ?? []
    expect(rows.map((row) => row.value)).toEqual([
      'MAVEN_HOME',
      'D:\\Apache\\apache-maven-3.9.11',
      '%MAVEN_HOME%\\bin',
    ])
  })
})

describe('mavenMemoGroups', () => {
  it('contains the expected groups', () => {
    expect(mavenMemoGroups.map((group) => group.id)).toEqual([
      'build',
      'options',
      'settings',
      'deps',
      'scope',
      'project',
      'troubleshoot',
    ])
  })

  it('has 5-10 commands per group', () => {
    for (const group of mavenMemoGroups) {
      expect(group.items.length).toBeGreaterThanOrEqual(5)
      expect(group.items.length).toBeLessThanOrEqual(10)
    }
  })

  it('keeps description keys unique and commands non-empty', () => {
    const keys = allItems.map((item) => item.descriptionKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const item of allItems) {
      expect(item.command.trim().length).toBeGreaterThan(0)
      expect(item.descriptionKey.startsWith('item-')).toBe(true)
    }
  })
})

describe('maven-memo i18n', () => {
  for (const [locale, messages] of [
    ['zh', zhCheatsheet],
    ['en', enCheatsheet],
  ] as const) {
    it(`defines every guide and command key in ${locale}`, () => {
      const section = messages['maven-memo']
      const expected = [
        ...installGuideKeys(mavenInstallGuide),
        ...mavenMemoGroups.map((group) => `group-${group.id}`),
        ...allItems.map((item) => item.descriptionKey),
      ]
      for (const key of expected) {
        expect(pick(section, key), key).toBeTruthy()
      }
    })
  }
})
