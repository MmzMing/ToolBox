import { useEffect, useState } from 'react'

const DAY_MS = 864e5

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * 访问者本地的「今天」，跨过零点自动翻页。
 *
 * 「近 7 天」「本月」这类快捷区间都以它为锚点：用挂载时的一次性快照，
 * 页面挂着跨过零点后会整体少算一天。
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))

  useEffect(() => {
    const delay = startOfDay(new Date(Date.now() + DAY_MS)).getTime() - Date.now()
    const timer = window.setTimeout(() => setToday(startOfDay(new Date())), delay)
    return () => window.clearTimeout(timer)
  }, [today])

  return today
}
