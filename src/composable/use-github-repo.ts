import { useEffect, useState } from 'react'

export type GithubRepoInfo = {
  stars: number
  forks: number
}

export type GithubRepoState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; info: GithubRepoInfo }

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * 读取 GitHub 仓库的 star / fork 数（关于页的仓库卡片）。
 *
 * 浏览器直连 GitHub 公开接口的只读请求，与 IP 查询同类：不带凭证，也不涉及用户输入。
 * 不另做内存缓存——接口响应自带 max-age=60，重复访问由浏览器 HTTP 缓存兜住。
 * 失败时返回 error，由卡片省略数字，而不是显示 0 冒充真实值。
 */
export function useGithubRepo(repo: string): GithubRepoState {
  const [state, setState] = useState<GithubRepoState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    fetch(`https://api.github.com/repos/${repo}`, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`GitHub API responded ${response.status}`)
        return (await response.json()) as Record<string, unknown>
      })
      .then((data) => {
        if (!active) return
        setState({
          status: 'ready',
          info: { stars: toCount(data.stargazers_count), forks: toCount(data.forks_count) },
        })
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return
        console.warn('[github-repo] failed to load', repo, error)
        setState({ status: 'error' })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [repo])

  return state
}
