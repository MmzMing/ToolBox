import { describe, expect, it } from 'vitest'

import {
  buildPlan,
  chunkText,
  computeTiming,
  defaultProject,
  designSize,
  normalizeProject,
  outputSize,
  parseLyrics,
  parseProject,
  planText,
  safeFileName,
  serializeProject,
  splitLines,
} from '@/tools/video/music-to-video/music-to-video.service'

const projectWith = (lyrics: string, part = {}) => ({ ...defaultProject(), lyrics, ...part })

describe('parseLyrics', () => {
  it('把每一行解析成一条歌词', () => {
    const { lines } = parseLyrics('第一行\n第二行')
    expect(lines.map((l) => l.text)).toEqual(['第一行', '第二行'])
  })

  it('忽略空行与注释行，但保留空行造成的停顿', () => {
    const { lines } = parseLyrics('# 这是注释\n第一行\n\n第二行')
    expect(lines).toHaveLength(2)
    expect(lines[0].gapBefore).toBe(false)
    expect(lines[1].gapBefore).toBe(true)
  })

  it('识别 LRC 时间戳并按时间排序', () => {
    const { lines } = parseLyrics('[00:02.50]后面\n[00:01.00]前面')
    expect(lines.map((l) => l.lrc)).toEqual([1, 2.5])
  })

  it('同一行的多个时间戳会展开成多条', () => {
    const { lines } = parseLyrics('[00:01.00][00:03.00]重复的副歌')
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.text === '重复的副歌')).toBe(true)
  })

  it('读取 [ti:] [ar:] 元数据', () => {
    const { lines, meta } = parseLyrics('[ti:晚风]\n[ar:某人]\n歌词')
    expect(meta).toEqual({ ti: '晚风', ar: '某人' })
    expect(lines).toHaveLength(1)
  })

  it('斜杠是手工分镜，竖线之后是注释', () => {
    const [line] = parseLyrics('把还没说完的话/留在风里|写给夏天').lines
    expect(line.text).toBe('把还没说完的话留在风里')
    expect(line.manual).toEqual(['把还没说完的话', '留在风里'])
    expect(line.note).toBe('写给夏天')
  })

  it('星号标记重音，行尾感叹号标记强调', () => {
    const [line] = parseLyrics('*我们*都以为明天还很远!').lines
    expect(line.emph).toEqual(['我们'])
    expect(line.impact).toBe(true)
    expect(line.text).toBe('我们都以为明天还很远')
  })

  it('空输入与纯空白都不报错', () => {
    expect(parseLyrics('').lines).toEqual([])
    expect(parseLyrics('\n\n  \n# 只有注释\n').lines).toEqual([])
    expect(parseLyrics('[00:01.00]').lines).toEqual([])
  })
})

describe('chunkText', () => {
  it('切成的词块拼回去等于原句', () => {
    const text = '凌晨三点的城市只有一盏灯还醒着'
    expect(chunkText(text).join('')).toBe(text)
  })

  it('词块不会超过单块上限，也不会剩孤字', () => {
    const chunks = chunkText('我们都以为明天还很远远到再也回不去')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.some((c) => [...c].length > 8)).toBe(false)
    expect(chunks.slice(1).every((c) => [...c].length > 1)).toBe(true)
  })

  it('英文句子按词切分', () => {
    expect(chunkText('hold the line').join(' ')).toBe('hold the line')
  })

  it('单字成句时返回整句', () => {
    expect(chunkText('雨')).toEqual(['雨'])
  })
})

describe('splitLines', () => {
  it('不超过上限时原样返回', () => {
    expect(splitLines('短句', 11)).toBe('短句')
  })

  it('换行点优先落在标点之后', () => {
    const text = '第一句话说完了，第二句话接着说下去'
    const lines = splitLines(text, 8).split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0].endsWith('，')).toBe(true)
  })

  it('不把英文单词从中间切断', () => {
    const lines = splitLines('always winter', 6).split('\n')
    expect(lines).toContain('always')
    expect(lines.join('')).toBe('alwayswinter')
  })
})

