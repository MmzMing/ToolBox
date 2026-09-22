import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { GRAMMAR_PROMPT } from '@/tools/resume/ai/prompts'
import { applyGrammarError, parseGrammarErrors } from '@/tools/resume/ai/grammar'
import { requestAIText } from '@/modules/ai/transport'
import { toAIConnection } from '@/modules/ai/providers'
import type { GrammarError } from '@/tools/resume/ai/grammar'
import type { AIModelProfile } from '@/modules/ai/providers'
import { useResumeStore } from '../../store'
import { applyGrammarMarks, clearGrammarMarks, scrollToGrammarMark } from './grammar-marks'
import { aiErrorKey } from '@/components/ai/error-copy'

const PREVIEW_ID = 'resume-preview'
const MARK_REAPPLY_DEBOUNCE_MS = 200

/**
 * AI 语法检查的状态机。
 *
 * 高亮是直接改预览 DOM 的，React 一重渲染就会把 `<mark>` 冲掉，所以挂一个
 * MutationObserver 在预览子树上、防抖后重打一遍。旧项目没做这件事，改一个字高亮就全丢。
 */
export function useGrammarCheck(model: AIModelProfile | null) {
  const { t } = useTranslation('tools-resume')
  const [errors, setErrors] = useState<GrammarError[]>([])
  const [dismissed, setDismissed] = useState<number[]>([])
  const [checking, setChecking] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const visibleErrors = useMemo(
    () => errors.filter((_, index) => !dismissed.includes(index)),
    [errors, dismissed],
  )

  const previewEl = useCallback(() => document.getElementById(PREVIEW_ID), [])

  const reapply = useCallback(() => {
    const root = previewEl()
    if (!root) {
      return
    }
    applyGrammarMarks(root, visibleErrors, activeIndex)
  }, [previewEl, visibleErrors, activeIndex])

  useEffect(() => {
    reapply()
  }, [reapply])

  // 预览内容一变就重打标记；跳过我们自己造成的那一次变更
  useEffect(() => {
    const root = previewEl()
    if (!root) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(reapply, MARK_REAPPLY_DEBOUNCE_MS)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [previewEl, reapply])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      const root = previewEl()
      if (root) {
        clearGrammarMarks(root)
      }
    },
    [previewEl],
  )

  const run = useCallback(async () => {
    const root = previewEl()
    const text = root?.innerText.trim() ?? ''
    if (!model) {
      toast.error(t('resume.ai.notConfigured'))
      return
    }
    if (!text) {
      toast.error(t('resume.grammar.nothingToCheck'))
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setChecking(true)
    try {
      const content = await requestAIText(
        toAIConnection(model),
        { system: GRAMMAR_PROMPT, text, json: true },
        controller.signal,
      )
      const found = parseGrammarErrors(content)
      setErrors(found)
      setDismissed([])
      setActiveIndex(null)
      if (found.length) {
        setDrawerOpen(true)
        toast.success(t('resume.grammar.found', { count: found.length }))
      } else {
        setDrawerOpen(false)
        toast.success(t('resume.grammar.clean'))
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(t(aiErrorKey(error)))
      }
    } finally {
      setChecking(false)
      abortRef.current = null
    }
  }, [model, previewEl, t])

  /** 应用一条：改数据后把这条从列表里去掉，索引要按原数组算 */
  const applyOne = useCallback(
    (index: number) => {
      const resume = useResumeStore.getState().activeResume
      const error = errors[index]
      if (!resume || !error) {
        return false
      }
      const { data, applied } = applyGrammarError(resume, error)
      if (!applied) {
        toast.error(t('resume.grammar.applyFailed'))
        return false
      }
      useResumeStore.getState().updateResume(resume.id, data)
      setDismissed((prev) => (prev.includes(index) ? prev : [...prev, index]))
      return true
    },
    [errors, t],
  )

  const applyAll = useCallback(() => {
    let applied = 0
    visibleErrors.forEach((error) => {
      const index = errors.indexOf(error)
      if (applyOne(index)) {
        applied += 1
      }
    })
    if (applied) {
      toast.success(t('resume.grammar.appliedCount', { count: applied }))
    }
  }, [applyOne, errors, t, visibleErrors])

  const dismiss = useCallback((index: number) => {
    setDismissed((prev) => (prev.includes(index) ? prev : [...prev, index]))
  }, [])

  const clear = useCallback(() => {
    setErrors([])
    setDismissed([])
    setActiveIndex(null)
    setDrawerOpen(false)
  }, [])

  const select = useCallback(
    (position: number) => {
      setActiveIndex(position)
      const root = previewEl()
      if (root) {
        scrollToGrammarMark(root, position)
      }
    },
    [previewEl],
  )

  return {
    /** 带原始下标的可见条目：apply / dismiss 按 index 寻址，滚动按 position 寻址 */
    items: visibleErrors.map((error, position) => ({
      error,
      index: errors.indexOf(error),
      position,
    })),
    checking,
    drawerOpen,
    setDrawerOpen,
    run,
    applyOne,
    applyAll,
    dismiss,
    clear,
    select,
  }
}
