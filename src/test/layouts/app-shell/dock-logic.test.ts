import { describe, expect, it } from 'vitest'

import {
  buildBreadcrumbs,
  fanSlots,
  isDockCollapsed,
  isImmersivePath,
  modKeyLabel,
  nextFocusIndex,
  normalizeActiveCategory,
  resolveShellLayout,
  routeCategoryOf,
  toggleCategory,
} from '@/layouts/app-shell/dock-logic'
import type { CategoryKey } from '@/tools/categories'

const KEYS = ['text', 'images', 'crypto'] as const satisfies readonly CategoryKey[]

describe('resolveShellLayout', () => {
  it('keeps the rail dock and a floating panel on desktop with every external link inline', () => {
    expect(resolveShellLayout('desktop')).toEqual({
      dock: 'rail',
      panel: 'floating',
      externalLinks: 'inline',
      breadcrumb: true,
      topCapsules: true,
    })
  })

  it('folds the three external links into a menu on tablet to free top-bar width', () => {
    expect(resolveShellLayout('tablet').externalLinks).toBe('menu')
    expect(resolveShellLayout('tablet').dock).toBe('rail')
  })

  it('drops the top capsules and the breadcrumb on mobile', () => {
    expect(resolveShellLayout('mobile')).toEqual({
      dock: 'bottom',
      panel: 'sheet',
      // 手机不渲染顶栏胶囊，外链落点这项取值无消费者
      externalLinks: 'inline',
      breadcrumb: false,
      topCapsules: false,
    })
  })
})

describe('toggleCategory', () => {
  it('closes the panel when the same category key is pressed again', () => {
    expect(toggleCategory('text', 'text')).toBeNull()
  })

  it('switches exclusively to the other category', () => {
    expect(toggleCategory('text', 'images')).toBe('images')
    expect(toggleCategory(null, 'images')).toBe('images')
  })
})

describe('normalizeActiveCategory', () => {
  it('accepts a known category key', () => {
    expect(normalizeActiveCategory('text', KEYS)).toBe('text')
  })

  it('rejects null, empty, unknown and non-string payloads', () => {
    expect(normalizeActiveCategory(null, KEYS)).toBeNull()
    expect(normalizeActiveCategory('', KEYS)).toBeNull()
    expect(normalizeActiveCategory('nope', KEYS)).toBeNull()
    expect(normalizeActiveCategory(42, KEYS)).toBeNull()
    expect(normalizeActiveCategory(['text'], KEYS)).toBeNull()
    expect(normalizeActiveCategory(undefined, [])).toBeNull()
  })
})

describe('routeCategoryOf', () => {
  const tools = [
    { path: '/text-diff', category: 'text' as const },
    { path: '/qr-code', category: 'images' as const },
  ]

  it('resolves the owning category of a tool route', () => {
    expect(routeCategoryOf('/qr-code', tools)).toBe('images')
  })

  it('returns null for the home page and for unknown paths', () => {
    expect(routeCategoryOf('/', tools)).toBeNull()
    expect(routeCategoryOf('/gone', tools)).toBeNull()
    expect(routeCategoryOf('/text-diff', [])).toBeNull()
  })
})

describe('isImmersivePath', () => {
  const tools = [{ path: '/gif-editor', immersive: true }, { path: '/text-diff' }]

  it('is true only for tools flagged immersive', () => {
    expect(isImmersivePath('/gif-editor', tools)).toBe(true)
    expect(isImmersivePath('/text-diff', tools)).toBe(false)
    expect(isImmersivePath('/unknown', tools)).toBe(false)
  })
})

describe('nextFocusIndex', () => {
  it('moves one step along the rail orientation and wraps around both ends', () => {
    expect(nextFocusIndex({ index: 0, total: 5, key: 'ArrowDown', orientation: 'vertical' })).toBe(
      1,
    )
    expect(nextFocusIndex({ index: 4, total: 5, key: 'ArrowDown', orientation: 'vertical' })).toBe(
      0,
    )
    expect(nextFocusIndex({ index: 0, total: 5, key: 'ArrowUp', orientation: 'vertical' })).toBe(4)
    expect(
      nextFocusIndex({ index: 2, total: 5, key: 'ArrowRight', orientation: 'horizontal' }),
    ).toBe(3)
    expect(
      nextFocusIndex({ index: 0, total: 5, key: 'ArrowLeft', orientation: 'horizontal' }),
    ).toBe(4)
  })

  it('ignores the axis perpendicular to the orientation', () => {
    expect(nextFocusIndex({ index: 1, total: 5, key: 'ArrowLeft', orientation: 'vertical' })).toBe(
      null,
    )
    expect(
      nextFocusIndex({ index: 1, total: 5, key: 'ArrowDown', orientation: 'horizontal' }),
    ).toBe(null)
  })

  it('jumps to the ends on Home and End', () => {
    expect(nextFocusIndex({ index: 3, total: 5, key: 'Home', orientation: 'vertical' })).toBe(0)
    expect(nextFocusIndex({ index: 3, total: 5, key: 'End', orientation: 'vertical' })).toBe(4)
  })

  it('returns null for unrelated keys and for an empty toolbar', () => {
    expect(nextFocusIndex({ index: 0, total: 5, key: 'Enter', orientation: 'vertical' })).toBeNull()
    expect(
      nextFocusIndex({ index: 0, total: 0, key: 'ArrowDown', orientation: 'vertical' }),
    ).toBeNull()
  })
})

