import { describe, expect, it } from 'vitest'

import { installGuideKeys } from '@/utils/install-guide'
import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import { gitInstallGuide, gitMemoGroups } from '@/tools/cheatsheet/git-memo/git-memo.service'

function pick(section: object, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      section,
    )
}

describe('gitInstallGuide', () => {
  it('covers download through first-run config', () => {
    expect(gitInstallGuide.map((step) => step.id)).toEqual([
      'download',
      'wizard',
      'verify',
      'config',
    ])
  })

  it('walks every wizard screen in install order', () => {
    const wizard = gitInstallGuide[1]
    const rows =
      wizard?.blocks?.flatMap((block) => (block.kind === 'choice' ? block.rows : [])) ?? []
    expect(rows.map((row) => row.labelKey)).toEqual([
      'guide.wizard.license',
      'guide.wizard.components',
      'guide.wizard.start-menu',
      'guide.wizard.editor',
      'guide.wizard.branch',
      'guide.wizard.path',
      'guide.wizard.ssh',
      'guide.wizard.https',
      'guide.wizard.line-endings',
      'guide.wizard.terminal',
      'guide.wizard.fetch',
      'guide.wizard.credential',
      'guide.wizard.extras',
    ])
  })

  for (const [locale, messages] of [
    ['zh', zhCheatsheet],
    ['en', enCheatsheet],
  ] as const) {
    it(`defines every guide key in ${locale}`, () => {
      const section = messages['git-memo']
      for (const key of installGuideKeys(gitInstallGuide)) {
        expect(pick(section, key), key).toBeTruthy()
      }
    })
  }
})

describe('gitMemoGroups', () => {
  it('contains the eight expected groups', () => {
    expect(gitMemoGroups.map((group) => group.id)).toEqual([
      'create',
      'snapshot',
      'branch',
      'remote',
      'undo',
      'history',
      'tags',
      'stash',
    ])
  })

  it('has 5-10 commands per group', () => {
    for (const group of gitMemoGroups) {
      expect(group.items.length).toBeGreaterThanOrEqual(5)
      expect(group.items.length).toBeLessThanOrEqual(10)
    }
  })

  it('starts every command with git and has unique description keys', () => {
    const keys = gitMemoGroups.flatMap((group) => group.items.map((item) => item.descriptionKey))
    for (const group of gitMemoGroups) {
      for (const item of group.items) {
        expect(item.command.startsWith('git ')).toBe(true)
      }
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
})
