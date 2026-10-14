import { useReducedMotion } from 'motion/react'

/**
 * 全站唯一的「用户是否要求减弱动效」入口。
 *
 * motion 的 hook 在首帧还没测到媒体查询时返回 `null`，各组件此前用 `=== true`、`!!`、
 * `Boolean()` 三种写法各自收成布尔，同一个用户的开关在不同浮层里可能读到不同的第一帧。
 * 一律在这里收成 `false`（按完整动效渲染），组件里只写 `const reduced = usePrefersReducedMotion()`。
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false
}
