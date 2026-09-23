import { describe, expect, it } from 'vitest'

import {
  aspectRatioOf,
  buildCanvasGraph,
  CANVAS_TEXT_LIMIT,
  composePromptText,
  findFreeSlot,
  LEGACY_WORKSPACE_ID,
  normalizeCanvasNode,
  normalizeGenParams,
  openaiSizeFor,
  parsePromptCandidates,
  summarizeWorkspaces,
  toImageRequestParams,
  wouldCreateCycle,
  type CanvasBox,
  type CanvasImageInput,
  type CanvasNode,
  type CanvasNodeRecord,
  type WorkspaceInput,
} from '@/tools/images/ai-image-gen/ai-image-gen.service'
import {
  BUILTIN_SKILLS,
  mergeSkills,
  parseSkillMarkdown,
  renderSkillSystem,
  serializeSkillMarkdown,
  type Skill,
} from '@/tools/images/ai-image-gen/skills'

describe('aspect to OpenAI size', () => {
  it('maps supported ratios to the three pixel buckets', () => {
    expect(openaiSizeFor('1:1')).toBe('1024x1024')
    expect(openaiSizeFor('3:2')).toBe('1536x1024')
    expect(openaiSizeFor('2:3')).toBe('1024x1536')
    expect(openaiSizeFor('16:9')).toBe('1536x1024')
    expect(openaiSizeFor('auto')).toBe('auto')
  })
})

describe('normalizeGenParams', () => {
  it('clamps count into 1..4', () => {
    expect(normalizeGenParams({ count: 0 }).count).toBe(1)
    expect(normalizeGenParams({ count: 9 }).count).toBe(4)
    expect(normalizeGenParams({ count: 3 }).count).toBe(3)
  })

  it('clamps compression and strips non digits from seed', () => {
    expect(normalizeGenParams({ outputCompression: -5 }).outputCompression).toBe(0)
    expect(normalizeGenParams({ outputCompression: 150 }).outputCompression).toBe(100)
    expect(normalizeGenParams({ seed: 'a12b34' }).seed).toBe('1234')
  })

  it('falls back to defaults for unknown enum values', () => {
    const params = normalizeGenParams({ aspect: '2:1', quality: 'ultra' } as never)
    expect(params.aspect).toBe('1:1')
    expect(params.quality).toBe('auto')
  })
})

describe('toImageRequestParams', () => {
  it('builds OpenAI params and drops compression for png', () => {
    const params = toImageRequestParams('openai', {
      ...normalizeGenParams(null),
      aspect: '3:2',
      outputFormat: 'png',
      outputCompression: 80,
    })
    expect(params).toMatchObject({
      size: '1536x1024',
      outputFormat: 'png',
      outputCompression: null,
    })
  })

  it('builds Gemini params with aspectRatio omitted for auto and numeric seed', () => {
    const auto = toImageRequestParams('gemini', normalizeGenParams({ aspect: 'auto' }))
    expect(auto.aspectRatio).toBeUndefined()
    expect(auto.seed).toBeNull()
    const seeded = toImageRequestParams(
      'gemini',
      normalizeGenParams({ aspect: '16:9', seed: '42' }),
    )
    expect(seeded).toMatchObject({ aspectRatio: '16:9', seed: 42 })
  })
})

describe('parsePromptCandidates', () => {
  it('reads a fenced JSON array', () => {
    const text = 'here you go:\n```json\n["a cat", "a dog"]\n```'
    expect(parsePromptCandidates(text)).toEqual(['a cat', 'a dog'])
  })

  it('serializes object candidates', () => {
    const parsed = parsePromptCandidates('[{"subject":"cat"}]')
    expect(parsed[0]).toContain('"subject": "cat"')
  })

  it('falls back to numbered lines and dedupes', () => {
    const text = '1. a red fox\n2. a red fox\n3. blue mountains at dusk'
    expect(parsePromptCandidates(text)).toEqual(['a red fox', 'blue mountains at dusk'])
  })
})

const skill = (over: Partial<Skill> = {}): Skill => ({
  id: 'my-skill',
  name: 'my-skill',
  description: 'a demo skill',
  markdown: 'Write prompts in {{lang}}.',
  references: [],
  builtin: false,
  enabled: true,
  ...over,
})

