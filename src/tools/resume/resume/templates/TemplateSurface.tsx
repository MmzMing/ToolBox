import { createElement, useMemo } from 'react'

import { TemplateContext } from './TemplateContext'
import { getTemplateComponent } from './components'
import type { TemplateRenderProps } from './types'

/**
 * 按简历的 templateId 选中对应模板，并把模板与章节信息供给其内部的各个 section。
 *
 * 组件类型来自模块级映射表，因此用 createElement 而不是 JSX：
 * 后者会被 react-hooks/static-components 判成"渲染期创建组件"。
 */
export function TemplateSurface({ data, template }: TemplateRenderProps) {
  const contextValue = useMemo(
    () => ({ templateId: template.id, menuSections: data.menuSections }),
    [template.id, data.menuSections],
  )

  return (
    <TemplateContext.Provider value={contextValue}>
      {createElement(getTemplateComponent(template.layout), { data, template })}
    </TemplateContext.Provider>
  )
}
