import { describe, expect, it } from 'vitest'

import {
  aspectRatioOf,
  boundingBoxOf,
  buildCanvasGraph,
  buildCanvasMap,
  canvasMapBox,
  CANVAS_IMAGE_WIDTH,
  CANVAS_MAP_LIMIT,
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_PROMPT_MAX_HEIGHT,
  CANVAS_TEXT_LIMIT,
  clampCanvasSize,
  composePromptText,
  defaultGenParams,
  findFreeSlot,
  insertReferenceMention,
  LEGACY_WORKSPACE_ID,
  MAX_MENTIONS,
  nextWorkspaceNumber,
  normalizeCanvasNode,
  normalizeGenParams,
  normalizePolishedText,
  normalizeWorkspace,
  openaiSizeFor,
  parsePromptCandidates,
  parseReferenceMentions,
  polishSystemPrompt,
  referenceLabelAt,
  remapReferenceMentions,
  summarizeWorkspaces,
  toImageRequestParams,
  WORKSPACE_NAME_LIMIT,
  wouldCreateCycle,
  zipReferenceMentions,
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
  it('defaults the aspect to auto so the provider follows the reference images', () => {
    expect(normalizeGenParams(null).aspect).toBe('auto')
    expect(defaultGenParams().aspect).toBe('auto')
  })

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
    expect(params.aspect).toBe('auto')
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
      vision: true,
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
      width: null,
      height: null,
      vision: true,
      mentions: [],
      createdAt: 1700000000000,
    })
    expect(normalizeCanvasNode({ nodeId: 'p:1', workspaceId: 'W7' })?.workspaceId).toBe('W7')
  })

  it('treats a missing or tampered vision flag as false', () => {
    expect(normalizeCanvasNode({ nodeId: 'p:a', text: '' })?.vision).toBe(false)
    expect(normalizeCanvasNode({ nodeId: 'p:a', text: '', vision: 'yes' })?.vision).toBe(false)
  })

  it('rounds a manual size and caps it per node kind', () => {
    expect(normalizeCanvasNode({ nodeId: 'a', width: 300.6, height: 200.4 })).toMatchObject({
      width: 301,
      height: 200,
    })
    // 提示词节点的高度封顶，图片节点不封
    expect(normalizeCanvasNode({ nodeId: 'p:a', width: 300, height: 9999 })?.height).toBe(
      CANVAS_PROMPT_MAX_HEIGHT,
    )
    expect(normalizeCanvasNode({ nodeId: 'a', width: 9999, height: 9999 })).toMatchObject({
      width: CANVAS_NODE_MAX_WIDTH,
      height: CANVAS_NODE_MAX_HEIGHT,
    })
    expect(normalizeCanvasNode({ nodeId: 'a', width: 1, height: 1 })).toMatchObject({
      width: CANVAS_NODE_MIN_WIDTH,
      height: CANVAS_NODE_MIN_HEIGHT,
    })
  })

  it('drops a half specified or non finite size back to the default box', () => {
    expect(normalizeCanvasNode({ nodeId: 'a', width: 300 })?.width).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 'a', height: 300 })?.height).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 'a', width: '300', height: Number.NaN })).toMatchObject({
      width: null,
      height: null,
    })
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

  it('keeps only mention bindings that are strings and clamps the list', () => {
    expect(
      normalizeCanvasNode({ nodeId: 'p:a', text: '', mentions: ['A', 'B'] })?.mentions,
    ).toEqual(['A', 'B'])
    expect(normalizeCanvasNode({ nodeId: 'p:a', mentions: ['A', 2, '', 'B'] })?.mentions).toEqual([
      'A',
      'B',
    ])
    expect(normalizeCanvasNode({ nodeId: 'p:a', mentions: 'nope' })?.mentions).toEqual([])
    expect(
      normalizeCanvasNode({ nodeId: 'p:a', mentions: Array(40).fill('A') })?.mentions,
    ).toHaveLength(MAX_MENTIONS)
  })

  it('returns null when the nodeId is unusable', () => {
    expect(normalizeCanvasNode(null)).toBeNull()
    expect(normalizeCanvasNode('p:1')).toBeNull()
    expect(normalizeCanvasNode({ nodeId: '' })).toBeNull()
    expect(normalizeCanvasNode({ nodeId: 42 })).toBeNull()
  })
})

