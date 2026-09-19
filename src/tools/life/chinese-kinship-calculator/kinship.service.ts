/**
 * 中国亲戚称谓计算 —— selector / ID 双层模型，算法与数据移植自开源库 relationship.js（见 kinship-data.ts 顶部说明）。
 *
 * - selector（非唯一关系链）：中文表述 → 关系符链，如「爸爸的哥哥」→「f,ob」；
 * - ID（唯一关系链）：关系符链 → 称谓，如「f,ob」→「伯父」。
 *
 * 关系符与修饰符语法见 kinship-data.ts 顶部注释。完整关系表由「主要关系 + 并称 +
 * 前缀×分支 + 配偶前缀」四类数据在模块加载时合并而成（对应上游 map.js）。
 */
import {
  BRANCH_DATA,
  FILTER_RULES,
  INPUT_DATA,
  MAIN_DATA,
  MULTIPLE_DATA,
  PAIR_DATA,
  PREFIX_DATA,
  REPLACE_RULES,
  SIMILAR,
  SORT_DATA,
} from './kinship-data'

export type Sex = 0 | 1

/** 查询产出：称谓 / 关系链 / 关系合称 */
export type RelationType = 'term' | 'chain' | 'pair'

/** 单步关系的形态，用于辈分树的连线走位 */
export type RelationKind = 'parent' | 'child' | 'sibling' | 'spouse' | 'unknown'

type NameMap = Map<string, string[]>

// ---------------------------------------------------------------------------
// 数字工具（上游 utils.js）
// ---------------------------------------------------------------------------
const NUMBER_ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function zh2number(text: string): number {
  if (text === '大') return 1
  if (text === '小') return 99
  const [unit, dec = 0] = text
    .replace(/^十/, '一十')
    .split('十')
    .map((word) => NUMBER_ZH.indexOf(word))
    .reverse()
  return dec * 10 + unit
}

export function number2zh(num: number): string {
  if (num === 1) return '大'
  if (num === 99) return '小'
  const dec = Math.trunc(num / 10)
  const unit = num % 10
  return (dec ? (NUMBER_ZH[dec] + '十').replace('一十', '十') : '') + NUMBER_ZH[unit]
}

// ---------------------------------------------------------------------------
// ID 工具（上游 id.js）
// ---------------------------------------------------------------------------

/** ID 列表去重：长幼信息可推导时保留更泛化的一条 */
export function filterId(arr: readonly string[]): string[] {
  const normalize = (item: string): string =>
    item.replace(/[ol](?=[s|b])/g, 'x').replace(/&[ol]/, '')
  const sameList = new Set(arr.filter((item) => item === normalize(item)))
  const seen = new Set<string>()
  return arr.filter((item) => {
    const temp = normalize(item)
    const keep = sameList.has(item) || (item !== temp && !sameList.has(temp))
    if (keep && !seen.has(item)) {
      seen.add(item)
      return true
    }
    return false
  })
}

/** ID 的世代数：正数长辈，负数晚辈 */
export function getGenById(id: string): number {
  const genMap: Record<string, number> = { f: 1, m: 1, s: -1, d: -1 }
  let gen = 0
  for (const sub of id.split(',')) {
    const sign = sub.replace(/&[ol\d]+/, '')
    gen += genMap[sign] ?? 0
  }
  return gen
}

/** ID 逆转：从对方视角看我 */
export function reverseId(id: string, sex: -1 | Sex): string[] {
  if (!id) return ['']
  const hash: Record<string, [string, string]> = {
    f: ['d', 's'],
    m: ['d', 's'],
    h: ['w', ''],
    w: ['', 'h'],
    s: ['m', 'f'],
    d: ['m', 'f'],
    lb: ['os', 'ob'],
    ob: ['ls', 'lb'],
    xb: ['xs', 'xb'],
    ls: ['os', 'ob'],
    os: ['ls', 'lb'],
    xs: ['xs', 'xb'],
  }
  let age = ''
  if (/&o$/.test(id)) age = '&l'
  else if (/&l$/.test(id)) age = '&o'
  id = id.replace(/&[ol\d+]/g, '')
  let activeSex: -1 | Sex = sex
  if (activeSex < 0) {
    if (/^w/.test(id)) activeSex = 1
    else if (/^h/.test(id)) activeSex = 0
  }
  const doing = (doingSex: Sex): string => {
    const sid = (',' + doingSex + ',' + id)
      .replace(/,[fhs]|,[olx]b/g, ',1')
      .replace(/,[mwd]|,[olx]s/g, ',0')
    const sidArr = sid
      .slice(0, sid.length - 2)
      .split(',')
      .reverse()
    const rId = id
      .split(',')
      .reverse()
      .map((sign, i) => {
        const reversed = hash[sign]
        return reversed ? reversed[Number(sidArr[i]) as 0 | 1] : ''
      })
      .join(',')
    return rId + (getGenById(rId) ? '' : age)
  }
  if (activeSex === -1) return [doing(1), doing(0)]
  return [doing(activeSex)]
}

