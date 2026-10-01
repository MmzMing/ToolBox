/**
 * 菜品缩略图清单，手工维护：图（224px 宽的 JPEG）放进 public/food/<菜品 id>.jpg 后在此登记一行。
 * 图是 AI 生成的（不来自任何图库，无授权负担）；
 * 没登记到的菜退回首字占位 —— 站点离线可用，图只是锦上添花。
 */
export type DishImage = {
  /** 相对站点根的路径，对应 public/food/<id>.jpg */
  src: string
  /** 来源说明，显示在缩略图的悬浮提示里 */
  license: string
}

export const DISH_IMAGES: Record<string, DishImage> = {
  'cn-chicken-wing': { src: '/food/cn-chicken-wing.jpg', license: 'AI 生成' },
  'cn-eggplant': { src: '/food/cn-eggplant.jpg', license: 'AI 生成' },
  'cn-lamb-skewer': { src: '/food/cn-lamb-skewer.jpg', license: 'AI 生成' },
}