describe('isDockCollapsed', () => {
  it('collapses on an ordinary tool page once its content area has been used', () => {
    expect(isDockCollapsed({ collapsedAt: '/text-diff', pathname: '/text-diff' })).toBe(true)
    expect(isDockCollapsed({ collapsedAt: '/qr-code', pathname: '/qr-code' })).toBe(true)
  })

  it('collapses on an immersive page the same way', () => {
    expect(isDockCollapsed({ collapsedAt: '/gif-editor', pathname: '/gif-editor' })).toBe(true)
  })

  it('expands again after navigating away and back', () => {
    expect(isDockCollapsed({ collapsedAt: '/gif-editor', pathname: '/markdown-editor' })).toBe(
      false,
    )
    expect(isDockCollapsed({ collapsedAt: null, pathname: '/gif-editor' })).toBe(false)
  })
})

describe('fanSlots', () => {
  it('spreads symmetrically above the gear, centred on the vertical', () => {
    const slots = fanSlots(5, 132)
    expect(slots).toHaveLength(5)
    expect(slots[2]).toEqual({ x: 0, y: -132 })
    expect(slots[0].x).toBeLessThan(0)
    expect(slots[4].x).toBeGreaterThan(0)
    // 左右镜像对称
    expect(slots[0].x).toBe(-slots[4].x)
    expect(slots[0].y).toBe(slots[4].y)
    expect(slots[1].x).toBe(-slots[3].x)
    expect(slots[1].y).toBe(slots[3].y)
  })

  it('keeps every slot above the gear so the fan never sinks into the dock', () => {
    for (const slot of fanSlots(5, 132)) {
      expect(slot.y).toBeLessThan(0)
    }
  })

  it('handles a single slot and an empty count', () => {
    expect(fanSlots(1, 100)).toEqual([{ x: 0, y: -100 }])
    expect(fanSlots(0, 100)).toEqual([])
  })
})

describe('modKeyLabel', () => {
  it('uses the command glyph on Apple user agents', () => {
    expect(modKeyLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('⌘')
    expect(modKeyLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('⌘')
  })

  it('falls back to Ctrl elsewhere, including an empty string', () => {
    expect(modKeyLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Ctrl')
    expect(modKeyLabel('')).toBe('Ctrl')
  })
})

describe('buildBreadcrumbs', () => {
  it('shows only the home crumb on the index route', () => {
    expect(
      buildBreadcrumbs({
        pathname: '/',
        homeLabel: 'Tools',
        toolTitle: null,
        toolCategory: null,
        categoryLabel: null,
        staticPageLabel: null,
      }),
    ).toEqual([{ kind: 'home', label: 'Tools', href: '/', categoryKey: null }])
  })

  it('nests a tool page under its category, which has no anchor of its own', () => {
    const crumbs = buildBreadcrumbs({
      pathname: '/text-diff',
      homeLabel: 'Tools',
      toolTitle: 'Text Diff',
      toolCategory: 'text' satisfies CategoryKey,
      categoryLabel: 'Text',
      staticPageLabel: null,
    })
    expect(crumbs.map((crumb) => crumb.kind)).toEqual(['home', 'category', 'page'])
    expect(crumbs[1]).toEqual({
      kind: 'category',
      label: 'Text',
      href: null,
      categoryKey: 'text',
    })
    expect(crumbs[2]?.href).toBe('/text-diff')
  })

  it('degrades to two levels on a static page', () => {
    const crumbs = buildBreadcrumbs({
      pathname: '/about',
      homeLabel: 'Tools',
      toolTitle: null,
      toolCategory: null,
      categoryLabel: null,
      staticPageLabel: 'About',
    })
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['Tools', 'About'])
  })

  it('falls back to the raw pathname for an unknown route instead of rendering blank', () => {
    const crumbs = buildBreadcrumbs({
      pathname: '/mystery',
      homeLabel: 'Tools',
      toolTitle: null,
      toolCategory: null,
      categoryLabel: null,
      staticPageLabel: null,
    })
    expect(crumbs[1]).toMatchObject({ kind: 'page', label: '/mystery' })
  })

  it('treats a tool with an unresolved i18n title as a static page', () => {
    const crumbs = buildBreadcrumbs({
      pathname: '/text-diff',
      homeLabel: 'Tools',
      toolTitle: null,
      toolCategory: 'text',
      categoryLabel: 'Text',
      staticPageLabel: null,
    })
    expect(crumbs.map((crumb) => crumb.kind)).toEqual(['home', 'page'])
  })
})
