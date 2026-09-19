import { useTranslation } from 'react-i18next'

import { buildTreeLayout, type KinshipPathNode, type KinshipTreeNode } from '../kinship.service'

const CELL_WIDTH = 116
const ROW_HEIGHT = 76
const NODE_HEIGHT = 34
const NODE_HALF_WIDTH = 34
const LABEL_WIDTH = 68
const PAD_Y = 12

type Props = {
  path: KinshipPathNode[]
  /** 计算结果，作为树末端的「称呼」节点 */
  resultLabel: string
  /** 结果总数，多于一个时在节点下标注 */
  resultCount: number
}

/**
 * 辈分关系树：行 = 连续辈分（上为长辈下为晚辈，同辈行为基准），
 * 列 = 关系推进，跨辈分不占新列、同辈（兄弟/配偶）才右移一列。
 */
export function KinshipTree({ path, resultLabel, resultCount }: Props) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'chinese-kinship-calculator' })
  const layout = buildTreeLayout(path, resultLabel)

  if (layout.nodes.length <= 1) {
    return (
      <div className="border-border bg-card flex h-24 items-center justify-center rounded-xl border">
        <span className="text-muted-foreground text-xs">{t('treeEmpty')}</span>
      </div>
    )
  }

  const targetIndex = layout.nodes.length - (resultLabel ? 2 : 1)
  const xOf = (col: number) => LABEL_WIDTH + (col + 0.5) * CELL_WIDTH
  const yOf = (gen: number) => PAD_Y + (layout.rows.indexOf(gen) + 0.5) * ROW_HEIGHT

  return (
    <div className="border-border bg-card overflow-x-auto rounded-xl border">
      <div
        className="relative w-full"
        style={{
          minWidth: LABEL_WIDTH + (layout.maxCol + 1) * CELL_WIDTH,
          height: layout.rows.length * ROW_HEIGHT + PAD_Y * 2,
        }}
      >
        {layout.rows.map((gen, i) => {
          const named = t(`lane.${gen}`, { defaultValue: '' })
          return (
            <Lane
              key={gen}
              gen={gen}
              top={PAD_Y + i * ROW_HEIGHT}
              label={named || (gen > 0 ? t('laneAbove', { n: gen }) : t('laneBelow', { n: -gen }))}
            />
          )
        })}

        <svg className="absolute inset-0 size-full" aria-hidden>
          {layout.nodes.slice(1).map((node, i) => {
            const previous = layout.nodes[i]
            return (
              <TreeEdge
                key={`edge-${i}`}
                x1={xOf(previous.col)}
                y1={yOf(previous.gen)}
                x2={xOf(node.col)}
                y2={yOf(node.gen)}
                node={node}
                label={node.kind === 'result' ? t('treeCallLabel') : node.label}
              />
            )
          })}
        </svg>

        {layout.nodes.map((node, i) => (
          <TreeNode
            key={`node-${i}`}
            x={xOf(node.col)}
            y={yOf(node.gen)}
            label={node.kind === 'self' ? t('treeMe') : node.label}
            caption={
              node.kind === 'self'
                ? t('treeBaseline')
                : node.kind === 'result' && resultCount > 1
                  ? t('treeResultCount', { n: resultCount })
                  : undefined
            }
            tone={toneOf(node, i === targetIndex)}
          />
        ))}
      </div>
    </div>
  )
}

function Lane({ gen, top, label }: { gen: number; top: number; label: string }) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'chinese-kinship-calculator' })
  const isBase = gen === 0
  return (
    <>
      <div
        className={isBase ? 'bg-primary/10 absolute inset-x-0' : 'absolute inset-x-0'}
        style={{ top, height: ROW_HEIGHT }}
      />
      <div
        className="border-border/70 absolute inset-x-0 border-t"
        style={{ top: top + ROW_HEIGHT }}
      />
      <div
        className="absolute left-0 flex flex-col items-end justify-center gap-0.5 pr-2 text-right"
        style={{ top, height: ROW_HEIGHT, width: LABEL_WIDTH }}
      >
        <span
          className={
            isBase ? 'text-primary text-xs font-semibold' : 'text-muted-foreground text-xs'
          }
        >
          {label}
        </span>
        {isBase && <span className="text-muted-foreground text-[10px]">{t('laneBaseHint')}</span>}
      </div>
    </>
  )
}

