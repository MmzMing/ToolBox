import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, DragEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CircleAlert,
  ClipboardPaste,
  File as FileIcon,
  FileArchive,
  FileImage,
  FilePlay,
  FileText,
  FolderOpen,
  ImageUp,
  RotateCw,
  X,
} from 'lucide-react'
import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from 'motion/react'
import type { HTMLMotionProps, TargetAndTransition, Transition } from 'motion/react'

import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'
import { motionTokens } from '@/lib/motion-tokens'
import { filesFromDataTransfer, imageFilesFromClipboard } from '@/utils/data-transfer-files'
import { formatBytes } from '@/utils/format-bytes'

/** 本地处理语义：不是「上传到服务器」，而是工具自己的处理态。 */
export type FileDropZoneStatus = 'processing' | 'ready' | 'error'

export type FileDropZoneItem = {
  id: string
  name: string
  size: number
  status?: FileDropZoneStatus
  /** 0–100，处理中时显示进度条 */
  progress?: number
  /** 出错原因，直接展示在行内 */
  error?: string
  /** 缩略图地址，图片类文件由调用方生成 object URL */
  preview?: string
  file?: File
}

type Pickers = {
  accept?: string
  multiple?: boolean
  allowFolder?: boolean
  onFiles: (files: File[]) => void
}

type FileDropZoneProps = Pickers & {
  /** 一次最多保留多少个文件（配合受控 items 计数） */
  maxFiles?: number
  /** 超过这个字节数的文件不入列表，并在下方给出原因 */
  maxSize?: number
  /** 受控文件列表；不传则只渲染拖拽区 */
  items?: readonly FileDropZoneItem[]
  onRemove?: (item: FileDropZoneItem) => void
  onRetry?: (item: FileDropZoneItem) => void
  label?: string
  description?: string
  /** 文件悬停在区域上方时替换 label 的文案 */
  dropLabel?: string
  folderLabel?: string
  /** 鼠标悬停或焦点在区内时允许 Ctrl+V 粘贴文件 */
  allowPaste?: boolean
  /** 替代描述下方的小字说明 */
  note?: string
  icon?: ComponentType<{ className?: string }>
  minHeightClass?: string
  /** 列表渲染在拖拽区下方还是内部边缘 */
  listPlacement?: 'below' | 'inside'
  /** 列表达到这个条数后提示语折成细条，把空间让给列表 */
  compactAt?: number
  className?: string
}

const EMPTY_ITEMS: readonly FileDropZoneItem[] = []
/** 虚线周长按此周期切分，保证每段虚线等长且接缝不显。 */
const DASH_PERIOD = 7
const MAX_STAGGER = 7
/** 折叠过渡中可能量到过窄的尺寸，低于这个边长就不重写描边几何。 */
const EDGE_MIN_SIZE = 32
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic', 'heif']
const VIDEO_EXTENSIONS = ['mov', 'mp4', 'webm', 'm4v', 'avi']
const ARCHIVE_EXTENSIONS = ['zip', 'gz', 'tar', 'rar', '7z']
const TEXT_EXTENSIONS = ['pdf', 'md', 'txt', 'doc', 'docx', 'rtf', 'json']

const enter: Transition = {
  duration: motionTokens.duration.base,
  ease: [...motionTokens.ease.enter],
}
const exitFast: Transition = {
  duration: motionTokens.duration.quick,
  ease: [...motionTokens.ease.exit],
}
const instant: Transition = { duration: motionTokens.duration.instant }
/** 退场比入场更短：同一族弹簧，提前收敛，列表折叠不拖沓。 */
const collapse: Transition = motionTokens.spring.snappy
const textIn: TargetAndTransition = {
  opacity: 0,
  y: '0.3em',
  filter: `blur(${motionTokens.blur.soft}px)`,
}
const textOut: TargetAndTransition = {
  opacity: 0,
  y: '-0.3em',
  filter: `blur(${motionTokens.blur.subtle}px)`,
  transition: exitFast,
}
const shown: TargetAndTransition = { opacity: 1, y: '0em', filter: 'blur(0px)' }
/** 一次性左右衰减抖动：拒绝读起来像「不行」，又不牵动其它元素。 */
const SHAKE = { x: [0, -7, 6, -4, 3, -1.5, 0] }
const shakeTransition: Transition = {
  duration: motionTokens.duration.slow,
  ease: [...motionTokens.ease.exit],
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 100)

