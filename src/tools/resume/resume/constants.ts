import type { BasicField, GlobalSettings, PhotoConfig } from './types'

export const DEFAULT_PHOTO_CONFIG: PhotoConfig = {
  width: 90,
  height: 120,
  aspectRatio: '1:1',
  borderRadius: 'none',
  customBorderRadius: 0,
  visible: true,
}

/** localStorage 键；沿用旧项目名以便首次进入时把历史数据搬过来 */
export const RESUME_STORAGE_KEY = 'resume-storage'
/** 迁移完成后旧键改名到此，保证幂等且可回溯 */
export const LEGACY_RESUME_STORAGE_KEY = 'resume-storage.migrated'
/** IndexedDB：存放 File System Access 的目录句柄 */
export const FILE_HANDLE_DB = 'FileHandleDB'
export const FILE_HANDLE_DB_VERSION = 2
export const SYNC_DIRECTORY_HANDLE_KEY = 'syncDirectory'
export const SYNC_DIRECTORY_PATH_KEY = 'syncDirectoryPath'

export const THEME_COLORS = [
  '#000000',
  '#1A1A1A',
  '#333333',
  '#4D4D4D',
  '#666666',
  '#808080',
  '#999999',
  '#0047AB',
  '#8B0000',
  '#FF4500',
  '#4B0082',
  '#2E8B57',
] as const

/**
 * 简历纸张可用字体。
 *
 * 旧项目把每个字重声明成独立 family（`NotoSansSC-Medium` 等），下拉里其实只选中了
 * Regular 一档；这里改为每族一个 family + 按 weight 匹配，`fontFamily` 存的仍是 CSS 栈。
 */
export const resumeFontOptions = [
  { id: 'alibaba', family: "'Alibaba PuHuiTi 3.0', sans-serif" },
  { id: 'misans', family: "'MiSans', sans-serif" },
  { id: 'noto', family: "'Noto Sans SC', sans-serif" },
  { id: 'serif', family: "'Source Han Serif SC', serif" },
] as const

export const DEFAULT_FONT_FAMILY = resumeFontOptions[0].family

export const fontSizeOptions = [12, 13, 14, 15, 16, 18, 20, 24] as const

export const LINE_HEIGHT_MIN = 1
export const LINE_HEIGHT_MAX = 2
export const LINE_HEIGHT_STEP = 0.1

export const PAGE_PADDING_RANGE = { min: 0, max: 100, step: 1 }
export const SECTION_SPACING_RANGE = { min: 1, max: 100, step: 1 }
export const PARAGRAPH_SPACING_RANGE = { min: 1, max: 50, step: 1 }

/** A4 与分页参考线：297mm 在 96dpi 下约 1122.5px */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
export const A4_HEIGHT_PX = 1122.5
export const PX_PER_MM = 96 / 25.4
export const MAX_PAGE_BREAK_LINES = 20

export const HISTORY_LIMIT = 50
/** 同一字段在合并窗口内的连续输入只留一条撤销记录 */
export const HISTORY_GROUP_WINDOW_MS = 1000
export const FILE_SYNC_DEBOUNCE_MS = 1500
/** 视口窄于此值时自动折叠左侧设置栏 */
export const SIDEBAR_AUTO_COLLAPSE_BELOW = 1440

export const LAYOUT_CONFIG = {
  sidePanel: { defaultSize: 20, minSize: 15 },
  editPanel: { defaultSize: 32, minSize: 25 },
  previewPanel: { defaultSize: 48, minSize: 30 },
} as const

/** 证书图片压缩阶梯：逐级降质直到 base64 体积达标 */
export const CERTIFICATE_COMPRESSION_LADDER = [
  { maxWidth: 1200, quality: 0.8 },
  { maxWidth: 800, quality: 0.7 },
  { maxWidth: 600, quality: 0.5 },
  { maxWidth: 400, quality: 0.4 },
] as const
export const CERTIFICATE_MAX_BASE64_BYTES = 2 * 1024 * 1024
export const CERTIFICATE_WIDTH_RANGE = { min: 10, max: 100, step: 1 }

/** 章节默认图标：存 lucide 导出名，渲染统一走 components/SectionIcon */
export const DEFAULT_SECTION_ICONS: Record<string, string> = {
  basic: 'User',
  skills: 'Zap',
  experience: 'Briefcase',
  projects: 'Rocket',
  education: 'GraduationCap',
  selfEvaluation: 'MessageSquare',
  certificates: 'Trophy',
}

/** 旧项目用 emoji 存章节图标，读回历史数据时换算成 lucide 名 */
export const LEGACY_SECTION_EMOJI_ICONS: Record<string, string> = {
  '👤': 'User',
  '⚡': 'Zap',
  '💼': 'Briefcase',
  '🚀': 'Rocket',
  '🎓': 'GraduationCap',
  '💬': 'MessageSquare',
  '🏆': 'Trophy',
  '➕': 'Plus',
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  themeColor: '#000000',
  fontFamily: DEFAULT_FONT_FAMILY,
  baseFontSize: 14,
  pagePadding: 32,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  sectionSpacing: 16,
  headerSize: 18,
  subheaderSize: 15,
  useIconMode: true,
  centerSubtitle: false,
  flexibleHeaderLayout: false,
  autoOnePage: false,
  pageBreakLinesVisible: false,
}

/**
 * 基础信息字段的初始顺序。
 *
 * `label` 在新版里只作 placeholder 兜底：显示文案走 i18n 的
 * `resume.basicFields.<key>`，所以中英种子无需各存一份。
 */
export const DEFAULT_FIELD_ORDER: BasicField[] = [
  { id: '1', key: 'name', label: '', type: 'text', visible: true },
  { id: '2', key: 'title', label: '', type: 'text', visible: true },
  { id: '3', key: 'employementStatus', label: '', type: 'text', visible: true },
  { id: '4', key: 'birthDate', label: '', type: 'date', visible: true },
  { id: '5', key: 'email', label: '', type: 'text', visible: true },
  { id: '6', key: 'phone', label: '', type: 'text', visible: true },
  { id: '7', key: 'location', label: '', type: 'text', visible: true },
]
