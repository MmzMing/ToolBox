import JSZip from 'jszip'

/**
 * Agent Skills 形态：一个 skill = skills/<name>/SKILL.md（frontmatter + Markdown 指令），
 * 同目录 references/*.md 为渐进披露的参考材料。
 * 构建期由 import.meta.glob 全量读入，运行时把 references 拼进 system prompt
 * （浏览器直连的 chat/images 接口没有文件懒加载通道）。
 */
export type SkillReference = { path: string; content: string }

export type Skill = {
  id: string
  name: string
  description: string
  markdown: string
  references: SkillReference[]
  builtin: boolean
  enabled: boolean
}

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

const skillDocs = import.meta.glob('./skills/**/SKILL.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const allDocs = import.meta.glob('./skills/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const OUTPUT_SUFFIX =
  '\n\n---\nOutput contract: return ONLY a JSON array of exactly 4 candidates (strings, or objects for structured format). No fences, no commentary.'

export const BUILTIN_SKILLS: readonly Skill[] = Object.entries(skillDocs)
  .map(([path, raw]) => {
    const dir = path.slice(0, path.lastIndexOf('/'))
    const references = Object.entries(allDocs)
      .filter(([file]) => file.startsWith(`${dir}/`) && !file.endsWith('SKILL.md'))
      .map(([file, content]) => ({ path: file.slice(dir.length + 1), content }))
      .sort((a, b) => a.path.localeCompare(b.path))
    return { ...parseSkillMarkdown(raw), references, builtin: true, enabled: true }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export function renderSkillSystem(skill: Skill, lang: 'zh' | 'en'): string {
  const langName = lang === 'zh' ? 'Chinese' : 'English'
  const refs = skill.references
    .map((reference) => `\n\n## Reference: ${reference.path}\n${reference.content}`)
    .join('')
  return `${skill.markdown}${refs}`.replaceAll('{{lang}}', langName) + OUTPUT_SUFFIX
}

/** 内置定义永远以文件为准（往 skills/ 目录放包即自动识别），持久化只留启停与自定义项 */
export function mergeSkills(
  persisted: readonly unknown[],
  flags: Record<string, boolean> = {},
): Skill[] {
  const list = persisted.map((item) => normalizeSkill(item)).filter((s): s is Skill => !!s)
  const builtins = BUILTIN_SKILLS.map((skill) => ({
    ...skill,
    enabled: flags[skill.id] ?? skill.enabled,
  }))
  const customs = list.filter((skill) => !skill.builtin)
  return [...builtins, ...customs]
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** 兼容旧版形状（systemTemplate / 无 references）与手改坏的脏数据 */
function normalizeSkill(value: unknown): Skill | null {
  const raw = record(value)
  const name = text(raw.name).trim()
  const legacyTemplate = text(raw.systemTemplate).trim()
  const markdown = text(raw.markdown).trim() || legacyTemplate
  if (!name || !markdown) {
    return null
  }
  return {
    id: text(raw.id).trim() || name,
    name,
    description: text(raw.description).slice(0, 500),
    markdown: markdown.slice(0, 20000),
    references: Array.isArray(raw.references)
      ? (raw.references as SkillReference[]).filter(
          (item) => !!item && typeof item.path === 'string' && typeof item.content === 'string',
        )
      : [],
    builtin: raw.builtin === true,
    enabled: raw.enabled !== false,
  }
}

/** 解析 SKILL.md：--- frontmatter --- + Markdown 正文 */
export function parseSkillMarkdown(source: string): Skill {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md missing frontmatter block')
  }
  const fields: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (pair) {
      fields[pair[1].toLowerCase()] = pair[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  const name = (fields.name ?? '').trim()
  if (!NAME_PATTERN.test(name)) {
    throw new Error('invalid skill name: expect kebab-case, max 64 chars')
  }
  const markdown = match[2].trim()
  if (!markdown) {
    throw new Error(`${name}: empty SKILL.md body`)
  }
  return {
    id: name,
    name,
    description: (fields.description ?? '').slice(0, 500),
    markdown: markdown.slice(0, 20000),
    references: [],
    builtin: false,
    enabled: true,
  }
}

export function serializeSkillMarkdown(skill: Skill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.markdown}\n`
}

/**
 * 导入包的上限。
 *
 * 一个几百 KB 的 zip 可以解出 GB 级文本（zip 炸弹），而 skill 正文随后会整段拼进
 * system prompt——既崩标签页又花用户的钱，所以条目数、单篇与总量三头都要卡。
 * 中心目录里声明的 uncompressedSize 是唯一能在解压前判断的依据，缺了就只能在
 * 解出来之后兜一道。
 */
export const SKILL_IMPORT_MAX_ENTRIES = 200
export const SKILL_DOC_MAX_CHARS = 256 * 1024
export const SKILL_IMPORT_MAX_TOTAL = 1024 * 1024

/** JSZip 只在内部字段上带声明尺寸，取不到即 0（当作未知，交给解压后的复核） */
function declaredSize(entry: unknown): number {
  const data = (entry as { _data?: { uncompressedSize?: unknown } })._data
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : 0
}

/** 导入 .md 或 .zip 包：zip 内每个含 SKILL.md 的目录识别为一个 skill，同级 .md 收作 references */
export async function readSkillFiles(files: readonly File[]): Promise<Skill[]> {
  const out: Skill[] = []
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const entries = Object.values(zip.files).filter(
        (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.md'),
      )
      if (entries.length > SKILL_IMPORT_MAX_ENTRIES) {
        throw new Error(`skill package has too many markdown files: ${entries.length}`)
      }
      const docs = new Map<string, string>()
      let total = 0
      for (const entry of entries) {
        if (declaredSize(entry) > SKILL_DOC_MAX_CHARS) {
          throw new Error(`skill document is too large: ${entry.name}`)
        }
        const content = await entry.async('text')
        if (content.length > SKILL_DOC_MAX_CHARS) {
          throw new Error(`skill document is too large: ${entry.name}`)
        }
        total += content.length
        if (total > SKILL_IMPORT_MAX_TOTAL) {
          throw new Error('skill package expands past the size limit')
        }
        docs.set(entry.name, content)
      }
      for (const [name, source] of docs) {
        if (!name.toLowerCase().endsWith('skill.md')) {
          continue
        }
        const dir = name.slice(0, name.lastIndexOf('/') + 1)
        const references = [...docs.entries()]
          .filter(([entryName]) => entryName.startsWith(dir) && entryName !== name)
          .map(([entryName, content]) => ({ path: entryName.slice(dir.length), content }))
          .sort((a, b) => a.path.localeCompare(b.path))
        out.push({ ...parseSkillMarkdown(source), references })
      }
      continue
    }
    if (file.name.toLowerCase().endsWith('.md')) {
      if (file.size > SKILL_DOC_MAX_CHARS) {
        throw new Error(`skill document is too large: ${file.name}`)
      }
      out.push(parseSkillMarkdown(await file.text()))
      continue
    }
    throw new Error('unsupported file type')
  }
  const seen = new Set<string>()
  return out.filter((skill) => {
    if (seen.has(skill.id)) {
      return false
    }
    seen.add(skill.id)
    return true
  })
}

/** 导出：每个 skill 一个目录（包名 = skill id），SKILL.md 与 references 原样落回 */
export async function serializeSkillZip(skills: readonly Skill[]): Promise<Blob> {
  const zip = new JSZip()
  for (const skill of skills) {
    zip.file(`${skill.id}/SKILL.md`, serializeSkillMarkdown(skill))
    for (const reference of skill.references) {
      zip.file(`${skill.id}/${reference.path}`, reference.content)
    }
  }
  return zip.generateAsync({ type: 'blob' })
}