describe('skill package (SKILL.md)', () => {
  it('round-trips through serialize and parse', () => {
    const parsed = parseSkillMarkdown(serializeSkillMarkdown(skill()))
    expect(parsed.name).toBe('my-skill')
    expect(parsed.description).toBe('a demo skill')
    expect(parsed.markdown).toBe('Write prompts in {{lang}}.')
    expect(parsed.builtin).toBe(false)
  })

  it('rejects missing frontmatter, bad names and empty bodies', () => {
    expect(() => parseSkillMarkdown('# no frontmatter')).toThrow()
    expect(() => parseSkillMarkdown('---\nname: Bad_Name\ndescription: x\n---\nbody')).toThrow()
    expect(() => parseSkillMarkdown('---\nname: ok-skill\ndescription: x\n---\n   ')).toThrow()
  })

  it('auto-discovers SKILL.md packages from the skills directory', () => {
    const ids = BUILTIN_SKILLS.map((item) => item.id)
    expect(ids).toContain('nai5-prompt-expert')
    const nai5 = BUILTIN_SKILLS.find((item) => item.id === 'nai5-prompt-expert')
    expect(nai5?.references.length).toBeGreaterThan(0)
    expect(renderSkillSystem(nai5 ?? skill(), 'zh')).toContain('## Reference:')
  })

  it('mergeSkills keeps customs, applies flags to builtins and never loses file content', () => {
    const merged = mergeSkills([skill({ id: 'mine', name: 'mine' })], {
      'nai5-prompt-expert': false,
    })
    expect(merged.find((item) => item.id === 'nai5-prompt-expert')?.enabled).toBe(false)
    expect(merged.find((item) => item.id === 'mine')).toBeDefined()
    expect(merged.filter((item) => item.builtin)).toHaveLength(BUILTIN_SKILLS.length)
  })

  it('renderSkillSystem replaces the language placeholder and appends the output contract', () => {
    const rendered = renderSkillSystem(skill(), 'zh')
    expect(rendered).toContain('Write prompts in Chinese.')
    expect(rendered).toContain('JSON array of exactly 4')
  })
})

describe('normalizeCanvasNode', () => {
  it('keeps a well formed prompt record', () => {
    const result = normalizeCanvasNode({
      nodeId: 'p:01ABC',
      x: 120.7,
      y: -40,
      text: 'a cat',
      refs: ['01IMG'],
      createdAt: 1700000000000,
    })
    expect(result).toEqual({
      nodeId: 'p:01ABC',
      workspaceId: LEGACY_WORKSPACE_ID,
      x: 121,
      y: -40,
      text: 'a cat',
      refs: ['01IMG'],
      chain: [],
      createdAt: 1700000000000,
    })
    expect(normalizeCanvasNode({ nodeId: 'p:1', workspaceId: 'W7' })?.workspaceId).toBe('W7')
  })

  it('drops non finite coordinates back to auto layout', () => {
    expect(normalizeCanvasNode({ nodeId: 'a', x: Number.NaN, y: '12' })?.x).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 'a', x: '12', y: Number.POSITIVE_INFINITY })?.y).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 'a' })?.x).toBeNull()
  })

  it('treats a missing or oversized text as a position only node', () => {
    expect(normalizeCanvasNode({ nodeId: 'a', x: 1, y: 2 })?.text).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 'a', text: 42 })?.text).toBeNull()
    const long = normalizeCanvasNode({ nodeId: 'a', text: 'x'.repeat(CANVAS_TEXT_LIMIT + 10) })
    expect(long?.text).toHaveLength(CANVAS_TEXT_LIMIT)
  })

  it('dedupes refs and clamps them to the reference image limit', () => {
    const result = normalizeCanvasNode({
      nodeId: 'a',
      refs: ['1', '1', '', 2, '3', '4', '5', '6'],
    })
    expect(result?.refs).toEqual(['1', '3', '4', '5'])
    expect(normalizeCanvasNode({ nodeId: 'a', refs: 'nope' })?.refs).toEqual([])
  })

  it('keeps only usable upstream prompt links', () => {
    const result = normalizeCanvasNode({
      nodeId: 'p:A',
      chain: ['p:B', 'p:B', '', 42, 'IMG_1', 'p:A', null],
    })
    expect(result?.chain).toEqual(['p:B'])
    expect(normalizeCanvasNode({ nodeId: 'p:A' })?.chain).toEqual([])
    expect(normalizeCanvasNode({ nodeId: 'p:A', chain: 'nope' })?.chain).toEqual([])
  })

  it('returns null when the nodeId is unusable', () => {
    expect(normalizeCanvasNode(null)).toBeNull()
    expect(normalizeCanvasNode('p:1')).toBeNull()
    expect(normalizeCanvasNode({ nodeId: '' })).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 42 })).toBeNull()
  })
})

