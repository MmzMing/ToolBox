import { describe, expect, it } from 'vitest'

import {
  convertDockerRun,
  serviceKeyFromImage,
  tokenizeDockerRun,
} from './docker-run-to-docker-compose-converter.service'

describe('tokenizeDockerRun', () => {
  it('splits on whitespace', () => {
    expect(tokenizeDockerRun('docker run -d nginx')).toEqual(['docker', 'run', '-d', 'nginx'])
  })

  it('keeps quoted values as one token and strips the quotes', () => {
    expect(tokenizeDockerRun('-v "/host path/a:/ct path" -e MSG="a b"')).toEqual([
      '-v',
      '/host path/a:/ct path',
      '-e',
      'MSG=a b',
    ])
  })

  it('joins backslash line continuations', () => {
    expect(tokenizeDockerRun('docker run \\\n  -d \\\n  nginx')).toEqual([
      'docker',
      'run',
      '-d',
      'nginx',
    ])
  })

  it('returns empty for empty input', () => {
    expect(tokenizeDockerRun('')).toEqual([])
    expect(tokenizeDockerRun('   \n ')).toEqual([])
  })

  it('throws on unmatched quotes', () => {
    expect(() => tokenizeDockerRun('-v "/host:/ct')).toThrow(/Unmatched quote/)
  })
})

describe('serviceKeyFromImage', () => {
  it('sanitizes image references into compose service names', () => {
    expect(serviceKeyFromImage('nginx:latest')).toBe('nginx-latest')
    expect(serviceKeyFromImage('ghcr.io/user/app:v1')).toBe('ghcr.io-user-app-v1')
    expect(serviceKeyFromImage('mongo')).toBe('mongo')
  })
})

describe('convertDockerRun', () => {
  it('converts a full docker run command', () => {
    const yaml = convertDockerRun(
      'docker run -d --name web -p 8080:80 -p 443:443 -v /data:/app/data:ro ' +
        '-e NODE_ENV=production -e DEBUG --restart always --network app-net ' +
        '--user 1000:1000 --workdir /srv --hostname web1 --entrypoint /bin/sh nginx:1.27 -g "daemon off;"',
    )
    expect(yaml).toBe(
      [
        'services:',
        '  web:',
        '    image: nginx:1.27',
        '    ports:',
        '      - 8080:80',
        '      - 443:443',
        '    volumes:',
        '      - /data:/app/data:ro',
        '    environment:',
        '      NODE_ENV: production',
        '      DEBUG: null',
        '    restart: always',
        '    networks:',
        '      - app-net',
        '    user: 1000:1000',
        '    working_dir: /srv',
        '    hostname: web1',
        '    entrypoint: /bin/sh',
        '    command: -g daemon off;',
      ].join('\n'),
    )
  })

  it('falls back to the image name when --name is missing', () => {
    const yaml = convertDockerRun('docker run -d mongo:6')
    expect(yaml).toBe(['services:', '  mongo-6:', '    image: mongo:6'].join('\n'))
  })

  it('accepts commands without the docker run prefix', () => {
    const yaml = convertDockerRun('-p 5432:5432 postgres:16')
    expect(yaml).toContain('  postgres-16:')
    expect(yaml).toContain('    ports:')
    expect(yaml).toContain('      - 5432:5432')
  })

  it('collects unknown flags as comment lines', () => {
    const yaml = convertDockerRun('docker run --init --gpus=all -d redis:7')
    expect(yaml).toBe(
      [
        '# ignored flag: --init',
        '# ignored flag: --gpus=all',
        'services:',
        '  redis-7:',
        '    image: redis:7',
      ].join('\n'),
    )
  })

  it('handles quoted volume paths and multi-line input', () => {
    const yaml = convertDockerRun(
      'docker run -d \\\n  -v "/data with space:/app/data" \\\n  --name files \\\n  alpine',
    )
    expect(yaml).toContain('      - /data with space:/app/data')
    expect(yaml).toContain('  files:')
  })

  it('throws on empty input', () => {
    expect(() => convertDockerRun('')).toThrow(/Empty input/)
    expect(() => convertDockerRun('   \n')).toThrow(/Empty input/)
  })

  it('throws when no image is found', () => {
    expect(() => convertDockerRun('docker run -d -p 80:80')).toThrow(/No image found/)
  })

  it('throws on missing flag values', () => {
    expect(() => convertDockerRun('docker run --name')).toThrow(/Missing value/)
  })
})
