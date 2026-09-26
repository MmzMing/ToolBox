import { describe, expect, it } from 'vitest'

import { installGuideKeys } from '@/utils/install-guide'
import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import { nvmInstallGuide, nvmMemoGroups } from '@/tools/cheatsheet/nvm-memo/nvm-memo.service'

const allItems = nvmMemoGroups.flatMap((group) => group.items)

function pick(section: object, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      section,
    )
}

describe('nvmInstallGuide', () => {
  it('cleans the old node install before wiring mirrors', () => {
    expect(nvmInstallGuide.map((step) => step.id)).toEqual([
      'clean',
      'download',
      'install',
      'verify',
      'mirror',
      'first-use',
    ])
  })

  it('points the download step at the nvm-windows releases', () => {
    const download = nvmInstallGuide[1]
    const link = download?.blocks?.find((block) => block.kind === 'link')
    expect(link && link.kind === 'link' ? link.url : '').toBe(
      'https://github.com/coreybutler/nvm-windows/releases',
    )
  })

  it('ships the mirror block as settings.txt lines', () => {
    const mirror = nvmInstallGuide[4]
    const file = mirror?.blocks?.find((block) => block.kind === 'file')
    const content = file && file.kind === 'file' ? file.content : ''
    expect(content).toContain('node_mirror: https://npmmirror.com/mirrors/node/')
    expect(content).toContain('npm_mirror: https://npmmirror.com/mirrors/npm/')
  })
})

describe('nvmMemoGroups', () => {
  it('contains the expected groups', () => {
    expect(nvmMemoGroups.map((group) => group.id)).toEqual([
      'versions',
      'mirror',
      'npm',
      'troubleshoot',
    ])
  })

  it('has 5-10 commands per group and starts them with nvm or npm or where', () => {
    for (const group of nvmMemoGroups) {
      expect(group.items.length).toBeGreaterThanOrEqual(5)
      expect(group.items.length).toBeLessThanOrEqual(10)
      for (const item of group.items) {
        expect(/^(nvm|npm|where) /.test(item.command)).toBe(true)
      }
    }
  })

  it('keeps description keys unique', () => {
    const keys = allItems.map((item) => item.descriptionKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('nvm-memo i18n', () => {
  for (const [locale, messages] of [
    ['zh', zhCheatsheet],
    ['en', enCheatsheet],
  ] as const) {
    it(`defines every guide and command key in ${locale}`, () => {
      const section = messages['nvm-memo']
      const expected = [
        ...installGuideKeys(nvmInstallGuide),
        ...nvmMemoGroups.map((group) => `group-${group.id}`),
        ...allItems.map((item) => item.descriptionKey),
      ]
      for (const key of expected) {
        expect(pick(section, key), key).toBeTruthy()
      }
    })
  }
})