const img = (
  id: string,
  jobId: string,
  over: Partial<CanvasImageInput> = {},
): CanvasImageInput => ({
  id,
  jobId,
  prompt: `prompt of ${id}`,
  createdAt: 1000,
  ratio: 1,
  ...over,
})

const overlay = (nodeId: string, over: Partial<CanvasNodeRecord> = {}): CanvasNodeRecord => ({
  nodeId,
  workspaceId: LEGACY_WORKSPACE_ID,
  x: null,
  y: null,
  text: null,
  refs: [],
  chain: [],
  createdAt: null,
  ...over,
})

const boxOf = (node: CanvasNode): CanvasBox => ({
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
})

const intersects = (a: CanvasBox, b: CanvasBox): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

describe('aspectRatioOf', () => {
  it('divides the ratio parts and falls back to square', () => {
    expect(aspectRatioOf('3:2')).toBe(1.5)
    expect(aspectRatioOf('2:3')).toBeCloseTo(2 / 3)
    expect(aspectRatioOf('auto')).toBe(1)
    expect(aspectRatioOf('2:0')).toBe(1)
    expect(aspectRatioOf('wide')).toBe(1)
  })
})

describe('findFreeSlot', () => {
  it('takes the start position when nothing is occupied', () => {
    expect(findFreeSlot({ x: 0, y: 40, width: 240, height: 240 }, [])).toEqual({ x: 0, y: 40 })
  })

  it('steps straight down past a box in the same column', () => {
    const occupied = [{ x: 0, y: 0, width: 240, height: 240 }]
    const spot = findFreeSlot({ x: 0, y: 0, width: 240, height: 240 }, occupied)
    expect(spot.x).toBe(0)
    expect(spot.y).toBe(264)
  })

  it('ignores occupied boxes that live in another column', () => {
    const occupied = [{ x: 900, y: 0, width: 240, height: 240 }]
    expect(findFreeSlot({ x: 0, y: 0, width: 240, height: 240 }, occupied)).toEqual({ x: 0, y: 0 })
  })
})

