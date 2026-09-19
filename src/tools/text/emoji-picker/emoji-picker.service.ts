import emojiDataByGroup from 'unicode-emoji-json/data-by-group.json'

export interface EmojiItem {
  /** emoji 字符（可能包含 ZWJ / 肤色修饰的簇） */
  char: string
  /** 英文关键词，如 'grinning face' */
  name: string
}

export interface EmojiGroup {
  /** 分组标识，即 unicode-emoji-json 的 slug */
  id: string
  /** i18n 键：`emoji-picker.group-<slug>` */
  labelKey: string
  emojis: EmojiItem[]
}

interface RawEmojiEntry {
  emoji: string
  name: string
}

interface RawGroupEntry {
  slug: string
  emojis: RawEmojiEntry[]
}

function toEmojiItem(entry: RawEmojiEntry): EmojiItem {
  // Array.from 按 Unicode 码点切分再拼接，保证 emoji 簇（ZWJ / 肤色序列）不被拆坏
  return { char: Array.from(entry.emoji).join(''), name: entry.name }
}

const emojiGroups: EmojiGroup[] = (emojiDataByGroup as RawGroupEntry[]).map((group) => ({
  id: group.slug,
  labelKey: `emoji-picker.group-${group.slug}`,
  emojis: group.emojis.map(toEmojiItem),
}))

const allEmojis: EmojiItem[] = emojiGroups.flatMap((group) => group.emojis)

/** 读取全部 emoji 分组（数据在模块加载时一次性解析） */
export function loadEmojiGroups(): EmojiGroup[] {
  return emojiGroups
}

/** 跨分组按名称搜索 emoji（大小写不敏感），空查询返回 [] */
export function searchEmojis(query: string): EmojiItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return []
  }
  return allEmojis.filter((emoji) => emoji.name.toLowerCase().includes(needle))
}
