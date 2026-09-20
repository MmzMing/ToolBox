import { ArrowLeft, Download, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import type { PanelImperativeHandle } from 'react-resizable-panels'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import type { PanelKey } from '@/tools/resume/resume/components/PreviewDock'
import { BackupBadge } from '@/tools/resume/resume/components/BackupBadge'
import { EditPanel } from '@/tools/resume/resume/components/EditPanel'
import { LayoutToolbar } from '@/tools/resume/resume/components/LayoutToolbar'
import { MobileWorkbench } from '@/tools/resume/resume/components/MobileWorkbench'
import { PreviewDock } from '@/tools/resume/resume/components/PreviewDock'
import { PreviewPanel } from '@/tools/resume/resume/components/PreviewPanel'
import { LAYOUT_CONFIG } from '@/tools/resume/resume/constants'
import { exportPaperToLongPagePdf } from '@/tools/resume/resume/export/pdf'
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
  const canUndo = useResumeStore(
    (state) => (state.history[state.activeResumeId ?? '']?.length ?? 0) > 0,
  )
  const canRedo = useResumeStore(
    (state) => (state.future[state.activeResumeId ?? '']?.length ?? 0) > 0,
  )
  const undo = useResumeStore((state) => state.undo)
  const redo = useResumeStore((state) => state.redo)
  const updateResumeTitle = useResumeStore((state) => state.updateResumeTitle)

  const [exporting, setExporting] = useState(false)
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

  if (!id || !resume || resume.id !== id) {
    return null
  }

  const { editPanel, previewPanel } = LAYOUT_CONFIG

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportPaperToLongPagePdf(resume.title, {
        pagePadding: resume.globalSettings.pagePadding ?? 0,
        fontFamily: resume.globalSettings.fontFamily ?? '',
      })
      toast.success(t('resume.export.done'))
    } catch (error) {
      console.error('[resume-export] failed', error)
      toast.error(t('resume.export.failed'))
    } finally {
      setExporting(false)
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
        <LayoutToolbar />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" disabled={exporting} onClick={() => void handleExport()}>
            <Download className="size-4" />
            {t('resume.export.pdf')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canUndo}
            onClick={undo}
            title={t('resume.editor.undo')}
            aria-label={t('resume.editor.undo')}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canRedo}
            onClick={redo}
            title={t('resume.editor.redo')}
            aria-label={t('resume.editor.redo')}
          >
            <Redo2 className="size-4" />
          </Button>
        </div>
      </header>

      {breakpoint === 'mobile' ? (
        <MobileWorkbench />
      ) : (
        <div className="relative min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              panelRef={editRef}
              defaultSize={editPanel.defaultSize}
              minSize={editPanel.minSize}
              collapsible
            >
              <EditPanel />
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

          <PreviewDock collapsed={collapsed} onToggle={togglePanel} />
        </div>
      )}
    </div>
  )
}
