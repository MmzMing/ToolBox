import { Handle, NodeResizeControl, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ComponentProps } from 'react'

import {
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
} from '../../ai-image-gen.service'
import { ImageCard } from '../../components/ImageCard'

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
export function ImageNode({ id, data }: NodeProps<ImageRfNode>) {
  // 识图原图只用来显示：不给拖出参考图的把手，它永远不会进下一次生图
  const vision = data.card.vision === true
  return (
    <>
      <ImageCard {...data.card} />
      {/* 只承接派生的产出入边，用户连不上它，所以不显示也不可命中 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="pointer-events-none opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!vision}
        className={vision ? 'pointer-events-none opacity-0' : undefined}
      />
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
