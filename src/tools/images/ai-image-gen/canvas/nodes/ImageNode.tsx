import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ComponentProps } from 'react'

import { ImageCard } from '../../components/ImageCard'

export type ImageNodeData = {
  card: ComponentProps<typeof ImageCard>
}

export type ImageRfNode = Node<ImageNodeData, 'image'>

/** 图片节点：卡片本体照搬，左侧 target 只承接派生的产出入边，右侧 source 才允许用户拖出 */
export function ImageNode({ data }: NodeProps<ImageRfNode>) {
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
      <Handle type="source" position={Position.Right} />
    </>
  )
}