// ---------------------------------------------------------------------------
// 选择器（上游 selector.js）
// ---------------------------------------------------------------------------

/** 展开 selector：按缩写规则缩减，遇 # 隔断与 [a|b] 并列产生多分支 */
export function expandSelector(selector: string): string[] {
  const result: string[] = []
  const hash = new Set<string>()
  const expand = (current: string): void => {
    if (hash.has(current)) return
    hash.add(current)
    let previous: string
    let next = current
    do {
      previous = next
      for (const rule of FILTER_RULES) {
        next = next.replace(rule.exp, rule.str)
        if (next.includes('#')) {
          next.split('#').forEach(expand)
          return
        }
      }
    } while (previous !== next)
    // 同性恋爱关系去除
    if (/,[mwd0](&[ol\d]+)?,w|,[hfs1](&[ol\d]+)?,h/.test(next)) return
    result.push(next)
  }
  expand(selector)
  return result
}

/** selector → ID 列表 */
export function selector2id(selector: string, sex: -1 | Sex): string[] {
  let normalized = selector.startsWith(',') ? selector : ',' + selector
  let activeSex: -1 | Sex = sex
  // 性别判断
  if (activeSex < 0) {
    if (/^,[w1]/.test(normalized)) activeSex = 1
    else if (/^,[h0]/.test(normalized)) activeSex = 0
  } else if (activeSex === 1 && /^,[h0]/.test(normalized)) {
    return []
  } else if (activeSex === 0 && /^,[w1]/.test(normalized)) {
    return []
  }
  if (activeSex > -1 && !normalized.includes(',1') && !normalized.includes(',0')) {
    normalized = ',' + activeSex + normalized
  }
  // 同性恋爱关系去除
  if (/,[mwd0](&[ol\d]+)?,w|,[hfs1](&[ol\d]+)?,h/.test(normalized)) return []
  const result = expandSelector(normalized).map((s) => s.replace(/,[01]/, '').slice(1))
  return filterId(result)
}

// ---------------------------------------------------------------------------
// 完整关系表（上游 map.js）：并称 + 前缀×分支 + 主要关系 + 配偶前缀
// ---------------------------------------------------------------------------
const objectToMap = (obj: Record<string, string[]>): NameMap => new Map(Object.entries(obj))

/** 把 source 的值追加到 target 同键之后，返回 target */
function mergeMap(target: NameMap, source: NameMap): NameMap {
  source.forEach((value, key) => {
    target.set(key, (target.get(key) ?? []).concat(value))
  })
  return target
}

/** 配偶前缀：为「岳父家/婆家」侧的关系自动合成「妻舅 / 内兄 / 公公的兄弟」等叫法 */
const MATE_DATA: Record<'w' | 'h', string[]> = {
  w: ['妻', '内', '岳', '岳家', '丈人'],
  h: ['夫', '外', '公', '婆家', '婆婆'],
}