describe('clampCanvasSize', () => {
  it('keeps an in-range size and rounds it', () => {
    expect(clampCanvasSize('a', 320, 180.6)).toEqual({ width: 320, height: 181 })
  })

  it('caps prompt nodes lower than image nodes', () => {
    expect(clampCanvasSize('p:a', 400, 4000).height).toBe(CANVAS_PROMPT_MAX_HEIGHT)
    expect(clampCanvasSize('a', 400, 4000).height).toBe(CANVAS_NODE_MAX_HEIGHT)
  })

  it('clamps both axes to the shared bounds', () => {
    expect(clampCanvasSize('a', -100, -100)).toEqual({
      width: CANVAS_NODE_MIN_WIDTH,
      height: CANVAS_NODE_MIN_HEIGHT,
    })
    expect(clampCanvasSize('p:a', 1e6, 1e6)).toEqual({
      width: CANVAS_NODE_MAX_WIDTH,
      height: CANVAS_PROMPT_MAX_HEIGHT,
    })
  })
})

describe('referenceLabelAt', () => {
  it('uses chinese numerals in zh and arabic ones in en', () => {
    expect(referenceLabelAt(0, 'zh-CN')).toBe('图一')
    expect(referenceLabelAt(3, 'zh')).toBe('图四')
    expect(referenceLabelAt(1, 'en')).toBe('Image 2')
  })

  it('falls back to a plain number past the word list and to the first label when negative', () => {
    expect(referenceLabelAt(5, 'zh')).toBe('6')
    expect(referenceLabelAt(-1, 'en')).toBe('图一')
  })
})

describe('parseReferenceMentions', () => {
  it('returns tokens in reading order and accepts both languages', () => {
    const tokens = parseReferenceMentions('把 @图二 的衣服给 @Image 1，再看 @图一')
    expect(tokens.map((token) => token.label)).toEqual(['图二', 'Image 1', '图一'])
    expect(tokens.map((token) => token.start)).toEqual(
      [...tokens.map((t) => t.start)].sort((a, b) => a - b),
    )
  })

  it('ignores an at sign that is not a known label', () => {
    expect(parseReferenceMentions('@ nobody 图一')).toEqual([])
  })
})

describe('zipReferenceMentions', () => {
  it('drops bindings whose token the user deleted', () => {
    const bindings = zipReferenceMentions('@图一 only', ['A', 'B'])
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({ imageId: 'A', start: 0, end: 3 })
  })
})

describe('remapReferenceMentions', () => {
  it('renumbers every token after the reference order changes', () => {
    expect(
      remapReferenceMentions({
        text: '@图一 and @图二',
        mentions: ['A', 'B'],
        refs: ['B', 'A'],
        lang: 'zh',
      }),
    ).toEqual({ text: '@图二 and @图一', mentions: ['A', 'B'] })
  })

  it('removes the token of a disconnected image and shifts the rest up', () => {
    expect(
      remapReferenceMentions({
        text: '@图一 与 @图二',
        mentions: ['A', 'B'],
        refs: ['B'],
        lang: 'zh',
      }),
    ).toEqual({ text: ' 与 @图一', mentions: ['B'] })
  })

  it('rewrites a token into the current language', () => {
    expect(
      remapReferenceMentions({
        text: '@图二',
        mentions: ['A'],
        refs: ['B', 'A'],
        lang: 'en',
      }).text,
    ).toBe('@Image 2')
  })

  it('leaves hand-typed tokens beyond the binding list untouched', () => {
    expect(
      remapReferenceMentions({
        text: '@图一 @图二',
        mentions: ['A'],
        refs: ['A'],
        lang: 'zh',
      }),
    ).toEqual({ text: '@图一 @图二', mentions: ['A'] })
  })
})

