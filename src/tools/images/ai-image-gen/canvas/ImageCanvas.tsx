import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ImagePlus, Plus, SquarePlus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useIsMobile } from '@/composable/use-breakpoint'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  aspectRatioOf,
  buildCanvasGraph,
  CANVAS_IMAGE_WIDTH,
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_PROMPT_HEIGHT,
  CANVAS_PROMPT_WIDTH,
  jobIdOfPromptNode,
  MAX_CANVAS_REFS,
  REFERENCE_MIMES,
  wouldCreateCycle,
  type CanvasImageInput,
  type GenParams,
} from '../ai-image-gen.service'
import type { CardItem } from '../components/ImageCard'
import type { ImageRecord } from '../idb'
import {
  cancelJob,
  createPromptNode,
  deleteJobImages,
  linkChain,
  linkReference,
  moveCanvasNode,
  removeCanvasImage,
  renamePromptNode,
  resizeCanvasNode,
  retryJob,
  submitCanvasGeneration,
} from '../orchestrator'
import { useAiImageGenStore, type Job, type JobSlot } from '../store'

import { ImageNode, type ImageRfNode } from './nodes/ImageNode'
import { PromptNode, type PromptRfNode } from './nodes/PromptNode'

/** RF 要求 nodeTypes 引用稳定：写在组件里会让节点每帧重挂，blob URL 反复创建与释放 */
const nodeTypes = { image: ImageNode, prompt: PromptNode }
/** selectable=false：连线不参与选中，点它只为弹「断开关联」，不会把节点选区清掉 */
const edgeOptions = {
  type: 'smoothstep' as const,
  selectable: false,
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
}

type RfNode = ImageRfNode | PromptRfNode
type LinkProblem = 'shape' | 'cycle' | 'full'
/** 待断开的连线：由悬停描红 + 点击确认后走 unlink */
type DetachTarget = { id: string; source: string; target: string }

const LINK_KEY: Record<LinkProblem, string> = {
  shape: 'ai-image-gen.canvas.linkShape',
  cycle: 'ai-image-gen.canvas.linkCycle',
  full: 'ai-image-gen.canvas.linkFull',
}

/** 左键行为：框选，或拖拽平移 */
export type CanvasInteraction = 'select' | 'pan'

/** 光标聚光的半径（px，屏幕空间）：画布点阵在这个范围内被点亮 */
const CANVAS_GLOW_RADIUS = 150

/** 右键菜单的落点：screen 用于定位菜单，flow 用于放新节点 */
type ContextMenuState = {
  screen: { x: number; y: number }
  flow: { x: number; y: number }
  nodeId: string | null
}

type ImageCanvasProps = {
  records: ImageRecord[]
  jobs: Job[]
  params: GenParams
  interaction: CanvasInteraction
  /** 自增一次即在视口中央落一个新的提示词节点，供右侧 dock 触发 */
  createPromptSignal: number
  /** 拖放到画布上的文件交由宿主导入，反馈也统一在宿主做 */
  onImportFiles: (files: File[], position: { x: number; y: number }) => void
  onParamsChange: (patch: Partial<GenParams>) => void
  onReference: (record: ImageRecord) => void
  onRemix: (record: ImageRecord) => void
  onOpenLightbox: (record: ImageRecord) => void
  onOpenSettings: () => void
}

