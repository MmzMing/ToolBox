/** 选区：以图像宽高的比例表示（0..1），与显示尺寸无关 */
export type Selection = { x: number; y: number; width: number; height: number }

/** 默认选区 = 整张图 */
export const FULL_SELECTION: Selection = { x: 0, y: 0, width: 1, height: 1 }

/** 最小选区边长（占图像比例），防止拖成一个点 */
export const MIN_SELECTION_SIZE = 0.02