describe('insertReferenceMention', () => {
  it('splices the binding at the occurrence position instead of appending', () => {
    const result = insertReferenceMention({
      text: '@图一 done @',
      mentions: ['A'],
      refs: ['A', 'B'],
      imageId: 'B',
      start: 9,
      end: 10,
      lang: 'zh',
    })
    expect(result.text).toBe('@图一 done @图二 ')
    expect(result.mentions).toEqual(['A', 'B'])
    expect(result.caret).toBe(13)
  })

  it('keeps ordering right when inserting before an existing mention', () => {
    const result = insertReferenceMention({
      text: '@before @图一',
      mentions: ['A'],
      refs: ['A', 'B'],
      imageId: 'B',
      start: 0,
      end: 1,
      lang: 'zh',
    })
    expect(result.text).toBe('@图二 before @图一')
    expect(result.mentions).toEqual(['B', 'A'])
  })

  it('refuses an image that is not linked in', () => {
    expect(
      insertReferenceMention({
        text: '@',
        mentions: [],
        refs: ['A'],
        imageId: 'Z',
        start: 0,
        end: 1,
        lang: 'zh',
      }),
    ).toEqual({ text: '@', mentions: [], caret: 1 })
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
  width: null,
  height: null,
  vision: false,
  mentions: [],
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

describe('boundingBoxOf', () => {
  it('wraps a set of boxes regardless of order', () => {
    expect(
      boundingBoxOf([
        { id: 'b', x: 60, y: 150, width: 100, height: 50 },
        { id: 'a', x: 0, y: 0, width: 200, height: 100 },
      ]),
    ).toEqual({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 })
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

  it('marks a vision node and its source image, keeping the pair out of generation', () => {
    const graph = buildCanvasGraph(
      [img('seed', 'seed'), img('out', 'J1')],
      [overlay('p:J1', { text: 'from image', refs: ['seed'], vision: true })],
    )
    const prompt = graph.nodes.find((node) => node.id === 'p:J1')
    const seed = graph.nodes.find((node) => node.id === 'seed')
    expect(prompt?.kind === 'prompt' && prompt.vision).toBe(true)
    expect(seed?.kind === 'image' && seed.vision).toBe(true)
    const out = graph.nodes.find((node) => node.id === 'out')
    expect(out?.kind === 'image' && out.vision).toBe(false)
    expect(graph.edges).toContainEqual({
      id: 'ref:seed>p:J1',
      source: 'seed',
      target: 'p:J1',
      kind: 'reference',
    })
  })

  it('drops a dangling ref and a self referencing ref without breaking the node', () => {
    const graph = buildCanvasGraph(
      [img('a', 'J'), img('own', 'J')],
      [overlay('p:J', { text: 't', refs: ['ghost', 'own'] })],
    )
    expect(graph.edges.filter((edge) => edge.kind === 'reference')).toEqual([])
    const prompt = graph.nodes.find((node) => node.id === 'p:J')
    // 节点暴露的 refs 就是能用的那张顺序，@图N 的编号与出图请求都按它算
    expect(prompt?.kind === 'prompt' && prompt.refs).toEqual([])
  })

  it('carries mention bindings onto the prompt node in order', () => {
    const graph = buildCanvasGraph(
      [img('s1', 'J0'), img('s2', 'J0'), img('out', 'J1')],
      [overlay('p:J1', { text: '@图二 配 @图一', refs: ['s2', 's1'], mentions: ['s2', 's1'] })],
    )
    const prompt = graph.nodes.find((node) => node.id === 'p:J1')
    expect(prompt?.kind === 'prompt' && prompt.refs).toEqual(['s2', 's1'])
    expect(prompt?.kind === 'prompt' && prompt.mentions).toEqual(['s2', 's1'])
  })

  it('applies a manual size to both node kinds', () => {
    const graph = buildCanvasGraph(
      [img('a', 'J', { ratio: 2 }), img('b', 'J')],
      [
        overlay('p:J', { text: 't', width: 400, height: 300 }),
        overlay('a', { x: 10, y: 10, width: 120 }),
      ],
    )
    expect(graph.nodes.find((node) => node.id === 'p:J')).toMatchObject({ width: 400, height: 300 })
    // 图片只改宽度时，高度按原比例重算
    expect(graph.nodes.find((node) => node.id === 'a')).toMatchObject({ width: 120, height: 60 })
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
    map: [],
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

describe('buildCanvasMap', () => {
  it('rounds coordinates and falls back to the default node size', () => {
    expect(buildCanvasMap([{ x: 12.4, y: -8.6 }])).toEqual([
      { x: 12, y: -9, width: CANVAS_IMAGE_WIDTH, height: CANVAS_IMAGE_WIDTH },
    ])
  })

  it('drops entries without usable coordinates so the svg viewBox stays finite', () => {
    expect(
      buildCanvasMap([
        { x: Number.NaN, y: 0 },
        { x: 0, y: '2' },
        { x: 5, y: 5, width: 240, height: 150 },
      ]),
    ).toEqual([{ x: 5, y: 5, width: 240, height: 150 }])
  })

  it('treats anything but an array as an empty map', () => {
    expect(buildCanvasMap(null)).toEqual([])
    expect(buildCanvasMap('legacy row')).toEqual([])
  })

  it('caps the snapshot so a crowded canvas cannot bloat the record', () => {
    const nodes = Array.from({ length: CANVAS_MAP_LIMIT + 30 }, (_, index) => ({
      x: index,
      y: index,
    }))
    expect(buildCanvasMap(nodes)).toHaveLength(CANVAS_MAP_LIMIT)
  })
})

describe('canvasMapBox', () => {
  it('returns null for an empty map so the tile can show a placeholder', () => {
    expect(canvasMapBox([])).toBeNull()
  })

  it('wraps the union of the rects with padding on every side', () => {
    expect(
      canvasMapBox([
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 300, y: 200, width: 100, height: 100 },
      ]),
    ).toEqual({ x: -48, y: -48, width: 496, height: 396 })
  })

  it('keeps a minimum padding so a single node is not blown up to fill the tile', () => {
    expect(canvasMapBox([{ x: 0, y: 0, width: 10, height: 10 }])).toEqual({
      x: -48,
      y: -48,
      width: 106,
      height: 106,
    })
  })
})

describe('normalizeWorkspace', () => {
  it('rebuilds the map field records saved before thumbnails existed', () => {
    expect(normalizeWorkspace({ id: 'A', name: 'A', createdAt: 1, updatedAt: 2 })).toEqual({
      id: 'A',
      name: 'A',
      map: [],
      createdAt: 1,
      updatedAt: 2,
    })
  })

  it('rejects rows without a usable id', () => {
    expect(normalizeWorkspace({ name: 'x' })).toBeNull()
    expect(normalizeWorkspace(null)).toBeNull()
  })

  it('clamps an oversized name and replaces broken timestamps', () => {
    const record = normalizeWorkspace({
      id: 'A',
      name: '字'.repeat(WORKSPACE_NAME_LIMIT + 40),
      createdAt: 'nope',
      updatedAt: null,
    })
    expect(record?.name).toHaveLength(WORKSPACE_NAME_LIMIT)
    expect(record && record.createdAt > 0).toBe(true)
    expect(record && record.updatedAt > 0).toBe(true)
  })
})

describe('nextWorkspaceNumber', () => {
  it('starts at one when nothing is around yet', () => {
    expect(nextWorkspaceNumber([])).toBe(1)
  })

  it('follows the largest trailing number instead of the list size', () => {
    expect(nextWorkspaceNumber(['工作区1', '工作区7', '草稿'])).toBe(8)
  })

  it('ignores digits that sit anywhere but the end of the name', () => {
    expect(nextWorkspaceNumber(['2024 年度'])).toBe(1)
  })
})

describe('polishSystemPrompt', () => {
  it('pins the zh mention marker and the no-fence rule', () => {
    const text = polishSystemPrompt('zh')
    expect(text).toContain('@图N')
    expect(text).toContain('不要代码围栏')
  })

  it('pins the en mention marker exactly as referenceLabelAt spells it', () => {
    const text = polishSystemPrompt('en')
    expect(text).toContain('@Image N')
    expect(referenceLabelAt(0, 'en')).toBe('Image 1')
  })

  it('keeps the two languages apart instead of reusing one string', () => {
    expect(polishSystemPrompt('zh')).not.toBe(polishSystemPrompt('en'))
  })
})

describe('normalizePolishedText', () => {
  it('returns plain model output untouched apart from trimming', () => {
    expect(normalizePolishedText('\n  雪地里的少女，双手合拢  \n')).toBe('雪地里的少女，双手合拢')
  })

  it('strips a leading and trailing code fence', () => {
    const raw = '```markdown\n雪地里的少女\n\n【Base Prompt】\n1girl, snow\n```'
    expect(normalizePolishedText(raw)).toBe('雪地里的少女\n\n【Base Prompt】\n1girl, snow')
  })

  it('strips a bare fence line without eating the body', () => {
    expect(normalizePolishedText('```\nkeep me\n```')).toBe('keep me')
  })

  it('drops a standalone "润色后：" preamble but keeps inline labels', () => {
    expect(normalizePolishedText('润色后：\n正文一行')).toBe('正文一行')
    expect(normalizePolishedText('【润色后】依然保留这行')).toBe('【润色后】依然保留这行')
  })

  it('preserves @Image mentions and paragraph breaks across the cleanup', () => {
    const raw = '@Image 1 是背景\n\n第二段 @Image 2'
    expect(normalizePolishedText(raw)).toBe(raw)
  })

  it('collapses to empty for whitespace-only or fence-only output', () => {
    expect(normalizePolishedText('   \n\t \n ')).toBe('')
    expect(normalizePolishedText('```')).toBe('')
  })
})