describe('buildCanvasGraph', () => {
  it('synthesizes one prompt node per job and wires every output image to it', () => {
    const graph = buildCanvasGraph([img('a', 'J'), img('b', 'J')], [])
    const prompts = graph.nodes.filter((node) => node.kind === 'prompt')
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({
      id: 'p:J',
      jobId: 'J',
      text: 'prompt of a',
      persisted: false,
    })
    expect(graph.edges.map((edge) => `${edge.source}>${edge.target}:${edge.kind}`).sort()).toEqual([
      'p:J>a:output',
      'p:J>b:output',
    ])
  })

  it('turns overlay refs into reference edges feeding the prompt node', () => {
    const graph = buildCanvasGraph(
      [img('seed', 'J0'), img('out', 'J1')],
      [overlay('p:J1', { text: 'remix', refs: ['seed'] })],
    )
    expect(graph.edges).toContainEqual({
      id: 'ref:seed>p:J1',
      source: 'seed',
      target: 'p:J1',
      kind: 'reference',
    })
    const prompt = graph.nodes.find((node) => node.id === 'p:J1')
    expect(prompt?.kind === 'prompt' && prompt.persisted).toBe(true)
    expect(prompt?.kind === 'prompt' && prompt.x).toBeGreaterThan(
      (graph.nodes.find((node) => node.id === 'seed') as CanvasNode).x,
    )
  })

  it('drops a dangling ref and a self referencing ref without breaking the node', () => {
    const graph = buildCanvasGraph(
      [img('a', 'J'), img('own', 'J')],
      [overlay('p:J', { text: 't', refs: ['ghost', 'own'] })],
    )
    expect(graph.edges.filter((edge) => edge.kind === 'reference')).toEqual([])
    const prompt = graph.nodes.find((node) => node.id === 'p:J')
    expect(prompt?.kind === 'prompt' && prompt.refs).toEqual(['ghost', 'own'])
  })

  it('keeps pinned coordinates and places the rest without overlapping', () => {
    const graph = buildCanvasGraph(
      [img('a', 'J'), img('b', 'J'), img('c', 'J')],
      [overlay('a', { x: 900, y: 1200 })],
    )
    const a = graph.nodes.find((node) => node.id === 'a')
    expect(a).toMatchObject({ x: 900, y: 1200, pinned: true })
    const boxes = graph.nodes.map(boxOf)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(intersects(boxes[i], boxes[j])).toBe(false)
      }
    }
  })

  it('keeps a canvas created prompt node that has no output yet', () => {
    const graph = buildCanvasGraph([], [overlay('p:NEW', { text: 'idle', createdAt: 7 })])
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]).toMatchObject({ kind: 'prompt', id: 'p:NEW', text: 'idle' })
    expect(graph.edges).toEqual([])
  })

  it('ignores a position only overlay whose image is gone', () => {
    const graph = buildCanvasGraph([], [overlay('ghost', { x: 10, y: 20 })])
    expect(graph.nodes).toEqual([])
  })

  it('derives chain edges between prompt nodes', () => {
    const graph = buildCanvasGraph(
      [],
      [
        overlay('p:A', { text: 'base' }),
        overlay('p:B', { text: 'subject', chain: ['p:A', 'p:ghost', 'p:B'] }),
      ],
    )
    expect(graph.edges).toContainEqual({
      id: 'chain:p:A>p:B',
      source: 'p:A',
      target: 'p:B',
      kind: 'chain',
    })
    expect(graph.edges.filter((edge) => edge.source === 'p:ghost')).toEqual([])
    const b = graph.nodes.find((node) => node.id === 'p:B')
    expect(b?.kind === 'prompt' && b.chain).toEqual(['p:A', 'p:ghost', 'p:B'])
  })

  it('leaves an imported image as a root without synthesizing a prompt node', () => {
    const graph = buildCanvasGraph([img('up1', 'up1', { imported: true, ratio: 1.5 })], [])
    expect(graph.nodes.map((node) => node.kind)).toEqual(['image'])
    expect(graph.edges).toEqual([])
    expect(graph.nodes[0]).toMatchObject({ id: 'up1', width: 240, height: 160 })
  })

  it('still lets an imported image feed a prompt node as a reference', () => {
    const graph = buildCanvasGraph(
      [img('up1', 'up1', { imported: true }), img('out', 'J')],
      [overlay('p:J', { text: 'remix', refs: ['up1'] })],
    )
    expect(graph.nodes.filter((node) => node.kind === 'prompt').map((node) => node.id)).toEqual([
      'p:J',
    ])
    expect(graph.edges).toContainEqual({
      id: 'ref:up1>p:J',
      source: 'up1',
      target: 'p:J',
      kind: 'reference',
    })
  })

  it('returns an empty graph for empty input', () => {
    expect(buildCanvasGraph([], [])).toEqual({ nodes: [], edges: [] })
  })
})

describe('wouldCreateCycle', () => {
  const edge = (source: string, target: string) => ({
    id: `${source}>${target}`,
    source,
    target,
    kind: 'output' as const,
  })

  it('allows a link between unrelated nodes', () => {
    expect(wouldCreateCycle([edge('a', 'b'), edge('c', 'd')], 'c', 'a')).toBe(false)
  })

  it('rejects a direct back edge', () => {
    expect(wouldCreateCycle([edge('a', 'b')], 'b', 'a')).toBe(true)
  })

  it('rejects a link closing a multi hop path', () => {
    const edges = [edge('p1', 'i1'), edge('i1', 'p2'), edge('p2', 'i2')]
    expect(wouldCreateCycle(edges, 'i2', 'p1')).toBe(true)
    expect(wouldCreateCycle(edges, 'i2', 'p3')).toBe(false)
  })

  it('rejects a self loop', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true)
  })
})

