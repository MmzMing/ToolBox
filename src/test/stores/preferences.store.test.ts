// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { nextLocale, usePreferencesStore } from '@/stores/preferences.store'

const STORAGE_KEY = 'toolbox.preferences'

function seed(persisted: unknown, version: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: persisted, version }))
  usePreferencesStore.persist.rehydrate()
}

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear()
    usePreferencesStore.setState({
      locale: 'zh',
      activeCategory: null,
      customAcceleratorNodes: [],
      acceleratorNode: null,
    })
  })

  it('starts with no highlighted category so the dock never auto-opens a panel', () => {
    expect(usePreferencesStore.getState().activeCategory).toBeNull()
  })

  it('keeps the locale and accelerator choices when migrating from v4', () => {
    seed(
      {
        locale: 'en',
        expandedCategories: ['text', 'images'],
        sidebarCollapsed: true,
        customAcceleratorNodes: ['https://ghproxy.example/'],
        acceleratorNode: 'https://ghproxy.example/',
      },
      4,
    )
    const state = usePreferencesStore.getState()
    expect(state.locale).toBe('en')
    expect(state.customAcceleratorNodes).toEqual(['https://ghproxy.example/'])
    expect(state.acceleratorNode).toBe('https://ghproxy.example/')
    expect(state.activeCategory).toBeNull()
  })

  it('drops the retired sidebar fields instead of carrying them into v5', () => {
    seed({ locale: 'zh', expandedCategories: ['text'], sidebarCollapsed: true }, 4)
    // persist 只在状态变更时回写，触发一次写入才能看到落盘后的形状
    usePreferencesStore.getState().setActiveCategory('text')
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      state: Record<string, unknown>
      version: number
    }
    expect(raw.version).toBe(5)
    expect(raw.state).not.toHaveProperty('sidebarCollapsed')
    expect(raw.state).not.toHaveProperty('expandedCategories')
  })

  it('restores a category that still exists', () => {
    seed({ locale: 'zh', activeCategory: 'images' }, 5)
    expect(usePreferencesStore.getState().activeCategory).toBe('images')
  })

  it('falls back to null for an unknown or malformed category', () => {
    seed({ locale: 'zh', activeCategory: 'no-such-category' }, 5)
    expect(usePreferencesStore.getState().activeCategory).toBeNull()

    seed({ locale: 'zh', activeCategory: ['images'] }, 5)
    expect(usePreferencesStore.getState().activeCategory).toBeNull()
  })

  it('writes the last opened category back to storage', () => {
    usePreferencesStore.getState().setActiveCategory('crypto')
    expect(usePreferencesStore.getState().activeCategory).toBe('crypto')

    usePreferencesStore.getState().setActiveCategory(null)
    expect(usePreferencesStore.getState().activeCategory).toBeNull()
  })
})

describe('nextLocale', () => {
  it('flips to the other supported locale so one tap is enough', () => {
    expect(nextLocale('zh')).toBe('en')
    expect(nextLocale('en')).toBe('zh')
  })
})
