import { readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  resolveVoice,
  segmentSentence,
  clipCountFor,
  soundUrl,
  VOICE_EMOTIONS,
  voicePool,
} from '@/modules/page-tour/tour-voice'

const SOUND_DIR = 'public/sounds/madeline'

function filesFor(emotion: string): string[] {
  return readdirSync(SOUND_DIR)
    .filter((file) => file.startsWith(`${emotion}_`) && file.endsWith('.wav'))
    .map((file) => file.replace(/\.wav$/, ''))
    .sort()
}

describe('voicePool', () => {
  it('names exactly the clips that are actually shipped', () => {
    // 命名规律一旦和 public 里的文件对不上，运行时就是成片 404，所以这里当回归闸用
    for (const emotion of VOICE_EMOTIONS) {
      expect([...voicePool(emotion)].sort()).toEqual(filesFor(emotion))
    }
  })

  it('offers forty variants per emotion', () => {
    expect(voicePool('normal')).toHaveLength(40)
    expect(new Set(voicePool('determined')).size).toBe(40)
  })
})

describe('soundUrl', () => {
  it('maps a clip name to its static path', () => {
    expect(soundUrl('normal_mid_A_03')).toBe('/sounds/madeline/normal_mid_A_03.wav')
  })
})

describe('segmentSentence', () => {
  it('splits on clause and sentence punctuation', () => {
    expect(segmentSentence('点一个分类，再点同一个。嫌它占地方！').map((s) => s.text)).toEqual([
      '点一个分类',
      '再点同一个',
      '嫌它占地方',
    ])
  })

  it('pads a trailing gap so the next clause is not glued on', () => {
    const [first, second] = segmentSentence('你好，世界')
    expect(first.gapAfter).toBeLessThan(second.gapAfter)
  })

  it('treats a run of punctuation as one boundary and keeps unmarked text whole', () => {
    expect(segmentSentence('a。。。b').map((s) => s.text)).toEqual(['a', 'b'])
    expect(segmentSentence('no punctuation at all')).toHaveLength(1)
  })

  it('returns nothing for blank input', () => {
    expect(segmentSentence('')).toEqual([])
    expect(segmentSentence(' ， ，')).toEqual([])
  })
})

describe('clipCountFor', () => {
  it('gives every character its own clip by default', () => {
    expect(clipCountFor('')).toBe(1)
    expect(clipCountFor('一二三')).toBe(3)
    expect(clipCountFor('あ'.repeat(200))).toBe(200)
  })

  it('ignores spaces: they carry no syllable', () => {
    expect(clipCountFor('a b c')).toBe(3)
    expect(clipCountFor('   ')).toBe(1)
  })

  it('packs several characters into one clip when asked to', () => {
    expect(clipCountFor('一二三四五六七八九十')).toBe(10)
    expect(clipCountFor('一二三四五六七八九十', 3)).toBe(4)
    expect(clipCountFor('一二三四五六七八九十', 10)).toBe(1)
  })
})