export function ImageCanvas(props: ImageCanvasProps) {
  const {
    records,
    jobs,
    params,
    interaction,
    createPromptSignal,
    onImportFiles,
    onParamsChange,
    onReference,
    onRemix,
    onOpenLightbox,
    onOpenSettings,
  } = props
  const { t } = useTranslation('tools-images')
  const isMobile = useIsMobile()
  const instance = useReactFlow()
  const holderRef = useRef<HTMLDivElement>(null)
  const menuFileRef = useRef<HTMLInputElement>(null)
  const menuFlowRef = useRef<{ x: number; y: number } | null>(null)
  const fitted = useRef(false)
  const created = useRef(0)
  /** 聚光的坐标与排帧：pointermove 可以远快于刷新率，逐帧合批才不会拖垮合成 */
  const glowPoint = useRef({ x: 0, y: 0 })
  const glowFrame = useRef(0)
  const draggingNode = useRef(false)

  const overlays = useAiImageGenStore((state) => state.overlays)
  const viewport = useAiImageGenStore((state) => state.viewport)
  const setViewport = useAiImageGenStore((state) => state.setViewport)
  const setSelected = useAiImageGenStore((state) => state.setSelected)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RfNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [dropping, setDropping] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [detach, setDetach] = useState<DetachTarget | null>(null)

  const recordIndex = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  )
  const slotIndex = useMemo(() => {
    const map = new Map<string, { job: Job; slot: JobSlot }>()
    for (const job of jobs) {
      if (job.kind === 'gen') {
        for (const slot of job.slots) {
          map.set(slot.id, { job, slot })
        }
      }
    }
    return map
  }, [jobs])

  // 已回填库存记录的槽位不再插占位节点，否则同一张图会在图上出现两次
  const imageInputs = useMemo<CanvasImageInput[]>(
    () => [
      ...records.map((record) => ({
        id: record.id,
        jobId: record.meta.jobId,
        prompt: record.meta.prompt,
        createdAt: record.meta.createdAt,
        imported: record.meta.imported,
        ratio:
          record.width && record.height
            ? record.width / record.height
            : aspectRatioOf(record.meta.params.aspect),
      })),
      ...jobs.flatMap((job) =>
        job.kind !== 'gen'
          ? []
          : job.slots
              .filter((slot) => !slot.imageId || !recordIndex.has(slot.imageId))
              .map((slot) => ({
                id: slot.id,
                jobId: job.id,
                prompt: job.prompt,
                createdAt: job.createdAt,
                ratio: aspectRatioOf(job.params.aspect),
              })),
      ),
    ],
    [records, jobs, recordIndex],
  )

  const graph = useMemo(() => buildCanvasGraph(imageInputs, overlays), [imageInputs, overlays])

  /** 框选集合里也有提示词节点，store 的 selectedImageIds 只服务导出，不能拿它当删除依据 */
  const selectedNodeIds = useMemo(
    () => rfNodes.filter((node) => node.selected).map((node) => node.id),
    [rfNodes],
  )

  const cardItemOf = useCallback(
    (nodeId: string): CardItem | null => {
      const record = recordIndex.get(nodeId)
      if (record) {
        return { kind: 'image', record }
      }
      const slot = slotIndex.get(nodeId)
      return slot ? { kind: 'slot', job: slot.job, slot: slot.slot } : null
    },
    [recordIndex, slotIndex],
  )

  const handleDeleteImage = useCallback(
    (nodeId: string) => {
      if (recordIndex.has(nodeId)) {
        void removeCanvasImage(nodeId)
        return
      }
      const slot = slotIndex.get(nodeId)
      if (slot) {
        void deleteJobImages(slot.job.id)
      }
    },
    [recordIndex, slotIndex],
  )

  const handleGenerate = useCallback(
    (nodeId: string) => {
      void submitCanvasGeneration(nodeId, params).then((error) => {
        if (error) {
          toast.error(t(`ai-image-gen.errors.${error}`))
          onOpenSettings()
        }
      })
    },
    [params, onOpenSettings, t],
  )

  const handleDeletePrompt = useCallback((nodeId: string) => {
    void deleteJobImages(jobIdOfPromptNode(nodeId))
  }, [])

  /** 松手即落库：尺寸连同当前位置一起写，否则未钉位的节点会被自动布局按新尺寸挪走 */
  const handleResize = useCallback(
    (
      nodeId: string,
      size: { width: number; height: number },
      position: { x: number; y: number },
    ) => {
      void resizeCanvasNode(nodeId, size, position)
    },
    [],
  )

  const linkProblem = useCallback(
    (source: string | null | undefined, target: string | null | undefined): LinkProblem | null => {
      const from = source ? graph.nodes.find((node) => node.id === source) : undefined
      const to = target ? graph.nodes.find((node) => node.id === target) : undefined
      if (!from || !to || to.kind !== 'prompt' || (from.kind === 'prompt' && from.id === to.id)) {
        return 'shape'
      }
      if (wouldCreateCycle(graph.edges, from.id, to.id)) {
        return 'cycle'
      }
      if (from.kind === 'image') {
        const connected = to.refs.filter((ref) => recordIndex.has(ref)).length
        if (connected >= MAX_CANVAS_REFS) {
          return 'full'
        }
      }
      return null
    },
    [graph, recordIndex],
  )

  useEffect(() => {
    setRfNodes((previous) => {
      const next: RfNode[] = []
      for (const node of graph.nodes) {
        const carried = previous.find((item) => item.id === node.id)
        // 必须带走 measured：effect 重跑时若不保留，RF 就再也量不到节点，连线算不出端点
        const carriedState = carried
          ? { selected: carried.selected, measured: carried.measured }
          : {}
        const position = { x: node.x, y: node.y }
        if (node.kind === 'image') {
          const item = cardItemOf(node.id)
          if (!item) {
            continue
          }
          next.push({
            ...carriedState,
            id: node.id,
            type: 'image',
            deletable: false,
            position,
            width: node.width,
            height: node.height,
            data: {
              card: {
                item,
                onOpen: onOpenLightbox,
                onRetry: retryJob,
                onCancel: cancelJob,
                onReference,
                onRemix,
                onDelete: () => handleDeleteImage(node.id),
              },
              onResize: handleResize,
            },
          })
          continue
        }
        const job = jobs.find((item) => item.id === node.jobId)
        next.push({
          ...carriedState,
          id: node.id,
          type: 'prompt',
          deletable: false,
          position,
          width: node.width,
          height: node.height,
          data: {
            nodeId: node.id,
            jobId: node.jobId,
            text: node.text,
            refCount: node.refs.filter((ref) => recordIndex.has(ref)).length,
            chainCount: node.chain.filter(
              (link) => link !== node.id && graph.nodes.some((item) => item.id === link),
            ).length,
            status: job?.status ?? 'idle',
            errorCode: job?.errorCode,
            params,
            onRename: (nodeId: string, text: string) => void renamePromptNode(nodeId, text),
            onGenerate: handleGenerate,
            onCancel: cancelJob,
            onRetry: retryJob,
            onDelete: handleDeletePrompt,
            onParamsChange,
            onResize: handleResize,
          },
        })
      }
      return next
    })
  }, [
    graph,
    setRfNodes,
    cardItemOf,
    recordIndex,
    jobs,
    params,
    onOpenLightbox,
    onReference,
    onRemix,
    handleDeleteImage,
    handleGenerate,
    handleDeletePrompt,
    onParamsChange,
    handleResize,
  ])

  useEffect(() => {
    setRfEdges(
      graph.edges.map((edge) => {
        const detachable = edge.kind !== 'output'
        return {
          ...edgeOptions,
          id: edge.id,
          source: edge.source,
          target: edge.target,
          deletable: detachable,
          className: detachable ? 'canvas-edge-detachable' : undefined,
          style:
            edge.kind === 'reference'
              ? { strokeDasharray: '5 4' }
              : edge.kind === 'chain'
                ? { strokeDasharray: '2 4' }
                : undefined,
        }
      }),
    )
  }, [graph, setRfEdges])

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return
      }
      const from = graph.nodes.find((node) => node.id === connection.source)
      const link = from?.kind === 'prompt' ? linkChain : linkReference
      void link(connection.target, connection.source, true)
    },
    [graph],
  )

  const handleConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid) {
        return
      }
      const problem = linkProblem(state.fromNode?.id, state.toNode?.id)
      if (problem) {
        toast.error(t(LINK_KEY[problem]))
      }
    },
    [linkProblem, t],
  )

  /** 悬停描红的那条线被点中：先确认再断，产出边不可断所以不进这里 */
  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    if (edge.deletable === false) {
      return
    }
    setDetach({ id: edge.id, source: edge.source, target: edge.target })
  }, [])

  const confirmDetach = useCallback(() => {
    if (detach) {
      const unlink = detach.id.startsWith('chain:') ? linkChain : linkReference
      void unlink(detach.target, detach.source, false)
    }
    setDetach(null)
  }, [detach])

  const handleDragStart = useCallback(() => {
    // 拖拽期间不需要聚光：省掉整块遮罩层的重绘，换卡片跟手
    draggingNode.current = true
    holderRef.current?.style.setProperty('--glow-r', '0px')
  }, [])

  const handleDragStop = useCallback((_event: unknown, node: Node) => {
    draggingNode.current = false
    void moveCanvasNode(node.id, node.position.x, node.position.y)
  }, [])

  const handleGlowMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget
    glowPoint.current.x = event.clientX
    glowPoint.current.y = event.clientY
    if (draggingNode.current || glowFrame.current) {
      return
    }
    glowFrame.current = requestAnimationFrame(() => {
      glowFrame.current = 0
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--glow-x', `${glowPoint.current.x - rect.left}px`)
      el.style.setProperty('--glow-y', `${glowPoint.current.y - rect.top}px`)
      el.style.setProperty('--glow-r', `${CANVAS_GLOW_RADIUS}px`)
    })
  }, [])

  const handleGlowOff = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--glow-r', '0px')
  }, [])

  const handleSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) => {
      setSelected(nodes.filter((node) => node.type === 'image').map((node) => node.id))
    },
    [setSelected],
  )

  const addPrompt = useCallback(() => {
    const rect = holderRef.current?.getBoundingClientRect()
    const center = instance.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? CANVAS_PROMPT_WIDTH * 3) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? CANVAS_PROMPT_HEIGHT * 4) / 2,
    })
    void createPromptNode('', {
      x: center.x - CANVAS_PROMPT_WIDTH / 2,
      y: center.y - CANVAS_PROMPT_HEIGHT / 2,
    })
  }, [instance])

  const openMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, nodeId: string | null) => {
      event.preventDefault()
      const holder = holderRef.current
      const rect = holder?.getBoundingClientRect()
      const point = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setMenu({
        // 夹取在容器内：渲染期不能再读 ref，边界只能在这里算好存进 state
        screen: {
          x: Math.max(
            4,
            Math.min(event.clientX - (rect?.left ?? 0), (holder?.clientWidth ?? 0) - 168),
          ),
          y: Math.max(
            4,
            Math.min(event.clientY - (rect?.top ?? 0), (holder?.clientHeight ?? 0) - 120),
          ),
        },
        flow: { x: point.x - CANVAS_IMAGE_WIDTH / 2, y: point.y - CANVAS_PROMPT_HEIGHT / 2 },
        nodeId,
      })
    },
    [instance],
  )

  const menuAddPrompt = useCallback(() => {
    if (!menu) {
      return
    }
    void createPromptNode('', menu.flow)
    setMenu(null)
  }, [menu])

  const menuAddImage = useCallback(() => {
    if (!menu) {
      return
    }
    menuFlowRef.current = menu.flow
    setMenu(null)
    menuFileRef.current?.click()
  }, [menu])

  /** 右键落在选区内就整组删，否则只删命中的那一个 */
  const menuDeleteIds = useMemo(() => {
    if (!menu) {
      return []
    }
    if (!menu.nodeId) {
      return selectedNodeIds
    }
    return selectedNodeIds.includes(menu.nodeId) ? selectedNodeIds : [menu.nodeId]
  }, [menu, selectedNodeIds])

  const menuDelete = useCallback(() => {
    for (const id of menuDeleteIds) {
      const node = graph.nodes.find((item) => item.id === id)
      if (node?.kind === 'prompt') {
        handleDeletePrompt(id)
      } else if (node) {
        handleDeleteImage(id)
      }
    }
    setMenu(null)
  }, [menuDeleteIds, graph, handleDeleteImage, handleDeletePrompt])

  // 菜单开着时，点任何地方或按 Esc 都要收起来
  useEffect(() => {
    if (!menu) {
      return
    }
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
      }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDropping(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (!files.length) {
        return
      }
      const point = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      onImportFiles(files, {
        x: point.x - CANVAS_IMAGE_WIDTH / 2,
        y: point.y - CANVAS_PROMPT_HEIGHT / 2,
      })
    },
    [instance, onImportFiles],
  )

  // 没对准画布就松手时，浏览器会直接打开图片并把整个页面换掉
  useEffect(() => {
    const block = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault()
      }
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  useEffect(() => {
    if (createPromptSignal > created.current) {
      created.current = createPromptSignal
      addPrompt()
    }
  }, [createPromptSignal, addPrompt])

  // 用户从未挪动过视口时，首屏把整图收进视野
  useEffect(() => {
    if (fitted.current || viewport !== null || !graph.nodes.length) {
      return
    }
    fitted.current = true
    void instance.fitView({ padding: 0.15, duration: 600 })
  }, [graph, instance, viewport])

  return (
    <div
      ref={holderRef}
      className="bg-background absolute inset-0 overflow-hidden"
      onDragOver={(event) => {
        if (!event.dataTransfer?.types.includes('Files')) {
          return
        }
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Element | null)) {
          return
        }
        setDropping(false)
      }}
      onDrop={handleDrop}
      onPointerMove={handleGlowMove}
      onPointerLeave={handleGlowOff}
    >
      {dropping ? (
        <div className="border-primary/70 bg-primary/5 pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed">
          <p className="text-primary text-sm font-medium">{t('ai-image-gen.canvas.dropHint')}</p>
        </div>
      ) : null}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onEdgeClick={handleEdgeClick}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onSelectionChange={handleSelectionChange}
        isValidConnection={(connection) =>
          linkProblem(connection.source, connection.target) === null
        }
        onMoveEnd={(_event, next) => setViewport(next)}
        onMoveStart={() => setMenu(null)}
        onPaneContextMenu={(event) => openMenu(event, null)}
        onNodeContextMenu={(event, node) => openMenu(event, node.id)}
        // 框选后那块选区矩形盖在空白处，右键落在它上面只走这个回调，不接就成浏览器原生菜单
        onSelectionContextMenu={(event) => openMenu(event, null)}
        selectionOnDrag={interaction === 'select'}
        selectionKeyCode="Shift"
        panOnDrag={interaction === 'select' ? [1] : [0, 1]}
        nodeClickDistance={4}
        nodesConnectable={!isMobile}
        onlyRenderVisibleElements
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        defaultViewport={viewport ?? undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
        {/* 同规格的第二层主色点阵，靠 --glow-* 的圆形遮罩只在光标半径内显形 */}
        <Background
          id="glow"
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.5}
          color="var(--primary)"
          bgColor="transparent"
          className="canvas-glow"
        />
      </ReactFlow>

      {!graph.nodes.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-2 text-center">
            <p className="text-muted-foreground max-w-72 text-xs">
              {t('ai-image-gen.canvas.empty')}
            </p>
            {!isMobile ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full text-xs"
                onClick={addPrompt}
              >
                <Plus className="size-3.5" />
                {t('ai-image-gen.canvas.newPrompt')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 右键「新增图片」专用：落点存在 ref 里，选完文件再取 */}
      <input
        ref={menuFileRef}
        type="file"
        accept={REFERENCE_MIMES.join(',')}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          const flow = menuFlowRef.current
          if (files.length && flow) {
            onImportFiles(files, flow)
          }
          menuFlowRef.current = null
          event.target.value = ''
        }}
      />

      {menu ? (
        <div
          className="bg-card absolute z-20 w-40 rounded-lg border p-1 shadow-lg"
          style={{ left: menu.screen.x, top: menu.screen.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <MenuItem
            icon={<SquarePlus className="size-3.5" />}
            label={t('ai-image-gen.canvas.newPrompt')}
            onClick={menuAddPrompt}
          />
          <MenuItem
            icon={<ImagePlus className="size-3.5" />}
            label={t('ai-image-gen.canvas.menuAddImage')}
            onClick={menuAddImage}
          />
          <MenuItem
            icon={<Trash2 className="size-3.5" />}
            label={t('ai-image-gen.canvas.menuDelete')}
            destructive
            disabled={!menuDeleteIds.length}
            onClick={menuDelete}
          />
        </div>
      ) : null}

      <AlertDialog open={!!detach} onOpenChange={(open) => (open ? null : setDetach(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ai-image-gen.canvas.detachTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('ai-image-gen.canvas.detachDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ai-image-gen.toolbar.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDetach}>
              {t('ai-image-gen.canvas.detachAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-40',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}
