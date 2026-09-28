import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import type { PanelImperativeHandle } from 'react-resizable-panels'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import type { PanelKey, RailMode } from '@/tools/resume/resume/editor-ui'
import { BackupBadge } from '@/tools/resume/resume/components/BackupBadge'
import { EditPanel } from '@/tools/resume/resume/components/EditPanel'
import { EditorRail } from '@/tools/resume/resume/components/EditorRail'
import { EditorToolbar } from '@/tools/resume/resume/components/EditorToolbar'
import { ExportDialog } from '@/tools/resume/resume/components/ExportDialog'
import { FaqDialog } from '@/tools/resume/resume/components/FaqDialog'
import { MobileWorkbench } from '@/tools/resume/resume/components/MobileWorkbench'
import { PreviewPanel } from '@/tools/resume/resume/components/PreviewPanel'
import { LAYOUT_CONFIG } from '@/tools/resume/resume/constants'
import { useResumeStore } from '@/tools/resume/resume/store'
import { useBreakpoint } from '@/composable/use-breakpoint'

/** 顶栏里的简历名：就地改名，失焦提交，清空则回落到默认名 */
function ResumeTitleInput({
  title,
  onCommit,
}: {
  title: string
  onCommit: (next: string) => void
}) {
  const { t } = useTranslation('tools-resume')
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      value={draft ?? title}
      aria-label={t('resume.editor.rename')}
      title={t('resume.editor.rename')}
      className="hover:border-input focus-visible:bg-background h-8 w-56 shrink border-transparent bg-transparent text-sm font-medium"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = (draft ?? title).trim()
        setDraft(null)
        onCommit(next || t('resume.editor.untitled'))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(null)
        }
      }}
    />
  )
}

/**
 * 简历编辑器：满屏两栏工作台（表单 / A4 预览）+ 右侧 dock。
 *
 * 挂在 BaseLayout 之外的顶层路由——站内侧栏与顶栏会吃掉栏宽，
 * 而编辑过程本来就不该被站内导航打断。设置项以浮层形式挂在 dock 上。
 */
export default function ResumeEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const breakpoint = useBreakpoint()
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const updateResumeTitle = useResumeStore((state) => state.updateResumeTitle)

  const [mode, setMode] = useState<RailMode>('content')
  const editRef = useRef<PanelImperativeHandle | null>(null)
  const previewRef = useRef<PanelImperativeHandle | null>(null)
  const [collapsed, setCollapsed] = useState<Record<PanelKey, boolean>>({
    edit: false,
    preview: false,
  })

  useEffect(() => {
    if (!id) {
      return
    }
    // 直达链接或简历已被删除时退回列表，别让编辑器拿着空数据白屏
    if (!useResumeStore.getState().resumes[id]) {
      navigate('/resume', { replace: true })
      return
    }
    useResumeStore.getState().setActiveResume(id)
  }, [id, navigate])

  const handles: Record<PanelKey, React.RefObject<PanelImperativeHandle | null>> = {
    edit: editRef,
    preview: previewRef,
  }

  const togglePanel = (panel: PanelKey) => {
    const handle = handles[panel].current
    const next = !collapsed[panel]
    setCollapsed((prev) => ({ ...prev, [panel]: next }))
    if (next) {
      handle?.collapse()
    } else {
      handle?.expand()
    }
  }

  /** 顶栏"操作 / 预览 / 全部"：一次把两栏设成目标状态 */
  const setPanels = (next: Record<PanelKey, boolean>) => {
    if (next.edit !== collapsed.edit) {
      const handle = handles.edit.current
      if (next.edit) {
        handle?.collapse()
      } else {
        handle?.expand()
      }
    }
    if (next.preview !== collapsed.preview) {
      const handle = handles.preview.current
      if (next.preview) {
        handle?.collapse()
      } else {
        handle?.expand()
      }
    }
    setCollapsed(next)
  }

  if (!id || !resume || resume.id !== id) {
    return null
  }

  const { editPanel, previewPanel } = LAYOUT_CONFIG

  /** 换工作区或选章节时若编辑栏被收起，顺手展开，否则点了没反应 */
  const revealEditor = () => {
    if (collapsed.edit) {
      togglePanel('edit')
    }
  }

  return (
    <div className="bg-background flex h-svh flex-col overflow-hidden">
      <meta name="robots" content="noindex" />

      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Button variant="ghost" size="icon-sm" asChild title={t('resume.editor.back')}>
          <Link to="/resume">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <ResumeTitleInput key={resume.id} title={resume.title} onCommit={updateResumeTitle} />
        <BackupBadge className="hidden sm:inline-flex" />
        <EditorToolbar collapsed={collapsed} onSetPanels={setPanels} />
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <ExportDialog />
          <FaqDialog />
        </div>
      </header>

      {breakpoint === 'mobile' ? (
        <MobileWorkbench />
      ) : (
        <div className="flex min-h-0 flex-1">
          <EditorRail
            mode={mode}
            onModeChange={(next) => {
              setMode(next)
              revealEditor()
            }}
            activeSection={resume.activeSection}
            onSectionSelect={revealEditor}
          />

          <div className="relative min-w-0 flex-1">
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel
                panelRef={editRef}
                defaultSize={editPanel.defaultSize}
                minSize={editPanel.minSize}
                collapsible
              >
                <EditPanel mode={mode} />
              </ResizablePanel>

              <ResizableHandle
                className="hover:bg-primary bg-border mx-1 w-1"
                hidden={collapsed.edit}
              />

              {/* 预览栏只折叠不卸载：导出与打印要抓 #resume-preview，节点必须常驻 */}
              <ResizablePanel
                panelRef={previewRef}
                defaultSize={previewPanel.defaultSize}
                minSize={previewPanel.minSize}
                collapsible
              >
                <PreviewPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      )}
    </div>
  )
}
