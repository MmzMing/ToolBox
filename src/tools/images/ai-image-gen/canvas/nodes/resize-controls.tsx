import { NodeResizeControl } from '@xyflow/react'

/** 库给四角都备好了定位与光标类（.handle.top.left 等），这里只负责一次摆四个 */
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

type ResizeControlsProps = {
  onResizeEnd: (size: { width: number; height: number }, position: { x: number; y: number }) => void
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  keepAspectRatio?: boolean
}

/**
 * 四角等比缩放手柄。只改显示尺寸，不裁剪也不拉伸。
 * 可见性归 index.css 的 .canvas-resize-handle：鼠标压到哪个角，哪个角的点才现身。
 */
export function ResizeControls({
  onResizeEnd,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  keepAspectRatio = false,
}: ResizeControlsProps) {
  return (
    <>
      {CORNERS.map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          color="transparent"
          className="canvas-resize-handle"
          keepAspectRatio={keepAspectRatio}
          minWidth={minWidth}
          maxWidth={maxWidth}
          minHeight={minHeight}
          maxHeight={maxHeight}
          onResizeEnd={(_event, { width, height, x, y }) =>
            onResizeEnd({ width, height }, { x, y })
          }
        />
      ))}
    </>
  )
}
