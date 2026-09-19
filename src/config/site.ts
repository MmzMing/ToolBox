/**
 * 站点级外部链接与品牌信息，集中在此管理（新增外链只改这里）。
 * 各处（顶栏、命令面板、关于页、文档脚本）统一从本文件引用，禁止硬编码。
 */
export const siteConfig = {
  /** 站点名称 */
  name: 'ToolBox',
  /** GitHub 仓库地址 */
  githubUrl: 'https://github.com/your-org/toolbox',
  /** 博客地址 */
  blogUrl: 'https://tblog.mmzhiku.xyz',
  /** 上游参考项目（关于页致谢用） */
  itToolsUrl: 'https://github.com/CorentinTh/it-tools',
} as const