function buildModeMap(): NameMap {
  const $mode = objectToMap(MULTIPLE_DATA)

  const prefixMap: Record<string, Record<string, string[]>> = {}
  for (const tag in PREFIX_DATA) {
    prefixMap[tag] = {}
    for (const selector in PREFIX_DATA[tag]) {
      for (const expanded of expandSelector(selector)) {
        prefixMap[tag][expanded] = PREFIX_DATA[tag][selector]
      }
    }
  }

  const branchMap: Record<string, string[]> = {}
  for (const selector in BRANCH_DATA) {
    for (const expanded of expandSelector(selector)) {
      branchMap[expanded] = BRANCH_DATA[selector]
    }
  }

  // 前缀 × 分支：'{G1},xb' + 'f,xs' → 'f,xs,xb' = 「姑表哥」
  const merged: NameMap = new Map()
  for (const key in branchMap) {
    const tag = key.match(/\{.+?\}/)?.[0]
    if (!tag) continue
    const nameList = branchMap[key]
    for (const prefixKey in prefixMap[tag]) {
      const prefixList = prefixMap[tag][prefixKey]
      const newKey = key.replace(tag, prefixKey)
      // 配偶之间的伪关系链无意义
      if (['h,h', 'w,w', 'w,h', 'h,w'].some((pair) => newKey.includes(pair))) continue
      const newList = prefixList.flatMap((prefix) =>
        nameList.map((name) => (name.includes('?') ? name.replace('?', prefix) : prefix + name)),
      )
      merged.set(newKey, newList.concat(merged.get(newKey) ?? $mode.get(newKey) ?? []))
    }
  }
  merged.forEach((value, key) => $mode.set(key, value))

  // 主要关系优先级最高，排在最前
  for (const key in MAIN_DATA) {
    $mode.set(key, [...MAIN_DATA[key], ...($mode.get(key) ?? [])])
  }

  // 配偶前缀合成
  const nameSet = new Set([...$mode.values()].flat())
  $mode.forEach(function (names, key) {
    if (!/^[fm]/.test(key) && !/^[olx][bs]$|^[olx][bs],[^mf]/.test(key)) return
    for (const mate of Object.keys(MATE_DATA) as ('w' | 'h')[]) {
      const newKey = mate + ',' + key
      if (/[fm]/.test(key)) {
        // 已有长幼不分的泛化键时不再叠加配偶前缀，避免「内兄弟」这类冗余称呼
        const newKeyX = newKey
          .replace(/,[ol]([sb])(,[wh])?$/, ',x$1$2')
          .replace(/(,[sd])&[ol](,[wh])?$/, '$1$2')
        if (newKeyX !== newKey && $mode.has(newKeyX)) continue
      }
      if (!$mode.has(newKey)) $mode.set(newKey, [])
      const targetList = $mode.get(newKey) ?? []
      for (const prefix of MATE_DATA[mate]) {
        for (const name of names) {
          const newName = prefix + name
          if (!nameSet.has(newName)) {
            targetList.push(newName)
            $mode.set(newKey, targetList)
          }
        }
      }
    }
  })

  return $mode
}

const $mode = buildModeMap()

/**
 * 称谓 → ID 列表。反查索引额外并入「仅供输入」与「排行」两张表，
 * 使「兄弟」「几爷爷」这类口语能被解析，但不会作为称谓输出。
 */
const $reverse: NameMap = (() => {
  const lookup = mergeMap(mergeMap(new Map($mode), objectToMap(INPUT_DATA)), objectToMap(SORT_DATA))
  const map: NameMap = new Map()
  lookup.forEach((names, key) => {
    for (const name of names) {
      const list = map.get(name) ?? []
      list.push(key)
      map.set(name, list)
    }
  })
  return map
})()

// ---------------------------------------------------------------------------
// ID → 称谓 / 关系链 / 合称
// ---------------------------------------------------------------------------

/** ID → 称谓，含排行与长幼模糊回退 */
export function getItemsById(id: string): string[] {
  let items: string[] = []
  const getData = (key: string): string[] => {
    let ids: string[] = []
    const k1 = key.replace(/(,[sd])(,[wh])?$/, '$1&o$2')
    const k2 = key.replace(/(,[sd])(,[wh])?$/, '$1&l$2')
    if ($mode.has(k1) && $mode.has(k2)) {
      ids = [k1, k2]
    } else if ($mode.has(key)) {
      ids = [key]
    }
    return filterId(ids).map((rid) => $mode.get(rid)?.[0] ?? '')
  }
  // 排行处理：「二伯」→「f,ob&2」
  const numMatch = id.match(/&([\d]+)(,[hw])?$/)
  const num = numMatch ? Number(numMatch[1]) : 0
  if (num) {
    const zh = number2zh(num)
    id = id.replace(/&\d+/g, '')
    const sortEntry = SORT_DATA[id]
    if (sortEntry) {
      items.push(sortEntry[0].replace('几', zh))
    } else if ($mode.has(id)) {
      const names = $mode.get(id) ?? []
      const gen = getGenById(id)
      let item = ''
      if (gen < 3 && !/[hw],/.test(id)) {
        for (const name of names) {
          if (!item && name.includes('几')) item = name.replace('几', zh)
        }
        if (!item) {
          item = names[0] ?? ''
          item = /^[大小]/.test(item) ? item.replace(/^[大小]/, zh) : zh + item
        }
      }
      items.push(item)
    }
  }
  // 直接匹配
  if (items.length === 0) {
    id = id.replace(/&\d+/g, '')
    items = getData(id)
  }
  // 忽略年龄条件
  if (items.length === 0) {
    id = id.replace(/&[ol]/g, '')
    items = getData(id)
  }
  // 长幼并为不确定
  if (items.length === 0) {
    id = id.replace(/[ol](b|s)/g, 'x$1')
    items = getData(id)
  }
  // 缩小访问查找
  if (items.length === 0) {
    items = items.concat(getData(id.replace(/x/g, 'o')), getData(id.replace(/x/g, 'l')))
  }
  return items.filter(Boolean)
}

