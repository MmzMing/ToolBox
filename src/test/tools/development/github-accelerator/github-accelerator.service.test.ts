import { describe, expect, it } from 'vitest'

import {
  archiveTargetsFor,
  buildAcceleratedUrl,
  normalizeNodePrefix,
  parseGithubTarget,
} from '@/tools/development/github-accelerator/github-accelerator.service'

const urls = (input: string) => parseGithubTarget(input).targets.map((target) => target.url)
const hint = (input: string) => parseGithubTarget(input).hint

describe('parseGithubTarget', () => {
  it('turns a blob page into the raw link', () => {
    expect(
      urls('https://github.com/lodash/lodash/blob/main/package.json?plain=1#L1'),
    ).toStrictEqual(['https://raw.githubusercontent.com/lodash/lodash/main/package.json'])
  })

  it('keeps raw and codeload links as-is', () => {
    expect(urls('https://raw.githubusercontent.com/o/r/v1/src/a.ts')).toStrictEqual([
      'https://raw.githubusercontent.com/o/r/v1/src/a.ts',
    ])
    expect(urls('https://codeload.github.com/o/r/tar.gz/refs/heads/main')).toStrictEqual([
      'https://codeload.github.com/o/r/tar.gz/refs/heads/main',
    ])
  })

  it('keeps a release asset link as-is', () => {
    expect(
      urls('https://github.com/cli/cli/releases/download/v2.40.0/gh_2.40.0_linux_amd64.tar.gz'),
    ).toStrictEqual([
      'https://github.com/cli/cli/releases/download/v2.40.0/gh_2.40.0_linux_amd64.tar.gz',
    ])
  })

  it('expands a release tag page into both source archives', () => {
    expect(urls('https://github.com/o/r/releases/tag/v1.2.3')).toStrictEqual([
      'https://github.com/o/r/archive/v1.2.3.zip',
      'https://github.com/o/r/archive/v1.2.3.tar.gz',
    ])
    expect(hint('https://github.com/o/r/releases/tag/v1.2.3')).toBe('releaseAssetsNeedLink')
  })

  it('expands the repository home page into HEAD archives', () => {
    expect(urls('https://github.com/o/r')).toStrictEqual([
      'https://github.com/o/r/archive/HEAD.zip',
      'https://github.com/o/r/archive/HEAD.tar.gz',
    ])
    expect(hint('https://github.com/o/r')).toBeNull()
  })

  it('archives the whole repository for a tree link and warns about subdirectories', () => {
    expect(urls('https://github.com/o/r/tree/main')).toStrictEqual([
      'https://github.com/o/r/archive/main.zip',
      'https://github.com/o/r/archive/main.tar.gz',
    ])
    expect(hint('https://github.com/o/r/tree/main/src')).toBe('archiveWholeRepo')
  })

  it('keeps an existing archive link untouched', () => {
    expect(urls('https://github.com/o/r/archive/refs/heads/dev.zip')).toStrictEqual([
      'https://github.com/o/r/archive/refs/heads/dev.zip',
    ])
  })

  it('strips the .git suffix clone URLs put on the repository segment', () => {
    expect(urls('https://github.com/o/r.git')).toStrictEqual([
      'https://github.com/o/r/archive/HEAD.zip',
      'https://github.com/o/r/archive/HEAD.tar.gz',
    ])
    expect(urls('https://github.com/o/r.git/archive/HEAD.zip')).toStrictEqual([
      'https://github.com/o/r/archive/HEAD.zip',
    ])
    expect(urls('https://github.com/o/r.git/blob/main/src/a.ts')).toStrictEqual([
      'https://raw.githubusercontent.com/o/r/main/src/a.ts',
    ])
    expect(urls('https://github.com/o/r.git/releases/download/v1/app.zip')).toStrictEqual([
      'https://github.com/o/r/releases/download/v1/app.zip',
    ])
  })

  it('keeps a .git suffix that belongs to the file name itself', () => {
    const [target] = parseGithubTarget('https://github.com/o/r/blob/main/remotes.git').targets
    expect(target?.url).toBe('https://raw.githubusercontent.com/o/r/main/remotes.git')
    expect(target?.name).toBe('remotes.git')
  })

  it('offers a jsDelivr alternative for repository files only', () => {
    const [blob] = parseGithubTarget('https://github.com/o/r/blob/main/docs/a.md').targets
    expect(blob?.jsdelivrUrl).toBe('https://cdn.jsdelivr.net/gh/o/r@main/docs/a.md')

    const [asset] = parseGithubTarget('https://github.com/o/r/releases/download/v1/app.zip').targets
    expect(asset?.jsdelivrUrl).toBeNull()

    const [raw] = parseGithubTarget('https://raw.githubusercontent.com/o/r/main/a.md').targets
    expect(raw?.jsdelivrUrl).toBeNull()
  })

  it('reports the file name and kind for each target', () => {
    const [target] = parseGithubTarget('https://github.com/o/r/blob/main/src/index.ts').targets
    expect(target).toMatchObject({ name: 'index.ts', kind: 'file' })
  })

  it('rejects empty input, garbage and non-github hosts', () => {
    expect(hint('')).toBe('emptyInput')
    expect(hint('   ')).toBe('emptyInput')
    expect(hint('not a url')).toBe('invalidUrl')
    expect(hint('ftp://github.com/o/r')).toBe('invalidUrl')
    expect(hint('https://example.com/o/r/blob/main/a.txt')).toBe('notGithub')
    expect(parseGithubTarget('not a url').targets).toStrictEqual([])
  })

  it('asks for an asset link on release listing pages and rejects gist pages', () => {
    expect(hint('https://github.com/o/r/releases')).toBe('needAssetLink')
    expect(hint('https://github.com/o/r/releases/latest')).toBe('needAssetLink')
    expect(hint('https://gist.github.com/owner/1234abcd')).toBe('gistUnsupported')
  })

  it('rejects incomplete github paths', () => {
    expect(hint('https://github.com/o')).toBe('unsupportedPath')
    expect(hint('https://github.com/o/r/blob/main')).toBe('unsupportedPath')
    expect(hint('https://github.com/o/r/settings')).toBe('unsupportedPath')
    expect(hint('https://raw.githubusercontent.com/o')).toBe('unsupportedPath')
  })
})

