/**
 * GitHub 加速下载节点清单（gh-proxy 类反向代理），集中在此管理，新增/下线只改这里。
 * 公共节点生命周期短，失效时先在此替换，或在工具页「加速节点」里临时添加自定义节点。
 */

export interface AcceleratorNode {
  /** 展示名（取域名，便于识别是哪路节点） */
  readonly label: string
  /** 加速前缀，须以 / 结尾：最终链接 = 前缀 + 完整原始直链 */
  readonly prefix: string
}

export const githubAcceleratorNodes: readonly AcceleratorNode[] = [
  { label: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { label: 'gh.dpik.top', prefix: 'https://gh.dpik.top/' },
  { label: 'mirror.ghproxy.com', prefix: 'https://mirror.ghproxy.com/' },
  { label: 'ghfast.top', prefix: 'https://ghfast.top/' },
]
