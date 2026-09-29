import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'

import {
  parseSkillMarkdown,
  readSkillFiles,
  SKILL_DOC_MAX_CHARS,
  SKILL_IMPORT_MAX_ENTRIES,
  SKILL_IMPORT_MAX_TOTAL,
} from '@/tools/images/ai-image-gen/skills'

const SKILL_MD = '---\nname: demo-skill\ndescription: demo skill\n---\n\nsay hi\n'

const textFile = (name: string, content: string) => new File([content], name)

async function zipFile(name: string, entries: Record<string, string>) {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content)
  }
  return new File([await zip.generateAsync({ type: 'blob' })], name)
}

describe('readSkillFiles', () => {
  it('imports a bare SKILL.md as one custom skill', async () => {
    const skills = await readSkillFiles([textFile('demo.md', SKILL_MD)])
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({ name: 'demo-skill', builtin: false, references: [] })
  })

  it('collects the sibling markdown files of a packaged skill as references', async () => {
    const file = await zipFile('pack.zip', {
      'demo/SKILL.md': SKILL_MD,
      'demo/references/a.md': 'first',
      'demo/references/b.md': 'second',
    })
    const skills = await readSkillFiles([file])
    expect(skills[0].references).toEqual([
      { path: 'references/a.md', content: 'first' },
      { path: 'references/b.md', content: 'second' },
    ])
  })

  it('rejects a package with more markdown files than the entry cap', async () => {
    const entries: Record<string, string> = { 'demo/SKILL.md': SKILL_MD }
    for (let index = 0; index <= SKILL_IMPORT_MAX_ENTRIES; index += 1) {
      entries[`filler/${index}.md`] = 'x'
    }
    await expect(readSkillFiles([await zipFile('bomb.zip', entries)])).rejects.toThrow(
      /too many markdown files/,
    )
  })

  it('rejects a document past the per-file cap without keeping it in memory', async () => {
    const huge = 'a'.repeat(SKILL_DOC_MAX_CHARS + 1)
    const file = await zipFile('big.zip', { 'demo/SKILL.md': huge })
    await expect(readSkillFiles([file])).rejects.toThrow(/too large/)
  })

  it('rejects a package whose documents add past the total cap', async () => {
    const chunk = 'a'.repeat(64 * 1024)
    const entries: Record<string, string> = {}
    for (let index = 0; index * chunk.length <= SKILL_IMPORT_MAX_TOTAL; index += 1) {
      entries[`filler/${index}.md`] = chunk
    }
    await expect(readSkillFiles([await zipFile('wide.zip', entries)])).rejects.toThrow(
      /expands past the size limit/,
    )
  })

  it('rejects an oversized bare .md file', async () => {
    const file = textFile('huge.md', 'a'.repeat(SKILL_DOC_MAX_CHARS + 1))
    await expect(readSkillFiles([file])).rejects.toThrow(/too large/)
  })

  it('rejects anything that is neither .md nor .zip', async () => {
    await expect(readSkillFiles([textFile('payload.exe', 'MZ')])).rejects.toThrow(
      /unsupported file type/,
    )
  })
})

describe('parseSkillMarkdown', () => {
  it('requires a frontmatter block and a kebab-case name', () => {
    expect(() => parseSkillMarkdown('no frontmatter')).toThrow(/missing frontmatter/)
    expect(() => parseSkillMarkdown('---\nname: Bad Name\n---\n\nx\n')).toThrow(/invalid skill/)
  })
})
