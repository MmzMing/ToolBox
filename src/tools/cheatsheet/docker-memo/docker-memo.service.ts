import type { InstallGuideStep } from '@/utils/install-guide'

export interface DockerMemoItem {
  /** docker / 1pctl 命令（展示与复制用） */
  command: string
  /** i18n 键：tools-cheatsheet 命名空间下 docker-memo.<descriptionKey> */
  descriptionKey: string
}

export interface DockerMemoGroup {
  id: string
  items: DockerMemoItem[]
}

function item(command: string, key: string): DockerMemoItem {
  return { command, descriptionKey: `item-${key}` }
}

const DAEMON_JSON_CN = `{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.imgdb.de",
    "https://docker-0.unsee.tech",
    "https://docker.hlmirror.com"
  ]
}`

const DAEMON_JSON_WIN = `{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://hub-mirror.c.163.com"
  ]
}`

/** Linux 安装引导：检查 → 卸旧 → 配源 → 装引擎 → 启动 → 加速器 → 免 sudo → 验证 */
export const dockerLinuxGuide: readonly InstallGuideStep[] = [
  {
    id: 'check',
    detailKey: 'guide.check.detail',
    blocks: [
      { kind: 'code', value: 'uname -r' },
      { kind: 'code', value: 'lsb_release -a' },
    ],
  },
  {
    id: 'remove',
    detailKey: 'guide.remove.detail',
    blocks: [
      {
        kind: 'code',
        value: 'sudo apt-get remove docker docker-engine docker.io containerd runc',
      },
      {
        kind: 'code',
        value:
          'sudo yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine',
      },
    ],
  },
  {
    id: 'repo',
    detailKey: 'guide.repo.detail',
    blocks: [
      {
        kind: 'code',
        value:
          'sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release',
      },
      {
        kind: 'code',
        value:
          'curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg',
      },
      {
        kind: 'code',
        value:
          'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      },
      {
        kind: 'code',
        value: 'sudo yum install -y yum-utils device-mapper-persistent-data lvm2',
      },
      {
        kind: 'code',
        value:
          'sudo yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo',
      },
    ],
  },
  {
    id: 'install',
    detailKey: 'guide.install.detail',
    blocks: [
      {
        kind: 'code',
        value:
          'sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin',
      },
      {
        kind: 'code',
        value: 'sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin',
      },
    ],
  },
  {
    id: 'start',
    detailKey: 'guide.start.detail',
    blocks: [
      { kind: 'code', value: 'sudo systemctl start docker' },
      { kind: 'code', value: 'sudo systemctl enable docker' },
      { kind: 'code', value: 'sudo systemctl status docker' },
    ],
  },
  {
    id: 'mirror',
    detailKey: 'guide.mirror.detail',
    blocks: [
      { kind: 'file', nameKey: 'guide.mirror.file', content: DAEMON_JSON_CN },
      {
        kind: 'code',
        value: 'sudo systemctl daemon-reload && sudo systemctl restart docker',
      },
    ],
  },
  {
    id: 'perms',
    detailKey: 'guide.perms.detail',
    blocks: [
      { kind: 'code', value: 'sudo groupadd docker' },
      { kind: 'code', value: 'sudo usermod -aG docker $USER' },
      { kind: 'code', value: 'newgrp docker' },
    ],
  },
  {
    id: 'verify',
    detailKey: 'guide.verify.detail',
    blocks: [
      { kind: 'code', value: 'docker run hello-world' },
      { kind: 'code', value: 'docker info | grep Mirrors -A 3' },
    ],
  },
]

/** Windows 安装引导：WSL2 → Docker Desktop → 加速器 → 起不来时 */
export const dockerWindowsGuide: readonly InstallGuideStep[] = [
  {
    id: 'win-wsl',
    detailKey: 'guide.win-wsl.detail',
    blocks: [
      { kind: 'code', value: 'wsl --status' },
      { kind: 'code', value: 'wsl.exe --install' },
      { kind: 'code', value: 'wsl --set-default-version 2' },
    ],
  },
  {
    id: 'win-desktop',
    detailKey: 'guide.win-desktop.detail',
    blocks: [
      {
        kind: 'link',
        labelKey: 'guide.win-desktop.link',
        url: 'https://www.docker.com/products/docker-desktop/',
      },
      { kind: 'code', value: 'docker --version' },
      { kind: 'code', value: 'docker run hello-world' },
    ],
  },
  {
    id: 'win-mirror',
    detailKey: 'guide.win-mirror.detail',
    blocks: [{ kind: 'file', nameKey: 'guide.win-mirror.file', content: DAEMON_JSON_WIN }],
  },
  {
    id: 'win-rescue',
    detailKey: 'guide.win-rescue.detail',
    blocks: [
      { kind: 'code', value: 'wsl --shutdown' },
      { kind: 'code', value: 'bcdedit /set hypervisorlaunchtype off' },
    ],
  },
]

/** 1Panel 安装引导：前置 → 一键脚本 → 取回入口 → 放行端口 → 验证 */
export const panelInstallGuide: readonly InstallGuideStep[] = [
  {
    id: 'panel-pre',
    detailKey: 'guide.panel-pre.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.panel-pre.os', value: 'Debian / RedHat' },
          { labelKey: 'guide.panel-pre.dir', value: '/opt' },
        ],
      },
    ],
  },
  {
    id: 'panel-install',
    detailKey: 'guide.panel-install.detail',
    blocks: [
      {
        kind: 'code',
        value:
          'bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"',
      },
    ],
  },
  {
    id: 'panel-info',
    detailKey: 'guide.panel-info.detail',
    blocks: [
      { kind: 'code', value: '1pctl user-info' },
      {
        kind: 'file',
        nameKey: 'guide.panel-info.format',
        content: 'http://<服务器 IP>:<面板端口>/<安全入口>',
      },
    ],
  },
  {
    id: 'panel-firewall',
    detailKey: 'guide.panel-firewall.detail',
    blocks: [
      {
        kind: 'code',
        value:
          'sudo firewall-cmd --zone=public --add-port=18080/tcp --permanent && sudo firewall-cmd --reload',
      },
      {
        kind: 'code',
        value:
          'sudo firewall-cmd --zone=public --add-port=80/tcp --add-port=443/tcp --permanent && sudo firewall-cmd --reload',
      },
    ],
  },
  {
    id: 'panel-verify',
    detailKey: 'guide.panel-verify.detail',
    blocks: [
      { kind: 'code', value: '1pctl status' },
      { kind: 'code', value: '1pctl version' },
    ],
  },
]