describe('archiveTargetsFor', () => {
  it('builds zip and tar.gz for the same ref', () => {
    expect(archiveTargetsFor('o', 'r', 'dev').map((target) => target.name)).toStrictEqual([
      'r-dev.zip',
      'r-dev.tar.gz',
    ])
  })
})

describe('normalizeNodePrefix', () => {
  it('adds the scheme and a trailing slash', () => {
    expect(normalizeNodePrefix('ghfast.top')).toBe('https://ghfast.top/')
    expect(normalizeNodePrefix('https://ghfast.top/')).toBe('https://ghfast.top/')
    expect(normalizeNodePrefix('  https://ghfast.top  ')).toBe('https://ghfast.top/')
  })

  it('keeps a subpath prefix intact', () => {
    expect(normalizeNodePrefix('https://proxy.example.com/gh')).toBe(
      'https://proxy.example.com/gh/',
    )
  })

  it('rejects non-https, credentials and garbage', () => {
    expect(normalizeNodePrefix('http://ghfast.top')).toBeNull()
    expect(normalizeNodePrefix('https://user:pw@ghfast.top')).toBeNull()
    expect(normalizeNodePrefix('https://localhost')).toBeNull()
    expect(normalizeNodePrefix('not a host')).toBeNull()
    expect(normalizeNodePrefix('')).toBeNull()
  })
})

describe('buildAcceleratedUrl', () => {
  it('prefixes the full original url', () => {
    expect(buildAcceleratedUrl('https://ghfast.top/', 'https://github.com/o/r')).toBe(
      'https://ghfast.top/https://github.com/o/r',
    )
  })

  it('adds the missing separator slash', () => {
    expect(
      buildAcceleratedUrl('https://ghfast.top', 'https://raw.githubusercontent.com/o/r/a'),
    ).toBe('https://ghfast.top/https://raw.githubusercontent.com/o/r/a')
  })
})
