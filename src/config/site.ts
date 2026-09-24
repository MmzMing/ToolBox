/**
 * 站点级外部链接、品牌信息与图标资源，集中在此管理（新增只改这里）。
 * 各处（顶栏、侧栏、命令面板、关于页、index.html、文档脚本）统一从本文件引用，禁止硬编码。
 * index.html 是静态文件读不到 TS，其 <title>、meta description 与 <link rel="icon">
 * 由 vite.config.ts 的 transformIndexHtml 钩子按本文件生成，因此这里仍是唯一来源。
 */

/** 图标资源目录（public 下，构建时整体拷贝进 dist） */
const ICON_DIR = '/images/favicon'

/** 品牌名：i18n 文案里的 {{site}} 占位符、页签标题、SEO 均取此值 */
const SITE_NAME = 'MmzMing的工具箱'

export const siteConfig = {
  /** 站点名称 */
  name: SITE_NAME,
  /**
   * 站点标题与描述：静态 index.html 的首屏值（React 挂载后由各页 DocumentMeta 覆盖）。
   * 与 locales/zh/home.json 的 pageTitle / subtitle 对应，中文文案改动时同步此处。
   */
  title: `${SITE_NAME} - 在线工具箱`,
  description:
    '免费开源的在线工具箱：加密、转换、编码、网络、文本处理等 80+ 实用工具，计算全部在浏览器本地完成，本站不收集、不上传数据。',
  /**
   * 站点正式域名（不带结尾斜杠）。sitemap.xml / robots.txt 的绝对地址以此为准，
   * 构建时可用环境变量 SITE_URL 临时覆盖（预览环境等）。
   */
  siteUrl: 'https://tool.mmzhiku.xyz',
  /** GitHub 仓库地址 */
  githubUrl: 'https://github.com/MmzMing/ToolBox',
  /** 博客地址 */
  blogUrl: 'https://tblog.mmzhiku.xyz',
  /** 浏览器 UI 着色与 Safari 固定标签页着色 */
  themeColor: '#0ea95e',
  icons: {
    /** 多尺寸容器，旧浏览器兜底 */
    ico: `${ICON_DIR}/favicon.ico`,
    /** 自动描摹生成的矢量图（约 418 KB，非手绘路径） */
    svg: `${ICON_DIR}/favicon.svg`,
    png16: `${ICON_DIR}/favicon-16x16.png`,
    png32: `${ICON_DIR}/favicon-32x32.png`,
    png48: `${ICON_DIR}/favicon-48x48.png`,
    /** iOS 主屏图标（180 为默认 apple-touch-icon） */
    appleTouch: `${ICON_DIR}/apple-touch-icon.png`,
    appleTouch152: `${ICON_DIR}/apple-touch-icon-152x152.png`,
    appleTouch167: `${ICON_DIR}/apple-touch-icon-167x167.png`,
    appleTouch180: `${ICON_DIR}/apple-touch-icon-180x180.png`,
    /** Android / 桌面「添加到主屏幕」（以 link rel=icon + sizes 声明，无 manifest） */
    android192: `${ICON_DIR}/android-chrome-192x192.png`,
    android512: `${ICON_DIR}/android-chrome-512x512.png`,
    /** Safari 固定标签页；mask-icon 只取 alpha 通道，需要纯黑剪影 */
    mask: `${ICON_DIR}/safari-pinned-tab.svg`,
    /** 站内品牌图（侧栏、移动端顶栏） */
    brand: `${ICON_DIR}/apple-touch-icon-152x152.png`,
    /** 16px 内联场景（面包屑） */
    brandSmall: `${ICON_DIR}/favicon-16x16.png`,
    /** 生成整套图标的原始位图（1254×1254，不参与 head 声明） */
    source: `${ICON_DIR}/6bab8870-69ad-4e94-952d-272f83d960de.png`,
  },
} as const