/** ID 对 → 关系合称，如「f#s」→「父子」 */
export function getPairsById(id1: string, id2: string): string[] {
  const strip = (id: string): string => id.replace(/&\d+/g, '')
  const toX = (id: string): string => id.replace(/([ol])([bs])/g, 'x$2')
  const toPlain = (id: string): string => id.replace(/&[ol]/g, '')
  const a = strip(id1)
  const b = strip(id2)
  const aX = toX(a)
  const bX = toX(b)
  const aR = toPlain(a)
  const bR = toPlain(b)

  const result: string[] = []
  const resultX: string[] = []
  const resultR: string[] = []
  for (const key in PAIR_DATA) {
    const [left, right] = key.split('#')
    if (right === undefined) continue
    const list1 = selector2id(left, -1)
    const list2 = selector2id(right, -1)
    const list1R = list1.map((s) => toX(s.replace(/&[ol\d]+/g, '')))
    const list2R = list2.map((s) => toX(s.replace(/&[ol\d]+/g, '')))
    const pair = (listA: string[], valA: string, listB: string[], valB: string): boolean =>
      (listA.includes(valA) && listB.includes(valB)) ||
      (listA.includes(valB) && listB.includes(valA))
    if (pair(list1, a, list2, b)) result.push(PAIR_DATA[key][0])
    if (pair(list1R, aX, list2R, bX)) resultX.push(PAIR_DATA[key][0])
    if (pair(list1R, aR, list2R, bR)) resultR.push(PAIR_DATA[key][0])
  }
  if (result.length === 0) result.push(...resultX)
  if (result.length === 0) result.push(...resultR)
  return [...new Set(result)]
}

/** ID → 中文关系链 */
export function getChainById(id: string, sex: -1 | Sex = -1): string {
  const item = id
    .split(',')
    .map((sign) => {
      const key = sign.replace(/&[ol\d]+/, '')
      return ($mode.get(key) ?? { xb: ['兄弟'], xs: ['姐妹'] }[key] ?? [''])[0]
    })
    .join('的')
  if (sex > -1 && $mode.has(`${sex},${id}`)) {
    return sex === 0 ? `(女性)${item}` : `(男性)${item}`
  }
  return item
}

// ---------------------------------------------------------------------------
// 中文表述 → selector
// ---------------------------------------------------------------------------

