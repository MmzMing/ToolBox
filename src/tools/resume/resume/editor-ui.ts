/** 编辑器外壳的 UI 态标识：左右两栏的收起状态与左侧操作栏的层级 */

export type PanelKey = 'edit' | 'preview'

/** 操作栏第一层：内容 = 逐章节编辑，样式 = 全局样式，模板 = 换版式 */
export type RailMode = 'content' | 'style' | 'template'