/** Docker 速查静态数据：镜像 / 容器 / Compose / 数据与网络 / 排错 / 1Panel */
export const dockerMemoGroups: readonly DockerMemoGroup[] = [
  {
    id: 'images',
    items: [
      item('docker pull <image>:<tag>', 'pull'),
      item('docker images', 'images'),
      item('docker rmi <image>', 'rmi'),
      item('docker build -t <name>:<tag> .', 'build'),
      item('docker tag <image> <registry>/<name>:<tag>', 'tag'),
      item('docker push <registry>/<name>:<tag>', 'push'),
      item('docker save -o <file>.tar <image>', 'save'),
      item('docker history <image>', 'history'),
    ],
  },
  {
    id: 'containers',
    items: [
      item('docker run -d --name <name> -p 8080:80 <image>', 'run-detached'),
      item('docker run -it --rm <image> sh', 'run-tmp'),
      item('docker run -v <host-path>:<container-path> <image>', 'run-volume'),
      item('docker ps -a', 'ps-all'),
      item('docker exec -it <name> bash', 'exec'),
      item('docker logs -f --tail 100 <name>', 'logs'),
      item('docker inspect <name>', 'inspect'),
      item('docker stats --no-stream', 'stats'),
      item('docker stop -t 10 <name>', 'stop'),
      item('docker rm -f <name>', 'rm'),
    ],
  },
  {
    id: 'compose',
    items: [
      item('docker compose up -d', 'compose-up'),
      item('docker compose up -d --build', 'compose-build'),
      item('docker compose pull', 'compose-pull'),
      item('docker compose config', 'compose-config'),
      item('docker compose ps', 'compose-ps'),
      item('docker compose logs -f <service>', 'compose-logs'),
      item('docker compose restart <service>', 'compose-restart'),
      item('docker compose exec <service> sh', 'compose-exec'),
      item('docker compose down', 'compose-down'),
      item('docker compose down -v', 'compose-down-volumes'),
    ],
  },
  {
    id: 'storage',
    items: [
      item('docker volume ls', 'volume-ls'),
      item('docker volume create <name>', 'volume-create'),
      item('docker volume rm <name>', 'volume-rm'),
      item('docker network ls', 'network-ls'),
      item('docker network create <name>', 'network-create'),
      item('docker network connect <net> <name>', 'network-connect'),
      item('docker cp <container>:<path> <host-path>', 'cp'),
      item('docker system df', 'system-df'),
      item('docker volume prune', 'volume-prune'),
      item('docker system prune -a -f --volumes', 'system-prune'),
    ],
  },
  {
    id: 'troubleshoot',
    items: [
      item('systemctl status docker', 'ts-status'),
      item('journalctl -u docker.service --no-pager -e', 'ts-journal'),
      item('docker info | grep -A 3 Mirrors', 'ts-mirrors'),
      item(
        'sudo firewall-cmd --zone=public --add-masquerade --permanent && sudo firewall-cmd --reload',
        'ts-masquerade',
      ),
      item('cat /etc/resolv.conf', 'ts-dns'),
      item('sudo sysctl vm.max_map_count=262144', 'ts-map-count'),
      item('docker rm $(docker ps -aq --filter status=exited)', 'ts-dead'),
    ],
  },
  {
    id: 'panel',
    items: [
      item('1pctl status', 'panel-status'),
      item('1pctl user-info', 'panel-user-info'),
      item('1pctl start', 'panel-start'),
      item('1pctl stop', 'panel-stop'),
      item('1pctl restart', 'panel-restart'),
      item('1pctl version', 'panel-version'),
      item('1pctl update password', 'panel-update-password'),
      item('1pctl reset entrance', 'panel-reset-entrance'),
      item('1pctl listen-ip ipv4', 'panel-listen-ip'),
      item('1pctl uninstall', 'panel-uninstall'),
    ],
  },
]