/** 中文表述 → selector 列表，支持同义词、词义扩展与排行 */
export function getSelectors(input: string): string[] {
  let str = input
    .replace(/之/g, '的')
    .replace(/吾之?(.+)/, '$1')
    .replace(/我的?(.+)/, '$1')
  if (/[^娘婆岳亲]家的?(孩子|儿子|女儿)/.test(str)) {
    str = str.replace(/家的?/, '的')
  }
  str = str
    .replace(/(舅|姑)+(爸|父|丈|妈|母)?家的?(哥|姐|弟|妹)+/, '$1表$3')
    .replace(/(舅|姑)+(爸|父|丈|妈|母)?家的?/, '$1表')
  str = str
    .replace(/(伯|叔)+(父|母)?家的?(哥|姐|弟|妹)+/, '堂$3')
    .replace(/(伯|叔)+(父|母)?家的?/, '堂')
  str = str
    .replace(/姨+(爸|父|丈|妈|母)?家的?(哥|姐|弟|妹)+/, '姨$2')
    .replace(/姨+(爸|父|丈|妈|母)?家的?/, '姨')

  const lists = str.split('的')
  let result: string[] = []
  let isMatch = true
  while (lists.length) {
    const name = lists.shift() ?? ''
    let items: string[] = []
    const keywords = [name]
    const collect = (word: string): void => {
      // 词义扩展
      for (const rule of REPLACE_RULES) {
        for (const replacement of rule.arr) {
          const expanded = word.replace(rule.exp, replacement)
          if (expanded !== word) {
            keywords.push(expanded)
            collect(expanded)
          }
        }
      }
      // 同义词替换（双向）
      for (const similar in SIMILAR) {
        const replaced = word.replace(similar, SIMILAR[similar])
        const inversed = word.replace(SIMILAR[similar], similar)
        if (replaced !== word) keywords.push(replaced)
        if (inversed !== word) keywords.push(inversed)
      }
    }
    collect(name)
    // 通过关键词找关系
    const itemsMap: string[][] = [[], [], []]
    for (let keyword of keywords) {
      keyword = keyword.replace(/^[尕幺细满碎晚末尾幼]/, '小')
      const match = keyword.match(/^[大|小]|^[一|二|三|四|五|六|七|八|九|十]+/)
      if (match) {
        // 排行匹配
        const xName = keyword.replace(match[0], '几')
        const rName = keyword.replace(match[0], '')
        const num = zh2number(match[0])
        for (const [index, candidate] of [xName, rName, keyword].entries()) {
          const ids = $reverse.get(candidate)
          if (ids && ids.length) {
            for (const rid of ids) {
              const expanded = rid
                .replace(/(,[hw])$/, '&' + num + '$1')
                .replace(/([^hw]+)$/, '$1&' + num)
              if (!/^[mf,]+$/.test(rid) && !/^[从世]/.test(candidate)) {
                // 直系祖辈不参与排序
                itemsMap[index].push(expanded)
              }
            }
          }
        }
      }
      items = items.concat($reverse.get(keyword) ?? [])
    }
    // 找不到时再考虑排行
    for (const itemsX of itemsMap) {
      if (items.length === 0) items = itemsX
    }
    if (items.length === 0) isMatch = false
    const res: string[] = []
    if (result.length === 0) result = ['']
    for (const a of result) {
      for (const b of items) {
        res.push(a + (b ? ',' + b : ''))
      }
    }
    result = res
  }
  return isMatch ? filterId(result) : []
}

/** 两条关系链消除公共前缀，得到「相对对象看目标对象」的最短链 */
function getOptimal(options: { from: string; to: string; sex: -1 | Sex; optimal?: boolean }): {
  from: string
  to: string
  sex: -1 | Sex
} {
  let { from, to, sex } = options
  const fromChain = from.split(',')
  const toChain = to.split(',')
  for (let i = 0; i < fromChain.length && i < toChain.length; i++) {
    if (fromChain[i] === toChain[i]) {
      from = fromChain.slice(i + 1).join(',')
      to = toChain.slice(i + 1).join(',')
      sex = /^([fhs1](&[ol\d]+)?|[olx]b)(&[ol\d]+)?/.test(fromChain[i]) ? 1 : 0
      continue
    }
    if (
      getGenById(fromChain[i]) === getGenById(toChain[i]) &&
      /^[xol][bs]|^[sd]/.test(fromChain[i]) &&
      /^[xol][bs]|^[sd]/.test(toChain[i])
    ) {
      const fromType = fromChain[i].replace(/&([ol\d]+)/, '').replace(/^[xol]([bs])/, '$1')
      const toType = toChain[i].replace(/&([ol\d]+)/, '').replace(/^[xol]([bs])/, '$1')
      if (fromType !== toType) break
      const fromAttr =
        fromChain[i].match(/&([ol\d]+)/)?.[1] || fromChain[i].match(/([ol])[bs]/)?.[1] || ''
      const toAttr =
        toChain[i].match(/&([ol\d]+)/)?.[1] || toChain[i].match(/([ol])[bs]/)?.[1] || ''
      const asOlder = (sign: string): string =>
        sign.replace(/^[xol]b|^s/, 'ob').replace(/^[xol]s|^d/, 'os')
      const asYounger = (sign: string): string =>
        sign.replace(/^[xol]b|^s/, 'lb').replace(/^[xol]s|^d/, 'ls')
      if (fromAttr && toAttr) {
        if (!isNaN(Number(fromAttr)) && !isNaN(Number(toAttr))) {
          fromChain[i] =
            Number(fromAttr) > Number(toAttr) ? asYounger(fromChain[i]) : asOlder(fromChain[i])
        } else if (
          (!isNaN(Number(fromAttr)) && toAttr === 'o') ||
          (fromAttr === 'l' && !isNaN(Number(toAttr)))
        ) {
          fromChain[i] = asYounger(fromChain[i])
        } else if (
          (!isNaN(Number(fromAttr)) && toAttr === 'l') ||
          (fromAttr === 'o' && !isNaN(Number(toAttr)))
        ) {
          fromChain[i] = asOlder(fromChain[i])
        }
        from = fromChain.slice(i).join(',')
        to = toChain.slice(i + 1).join(',')
        sex = /^([fhs1](&[ol\d]+)?|[olx]b)(&[ol\d]+)?/.test(toChain[i]) ? 1 : 0
      } else if (options.optimal) {
        const fromRank = fromChain[i].match(/([xol])[bs]/)?.[1] ?? ''
        const toRank = toChain[i].match(/([xol])[bs]/)?.[1] ?? ''
        if (fromRank === 'x' || toRank === 'x') {
          from = fromChain.slice(i + 1).join(',')
          to = toChain.slice(i + 1).join(',')
          sex = /^([fhs1](&[ol\d]+)?|[olx]b)(&[ol\d]+)?/.test(fromChain[i]) ? 1 : 0
          continue
        }
      }
    }
    break
  }
  return { from, to, sex }
}

