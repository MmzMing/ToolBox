/**
 * 简历数据模型。
 *
 * 移植自旧项目（Magic Resume）后有三处刻意为之的约束，改动即破坏用户已存数据：
 * 1. `employementStatus` 的拼写错误是 localStorage 里的既成字段名，禁止"顺手修正"；
 * 2. 日期一律是显示字符串（`"2021/07"`、`"2021/07 - 至今"`），不归一化成 ISO；
 * 3. 章节标识是字符串（`basic` / `skills` / ... / `custom-1`），不是枚举。
 */

export type PhotoAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | 'custom'

export type PhotoBorderRadius = 'none' | 'medium' | 'full' | 'custom'

export type PhotoConfig = {
  width: number
  height: number
  aspectRatio: PhotoAspectRatio
  borderRadius: PhotoBorderRadius
  customBorderRadius: number
  visible?: boolean
}

/** 可增删的字段库，`languages` 仅 editorial 模板开放 */
export const STANDARD_MODULE_IDS = [
  'skills',
  'experience',
  'projects',
  'education',
  'selfEvaluation',
  'certificates',
] as const

export type StandardModuleId = (typeof STANDARD_MODULE_IDS)[number]

/** 章节 id：标准模块名或 `custom-<n>`，历史数据里还可能出现 `languages` */
export type SectionId = string

export type BasicFieldKey =
  'name' | 'title' | 'employementStatus' | 'birthDate' | 'email' | 'phone' | 'location'

export type BasicFieldType = 'date' | 'textarea' | 'text' | 'editor'

export type BasicField = {
  id: string
  key: BasicFieldKey
  label: string
  type?: BasicFieldType
  visible: boolean
  custom?: boolean
}

export type CustomField = {
  id: string
  label: string
  value: string
  icon?: string
  visible?: boolean
  custom?: boolean
  displayLabel?: boolean
}

export type BasicInfo = {
  birthDate: string
  name: string
  title: string
  email: string
  phone: string
  location: string
  /** 字段 key → lucide 图标名，取不到时用默认图标 */
  icons: Record<string, string>
  /** 拼写错误为既成数据字段，勿改 */
  employementStatus: string
  photo: string
  photoConfig: PhotoConfig
  fieldOrder?: BasicField[]
  customFields: CustomField[]
  githubKey: string
  githubUseName: string
  githubContributionsVisible: boolean
  layout?: 'left' | 'center' | 'right'
}

export type Education = {
  id: string
  school: string
  major: string
  degree: string
  startDate: string
  endDate: string
  gpa?: string
  description?: string
  visible?: boolean
}

export type Experience = {
  id: string
  company: string
  position: string
  date: string
  details: string
  visible?: boolean
}

export type Project = {
  id: string
  name: string
  role: string
  date: string
  description: string
  visible: boolean
  link?: string
  linkLabel?: string
}

export type Certificate = {
  id: string
  /** data URL 或直链 */
  url: string
  /** 百分比宽度，供 flex 布局使用 */
  width: number
}

export type CustomItem = {
  id: string
  title: string
  subtitle: string
  dateRange: string
  description: string
  visible: boolean
}

export type MenuSection = {
  id: SectionId
  title: string
  icon: string
  enabled: boolean
  order: number
}

export type GlobalSettings = {
  themeColor?: string
  fontFamily?: string
  baseFontSize?: number
  pagePadding?: number
  paragraphSpacing?: number
  lineHeight?: number
  sectionSpacing?: number
  headerSize?: number
  subheaderSize?: number
  useIconMode?: boolean
  centerSubtitle?: boolean
  flexibleHeaderLayout?: boolean
  autoOnePage?: boolean
  pageBreakLinesVisible?: boolean
}

export type ResumeData = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  templateId: string | null
  basic: BasicInfo
  education: Education[]
  experience: Experience[]
  projects: Project[]
  certificates: Certificate[]
  /** 键 = menuSections[].id */
  customData: Record<string, CustomItem[]>
  /** Tiptap HTML */
  skillContent: string
  /** Tiptap HTML */
  selfEvaluationContent: string
  /** 以下为 UI 态，随数据一并持久化以保持刷新后的现场 */
  activeSection: string
  draggingProjectId: string | null
  menuSections: MenuSection[]
  globalSettings: GlobalSettings
}

export type TemplateColorScheme = {
  primary: string
  secondary: string
  background: string
  text: string
}

export type TemplateSpacing = {
  sectionGap: number
  itemGap: number
  contentPadding: number
}

export type ResumeTemplate = {
  id: string
  layout: string
  colorScheme: TemplateColorScheme
  spacing: TemplateSpacing
  basic: { layout?: 'left' | 'center' | 'right' }
  /** 缺省表示开放全部标准模块 */
  availableSections?: string[]
}