function toneOf(node: KinshipTreeNode, isTarget: boolean) {
  if (node.kind === 'result') return 'result' as const
  if (node.kind === 'self') return 'self' as const
  return isTarget ? ('target' as const) : ('node' as const)
}

type Tone = 'self' | 'node' | 'target' | 'result'

function TreeNode({
  x,
  y,
  label,
  caption,
  tone,
}: {
  x: number
  y: number
  label: string
  caption?: string
  tone: Tone
}) {
  const className = {
    self: 'border-primary/50 bg-card text-primary',
    node: 'border-border bg-card text-foreground',
    target: 'border-primary bg-card text-primary ring-2 ring-primary/30',
    result: 'border-primary bg-primary text-primary-foreground',
  }[tone]
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      style={{ left: x, top: y }}
    >
      <span
        className={`${className} inline-flex items-center justify-center rounded-lg border px-2 text-sm font-medium whitespace-nowrap`}
        style={{ height: NODE_HEIGHT }}
      >
        {label}
      </span>
      {caption && <span className="text-muted-foreground text-[10px] leading-none">{caption}</span>}
    </div>
  )
}

type EdgeSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  arrow?: 'up' | 'down' | 'right'
}

/** 连线：跨辈分走折线，同辈走水平直线，结果节点用虚线；线上标注该步关系 */
function TreeEdge({
  x1,
  y1,
  x2,
  y2,
  node,
  label,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  node: KinshipTreeNode
  label: string
}) {
  const isResult = node.kind === 'result'
  const half = NODE_HEIGHT / 2
  const segments: EdgeSegment[] = []
  let labelX = (x1 + x2) / 2
  let labelY: number

  if (isResult || y1 === y2) {
    segments.push({ x1: x1 + NODE_HALF_WIDTH, y1, x2: x2 - NODE_HALF_WIDTH, y2, arrow: 'right' })
    labelY = y1 - 14
  } else {
    const up = y2 < y1
    const fromY = up ? y1 - half : y1 + half
    const toY = up ? y2 + half : y2 - half
    const midY = (fromY + toY) / 2
    if (x1 === x2) {
      segments.push({ x1, y1: fromY, x2, y2: toY, arrow: up ? 'up' : 'down' })
    } else {
      // 折线：先竖着走到两行的中间，再横移，最后竖着接入目标节点
      segments.push({ x1, y1: fromY, x2: x1, y2: midY })
      segments.push({ x1, y1: midY, x2, y2: midY })
      segments.push({ x1: x2, y1: midY, x2, y2: toY, arrow: up ? 'up' : 'down' })
    }
    labelX = x1 === x2 ? x1 : (x1 + x2) / 2
    labelY = midY
  }

  const stroke = isResult ? 'stroke-primary/70' : 'stroke-muted-foreground/60'
  const fill = isResult ? 'fill-primary/70' : 'fill-muted-foreground/60'

  return (
    <g>
      {segments.map((segment, i) => (
        <line
          key={i}
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
          className={stroke}
          strokeWidth={isResult ? 2 : 1.5}
          strokeDasharray={isResult ? '5 4' : undefined}
        />
      ))}
      {segments.map((segment, i) =>
        segment.arrow ? (
          <polygon key={`arrow-${i}`} className={fill} points={arrowPoints(segment)} />
        ) : null,
      )}
      <EdgeLabel x={labelX} y={labelY} text={label} onResult={isResult} />
    </g>
  )
}

function arrowPoints(segment: EdgeSegment): string {
  const { x2, y2, arrow } = segment
  if (arrow === 'right') return `${x2 - 7},${y2 - 4} ${x2},${y2} ${x2 - 7},${y2 + 4}`
  const offset = arrow === 'up' ? 7 : -7
  return `${x2 - 4},${y2 + offset} ${x2},${y2} ${x2 + 4},${y2 + offset}`
}

/** 连线中点的关系文字，用底色遮住下方的线 */
function EdgeLabel({
  x,
  y,
  text,
  onResult,
}: {
  x: number
  y: number
  text: string
  onResult: boolean
}) {
  const width = text.length * 11 + 8
  return (
    <g>
      <rect x={x - width / 2} y={y - 8} width={width} height={16} rx={4} className="fill-card" />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className={onResult ? 'fill-primary' : 'fill-muted-foreground'}
        style={{ fontSize: 11 }}
      >
        {text}
      </text>
    </g>
  )
}
