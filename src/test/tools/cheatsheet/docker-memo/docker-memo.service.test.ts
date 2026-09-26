import { describe, expect, it } from 'vitest'

import { installGuideKeys } from '@/utils/install-guide'
import enCheatsheet from '@/modules/i18n/locales/en/tools-cheatsheet.json'
import zhCheatsheet from '@/modules/i18n/locales/zh/tools-cheatsheet.json'
import {
  dockerLinuxGuide,
  dockerMemoGroups,
  dockerWindowsGuide,
  panelInstallGuide,
} from '@/tools/cheatsheet/docker-memo/docker-memo.service'

const allItems = dockerMemoGroups.flatMap((group) => group.items)

function pick(section: object, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      section,
    )
}

describe('docker install guides', () => {
  it('walks the Linux install from preflight to hello-world', () => {
    expect(dockerLinuxGuide.map((step) => step.id)).toEqual([
      'check',
      'remove',
      'repo',
      'install',
      'start',
      'mirror',
      'perms',
      'verify',
    ])
  })

  it('covers the WSL backend before Docker Desktop on Windows', () => {
    expect(dockerWindowsGuide.map((step) => step.id)).toEqual([
      'win-wsl',
      'win-desktop',
      'win-mirror',
      'win-rescue',
    ])
  })

  it('ships the registry mirrors as a daemon.json block', () => {
    const mirror = dockerLinuxGuide[5]
    const file = mirror?.blocks?.find((block) => block.kind === 'file')
    const content = file && file.kind === 'file' ? file.content : ''
    expect(content).toContain('"registry-mirrors"')
    expect(content).toContain('https://docker.m.daocloud.io')
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('installs 1Panel with the official quick start script', () => {
    expect(panelInstallGuide.map((step) => step.id)).toEqual([
      'panel-pre',
      'panel-install',
      'panel-info',
      'panel-firewall',
      'panel-verify',
    ])
    const install = panelInstallGuide[1]
    const code = install?.blocks?.find((block) => block.kind === 'code')
    const value = code && code.kind === 'code' ? code.value : ''
    expect(value).toContain('resource.fit2cloud.com/1panel/package/v2/quick_start.sh')
  })
})

describe('dockerMemoGroups', () => {
  it('contains the expected groups', () => {
    expect(dockerMemoGroups.map((group) => group.id)).toEqual([
      'images',
      'containers',
      'compose',
      'storage',
      'troubleshoot',
      'panel',
    ])
  })

  it('has 5-10 commands per group', () => {
    for (const group of dockerMemoGroups) {
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

describe('docker-memo i18n', () => {
  for (const [locale, messages] of [
    ['zh', zhCheatsheet],
    ['en', enCheatsheet],
  ] as const) {
    it(`defines every guide and command key in ${locale}`, () => {
      const section = messages['docker-memo']
      const expected = [
        'group-linux',
        'group-windows',
        'group-panel',
        ...installGuideKeys(dockerLinuxGuide),
        ...installGuideKeys(dockerWindowsGuide),
        ...installGuideKeys(panelInstallGuide),
        ...dockerMemoGroups.map((group) => `group-cmd-${group.id}`),
        ...allItems.map((item) => item.descriptionKey),
      ]
      for (const key of expected) {
        expect(pick(section, key), key).toBeTruthy()
      }
    })
  }
})