/** 合并两条 selector：求「to 视角下的 from」关系链 */
function mergeSelector(param: {
  from: string
  to: string
  sex: -1 | Sex
  optimal?: boolean
}): Array<{ selector: string; sex: -1 | Sex }> {
  let mySex = param.sex
  if (mySex < 0) {
    const fromSex = /^,[w1]/.test(param.from) ? 1 : /^,[h0]/.test(param.from) ? 0 : -1
    const toSex = /^,[w1]/.test(param.to) ? 1 : /^,[h0]/.test(param.to) ? 0 : -1
    if (fromSex === -1 && toSex > -1) mySex = toSex
    else if (fromSex > -1 && toSex === -1) mySex = fromSex
    else if (fromSex === toSex) mySex = fromSex
    else return []
  }
  const fromIds = selector2id(param.from, mySex)
  const toIds = selector2id(param.to, mySex)
  if (fromIds.length === 0 || toIds.length === 0) return []

  const result: Array<{ selector: string; sex: -1 | Sex }> = []
  for (const from of fromIds) {
    for (const to of toIds) {
      let currentFrom = from
      let currentTo = to
      let currentSex: -1 | Sex = mySex
      let sex = mySex
      const selector = ',' + currentTo
      if (/,([fhs1](&[ol\d]+)?|[olx]b)(&[ol\d]+)?$/.test(selector)) sex = 1
      if (/,([mwd0](&[ol\d]+)?|[olx]s)(&[ol\d]+)?$/.test(selector)) sex = 0
      if (
        currentFrom &&
        currentTo &&
        (param.optimal || /&\d+/.test(currentFrom) || /&\d+/.test(currentTo))
      ) {
        ;({
          from: currentFrom,
          to: currentTo,
          sex: currentSex,
        } = getOptimal({
          from: currentFrom,
          to: currentTo,
          sex: currentSex,
          optimal: param.optimal,
        }))
      }
      const toRids = currentTo ? reverseId(currentTo, currentSex) : ['']
      for (const toR of toRids) {
        result.push({
          selector: (toR ? ',' + toR : '') + (currentFrom ? ',' + currentFrom : ''),
          sex,
        })
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export type RelationQuery = {
  /** 目标对象：称谓链，用「的」分隔 */
  text: string
  /** 相对对象：留空表示自己 */
  target?: string
  /** 本人性别，-1 表示由关系链推断 */
  sex?: -1 | Sex
  /** 产出类型 */
  type?: RelationType
  /** true 为对方称呼我 */
  reverse?: boolean
  /** 计算两者之间的最短关系 */
  optimal?: boolean
}

/** 关系计算主入口，返回去重后的称谓 / 关系链 / 合称列表 */
export function resolveRelation(query: RelationQuery): string[] {
  const { text, target = '', sex = -1, type = 'term', reverse = false, optimal = false } = query
  const fromSelectors = getSelectors(text)
  let toSelectors = getSelectors(target)
  if (toSelectors.length === 0) toSelectors = ['']

  const result: string[] = []
  const push = (item: string): void => {
    if (item && !result.includes(item)) result.push(item)
  }
  for (const fromSelector of fromSelectors) {
    for (const toSelector of toSelectors) {
      for (const data of mergeSelector({ from: fromSelector, to: toSelector, sex, optimal })) {
        for (const id of selector2id(data.selector, data.sex)) {
          if (type === 'chain') {
            const chainSex: -1 | Sex = reverse
              ? /([fhs1](&[ol\d]+)?|[olx]b)$/.test(id)
                ? 1
                : 0
              : data.sex
            for (const activeId of reverse ? reverseId(id, data.sex) : [id]) {
              push(getChainById(activeId, chainSex))
            }
            continue
          }
          if (type === 'pair') {
            for (const rId of reverseId(id, data.sex)) {
              for (const pairName of getPairsById(id, rId)) push(pairName)
            }
            continue
          }
          const activeIds = reverse ? reverseId(id, data.sex) : [id]
          const itemSex: -1 | Sex = reverse
            ? /([fhs1](&[ol\d]+)?|[olx]b)$/.test(id)
              ? 1
              : 0
            : data.sex
          for (const activeId of activeIds) {
            for (const term of getItemsByIdOrFallback(activeId, itemSex)) push(term)
          }
        }
      }
    }
  }
  return result
}

function getItemsByIdOrFallback(id: string, sex: -1 | Sex): string[] {
  const items = getItemsById(id)
  if (items.length > 0) return items
  if (sex < 0) return []
  return getItemsById(sex + ',' + id)
}

/** 关系符 → 口语称谓 */
export const SIGN_LABEL: Record<string, string> = {
  f: '爸爸',
  m: '妈妈',
  h: '老公',
  w: '老婆',
  s: '儿子',
  d: '女儿',
  xb: '兄弟',
  ob: '哥哥',
  lb: '弟弟',
  xs: '姐妹',
  os: '姐姐',
  ls: '妹妹',
}

const SIGN_KIND: Record<string, RelationKind> = {
  f: 'parent',
  m: 'parent',
  s: 'child',
  d: 'child',
  ob: 'sibling',
  lb: 'sibling',
  xb: 'sibling',
  os: 'sibling',
  ls: 'sibling',
  xs: 'sibling',
  h: 'spouse',
  w: 'spouse',
}

export type KinshipPathNode = {
  /** 用户输入的原始称谓片段，如「堂哥」 */
  label: string
  /** 该片段解析出的首个关系符链，如「f,xb,s&o」；无法解析时为空 */
  signs: string
  kind: RelationKind
  /** 相对「我」的累计辈分（正长辈负晚辈） */
  gen: number
  /** 步序，从 0 开始 */
  index: number
}

export type KinshipOutput = {
  /** 计算得到的称谓（去重，可能多解） */
  terms: string[]
  /** 该称呼对应的关系链反查结果 */
  chains: string[]
  /** 辈分树路径节点 */
  path: KinshipPathNode[]
  /** 关系链中文表述 */
  pathText: string
  /** 输入是否可被解析 */
  isValid: boolean
}

/** 称谓片段 → 关系符片段（同义词命中多个时取最短，并优先直系） */
function resolveLabelFragment(label: string): string | null {
  const keys = $reverse.get(label)
  if (!keys || keys.length === 0) return null
  return keys.reduce((best, key) => (key.length < best.length ? key : best))
}

/**
 * 输入容错：漏写「的」的片段（如「妈妈儿子」）按已知称谓贪心拆开。
 * 只处理整段无法识别的情况，合法输入不受影响。
 */
export function normalizeChainText(text: string): string {
  return text
    .split('的')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (isKnownTerm(part) ? part : (splitKnownTerms(part) ?? part)))
    .join('的')
}

const isKnownTerm = (term: string): boolean => ($reverse.get(term)?.length ?? 0) > 0

function splitKnownTerms(term: string): string | null {
  for (let length = Math.min(term.length, 5); length >= 1; length--) {
    const head = term.slice(0, length)
    if (!isKnownTerm(head)) continue
    const rest = term.slice(length)
    if (!rest) return head
    const tail = splitKnownTerms(rest)
    if (tail) return `${head}的${tail}`
  }
  return null
}

/** 关系链 → 辈分树节点序列 */
export function buildKinshipPath(text: string): KinshipPathNode[] {
  const path: KinshipPathNode[] = []
  let cumulative = ''
  text
    .split('的')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((label, index) => {
      const fragment = resolveLabelFragment(label)
      if (!fragment) return
      cumulative += (cumulative ? ',' : '') + fragment
      const sign =
        fragment
          .split(',')
          .map((s) => s.replace(/&[ol\d]+/, ''))
          .pop() ?? ''
      path.push({
        label,
        signs: fragment,
        kind: SIGN_KIND[sign] ?? 'unknown',
        gen: getGenById(cumulative),
        index,
      })
    })
  return path
}

export type KinshipTreeNode = {
  label: string
  kind: 'self' | RelationKind | 'result'
  /** 相对「我」的辈分，正数长辈负数晚辈 */
  gen: number
  /** 横向序号，「我」为 0，之后每步右移一列 */
  col: number
}

export type KinshipTreeLayout = {
  /** 从上到下连续排列的辈分行，恒含 0（同辈基准行） */
  rows: number[]
  /** 树节点：基准点「我」+ 关系链各步 + 末尾的结果节点 */
  nodes: KinshipTreeNode[]
  /** 最右列序号，用于计算画布宽度 */
  maxCol: number
}

/**
 * 辈分树布局：行 = 连续辈分区间（长辈在上、晚辈在下），列 = 关系推进。
 * 跨辈分的一步（父/母/子/女）沿用当前列只换行，同辈的一步（兄弟/姐妹/配偶）右移一列；
 * 若落点已被占用（如「爸爸的儿子」回到同辈）则再右移一列，保证节点不重叠。
 */
export function buildTreeLayout(path: KinshipPathNode[], resultLabel: string): KinshipTreeLayout {
  const nodes: KinshipTreeNode[] = [{ label: '', kind: 'self', gen: 0, col: 0 }]
  const taken = new Set(['0:0'])
  let col = 0
  for (const node of path) {
    if (node.kind === 'sibling' || node.kind === 'spouse') col += 1
    while (taken.has(`${node.gen}:${col}`)) col += 1
    taken.add(`${node.gen}:${col}`)
    nodes.push({ label: node.label, kind: node.kind, gen: node.gen, col })
  }
  const last = nodes[nodes.length - 1]
  if (resultLabel) {
    nodes.push({ label: resultLabel, kind: 'result', gen: last.gen, col: last.col + 1 })
  }
  const maxCol = nodes.reduce((widest, node) => Math.max(widest, node.col), 0)

  const minGen = Math.min(0, ...nodes.map((node) => node.gen))
  const maxGen = Math.max(0, ...nodes.map((node) => node.gen))
  const rows: number[] = []
  for (let value = maxGen; value >= minGen; value--) rows.push(value)
  return { rows, nodes, maxCol }
}

/** 计算亲戚称谓：text 为「的」分隔的中文称谓链 */
export function calculateKinship(input: {
  text: string
  sex: Sex
  reverse?: boolean
}): KinshipOutput {
  const { text: rawText, sex, reverse = false } = input
  const text = normalizeChainText(rawText)
  const labels = text.split('的').filter((part) => part.length > 0)
  const terms = resolveRelation({ text, sex, reverse })
  // 单个称谓（如「表哥」「七舅外公」）拆不出关系链，用反查到的链作为树的推导路径
  const chains = labels.length > 1 ? [] : resolveRelation({ text, sex, type: 'chain' })
  const parsed = buildKinshipPath(text)
  const path = parsed.length > 0 || chains.length === 0 ? parsed : buildKinshipPath(chains[0])

  return {
    terms,
    chains,
    path,
    pathText: labels.join('的'),
    isValid: labels.length > 0 && terms.length > 0,
  }
}

/** 快捷输入按钮：配偶键随本人性别变化 */
export function buildQuickButtons(sex: Sex): ReadonlyArray<{ label: string; sign: string }> {
  const signs = ['f', 'm', sex === 1 ? 'w' : 'h', 'ob', 'lb', 'os', 'ls', 's', 'd']
  return signs.map((sign) => ({ label: SIGN_LABEL[sign], sign }))
}

/** 快速示例 */
export const KINSHIP_EXAMPLES = [
  '妈妈的妈妈',
  '爸爸的姐姐的儿子',
  '老婆的妈妈的弟弟',
  '舅舅的儿子',
  '外婆的哥哥',
  '堂哥的女儿',
] as const