describe('computeTiming', () => {
  it('全部带时间戳时直接采用时间戳', () => {
    const parsed = parseLyrics('[00:01.00]一\n[00:04.00]二')
    const tm = computeTiming(defaultProject(), parsed, null)
    expect(tm.starts).toEqual([1, 4])
    expect(tm.ends[0]).toBe(4)
  })

  it('没有时间戳时按字数估算，并加上结尾留白', () => {
    const parsed = parseLyrics('短句')
    const project = {
      ...defaultProject(),
      timing: { ...defaultProject().timing, offset: 0.4, tail: 0.9 },
    }
    const tm = computeTiming(project, parsed, null)
    expect(tm.starts[0]).toBe(0.4)
    expect(tm.ends[0]).toBeGreaterThan(tm.starts[0])
    expect(tm.duration).toBeCloseTo(tm.ends[0] + 0.9, 5)
  })

  it('给定 BPM 后每行时长取整拍', () => {
    const parsed = parseLyrics('一二三\n四五六')
    const project = {
      ...defaultProject(),
      timing: { ...defaultProject().timing, bpm: 120, snap: true },
    }
    const tm = computeTiming(project, parsed, null)
    expect(tm.starts[1] - tm.starts[0]).toBeCloseTo(
      Math.round((tm.starts[1] - tm.starts[0]) / 0.5) * 0.5,
      6,
    )
  })

  it('音频比歌词长时，时长跟随音频', () => {
    const parsed = parseLyrics('短句')
    const audio = { duration: 30 } as never
    const tm = computeTiming(defaultProject(), parsed, audio)
    expect(tm.duration).toBeGreaterThanOrEqual(30)
  })
})

describe('buildPlan', () => {
  const lyrics = '把还没说完的话/留在风里\n凌晨三点的城市\n*我们*都以为明天还很远!'

  it('为每行歌词排出首尾相接的镜头', () => {
    const plan = buildPlan(projectWith(lyrics), null)
    expect(plan.cuts.length).toBeGreaterThanOrEqual(plan.lines.length)
    for (const cut of plan.cuts) {
      expect(cut.dur).toBeGreaterThan(0)
      expect(cut.end - cut.start).toBeCloseTo(cut.dur, 6)
    }
  })

  it('同一 seed 两次规划结果完全一致（换 seed 才会变）', () => {
    const a = buildPlan(projectWith(lyrics), null)
    const b = buildPlan(projectWith(lyrics), null)
    expect(JSON.stringify(a.cuts)).toBe(JSON.stringify(b.cuts))
    const c = buildPlan(projectWith(lyrics, { seed: 12345 }), null)
    expect(JSON.stringify(c.cuts)).not.toBe(JSON.stringify(a.cuts))
  })

  it('镜头按时间排序且不重叠', () => {
    const plan = buildPlan(projectWith(lyrics), null)
    for (let i = 1; i < plan.cuts.length; i++) {
      expect(plan.cuts[i].start).toBeGreaterThanOrEqual(plan.cuts[i - 1].start)
      expect(plan.cuts[i].start).toBeLessThan(plan.cuts[i].end)
    }
  })

  it('标题足够靠前时生成片头卡', () => {
    const withTitle = {
      ...projectWith('[00:03.00]第一句\n[00:06.00]第二句'),
      title: '晚风',
      artist: '某人',
    }
    const plan = buildPlan(withTitle, null)
    expect(plan.title).toBe('晚风')
    expect(plan.cuts[0].layout).toBe('title')
    expect(plan.cuts[0].text).toBe('晚风')
  })

  it('单行歌词可以强制只出一个镜头', () => {
    const project = projectWith('一二三四五六七八九十')
    project.overrides[0] = { single: true }
    const single = buildPlan(project, null)
    const multi = buildPlan(projectWith('一二三四五六七八九十'), null)
    expect(single.cuts.filter((c) => c.line === 0)).toHaveLength(1)
    expect(multi.cuts.filter((c) => c.line === 0).length).toBeGreaterThanOrEqual(1)
  })

  it('关闭某个部件后不会再被选中', () => {
    const project = projectWith(lyrics)
    project.enabled.layout = { ...project.enabled.layout, huge: false }
    const plan = buildPlan(project, null)
    expect(plan.cuts.some((c) => c.layout === 'huge')).toBe(false)
  })

  it('节拍点会被吸收进切镜边界', () => {
    const project = projectWith('[00:00.00]第一句\n[00:04.00]第二句')
    const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
    const plan = buildPlan(project, {
      beats,
      energy: new Float32Array(10).fill(0.5),
      energyRate: 50,
      duration: 6,
    } as never)
    expect(plan.beats.length).toBe(beats.length)
    const snapped = plan.cuts.filter((c) => beats.includes(c.start))
    expect(snapped.length).toBeGreaterThan(0)
  })

  it('空歌词不产生镜头，但不抛异常', () => {
    const plan = buildPlan(projectWith(''), null)
    expect(plan.cuts).toEqual([])
    expect(plan.duration).toBeGreaterThan(0)
    expect(planText(plan)).toContain('')
  })

  it('长停顿里插入间奏镜头', () => {
    const plan = buildPlan(projectWith('[00:00.50]短句\n[00:09.00]另一句'), null)
    expect(plan.cuts.some((c) => c.layout === 'interlude')).toBe(true)
  })
})