function matchesAccept(file: File, accepted: readonly string[]): boolean {
  return accepted.some((type) =>
    type.startsWith('.')
      ? file.name.toLowerCase().endsWith(type)
      : type.endsWith('/*')
        ? file.type.startsWith(type.slice(0, -1))
        : file.type === type,
  )
}

const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

function TypeIcon({ name }: { name: string }) {
  const props = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const
  const extension = name.toLowerCase().split('.').pop() ?? ''
  if (IMAGE_EXTENSIONS.includes(extension)) return <FileImage {...props} />
  if (VIDEO_EXTENSIONS.includes(extension)) return <FilePlay {...props} />
  if (ARCHIVE_EXTENSIONS.includes(extension)) return <FileArchive {...props} />
  if (TEXT_EXTENSIONS.includes(extension)) return <FileText {...props} />
  return <FileIcon {...props} />
}

/** 离场的那份文案对读屏隐藏，只读当前这份。 */
function Swap(props: HTMLMotionProps<'span'>) {
  const present = useIsPresent()
  return <motion.span {...props} aria-hidden={present ? props['aria-hidden'] : true} />
}

/** 新文案上移并去模糊落位，旧文案同槽位向上离场。 */
function TextSwap({
  text,
  className,
  reduced,
}: {
  text: string
  className?: string
  reduced: boolean
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <Swap
        key={text}
        className={className}
        initial={reduced ? { opacity: 0 } : textIn}
        animate={shown}
        exit={reduced ? { opacity: 0, transition: instant } : textOut}
        transition={reduced ? instant : enter}
      >
        {text}
      </Swap>
    </AnimatePresence>
  )
}

/** 变了的词上移去模糊，没变的词原地不动；读屏拿的是整句纯文本。 */
function MotionText({ text }: { text: string }) {
  const reduced = usePrefersReducedMotion()
  const words = text.split(' ')
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="inline-flex flex-wrap" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout">
          {words.map((word, index) => (
            <motion.span
              key={`${index}:${word}`}
              initial={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, y: '0.35em', filter: `blur(${motionTokens.blur.soft}px)` }
              }
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={
                reduced
                  ? { opacity: 0, transition: instant }
                  : {
                      opacity: 0,
                      y: '-0.35em',
                      filter: `blur(${motionTokens.blur.subtle}px)`,
                      transition: exitFast,
                    }
              }
              transition={reduced ? instant : enter}
            >
              {index < words.length - 1 ? `${word} ` : word}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </>
  )
}

/** 错误行按弹簧开合，并跟随实测高度，长文案换行时是撑开下一行而不是硬跳。 */
function ErrorRow({ text }: { text: string }) {
  const reduced = usePrefersReducedMotion()
  const copyRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')

  useEffect(() => {
    const node = copyRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height, opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: reduced ? instant : { height: motionTokens.spring.glide, opacity: instant },
      }}
      transition={reduced ? instant : { height: motionTokens.spring.glide, opacity: exitFast }}
    >
      <motion.div
        ref={copyRef}
        className="text-destructive mt-2 flex items-start gap-1.5 text-xs"
        role="alert"
        initial={reduced ? false : { y: '0.35em', filter: `blur(${motionTokens.blur.soft}px)` }}
        animate={{ y: 0, filter: 'blur(0px)' }}
        transition={reduced ? instant : enter}
      >
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
        <span className="min-w-0">
          <MotionText text={text} />
        </span>
      </motion.div>
    </motion.div>
  )
}

/** 圆先闭上，勾再沿着它描出来。 */
function DrawnCheck({ reduced }: { reduced: boolean }) {
  return (
    <svg
      className="size-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d="M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: motionTokens.duration.slow, ease: [...motionTokens.ease.enter] }}
      />
      <motion.path
        d="m8.2 12.4 2.6 2.6 5-5.2"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ ...enter, delay: motionTokens.duration.quick }}
      />
    </svg>
  )
}

