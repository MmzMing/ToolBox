// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import type { CanvasNodeRecord } from '@/tools/images/ai-image-gen/ai-image-gen.service'
import { useAiImageGenStore } from '@/tools/images/ai-image-gen/store'

const node = (nodeId: string): CanvasNodeRecord => ({
  nodeId,
  workspaceId: 'legacy',
  x: null,
  y: null,
  text: null,
  refs: [],
  chain: [],
  width: null,
  height: null,
  mentions: [],
  createdAt: null,
})

const apply = (records: CanvasNodeRecord[]) => useAiImageGenStore.getState().setOverlays(records)
const push = () => useAiImageGenStore.getState().pushHistory()
const step = (dir: 'undo' | 'redo') => useAiImageGenStore.getState().stepHistory(dir)

describe('canvas history stack', () => {
  beforeEach(() => {
    useAiImageGenStore.setState({ past: [], future: [], overlays: [] })
  })

  it('hands back the state captured before the newest change', () => {
    apply([node('p:1')])
    push()
    apply([node('p:1'), node('p:2')])

    // stepHistory 只交出快照，落回 IDB 与 setOverlays 归 orchestrator 管
    expect(step('undo')).toEqual([node('p:1')])
    expect(useAiImageGenStore.getState().past).toEqual([])
  })

  it('walks forward again with redo', () => {
    apply([node('p:1')])
    push()
    apply([node('p:1'), node('p:2')])
    step('undo')

    expect(step('redo')).toEqual([node('p:1'), node('p:2')])
  })

  it('drops the redo branch as soon as a new change lands', () => {
    apply([node('p:1')])
    push()
    apply([node('p:2')])
    step('undo')
    push()

    expect(step('redo')).toBeNull()
  })

  it('reports nothing to step when a stack is empty', () => {
    expect(step('undo')).toBeNull()
    expect(step('redo')).toBeNull()
  })

  it('keeps the stack bounded to the newest entries', () => {
    for (let index = 0; index < 60; index++) {
      push()
    }

    expect(useAiImageGenStore.getState().past).toHaveLength(50)
  })

  it('forgets history when the workspace changes', () => {
    push()
    push()
    useAiImageGenStore.setState({ future: [[node('p:1')]] })

    useAiImageGenStore.getState().setActiveWorkspace('other')

    const state = useAiImageGenStore.getState()
    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
  })
})
