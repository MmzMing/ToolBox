/**
 * 导览配音：把一句话翻成一串 Madeline 人声音效，按时间轴拼起来播。
 *
 * 音库是《Celeste》主角的人声，10 种情绪 × 4 条音轨 × 10 个变体 = 400 条，
 * 每条 0.06~0.27s（中位 0.2s），正好是"一个音节"的尺度——所以一句话就是若干条
 * 音效的拼接，跟《动物森友会》《模拟市民》那类无词语音是一个做法。
 *
 * 这里只做纯推导（文本 → 音效序列 + 停顿），不碰 WebAudio，方便单测。
 */

/** 音库里实际拷进来的 10 种情绪，见 public/sounds/madeline/ */
export const VOICE_EMOTIONS = [
  'angry',
  'deadpan',
  'determined',
  'distracted',
  'normal',
  'panic',
  'sad',
  'sadder',
  'surprised',
  'upset',
] as const
export type VoiceEmotion = (typeof VOICE_EMOTIONS)[number]

/** 静态资源前缀 */
export const SOUND_BASE = '/sounds/madeline'

/** 每种情绪下的四条音轨与十个变体，命名规律可精确复现文件清单 */
const TRACKS = ['mid_A', 'mid_B', 'mid_C', 'per'] as const
const VARIANTS = 10

/**
 * 整句的音效预算。
 *
 * 中文四步导览文案是 38~43 个音节，所以预算取 44——正好让中文落在「一个字一条音效」上，
 * 不用摊薄。英文同样内容 79~121 个字母，超出预算时才按比例并字（见 resolveVoice）。
 */
const MAX_PER_LINE = 44
/** 词组内与词组间的停顿（秒）：逗号短、句号长 */
const GAP_WITHIN = 0.045
const GAP_CLAUSE = 0.16
const GAP_SENTENCE = 0.3

export type VoiceLine = {
  /** 用哪种情绪的音库 */
  emotion: VoiceEmotion
  /**
   * 显式指定音效序列（文件名，不含 .wav）——这就是"一句话挑多个音效拼起来"。
   * 给了就完全照它播，不做推导；想手调某句的语气时用它。
   */
  clips?: readonly string[]
  /** 固定每条音效承担几个字，跳过按预算自动摊薄的推导 */
  charsPerClip?: number
}

/** 时间轴上的一个音片 */
export type VoiceCue = {
  /** 不含扩展名的文件名 */
  clip: string
  /** 播它之前先静音多久（秒） */
  pauseBefore: number
  /** 0..1，用来微调播放速率，让同一句不至于每条都一个调 */
  seed: number
  /** 这条开口后正文应当露到第几个字符（打字机跟着语音走，而不是各跑各的） */
  reveal: number
}

/** 分句用的标点：它们不占音节，但要跟着前一个字一起露出来 */
const PUNCTUATION = '，,、：:；;。！？.!?…'

/**
 * 每个发音字符在原句里的收尾下标。
 *
 * reveal 要落回原句下标，不能停在音节序号上：标点不发音却得显示，
 * 而"下一个发音字符的收尾下标"天然把它前面那段标点和空格一起带出来了。
 */
function voicedStops(text: string): number[] {
  const stops: number[] = []
  let index = 0
  for (const char of text) {
    index += char.length
    if (!PUNCTUATION.includes(char) && !/\s/.test(char)) {
      stops.push(index)
    }
  }
  return stops
}

/** 情绪 × 音轨 × 变体 → 该情绪可用的全部音效名（40 条） */
export function voicePool(emotion: VoiceEmotion): string[] {
  const pool: string[] = []
  for (const track of TRACKS) {
    for (let i = 1; i <= VARIANTS; i += 1) {
      pool.push(`${emotion}_${track}_${String(i).padStart(2, '0')}`)
    }
  }
  return pool
}

export function soundUrl(clip: string): string {
  return `${SOUND_BASE}/${clip}.wav`
}

/**
 * FNV-1a 哈希。
 *
 * 用它而不是 Math.random：同一句话必须永远念成同一个调，
 * 随机取音会让配音听感是"噪声"而不是"话"，而且没法复现问题。
 */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