function Thumb({ item }: { item: FileDropZoneItem }) {
  const [broken, setBroken] = useState(false)
  if (!item.preview || broken) {
    return (
      <span className="text-muted-foreground flex size-10 shrink-0 items-center justify-center">
        <TypeIcon name={item.name} />
      </span>
    )
  }
  return (
    <span className="bg-muted size-10 shrink-0 overflow-hidden rounded-md border">
      <img
        src={item.preview}
        alt=""
        width={40}
        height={40}
        decoding="async"
        className="size-full object-cover"
        onError={() => setBroken(true)}
      />
    </span>
  )
}

type RowProps = {
  item: FileDropZoneItem
  reduced: boolean
  delay: number
  fresh: boolean
  canRetry: boolean
  labels: {
    processing: string
    ready: string
    failed: string
    remove: string
    retry: string
  }
  onRemove: () => void
  onRetry: () => void
  removeRef: (node: HTMLButtonElement | null) => void
}

function FileRow({
  item,
  reduced,
  delay,
  fresh,
  canRetry,
  labels,
  onRemove,
  onRetry,
  removeRef,
}: RowProps) {
  const { status } = item
  const rowRef = useRef<HTMLDivElement>(null)
  // 只在「变成失败」的那一次抖一下，重复渲染不再抖。
  const shakenFor = useRef<FileDropZoneStatus | 'new' | undefined>(fresh ? 'new' : status)

  useEffect(() => {
    const previous = shakenFor.current
    if (status === previous) return
    shakenFor.current = status
    const node = rowRef.current
    if (status !== 'error' || reduced || !node) return
    animate(node, SHAKE, {
      ...shakeTransition,
      delay: previous === 'new' ? delay + motionTokens.duration.quick : 0,
    })
  }, [status, reduced, delay])

  // 进度条与百分比共用一根弹簧，两者读数永远一致。
  const progress = useMotionValue(status === 'ready' ? 100 : (item.progress ?? 0))
  const x = useTransform(progress, (value) => `${clamp(value) - 100}%`)
  const percent = useTransform(progress, (value) => `${Math.round(clamp(value))}%`)
  const [filled, setFilled] = useState(status !== 'processing')
  const [seen, setSeen] = useState(status)
  if (seen !== status) {
    setSeen(status)
    if (status === 'processing') setFilled(false)
  }
  // 处理完成的行让进度条跑完弹簧再收，100% 看得见之后文案才转成「就绪」。
  const phase = status === 'ready' && !filled && !reduced ? 'processing' : status
  const target = status === 'ready' ? 100 : (item.progress ?? 0)

  useEffect(() => {
    if (status !== 'processing' && status !== 'ready') return
    if (reduced || (status === 'processing' && target === 0)) {
      progress.jump(target)
      return
    }
    const controls = animate(progress, target, {
      ...motionTokens.spring.glide,
      onComplete: status === 'ready' ? () => setFilled(true) : undefined,
    })
    return () => controls.stop()
  }, [status, target, progress, reduced])

  useMotionValueEvent(progress, 'change', (value) => {
    if (status === 'ready' && value >= 99.5) setFilled(true)
  })

  const failed = status === 'error'
  const retry = failed && canRetry

  return (
    <motion.li
      initial={reduced ? { opacity: 0 } : { height: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={
        reduced
          ? { opacity: 0, transition: instant }
          : {
              height: 0,
              opacity: 0,
              transition: {
                height: collapse,
                opacity: { ...exitFast, delay: motionTokens.duration.instant },
              },
            }
      }
      transition={reduced ? instant : { height: motionTokens.spring.glide, opacity: enter, delay }}
    >
      {/* 新行一边撑开高度一边轻微下落去模糊，下面的行为它让位而不是整列跳动。 */}
      <motion.div
        ref={rowRef}
        data-row
        className={cn(
          'bg-card flex items-center gap-3 rounded-lg border p-2',
          failed && 'border-destructive/40',
        )}
        initial={
          reduced
            ? false
            : { opacity: 0, y: -22, scale: 0.94, filter: `blur(${motionTokens.blur.soft}px)` }
        }
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={
          reduced
            ? undefined
            : { scale: 0.97, filter: `blur(${motionTokens.blur.subtle}px)`, transition: exitFast }
        }
        transition={
          reduced
            ? instant
            : {
                y: { ...motionTokens.spring.glide, delay },
                scale: { ...motionTokens.spring.glide, delay },
                opacity: { ...enter, delay },
                filter: { ...enter, delay },
              }
        }
      >
        <Thumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={item.name}>
            {item.name}
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            <span>{formatBytes(item.size)}</span>
            {phase && (
              <>
                <span aria-hidden="true">·</span>
                <AnimatePresence mode="popLayout" initial={false}>
                  <Swap
                    key={phase}
                    className={cn(
                      'inline-flex items-center gap-1',
                      phase === 'ready' && 'text-primary',
                      phase === 'error' && 'text-destructive',
                    )}
                    initial={reduced ? { opacity: 0 } : textIn}
                    animate={shown}
                    exit={reduced ? { opacity: 0, transition: instant } : textOut}
                    transition={reduced ? instant : enter}
                  >
                    {phase === 'processing' ? (
                      <span>
                        {labels.processing}
                        <motion.span className="ml-1 tabular-nums">{percent}</motion.span>
                      </span>
                    ) : phase === 'ready' ? (
                      <>
                        <DrawnCheck reduced={reduced} />
                        <span>{labels.ready}</span>
                      </>
                    ) : (
                      <>
                        <CircleAlert className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
                        <span className="truncate" title={item.error}>
                          <span className="sr-only">{labels.failed}：</span>
                          {item.error || labels.failed}
                        </span>
                      </>
                    )}
                  </Swap>
                </AnimatePresence>
              </>
            )}
          </span>
          {/* 进度条随处理开始展开、随勾号画出后收起。 */}
          <AnimatePresence initial={false}>
            {phase === 'processing' && (
              <motion.span
                key="bar"
                className="mt-1.5 block overflow-hidden"
                initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: instant }
                    : { height: 0, opacity: 0, transition: { height: collapse, opacity: exitFast } }
                }
                transition={
                  reduced ? instant : { height: motionTokens.spring.glide, opacity: enter }
                }
              >
                <span
                  className="bg-muted block h-1 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-label={item.name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(clamp(target))}
                >
                  <motion.span className="bg-primary block h-full w-full" style={{ x }} />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {/* 重试按钮撑开自己的宽度，名字列跟着弹簧变窄而不是一帧丢失空间。 */}
          <AnimatePresence initial={false}>
            {retry && (
              <motion.span
                key="retry"
                className="overflow-hidden"
                initial={reduced ? { opacity: 0 } : { width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: instant }
                    : { width: 0, opacity: 0, transition: { width: collapse, opacity: instant } }
                }
                transition={
                  reduced ? instant : { width: motionTokens.spring.glide, opacity: enter }
                }
              >
                <motion.span
                  className="inline-block"
                  initial={
                    reduced ? false : { scale: 0.8, filter: `blur(${motionTokens.blur.subtle}px)` }
                  }
                  animate={{ scale: 1, filter: 'blur(0px)' }}
                  transition={reduced ? instant : motionTokens.spring.snappy}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRetry}
                    aria-label={labels.retry}
                  >
                    <RotateCw aria-hidden="true" />
                  </Button>
                </motion.span>
              </motion.span>
            )}
          </AnimatePresence>
          <Button
            ref={removeRef}
            data-remove
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={labels.remove}
          >
            <X aria-hidden="true" />
          </Button>
        </span>
      </motion.div>
    </motion.li>
  )
}

function useFilePickers({ accept, multiple, allowFolder, onFiles }: Pickers) {
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const take = useCallback(
    (list: FileList | null) => {
      if (list?.length) onFiles(Array.from(list))
    },
    [onFiles],
  )

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
      {allowFolder && (
        <input
          ref={folderRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(event) => {
            take(event.target.files)
            event.target.value = ''
          }}
        />
      )}
    </>
  )

  return { fileRef, folderRef, inputs }
}

