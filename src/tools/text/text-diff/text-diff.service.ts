import { diffLines, diffWordsWithSpace } from 'diff'

export type DiffRowType = 'added' | 'removed' | 'unchanged'

/** 行内一段文本；changed 为 true 表示这段只存在于该侧（词级差异） */
export type DiffSegment = {
  text: string
  changed: boolean
}

/** 分栏中的一格；所在侧没有对应行时为 null（纯新增/纯删除的另一侧） */
export type DiffCell = {
  /** 左栏按原文、右栏按新文各自递增 */
  lineNumber: number
  type: DiffRowType
  segments: DiffSegment[]
}

/** 左右两栏的同一视觉行；changeIndex 为所属差异块序号，未变更行为 null */
export type DiffRow = {
  left: DiffCell | null
  right: DiffCell | null
  changeIndex: number | null
}

export type DiffSummary = {
  added: number
  removed: number
  /** 差异块数量，即「处」 */
  changes: number
}

type DiffBlock =
  { kind: 'common'; lines: string[] } | { kind: 'change'; removed: string[]; added: string[] }

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  // diffLines 的 value 以 \n 结尾（最后一行除外），split 后会多出一个空串
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

/** 把 jsdiff 交替产出的 removed/added 片段合并成成对的变更块 */
function toDiffBlocks(a: string, b: string): DiffBlock[] {
  const blocks: DiffBlock[] = []

  for (const change of diffLines(a, b)) {
    const lines = splitLines(change.value)
    if (lines.length === 0) {
      continue
    }
    const previous = blocks.at(-1)

    if (!change.added && !change.removed) {
      if (previous?.kind === 'common') {
        previous.lines.push(...lines)
      } else {
        blocks.push({ kind: 'common', lines })
      }
      continue
    }

    if (previous?.kind === 'change') {
      previous[change.removed ? 'removed' : 'added'].push(...lines)
    } else {
      blocks.push({
        kind: 'change',
        removed: change.removed ? lines : [],
        added: change.added ? lines : [],
      })
    }
  }

  return blocks
}

/** 变更块内两侧都有行时，按位置逐对做词级差异，让「改了哪几个字」可见 */
function pairSegments(removed: string, added: string) {
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  for (const part of diffWordsWithSpace(removed, added)) {
    const segment: DiffSegment = {
      text: part.value,
      changed: Boolean(part.added || part.removed),
    }
    if (!part.added) {
      left.push(segment)
    }
    if (!part.removed) {
      right.push(segment)
    }
  }
  return { left, right }
}

/** 行级 diff 的分栏视图数据：每行一条，左右各自一格，缺失侧为 null */
export function buildDiffRows(a: string, b: string): DiffRow[] {
  const rows: DiffRow[] = []
  let leftLine = 1
  let rightLine = 1
  let changeIndex = 0

  for (const block of toDiffBlocks(a, b)) {
    if (block.kind === 'common') {
      for (const text of block.lines) {
        const segments = [{ text, changed: false }]
        rows.push({
          left: { lineNumber: leftLine++, type: 'unchanged', segments },
          right: { lineNumber: rightLine++, type: 'unchanged', segments },
          changeIndex: null,
        })
      }
      continue
    }

    const pairCount = Math.max(block.removed.length, block.added.length)
    for (let index = 0; index < pairCount; index += 1) {
      const removedText = block.removed[index]
      const addedText = block.added[index]
      const paired =
        removedText !== undefined && addedText !== undefined
          ? pairSegments(removedText, addedText)
          : null

      rows.push({
        left:
          removedText === undefined
            ? null
            : {
                lineNumber: leftLine++,
                type: 'removed',
                segments: paired?.left ?? [{ text: removedText, changed: false }],
              },
        right:
          addedText === undefined
            ? null
            : {
                lineNumber: rightLine++,
                type: 'added',
                segments: paired?.right ?? [{ text: addedText, changed: false }],
              },
        changeIndex,
      })
    }
    changeIndex += 1
  }

  return rows
}

/** 统计新增行数、删除行数与差异块数 */
export function summarizeDiff(rows: readonly DiffRow[]): DiffSummary {
  let added = 0
  let removed = 0
  let changes = 0

  for (const row of rows) {
    if (row.left?.type === 'removed') {
      removed += 1
    }
    if (row.right?.type === 'added') {
      added += 1
    }
    if (row.changeIndex !== null) {
      changes = Math.max(changes, row.changeIndex + 1)
    }
  }

  return { added, removed, changes }
}
