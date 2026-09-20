import type { ResumeTemplate } from '../types'

/**
 * 模板注册表：新增模板 = 建目录写 config + 在 components.ts 登记组件，此处加一行。
 *
 * 只放纯数据、不 import 任何组件，store 与 service 因此能在无 React 环境下引用。
 * 模板名与简介不进这里——它们是用户可见文案，走 i18n 的
 * `resume.templates.<id>.name` / `.description`。
 */
export const TEMPLATE_CONFIGS: readonly ResumeTemplate[] = [
  {
    id: 'classic',
    layout: 'classic',
    colorScheme: {
      primary: '#000000',
      secondary: '#4b5563',
      background: '#ffffff',
      text: '#212529',
    },
    spacing: { sectionGap: 16, itemGap: 12, contentPadding: 32 },
    basic: { layout: 'left' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'modern',
    layout: 'modern',
    colorScheme: {
      primary: '#000000',
      secondary: '#6b7280',
      background: '#ffffff',
      text: '#212529',
    },
    spacing: { sectionGap: 8, itemGap: 4, contentPadding: 0 },
    basic: { layout: 'center' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'left-right',
    layout: 'left-right',
    colorScheme: {
      primary: '#000000',
      secondary: '#9ca3af',
      background: '#ffffff',
      text: '#212529',
    },
    spacing: { sectionGap: 24, itemGap: 16, contentPadding: 32 },
    basic: { layout: 'left' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'timeline',
    layout: 'timeline',
    colorScheme: {
      primary: '#18181b',
      secondary: '#64748b',
      background: '#ffffff',
      text: '#212529',
    },
    spacing: { sectionGap: 1, itemGap: 12, contentPadding: 24 },
    basic: { layout: 'left' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'minimalist',
    layout: 'minimalist',
    colorScheme: {
      primary: '#171717',
      secondary: '#737373',
      background: '#ffffff',
      text: '#171717',
    },
    spacing: { sectionGap: 32, itemGap: 24, contentPadding: 40 },
    basic: { layout: 'center' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'elegant',
    layout: 'elegant',
    colorScheme: {
      primary: '#18181b',
      secondary: '#71717a',
      background: '#ffffff',
      text: '#27272a',
    },
    spacing: { sectionGap: 28, itemGap: 18, contentPadding: 32 },
    basic: { layout: 'center' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'creative',
    layout: 'creative',
    colorScheme: {
      primary: '#18181b',
      secondary: '#64748b',
      background: '#ffffff',
      text: '#1e293b',
    },
    spacing: { sectionGap: 16, itemGap: 16, contentPadding: 14 },
    basic: { layout: 'left' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
  {
    id: 'editorial',
    layout: 'editorial',
    colorScheme: {
      primary: '#000000',
      secondary: '#666666',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
    spacing: { sectionGap: 32, itemGap: 16, contentPadding: 36 },
    basic: { layout: 'left' },
    // 唯一开放 basic / languages / custom 的模板
    availableSections: [
      'basic',
      'experience',
      'education',
      'projects',
      'skills',
      'selfEvaluation',
      'certificates',
      'languages',
      'custom',
    ],
  },
  {
    id: 'swiss',
    layout: 'swiss',
    colorScheme: {
      primary: '#0f172a',
      secondary: '#64748b',
      background: '#ffffff',
      text: '#0f172a',
    },
    spacing: { sectionGap: 36, itemGap: 20, contentPadding: 36 },
    basic: { layout: 'left' },
    availableSections: [
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
      'certificates',
    ],
  },
]

export const DEFAULT_TEMPLATES: readonly ResumeTemplate[] = TEMPLATE_CONFIGS

export const DEFAULT_TEMPLATE_ID = TEMPLATE_CONFIGS[0].id

export function getTemplateById(templateId: string | null | undefined): ResumeTemplate | undefined {
  return TEMPLATE_CONFIGS.find((template) => template.id === templateId)
}

/** 兜底到经典模板：模板被删掉时旧简历仍可渲染 */
export function getTemplateForResume(templateId: string | null | undefined): ResumeTemplate {
  return getTemplateById(templateId) ?? TEMPLATE_CONFIGS[0]
}

/** 模板墙缩略图路径，与 public/template-snapshots/zh/<layout>.png 同名 */
export function templateSnapshotPath(layout: string): string {
  return `/template-snapshots/zh/${layout}.png`
}