/** 工作区里「继续添加」用的一排按钮；粘贴同样只在悬停/聚焦时生效。 */
export function FileAddButtons(
  props: Pickers & { browseLabel?: string; folderLabel?: string; allowPaste?: boolean },
) {
  const { t } = useTranslation('common')
  const { allowFolder, allowPaste, onFiles } = props
  const { fileRef, folderRef, inputs } = useFilePickers(props)
  const [armed, setArmed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const addRef = useRef(onFiles)
  useLayoutEffect(() => {
    addRef.current = onFiles
  })

  useEffect(() => {
    if (!armed || !allowPaste) return
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFromClipboard(event.clipboardData)
      if (files.length === 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input:not([type='file']), textarea, [contenteditable='true']")) return
      event.preventDefault()
      addRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [armed, allowPaste])

  return (
    <div
      ref={wrapRef}
      className="flex flex-wrap items-center gap-2"
      onPointerEnter={() => setArmed(true)}
      onPointerLeave={() => setArmed(false)}
      onFocus={() => setArmed(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setArmed(false)
      }}
    >
      {inputs}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => fileRef.current?.click()}
      >
        <ImageUp className="size-4" />
        {props.browseLabel ?? t('fileDrop.browse')}
      </Button>
      {allowFolder && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => folderRef.current?.click()}
        >
          <FolderOpen className="size-4" />
          {props.folderLabel ?? t('fileDrop.browseFolder')}
        </Button>
      )}
      {allowPaste && (
        <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
          <ClipboardPaste className="size-3.5" />
          {t('fileDrop.pasteHint')}
        </span>
      )}
    </div>
  )
}

