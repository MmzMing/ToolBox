import { stringify } from 'yaml'

/** 切分命令为 token：处理单双引号与「\ + 换行」续行符 */
export function tokenizeDockerRun(input: string): string[] {
  const preprocessed = input.replace(/\\[ \t]*\r?\n[ \t]*/g, ' ')
  const tokens: string[] = []
  let current = ''
  let hasCurrent = false
  let quote: string | null = null

  for (const char of preprocessed) {
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      hasCurrent = true
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasCurrent = true
      continue
    }
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (hasCurrent) {
        tokens.push(current)
        current = ''
        hasCurrent = false
      }
      continue
    }
    current += char
    hasCurrent = true
  }

  if (quote !== null) {
    throw new Error('Unmatched quote in docker run command')
  }
  if (hasCurrent) {
    tokens.push(current)
  }
  return tokens
}

interface DockerRunOptions {
  name?: string
  ports: string[]
  volumes: string[]
  env: [string, string | null][]
  restart?: string
  networks: string[]
  user?: string
  workdir?: string
  hostname?: string
  entrypoint?: string
  image?: string
  commandTokens: string[]
}

/** 取合法 compose 服务名的镜像标识（nginx:latest → nginx，user/image:tag → user-image-tag） */
export function serviceKeyFromImage(image: string): string {
  return image.replaceAll(/[^a-zA-Z0-9._-]/g, '-')
}

/** 把 docker run 命令转换为 compose services YAML；空输入/缺镜像抛 Error，未知 flag 收进注释行 */
export function convertDockerRun(input: string): string {
  const tokens = tokenizeDockerRun(input)
  if (tokens.length === 0) {
    throw new Error('Empty input: expected a docker run command')
  }

  // 跳过可选的 `docker run` 前缀
  let index = 0
  if (tokens[index] === 'docker') {
    index += 1
  }
  if (tokens[index] === 'run') {
    index += 1
  }

  const options: DockerRunOptions = {
    ports: [],
    volumes: [],
    env: [],
    networks: [],
    commandTokens: [],
  }
  const unknownFlags: string[] = []

  while (index < tokens.length) {
    const token = tokens[index]
    const next: string | undefined = tokens[index + 1]

    if (token === '-d' || token === '--detach' || token === '--rm' || token === '-it') {
      index += 1
      continue
    }

    if (
      token === '--name' ||
      token === '--restart' ||
      token === '--user' ||
      token === '--workdir' ||
      token === '--hostname' ||
      token === '--entrypoint'
    ) {
      if (next === undefined) {
        throw new Error(`Missing value for flag: ${token}`)
      }
      if (token === '--name') options.name = next
      else if (token === '--restart') options.restart = next
      else if (token === '--user') options.user = next
      else if (token === '--workdir') options.workdir = next
      else if (token === '--hostname') options.hostname = next
      else options.entrypoint = next
      index += 2
      continue
    }

    if (token === '--network') {
      if (next === undefined) {
        throw new Error('Missing value for flag: --network')
      }
      options.networks.push(next)
      index += 2
      continue
    }

    if (token === '-p' || token === '--publish') {
      if (next === undefined) {
        throw new Error('Missing value for flag: -p')
      }
      options.ports.push(next)
      index += 2
      continue
    }

    if (token === '-v' || token === '--volume') {
      if (next === undefined) {
        throw new Error('Missing value for flag: -v')
      }
      options.volumes.push(next)
      index += 2
      continue
    }

    if (token === '-e' || token === '--env') {
      if (next === undefined) {
        throw new Error('Missing value for flag: -e')
      }
      const separator = next.indexOf('=')
      options.env.push(
        separator === -1 ? [next, null] : [next.slice(0, separator), next.slice(separator + 1)],
      )
      index += 2
      continue
    }

    if (token.startsWith('-')) {
      // 未知 flag：忽略并记录为注释
      unknownFlags.push(token)
      index += 1
      continue
    }

    options.image = token
    options.commandTokens = tokens.slice(index + 1)
    index = tokens.length
  }

  if (options.image === undefined) {
    throw new Error('No image found in docker run command')
  }

  const image = options.image
  const name = options.name ?? serviceKeyFromImage(image)
  const command = options.commandTokens.length > 0 ? options.commandTokens.join(' ') : undefined

  const service: Record<string, unknown> = { image }
  if (options.ports.length > 0) service.ports = options.ports
  if (options.volumes.length > 0) service.volumes = options.volumes
  if (options.env.length > 0) service.environment = Object.fromEntries(options.env)
  if (options.restart !== undefined) service.restart = options.restart
  if (options.networks.length > 0) service.networks = options.networks
  if (options.user !== undefined) service.user = options.user
  if (options.workdir !== undefined) service.working_dir = options.workdir
  if (options.hostname !== undefined) service.hostname = options.hostname
  if (options.entrypoint !== undefined) service.entrypoint = options.entrypoint
  if (command !== undefined) service.command = command

  const commentLines = unknownFlags.map((flag) => `# ignored flag: ${flag}`)
  const yamlBody = stringify({ services: { [name]: service } }).trimEnd()
  return [...commentLines, yamlBody].join('\n')
}
