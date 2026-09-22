import { describe, expect, it } from 'vitest'

import {
  normalizeGenParams,
  openaiSizeFor,
  parsePromptCandidates,
  toImageRequestParams,
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