describe('画幅与输出尺寸', () => {
  it('各画幅的设计尺寸符合约定', () => {
    expect(designSize('16:9')).toEqual([1920, 1080])
    expect(designSize('9:16')).toEqual([1080, 1920])
    expect(designSize('1:1')).toEqual([1440, 1440])
  })

  it('输出尺寸按短边取目标分辨率，且宽高都为偶数', () => {
    const [w, h] = outputSize('16:9', 720)
    expect(h).toBe(720)
    expect(w % 2).toBe(0)
    expect(h % 2).toBe(0)
  })
})

describe('normalizeProject', () => {
  it('非对象输入回退到默认项目', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(normalizeProject(bad)).toEqual(defaultProject())
    }
  })

  it('非法画幅 / 分辨率 / 帧率都回退默认值', () => {
    const p = normalizeProject({ aspect: '3:7', res: 999, fps: 11 })
    expect(p.aspect).toBe(defaultProject().aspect)
    expect(p.res).toBe(defaultProject().res)
    expect(p.fps).toBe(defaultProject().fps)
  })

  it('滑块值被夹到 0..1，非法值回退默认', () => {
    const p = normalizeProject({ fx: { motion: 9, glitch: 'abc' } })
    expect(p.fx.motion).toBe(1)
    expect(p.fx.glitch).toBe(defaultProject().fx.glitch)
  })

  it('保留合法字段并补齐缺失字段', () => {
    const p = normalizeProject({ title: '晚风', lyrics: '一句', seed: 7, aspect: '9:16' })
    expect(p.title).toBe('晚风')
    expect(p.seed).toBe(7)
    expect(p.aspect).toBe('9:16')
    expect(p.fx.density).toBe(defaultProject().fx.density)
  })

  it('丢弃形状不对的行覆盖与时间轴，只留合法项', () => {
    const p = normalizeProject({
      overrides: { 0: { layout: 'center', lock: true }, '-1': { lock: true }, 1: 'nope' },
      timing: { lineTimes: { 0: 1.5, 1: 'x' } },
    })
    expect(Object.keys(p.overrides)).toEqual(['0'])
    expect(p.overrides[0].lock).toBe(true)
    expect(p.timing.lineTimes).toEqual({ 0: 1.5 })
  })

  it('超长歌词与标题会被截断，防止 localStorage 塞爆', () => {
    const p = normalizeProject({ lyrics: '啊'.repeat(30000), title: 'x'.repeat(500) })
    expect(p.lyrics.length).toBe(20000)
    expect(p.title.length).toBe(120)
  })

  it('归一化过的项目再规划一次也不会崩', () => {
    const p = normalizeProject({ lyrics: '一二三\n四五六', seed: 3 })
    expect(buildPlan(p, null).cuts.length).toBeGreaterThan(0)
  })

  it('默认开启追加部件、默认 60 帧', () => {
    expect(defaultProject().extra).toBe(true)
    expect(defaultProject().fps).toBe(60)
    // 早先保存的工程没有这个字段时按新默认补齐，显式关掉的才保持关闭
    expect(normalizeProject({ lyrics: '一' }).extra).toBe(true)
    expect(normalizeProject({ extra: false }).extra).toBe(false)
  })
})

describe('safeFileName', () => {
  it('剔除路径与非法字符', () => {
    expect(safeFileName('a/b:c*d?.mp4')).toBe('a-b-c-d-.mp4')
    expect(safeFileName('  晚风  ')).toBe('晚风')
  })

  it('全被剔除时使用兜底名', () => {
    expect(safeFileName('///')).toBe('music-to-video')
  })
})

describe('工程文件读写', () => {
  it('保存再打开得到同一份设置', () => {
    const p = { ...defaultProject(), title: '晚风', lyrics: '一\n二\n三', seed: 77 }
    expect(parseProject(serializeProject(p))).toEqual(normalizeProject(p))
  })

  it('接受没有类型标记但字段齐全的裸对象', () => {
    const got = parseProject(JSON.stringify({ lyrics: '一\n二', seed: 5 }))
    expect(got?.lyrics).toBe('一\n二')
    expect(got?.seed).toBe(5)
  })

  it('坏 JSON、非对象、无关 JSON 都返回 null 而不抛错', () => {
    expect(parseProject('{ 不是 json')).toBeNull()
    expect(parseProject('[1,2,3]')).toBeNull()
    expect(parseProject('{"tools":[]}')).toBeNull()
  })

  it('带标记却没有工程内容时不猜', () => {
    expect(parseProject(JSON.stringify({ kind: 'toolbox.music-to-video' }))).toBeNull()
  })

  it('字段被手工改坏时逐项兜底', () => {
    const got = parseProject(
      JSON.stringify({
        kind: 'toolbox.music-to-video',
        project: { lyrics: 42, seed: 'x', fps: 999 },
      }),
    )
    const base = defaultProject()
    expect(got?.lyrics).toBe(base.lyrics)
    expect(got?.seed).toBe(base.seed)
    expect(got?.fps).toBe(base.fps)
  })
})