/**
 * 全局文件入口：点击 / 拖拽（含文件夹递归）/ 剪贴板粘贴，可选的受控文件列表。
 *
 * 视觉语言全站统一——虚线边框由 SVG 描绘并贴合实测周长，拖拽时闭合成实线，
 * 光晕跟随指针；拒绝时整块抖一下并给出原因，而不是弹 toast。
 */
export function FileDropZone({
  accept,
  multiple = false,
  allowFolder = false,
  maxFiles,
  maxSize,
  items,
  onRemove,
  onRetry,
  label,
  description,
  dropLabel,
  folderLabel,
  allowPaste = false,
  note,
  icon: Icon = ImageUp,
  minHeightClass = 'min-h-[420px]',
  listPlacement = 'below',
  compactAt,
  className,
  onFiles,
}: FileDropZoneProps) {
  const { t } = useTranslation('common')
  const reduced = usePrefersReducedMotion()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLButtonElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const edgeRef = useRef<SVGRectElement>(null)
  const solidRef = useRef<SVGRectElement>(null)
  const dragDepth = useRef(0)
  const removeRefs = useRef(new Map<string, HTMLButtonElement>())
  const descriptionId = useId()
  const noteId = useId()

  const rows = items ?? EMPTY_ITEMS
  const inside = listPlacement === 'inside'
  const compact = compactAt !== undefined && rows.length >= compactAt
  const defaultNote =
    maxFiles !== undefined && multiple ? t('fileDrop.maxFiles', { count: maxFiles }) : undefined
  const noteCopy = note ?? defaultNote
  const dropCopy = dropLabel ?? t('fileDrop.dropLabel')
  const labelText = label ?? t('fileDrop.label')
  const hint = description ?? t('fileDrop.description')

  // 行只在第一次出现时播放入场与错峰，后续状态更新不应重放。
  // 这里是官方推荐的「渲染期跟着 props 调状态」写法：记下的 id 一旦补齐，fresh 就空了，不会连环重渲。
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  const fresh = useMemo(() => {
    const ids = new Set<string>()
    for (const row of rows) {
      if (!seenIds.has(row.id)) ids.add(row.id)
    }
    return ids
  }, [rows, seenIds])
  if (fresh.size > 0) {
    const next = new Set(seenIds)
    for (const id of fresh) next.add(id)
    setSeenIds(next)
  }
  const batchStart = useMemo(() => {
    const index = rows.findIndex((row) => fresh.has(row.id))
    return index < 0 ? 0 : index
  }, [rows, fresh])

  /* 拖拽光效：贴合指针的一圈边缘光与更淡的 wash，用弹簧跟随，轮廓会朝文件微微偏。 */
  const pointerX = useMotionValue(50)
  const pointerY = useMotionValue(50)
  const glowX = useSpring(pointerX, motionTokens.spring.glide)
  const glowY = useSpring(pointerY, motionTokens.spring.glide)
  const edgeLight = useMotionTemplate`radial-gradient(180px circle at ${glowX}% ${glowY}%, var(--primary), transparent 70%)`
  const washLight = useMotionTemplate`radial-gradient(260px circle at ${glowX}% ${glowY}%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%)`

  const track = useCallback(
    (event: DragEvent) => {
      const zone = zoneRef.current
      if (!zone) return
      const box = zone.getBoundingClientRect()
      const x = ((event.clientX - box.left) / Math.max(1, box.width)) * 100
      const y = ((event.clientY - box.top) / Math.max(1, box.height)) * 100
      if (reduced || !dragging) {
        pointerX.jump(x)
        pointerY.jump(y)
        glowX.jump(x)
        glowY.jump(y)
      } else {
        pointerX.set(x)
        pointerY.set(y)
      }
    },
    [dragging, reduced, glowX, glowY, pointerX, pointerY],
  )

  const shakeZone = useCallback(() => {
    if (!reduced && zoneRef.current) animate(zoneRef.current, SHAKE, shakeTransition)
  }, [reduced])

  // 虚线是画出来的而非 border，才能把虚线段闭合成实线；周长实测后按固定周期切分，
  // 任意宽度和列表高度下每段虚线都一样长，接缝也看不出来。
  useLayoutEffect(() => {
    const zone = zoneRef.current
    const edge = edgeRef.current
    if (!zone || !edge) return
    const fit = () => {
      const width = zone.offsetWidth - 1
      const height = zone.offsetHeight - 1
      // 折叠/展开的过渡里量到过窄的尺寸就直接跳过：写进去会把圆角压成直角，
      // 而 ResizeObserver 只在尺寸变化时补通知，坏值会一直留在 DOM 上。
      if (width < EDGE_MIN_SIZE || height < EDGE_MIN_SIZE) return
      const radius = Math.min(
        parseFloat(getComputedStyle(zone).borderTopLeftRadius) || 0,
        width / 2,
        height / 2,
      )
      const perimeter = 2 * (width + height) - 8 * radius + 2 * Math.PI * radius
      edge.setAttribute('rx', String(radius))
      solidRef.current?.setAttribute('rx', String(radius))
      edge.setAttribute(
        'pathLength',
        String(Math.max(8, Math.round(perimeter / DASH_PERIOD)) * DASH_PERIOD),
      )
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit)
    observer?.observe(zone)
    return () => observer?.disconnect()
  }, [])

  const addFiles = useCallback(
    (incoming: File[]) => {
      const accepted = (accept ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      const matching =
        accepted.length === 0 ? incoming : incoming.filter((file) => matchesAccept(file, accepted))
      const unique = matching.filter(
        (file, index) =>
          matching.findIndex((other) => sameFile(other, file)) === index &&
          !rows.some((row) => row.file && sameFile(row.file, file)),
      )
      const oversized = maxSize === undefined ? [] : unique.filter((file) => file.size > maxSize)
      const fits = unique.filter((file) => !oversized.includes(file))
      const capacity = multiple ? Math.max(0, (maxFiles ?? Infinity) - rows.length) : 1
      const added = fits.slice(0, capacity)

      const rejected = incoming.length - matching.length
      const overflow = fits.length - added.length
      if (rejected > 0) {
        setError(
          rejected === 1 && incoming.length === 1
            ? t('fileDrop.errors.unsupportedOne', { name: incoming[0].name })
            : t('fileDrop.errors.unsupportedMany', { count: rejected }),
        )
      } else if (oversized.length > 0) {
        setError(t('fileDrop.errors.tooLarge', { max: formatBytes(maxSize ?? 0) }))
      } else if (overflow > 0) {
        setError(t('fileDrop.errors.tooMany', { count: maxFiles ?? 1 }))
      } else {
        setError('')
      }
      if (rejected > 0 || oversized.length > 0 || overflow > 0) shakeZone()
      if (added.length === 0) return

      onFiles(added)
      setAnnouncement(t('fileDrop.announcement.added', { count: added.length }))
    },
    [accept, onFiles, multiple, maxFiles, maxSize, rows, shakeZone, t],
  )

  const removeItem = useCallback(
    (item: FileDropZoneItem) => {
      const index = rows.findIndex((row) => row.id === item.id)
      const neighbor = rows[index + 1] ?? rows[index - 1]
      onRemove?.(item)
      setError('')
      setAnnouncement(t('fileDrop.announcement.removed', { name: item.name }))
      requestAnimationFrame(() =>
        (neighbor ? removeRefs.current.get(neighbor.id) : dropRef.current)?.focus(),
      )
    },
    [rows, onRemove, t],
  )

  const retryItem = useCallback(
    (item: FileDropZoneItem) => {
      if (!onRetry) return
      setAnnouncement(t('fileDrop.announcement.retrying', { name: item.name }))
      onRetry(item)
      requestAnimationFrame(() => removeRefs.current.get(item.id)?.focus())
    },
    [onRetry, t],
  )

  // 上下键在行之间移动并保持同一个动作；Delete/Backspace 移除当前行。
  const moveFocus = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-row]')
      const button = row?.querySelector<HTMLButtonElement>('[data-remove]')
      if (button) {
        event.preventDefault()
        button.click()
      }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const button = (event.target as HTMLElement).closest('button')
    const row = button?.closest<HTMLElement>('[data-row]')
    if (!button || !row) return
    const list = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-row]'))
    const next = list[list.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)]
    if (!next) return
    event.preventDefault()
    next.querySelector<HTMLButtonElement>('[data-remove]')?.focus()
  }

  // 粘贴只在指针悬停或焦点落在区内时生效，避免抢走页面其它输入框的粘贴。
  const pasteArmed = (hovered || focusWithin) && allowPaste
  const addRef = useRef(addFiles)
  useLayoutEffect(() => {
    addRef.current = addFiles
  })
  useEffect(() => {
    if (!pasteArmed) return
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFromClipboard(event.clipboardData)
      if (files.length === 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input:not([type='file']), textarea, [contenteditable='true']")) return
      event.preventDefault()
      addRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [pasteArmed])

  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')

  // 槽位自己开合高度，提示语因而不是在一帧里变形。
  const slot = {
    initial: reduced ? { opacity: 0 } : { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: reduced
      ? { opacity: 0, transition: instant }
      : { height: 0, opacity: 0, transition: { height: collapse, opacity: exitFast } },
    transition: reduced ? instant : { height: motionTokens.spring.glide, opacity: enter },
  }
  const rowsInside = inside && rows.length > 0
  const fan = dragging ? 16 : hovered ? 8 : 0

  const list = (
    <motion.ul
      className="flex flex-col gap-2"
      aria-label={t('fileDrop.listLabel')}
      aria-hidden={rows.length ? undefined : true}
      onKeyDown={moveFocus}
      initial={false}
      animate={{
        paddingTop: rows.length && !inside ? 8 : 0,
        paddingBottom: rows.length && inside ? 12 : 0,
      }}
      transition={reduced ? instant : motionTokens.spring.glide}
    >
      <AnimatePresence initial={false}>
        {rows.map((item, index) => (
          <FileRow
            key={item.id}
            item={item}
            reduced={reduced}
            delay={
              reduced
                ? 0
                : Math.min(Math.max(0, index - batchStart), MAX_STAGGER) * motionTokens.stagger.item
            }
            fresh={fresh.has(item.id)}
            canRetry={!!onRetry}
            labels={{
              processing: t('fileDrop.status.processing'),
              ready: t('fileDrop.status.ready'),
              failed: t('fileDrop.status.error'),
              remove: t('fileDrop.remove', { name: item.name }),
              retry: t('fileDrop.retry', { name: item.name }),
            }}
            onRemove={() => removeItem(item)}
            onRetry={() => retryItem(item)}
            removeRef={(node) => {
              if (node) removeRefs.current.set(item.id, node)
              else removeRefs.current.delete(item.id)
            }}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  )

  return (
    <div
      className={cn('w-full', className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false)
      }}
    >
      <div
        ref={zoneRef}
        className={cn(
          'relative isolate flex flex-col rounded-2xl',
          inside && 'overflow-hidden',
          dragging && 'z-10',
        )}
        onDragEnter={(event) => {
          if (!carriesFiles(event)) return
          event.preventDefault()
          if (!dragDepth.current) track(event)
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => {
          if (!carriesFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          track(event)
        }}
        onDragLeave={(event) => {
          if (!carriesFiles(event)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (!dragDepth.current) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          if (event.dataTransfer.files.length || event.dataTransfer.items.length) {
            void filesFromDataTransfer(event.dataTransfer).then((files) => {
              if (files.length) addFiles(files)
            })
          }
        }}
      >
        <motion.span
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity',
            dragging && 'opacity-100',
          )}
          style={{ backgroundImage: washLight }}
          aria-hidden="true"
        />
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <rect
            ref={edgeRef}
            className={cn(
              'fill-none transition-opacity duration-200',
              hovered ? 'stroke-primary' : 'stroke-border',
              dragging && 'opacity-0',
            )}
            width="100%"
            height="100%"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <rect
            ref={solidRef}
            className={cn(
              'stroke-primary fill-none transition-opacity duration-200',
              dragging ? 'opacity-100' : 'opacity-0',
            )}
            width="100%"
            height="100%"
            strokeWidth={1.5}
          />
        </svg>
        <motion.span
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 opacity-0 mix-blend-normal transition-opacity',
            dragging && 'opacity-60',
          )}
          style={{ backgroundImage: edgeLight }}
          aria-hidden="true"
        />
        {/* 子元素不吃指针事件，整块区域就是一个点击与拖拽命中面。 */}
        <motion.button
          ref={dropRef}
          type="button"
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 px-6 text-center',
            minHeightClass,
          )}
          aria-describedby={compact ? descriptionId : `${descriptionId} ${noteId}`}
          initial={false}
          animate={{
            paddingTop: compact ? 16 : 26,
            paddingBottom: compact ? (rowsInside ? 8 : 16) : rowsInside ? 26 : 34,
          }}
          transition={reduced ? instant : motionTokens.spring.glide}
          onClick={() => inputRef.current?.click()}
        >
          <AnimatePresence initial={false}>
            {(!compact || dragging) && (
              <motion.span key="icon" className="flex" {...slot}>
                {/* 三张纸平时叠平，悬停扇开，有文件压过来时张得更开。 */}
                <span
                  className="relative flex size-14 items-center justify-center"
                  aria-hidden="true"
                >
                  <motion.span
                    className="border-border bg-muted absolute inset-1 rounded-lg border"
                    initial={false}
                    animate={{ rotate: -fan, x: -fan * 0.35 }}
                    transition={reduced ? instant : motionTokens.spring.glide}
                  />
                  <motion.span
                    className="border-border bg-muted absolute inset-1 rounded-lg border"
                    initial={false}
                    animate={{ rotate: fan, x: fan * 0.35 }}
                    transition={reduced ? instant : motionTokens.spring.glide}
                  />
                  <span className="border-border bg-card absolute inset-1 flex items-center justify-center rounded-lg border">
                    <Icon className="text-primary size-6" />
                  </span>
                </span>
              </motion.span>
            )}
          </AnimatePresence>
          <strong className="text-sm font-semibold">
            <TextSwap text={dragging ? dropCopy : labelText} reduced={reduced} />
          </strong>
          <span id={descriptionId} className="text-muted-foreground text-xs">
            {hint}
          </span>
          {allowPaste && !compact && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <ClipboardPaste className="size-3.5" />
              {t('fileDrop.pasteHint')}
            </span>
          )}
          <AnimatePresence initial={false}>
            {!compact && noteCopy && (
              <motion.span key="note" {...slot}>
                <small id={noteId} className="text-muted-foreground text-xs">
                  {noteCopy}
                </small>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        {/* 整块区域本身就是「选择文件」的触发器，所以文件夹只能作为区域外的兄弟节点，
            否则就是 button 套 button 的非法 DOM。 */}
        {allowFolder && (
          <div className="pointer-events-none flex justify-center pb-4">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground pointer-events-auto gap-1.5"
              onClick={() => folderRef.current?.click()}
            >
              <FolderOpen className="size-3.5" />
              {folderLabel ?? t('fileDrop.browseFolder')}
            </Button>
          </div>
        )}
        {inside && list}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files?.length) addFiles(Array.from(event.target.files))
          event.target.value = ''
        }}
      />
      {allowFolder && (
        <input
          ref={folderRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(event) => {
            if (event.target.files?.length) addFiles(Array.from(event.target.files))
            event.target.value = ''
          }}
        />
      )}
      <AnimatePresence initial={false}>
        {error ? <ErrorRow key="error" text={error} /> : null}
      </AnimatePresence>
      {!inside && list}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}

export default FileDropZone
