/**
 * GitHub 文件加速下载的纯逻辑层：把形状各异的 GitHub 链接归一化为可下载直链。
 * 零 DOM/React 依赖，不做任何网络请求（加速由第三方前缀代理完成）。
 */

export type TargetKind = 'file' | 'releaseAsset' | 'sourceArchive'

export interface DownloadTarget {
  /** 未加代理前缀的原始直链 */
  url: string
  /** 展示名：文件名 / 资源名 / 归档名 */
  name: string
  kind: TargetKind
  /** 单文件的 jsDelivr 备选直链，其余类型为 null */
  jsdelivrUrl: string | null
}

export interface ParseResult {
  targets: DownloadTarget[]
  /** 提示文案的 i18n 键（识别失败原因或补充说明），无需提示时为 null */
  hint: string | null
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])
/** 这三类 host 的链接本身就是可下载的原始直链，按原样使用 */
const DIRECT_FILE_HOSTS = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'codeload.github.com',
])

function toUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** 剥离 query 与 hash（`?plain=1`、`#L10` 等对下载无意义） */
function stripLocation(url: URL): string {
  return `${url.origin}${url.pathname}`
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}

function unsupported(hint: string): ParseResult {
  return { targets: [], hint }
}

/** jsDelivr 只能代理仓库文件，release 资源与 gist 不适用 */
function jsDelivrFileUrl(owner: string, repo: string, ref: string, filePath: string): string {
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${filePath}`
}

/** 同一 ref 的 zip 与 tar.gz 两种归档 */
export function archiveTargetsFor(owner: string, repo: string, ref: string): DownloadTarget[] {
  return ['zip', 'tar.gz'].map((ext) => ({
    url: `https://github.com/${owner}/${repo}/archive/${ref}.${ext}`,
    name: `${repo}-${ref}.${ext}`,
    kind: 'sourceArchive' as const,
    jsdelivrUrl: null,
  }))
}

/** 识别 GitHub 链接：返回可下载直链与提示键 */
export function parseGithubTarget(input: string): ParseResult {
  const trimmed = input.trim()
  if (trimmed === '') {
    return unsupported('emptyInput')
  }
  const url = toUrl(trimmed)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    return unsupported('invalidUrl')
  }

  const host = url.hostname.toLowerCase()
  const segments = pathSegments(url)

  if (DIRECT_FILE_HOSTS.has(host)) {
    if (segments.length < 3) {
      return unsupported('unsupportedPath')
    }
    return {
      targets: [
        {
          url: stripLocation(url),
          name: segments[segments.length - 1] ?? '',
          kind: 'file',
          jsdelivrUrl: null,
        },
      ],
      hint: null,
    }
  }

  if (host === 'gist.github.com') {
    return unsupported('gistUnsupported')
  }
  if (!GITHUB_HOSTS.has(host)) {
    return unsupported('notGithub')
  }
  if (segments.length < 2) {
    return unsupported('unsupportedPath')
  }

  const [owner, repoSegment, ...rest] = segments
  const repo = repoSegment?.endsWith('.git') ? repoSegment.slice(0, -'.git'.length) : repoSegment
  if (!owner || !repo) {
    return unsupported('unsupportedPath')
  }
  const [head, second, third] = rest

  if (head === 'blob') {
    const filePath = rest.slice(2)
    if (!second || filePath.length === 0) {
      return unsupported('unsupportedPath')
    }
    const path = filePath.join('/')
    return {
      targets: [
        {
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${second}/${path}`,
          name: filePath[filePath.length - 1] ?? '',
          kind: 'file',
          jsdelivrUrl: jsDelivrFileUrl(owner, repo, second, path),
        },
      ],
      hint: null,
    }
  }

  if (head === 'releases') {
    if (second === 'download') {
      const asset = rest.slice(3)
      if (!third || asset.length === 0) {
        return unsupported('unsupportedPath')
      }
      return {
        targets: [
          {
            url: `https://github.com/${owner}/${repo}/releases/download/${third}/${asset.join('/')}`,
            name: asset[asset.length - 1] ?? '',
            kind: 'releaseAsset',
            jsdelivrUrl: null,
          },
        ],
        hint: null,
      }
    }
    if (second === 'tag' && third) {
      return { targets: archiveTargetsFor(owner, repo, third), hint: 'releaseAssetsNeedLink' }
    }
    return unsupported('needAssetLink')
  }

  if (head === 'archive') {
    const ref = rest.slice(1).join('/')
    if (!ref) {
      return unsupported('unsupportedPath')
    }
    return {
      targets: [
        {
          url: `https://github.com/${owner}/${repo}/archive/${ref}`,
          name: ref,
          kind: 'sourceArchive',
          jsdelivrUrl: null,
        },
      ],
      hint: null,
    }
  }

  if (head === 'tree') {
    if (!second) {
      return unsupported('unsupportedPath')
    }
    return {
      targets: archiveTargetsFor(owner, repo, second),
      hint: rest.length > 2 ? 'archiveWholeRepo' : null,
    }
  }

  if (rest.length === 0) {
    return { targets: archiveTargetsFor(owner, repo, 'HEAD'), hint: null }
  }

  return unsupported('unsupportedPath')
}

/**
 * 归一化用户填写的节点前缀：缺 scheme 时补 https，保留子路径并补齐结尾斜杠。
 * 只接受 https（站点本身是 https，http 节点会被浏览器按混合内容拦截），非法返回 null。
 */
export function normalizeNodePrefix(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') {
    return null
  }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = toUrl(withScheme)
  if (
    !url ||
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null
  }
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return `${url.origin}${pathname}`
}

/** 加速链接 = 节点前缀 + 完整原始直链 */
export function buildAcceleratedUrl(prefix: string, targetUrl: string): string {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
  return `${normalized}${targetUrl}`
}