type Segment = { text: string; gapAfter: number }

/**
 * 按标点把句子切成词组，并给每组标上"说完停多久"。
 * 中文没有空格，只能靠标点分词；句末没有标点时也算一句。
 */
export function segmentSentence(text: string): Segment[] {
  const segments: Segment[] = []
  let current = ''
  for (const char of text) {
    if ('，,、：:；;'.includes(char)) {
      if (current.trim()) {
        segments.push({ text: current.trim(), gapAfter: GAP_CLAUSE })
      }
      current = ''
    } else if ('。！？.!?…'.includes(char)) {
      if (current.trim()) {
        segments.push({ text: current.trim(), gapAfter: GAP_SENTENCE })
      }
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) {
    segments.push({ text: current.trim(), gapAfter: GAP_SENTENCE })
  }
  return segments
}

/** 参与发音的字符：空格不占音节（标点已经在 segmentSentence 里切掉了） */
function syllables(text: string): string[] {
  return [...text].filter((char) => !/\s/.test(char))
}

/** 词组里放几条音效：每条承担 charsPerClip 个字，向上取整保证每个字都有音 */
export function clipCountFor(text: string, charsPerClip = 1): number {
  return Math.max(1, Math.ceil(syllables(text).length / Math.max(1, charsPerClip)))
}

/**
 * 把一句话解析成音效时间轴。
 *
 * 显式 clips 优先（手调）；否则按词组切分，每组从该情绪的 40 条里确定性取若干条。
 * 默认一个字一条音效，整句音节数超出预算时才按比例并字——中文四步都在预算内所以就是
 * 一字一音，英文同样内容字母多，不并字就念不完。
 */
export function resolveVoice(line: VoiceLine, text: string): VoiceCue[] {
  const pool = voicePool(line.emotion)
  const stops = voicedStops(text)

  if (line.clips?.length) {
    const n = line.clips.length
    return line.clips.map((clip, i) => ({
      clip,
      pauseBefore: i === 0 ? 0 : GAP_WITHIN,
      seed: (hash(clip) % 1000) / 1000,
      // 手调的那串和正文没有字数对应关系，只能按条数平均分摊
      reveal: Math.round(((i + 1) * text.length) / n),
    }))
  }

  const segments = segmentSentence(text).map((segment) => ({
    ...segment,
    chars: syllables(segment.text),
  }))
  const per = line.charsPerClip ?? Math.max(1, Math.ceil(stops.length / MAX_PER_LINE))
  const cues: VoiceCue[] = []
  let budget = MAX_PER_LINE
  /** 已经念掉几个发音字符，用来把组内序号换成整句序号 */
  let said = 0

  segments.forEach((segment, s) => {
    const count = Math.min(clipCountFor(segment.text, per), budget)
    for (let i = 0; i < count; i += 1) {
      // 按这条音效真正承担的那几个字取音，而不是按它在句中的序号：同一个字永远同一个音，
      // 一句话里重复出现的词也就念得一样，听着才像话而不是抽噪声
      const h = hash(`${line.emotion}|${segment.chars.slice(i * per, (i + 1) * per).join('')}`)
      // 停顿规则：整句第一条不静；词组第一条前面接上一组的尾停顿（逗号短、句号长）；
      // 词组内部只隔一个短音节的空隙
      const pauseBefore = cues.length === 0 ? 0 : i === 0 ? segments[s - 1].gapAfter : GAP_WITHIN
      const upto = Math.min(said + (i + 1) * per, stops.length)
      cues.push({
        clip: pool[h % pool.length],
        pauseBefore,
        seed: ((h >>> 8) % 1000) / 1000,
        reveal: upto >= stops.length ? text.length : stops[upto - 1],
      })
    }
    said += segment.chars.length
    budget -= count
    if (budget <= 0) {
      budget = 0
    }
  })

  // 预算用尽时最后一条只覆盖半句，不补一下正文就永远露不全
  const last = cues.at(-1)
  if (last) {
    last.reveal = text.length
  }

  return cues
}
