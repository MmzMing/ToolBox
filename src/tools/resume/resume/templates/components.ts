import type { ComponentType } from 'react'

import ClassicTemplate from './classic'
import CreativeTemplate from './creative'
import EditorialTemplate from './editorial'
import ElegantTemplate from './elegant'
import LeftRightTemplate from './left-right'
import MinimalistTemplate from './minimalist'
import ModernTemplate from './modern'
import SwissTemplate from './swiss'
import TimelineTemplate from './timeline'
import type { TemplateRenderProps } from './types'

/**
 * layout → 组件的映射。
 *
 * 与 registry.ts 分开放，是为了让 registry 保持纯数据：store、service 与单测
 * 都要引用模板元信息，不该把 9 套模板组件一并拖进依赖图。
 */
const TEMPLATE_COMPONENTS: Record<string, ComponentType<TemplateRenderProps>> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  'left-right': LeftRightTemplate,
  timeline: TimelineTemplate,
  minimalist: MinimalistTemplate,
  elegant: ElegantTemplate,
  creative: CreativeTemplate,
  editorial: EditorialTemplate,
  swiss: SwissTemplate,
}

/** 模板被移除时回落到经典模板，保证任何 templateId 都能渲染出纸张 */
export function getTemplateComponent(layout: string): ComponentType<TemplateRenderProps> {
  return TEMPLATE_COMPONENTS[layout] ?? ClassicTemplate
}
