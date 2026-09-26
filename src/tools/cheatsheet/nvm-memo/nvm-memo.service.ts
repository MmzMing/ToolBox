import type { InstallGuideStep } from '@/utils/install-guide'

export interface NvmMemoItem {
  /** nvm / npm 命令（展示与复制用） */
  command: string
  /** i18n 键：tools-cheatsheet 命名空间下 nvm-memo.<descriptionKey> */
  descriptionKey: string
}

export interface NvmMemoGroup {
  id: string
  items: NvmMemoItem[]
}

function item(command: string, key: string): NvmMemoItem {
  return { command, descriptionKey: `item-${key}` }
}

/** nvm-windows 安装引导：清旧 Node → 下载 → 安装 → 验证 → 镜像 → 首次使用 */
export const nvmInstallGuide: readonly InstallGuideStep[] = [
  {
    id: 'clean',
    detailKey: 'guide.clean.detail',
    blocks: [
      {
        kind: 'file',
        nameKey: 'guide.clean.leftovers',
        content:
          'C:\\Program Files\\nodejs\nC:\\Program Files (x86)\\Nodejs\nC:\\Program Files\\Nodejs\n%AppData%\\npm\n%AppData%\\npm-cache\n%USERPROFILE%\\.npmrc',
      },
      { kind: 'code', value: 'node -v', noteKey: 'guide.clean.code-note' },
    ],
  },
  {
    id: 'download',
    detailKey: 'guide.download.detail',
    blocks: [
      {
        kind: 'link',
        labelKey: 'guide.download.link',
        url: 'https://github.com/coreybutler/nvm-windows/releases',
      },
      { kind: 'code', value: 'nvm-1.1.7-setup.zip', noteKey: 'guide.download.code-note' },
    ],
  },
  {
    id: 'install',
    detailKey: 'guide.install.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.install.nvm-dir', value: 'D:\\dev\\nvm' },
          { labelKey: 'guide.install.node-dir', value: 'D:\\dev\\nodejs' },
        ],
      },
      {
        kind: 'choice',
        rows: [{ labelKey: 'guide.install.noinstall', valueKey: 'guide.install.noinstall-value' }],
      },
    ],
  },
  {
    id: 'verify',
    detailKey: 'guide.verify.detail',
    blocks: [
      { kind: 'code', value: 'nvm version' },
      { kind: 'code', value: 'nvm' },
      { kind: 'kv', rows: [{ labelKey: 'guide.verify.path-append', value: 'D:\\dev\\nvm' }] },
    ],
  },
  {
    id: 'mirror',
    detailKey: 'guide.mirror.detail',
    blocks: [
      {
        kind: 'file',
        nameKey: 'guide.mirror.file',
        content:
          'node_mirror: https://npmmirror.com/mirrors/node/\nnpm_mirror: https://npmmirror.com/mirrors/npm/',
      },
    ],
  },
  {
    id: 'first-use',
    detailKey: 'guide.first-use.detail',
    blocks: [
      {
        kind: 'file',
        nameKey: 'guide.first-use.commands',
        content: 'nvm list available\nnvm install <version>\nnvm use <version>\nnode -v',
      },
    ],
  },
]

/** nvm 速查静态数据：版本切换 / 镜像与代理 / npm 侧 / 常见坑 */
export const nvmMemoGroups: readonly NvmMemoGroup[] = [
  {
    id: 'versions',
    items: [
      item('nvm list available', 'list-available'),
      item('nvm ls', 'ls'),
      item('nvm install <version>', 'install'),
      item('nvm install latest', 'install-latest'),
      item('nvm install <version> <arch>', 'install-arch'),
      item('nvm use <version>', 'use'),
      item('nvm uninstall <version>', 'uninstall'),
      item('nvm arch', 'arch'),
    ],
  },
  {
    id: 'mirror',
    items: [
      item('nvm node_mirror <url>', 'node-mirror'),
      item('nvm npm_mirror <url>', 'npm-mirror'),
      item('nvm proxy', 'proxy-show'),
      item('nvm proxy <url>', 'proxy-set'),
      item('nvm proxy none', 'proxy-none'),
      item('nvm root', 'root-show'),
      item('nvm root <path>', 'root-set'),
      item('nvm on', 'on'),
      item('nvm off', 'off'),
    ],
  },
  {
    id: 'npm',
    items: [
      item('npm config set registry https://registry.npmmirror.com', 'npm-registry'),
      item('npm config get registry', 'npm-registry-show'),
      item('npm install -g <package>', 'npm-global'),
      item('npm install -g cnpm --registry=https://registry.npmmirror.com', 'npm-cnpm'),
      item('where node', 'where-node'),
    ],
  },
  {
    id: 'troubleshoot',
    items: [
      item('nvm use <version>', 'ts-not-switched'),
      item('nvm on', 'ts-off'),
      item('nvm root', 'ts-locate-settings'),
      item('nvm install <version> --insecure', 'ts-insecure'),
      item('nvm proxy none', 'ts-proxy-stale'),
      item('nvm version', 'ts-version'),
    ],
  },
]