describe('resolveVoice', () => {
  const LINE = { emotion: 'normal' as const }

  it('plays an explicitly curated sequence verbatim', () => {
    const curated = ['surprised_mid_A_02', 'surprised_per_03', 'surprised_mid_B_05']
    const cues = resolveVoice({ emotion: 'surprised', clips: curated }, '忽略这句正文')
    expect(cues.map((c) => c.clip)).toEqual(curated)
    expect(cues[0].pauseBefore).toBe(0)
    expect(cues[1].pauseBefore).toBeGreaterThan(0)
    expect(cues[1].pauseBefore).toBe(cues[2].pauseBefore)
  })

  it('handles a single curated clip', () => {
    expect(resolveVoice({ emotion: 'normal', clips: ['normal_per_01'] }, '')).toEqual([
      expect.objectContaining({ clip: 'normal_per_01', pauseBefore: 0 }),
    ])
  })

  it('renders nothing when there is nothing to say', () => {
    expect(resolveVoice(LINE, '')).toEqual([])
    expect(resolveVoice(LINE, '，。！')).toEqual([])
  })

  it('draws only from the emotion requested', () => {
    const cues = resolveVoice({ emotion: 'determined' }, '这里是导航，点一个分类会浮出该类的工具。')
    expect(cues.length).toBeGreaterThan(0)
    expect(cues.every((c) => c.clip.startsWith('determined_'))).toBe(true)
  })

  it('is deterministic: the same sentence always reads the same way', () => {
    const text = '这里是导航。点一个分类会浮出该类的工具，再点同一个收起。'
    expect(resolveVoice(LINE, text)).toEqual(resolveVoice(LINE, text))
    expect(resolveVoice(LINE, text)).not.toEqual(resolveVoice(LINE, '完全不同的另一句话。'))
  })

  it('opens without a pause and breathes longer between clauses than inside one', () => {
    // 每组 5 个字、一字一音 → 每组 5 条，组间与组内都出现才能比出长短
    const cues = resolveVoice(LINE, '甲乙丙丁戊，庚辛壬癸子，辛壬癸甲乙')
    expect(cues).toHaveLength(15)
    expect(cues[0].pauseBefore).toBe(0)
    expect(cues.every((c) => c.pauseBefore >= 0)).toBe(true)
    // 下标 5 是第二组的第一条（前面接逗号停顿），下标 6 是同组内的第二条
    expect(cues[5].pauseBefore).toBeGreaterThan(cues[6].pauseBefore)
    expect(cues[10].pauseBefore).toBeGreaterThan(cues[11].pauseBefore)
  })

  it('voices one clip per character while the line fits the budget', () => {
    const text = '这里是导航。点一个分类会浮出该类的工具，再点同一个分类收起。'
    const chars = [...text].filter((c) => !/[，。、：；！？,.;:!?…\s]/.test(c)).length
    expect(resolveVoice(LINE, text)).toHaveLength(chars)
  })

  it('reads the same character the same way wherever it lands', () => {
    // 取音按"这条音效承担的那几个字"哈希，不按序号——所以叠字听起来是重复而不是两个音
    const cues = resolveVoice(LINE, '甲甲，乙乙')
    expect(cues.map((c) => c.clip)).toEqual([
      cues[0].clip,
      cues[0].clip,
      cues[2].clip,
      cues[2].clip,
    ])
  })

  it('packs characters instead of truncating when the copy outruns the budget', () => {
    const text = `${'一二三四五六七八九十，'.repeat(30)}一二三四五六七八九十。`
    const cues = resolveVoice(LINE, text)
    expect(cues.length).toBeLessThanOrEqual(44)
    // 310 个音节压进 44 条预算：每条承担 8 个字，仍然覆盖到最后一个字
    expect(cues.length).toBe(44)
  })

  it('reveals one more character per clip so the text keeps pace with the voice', () => {
    // 「。」不发音，所以它跟着下一个字一起露出来，而不是孤零零地先挂在那儿
    const cues = resolveVoice(LINE, '这里是导航。点一个分类')
    expect(cues.map((c) => c.reveal)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11])
  })

  it('never leaves the copy half shown, even when the budget ran out', () => {
    const text = `${'一二三四五六七八九十，'.repeat(30)}一二三四五六七八九十。`
    const cues = resolveVoice(LINE, text)
    expect(cues.at(-1)?.reveal).toBe(text.length)
    expect(cues.every((c, i) => i === 0 || c.reveal >= cues[i - 1].reveal)).toBe(true)
  })

  it('spreads the reveal evenly for a hand-picked clip sequence', () => {
    const text = '中间这块电路板就是全部工具'
    const cues = resolveVoice(
      { emotion: 'normal', clips: ['normal_per_01', 'normal_per_02'] },
      text,
    )
    expect(cues[0].reveal).toBeGreaterThan(0)
    expect(cues[0].reveal).toBeLessThan(text.length)
    expect(cues.at(-1)?.reveal).toBe(text.length)
  })

  it('exposes a playback-rate seed in range for every cue', () => {
    for (const cue of resolveVoice(LINE, '这里是导航，点一个分类。')) {
      expect(cue.seed).toBeGreaterThanOrEqual(0)
      expect(cue.seed).toBeLessThan(1)
    }
  })
})
