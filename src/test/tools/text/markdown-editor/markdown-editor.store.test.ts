// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { useMarkdownEditorStore } from '@/tools/text/markdown-editor/markdown-editor.store'

const KEY = 'toolbox.markdown-editor'

/** zustand persist 存的是信封，不是裸 state：手写字面量必须带上 state/version */
function hydrate(state: unknown, version = 3) {
  localStorage.setItem(KEY, JSON.stringify({ state, version }))
  useMarkdownEditorStore.persist.rehydrate()
}

const draft = (over: Record<string, unknown> = {}) => ({
  title: 'T',
  content: 'body',
  updatedAt: 1000,
  seeded: true,
  ui: {},
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  useMarkdownEditorStore.setState({
    title: '',
    content: '',
    updatedAt: 0,
    seeded: false,
  })
})

describe('draft hydration', () => {
  it('coerces non-string fields to safe values', () => {
    hydrate(draft({ title: 42, content: null }))
    const state = useMarkdownEditorStore.getState()
    expect(state.title).toBe('')
    expect(state.content).toBe('')
  })

  it('ignores a garbage view mode and keeps the default', () => {
    hydrate(draft({ ui: { viewMode: 'turbo', syncScroll: 'yes' } }))
    const ui = useMarkdownEditorStore.getState().ui
    expect(ui.viewMode).toBe('split')
    expect(ui.syncScroll).toBe(true)
  })

  it('falls back to defaults for a wholly unusable payload', () => {
    hydrate('not an object')
    const state = useMarkdownEditorStore.getState()
    expect(state.content).toBe('')
    expect(state.ui.viewMode).toBe('split')
  })
})

describe('v2 multi-document migration', () => {
  const legacy = {
    docs: [
      { id: 'a', title: 'A', content: 'body a', createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'B', content: 'body b', createdAt: 2, updatedAt: 9 },
    ],
    activeDocId: 'a',
    seeded: true,
    ui: { viewMode: 'split' },
  }

  it('keeps the document that was open', () => {
    hydrate(legacy, 2)
    const state = useMarkdownEditorStore.getState()
    expect(state.title).toBe('A')
    expect(state.content).toBe('body a')
  })

  it('falls back to the newest document when the active id dangles', () => {
    hydrate({ ...legacy, activeDocId: 'missing' }, 2)
    expect(useMarkdownEditorStore.getState().content).toBe('body b')
  })

  it('survives a legacy payload whose docs array is junk', () => {
    hydrate({ docs: [{ nope: true }, null], activeDocId: '', seeded: true }, 2)
    expect(useMarkdownEditorStore.getState().content).toBe('')
  })
})

describe('draft actions', () => {
  it('stamps updatedAt on every write', () => {
    useMarkdownEditorStore.getState().setContent('x')
    const first = useMarkdownEditorStore.getState().updatedAt
    expect(first).toBeGreaterThan(0)
    useMarkdownEditorStore.getState().setTitle('y')
    expect(useMarkdownEditorStore.getState().updatedAt).toBeGreaterThanOrEqual(first)
  })

  it('replaces title and content together on import', () => {
    useMarkdownEditorStore.getState().loadDocument('notes', '# imported')
    const state = useMarkdownEditorStore.getState()
    expect(state.title).toBe('notes')
    expect(state.content).toBe('# imported')
  })

  it('seeds once and never resurrects a cleared draft', () => {
    const seed = () => useMarkdownEditorStore.getState().seedIfEmpty('# hi', 'sample')
    seed()
    expect(useMarkdownEditorStore.getState().content).toBe('# hi')
    useMarkdownEditorStore.getState().setContent('')
    seed()
    expect(useMarkdownEditorStore.getState().content).toBe('')
  })

  it('does not overwrite a draft that already has content', () => {
    useMarkdownEditorStore.getState().setContent('mine')
    useMarkdownEditorStore.getState().seedIfEmpty('# hi', 'sample')
    expect(useMarkdownEditorStore.getState().content).toBe('mine')
  })
})
