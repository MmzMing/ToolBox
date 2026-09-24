import { NodeResizeControl, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ComponentProps } from 'react'

import {
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
} from '../../ai-image-gen.service'
import { ImageCard } from '../../components/ImageCard'
import { LinkZone } from './link-zone'

export type ImageNodeData = {
  card: ComponentProps<typeof ImageCard>
  onResize: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void
}

export type ImageRfNode = Node<ImageNodeData, 'image'>

/** 图片节点：卡片本体照搬，左侧 target 只承接派生的产出入边，右侧 source 才允许用户拖出 */
export function ImageNode({ id, data, selected }: NodeProps<ImageRfNode>) {
  // 识图原图只用来显示：不给拖出参考图的热区，它永远不会进下一次生图
  const vision = data.card.vision === true
  return (
    <>
      <ImageCard {...data.card} selected={selected} />
      {/* 产出边由提示词派生，用户连不上，所以这一侧不可见也不吃事件 */}
      <LinkZone type="target" position={Position.Left} invisible />
      <LinkZone type="source" position={Position.Right} invisible={vision} />
      {/* 等比缩放：只改显示尺寸，不裁剪也不拉伸 */}
      <NodeResizeControl
        position="bottom-right"
        color="transparent"
        className="canvas-resize-handle"
        keepAspectRatio
        minWidth={CANVAS_NODE_MIN_WIDTH}
        maxWidth={CANVAS_NODE_MAX_WIDTH}
        minHeight={CANVAS_NODE_MIN_HEIGHT}
        maxHeight={CANVAS_NODE_MAX_HEIGHT}
        onResizeEnd={(_event, { width, height, x, y }) =>
          data.onResize(id, { width, height }, { x, y })
        }
      />
    </>
  )
}