describe('composePromptText', () => {
  const chainGraph = (entries: [nodeId: string, over?: Partial<CanvasNodeRecord>][]) =>
    buildCanvasGraph(
      [],
      entries.map(([nodeId, over]) => overlay(nodeId, { text: '', ...over })),
    )

  it('joins a two level chain from the root down to the node', () => {
    const graph = chainGraph([
      ['p:A', { text: 'cinematic lighting' }],
      ['p:B', { text: 'a red fox', chain: ['p:A'] }],
    ])
    expect(composePromptText(graph, 'p:B')).toBe('cinematic lighting\n\na red fox')
  })

  it('orders merged ancestors by depth before creation time', () => {
    const graph = chainGraph([
      ['p:ROOT', { text: 'root', createdAt: 100 }],
      ['p:MID', { text: 'mid', createdAt: 1, chain: ['p:ROOT'] }],
      ['p:LEAF', { text: 'leaf', createdAt: 2, chain: ['p:ROOT', 'p:MID'] }],
    ])
    expect(composePromptText(graph, 'p:LEAF')).toBe('root\n\nmid\n\nleaf')
  })

  it('skips blank upstream text and dangling links', () => {
    const graph = chainGraph([
      ['p:EMPTY', { text: '   ' }],
      ['p:B', { text: 'subject', chain: ['p:EMPTY', 'p:GHOST'] }],
    ])
    expect(composePromptText(graph, 'p:B')).toBe('subject')
  })

  it('returns the node text alone when nothing feeds it', () => {
    const graph = chainGraph([['p:A', { text: 'solo' }]])
    expect(composePromptText(graph, 'p:A')).toBe('solo')
  })

  it('returns an empty string for an unknown node', () => {
    expect(composePromptText(chainGraph([['p:A', { text: 'a' }]]), 'p:MISSING')).toBe('')
  })
})

describe('summarizeWorkspaces', () => {
  const ws = (id: string, over: Partial<WorkspaceInput> = {}): WorkspaceInput => ({
    id,
    name: `name ${id}`,
    description: '',
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  })

  it('counts images and distinct generation jobs per workspace', () => {
    const summary = summarizeWorkspaces(
      [ws('A'), ws('B')],
      [
        { workspaceId: 'A', jobId: 'J1' },
        { workspaceId: 'A', jobId: 'J1' },
        { workspaceId: 'A', jobId: 'J2' },
        { workspaceId: 'B', jobId: 'J3' },
      ],
      [],
    )
    expect(summary[0]).toMatchObject({ id: 'A', imageCount: 3, jobCount: 2, activeCount: 0 })
    expect(summary[1]).toMatchObject({ id: 'B', imageCount: 1, jobCount: 1 })
  })

  it('routes records without a workspace id to the default workspace', () => {
    const summary = summarizeWorkspaces(
      [ws(LEGACY_WORKSPACE_ID)],
      [{ jobId: 'J1' }, { workspaceId: 'A', jobId: 'J2' }],
      [],
    )
    expect(summary[0]).toMatchObject({ id: LEGACY_WORKSPACE_ID, imageCount: 1, jobCount: 1 })
  })

  it('counts in-flight jobs', () => {
    const summary = summarizeWorkspaces(
      [ws('A')],
      [],
      [
        { workspaceId: 'A', active: true },
        { workspaceId: 'A', active: true },
        { workspaceId: 'A', active: false },
        { workspaceId: 'B', active: true },
      ],
    )
    expect(summary[0].activeCount).toBe(2)
  })

  it('keeps the incoming order and returns nothing for no workspaces', () => {
    expect(summarizeWorkspaces([], [], [])).toEqual([])
    expect(summarizeWorkspaces([ws('B'), ws('A')], [], []).map((item) => item.id)).toEqual([
      'B',
      'A',
    ])
  })
})
