import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ImagePlus, Layers, Plus, SquarePlus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useIsMobile } from '@/composable/use-breakpoint'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  aspectRatioOf,
  boundingBoxOf,
  buildCanvasGraph,
  CANVAS_IMAGE_WIDTH,
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_PROMPT_HEIGHT,
  CANVAS_PROMPT_WIDTH,
  jobIdOfPromptNode,
  MAX_CANVAS_REFS,
  REFERENCE_MIMES,
  referenceLabelAt,
  wouldCreateCycle,
  type CanvasImageInput,
  type GenParams,
  type NodeBounds,
} from '../ai-image-gen.service'
import type { CardItem } from '../components/ImageCard'
import type { ImageRecord } from '../idb'
import { objectUrlOf } from '../object-url'
import {
  cancelJob,
  clearCanvasLayout,
  createPromptNode,
  deleteJobImages,
  duplicatePromptNode,
  linkChain,
  linkReference,
  moveCanvasNodes,
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

/** 左键行为：框选，或拖拽平移 */
export type CanvasInteraction = 'select' | 'pan'

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
    onOpenLightbox,
    onOpenSettings,
  } = props
  const { t, i18n } = useTranslation('tools-images')
  const isMobile = useIsMobile()
  // @图N 的词表跟着界面语言走，两种写法在解析时都认
  const lang = i18n.language
  const instance = useReactFlow()
  const holderRef = useRef<HTMLDivElement>(null)
  const menuFileRef = useRef<HTMLInputElement>(null)
  const menuFlowRef = useRef<{ x: number; y: number } | null>(null)
  const fitted = useRef(false)
  const created = useRef(0)

  const overlays = useAiImageGenStore((state) => state.overlays)
  const viewport = useAiImageGenStore((state) => state.viewport)
  const setViewport = useAiImageGenStore((state) => state.setViewport)
  const setSelected = useAiImageGenStore((state) => state.setSelected)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RfNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [dropping, setDropping] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

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

  /** 多选时各节点的工具条让位给选框上方那一条重排，所以包围盒要按这批节点算 */
  const selectedBoxes = useMemo<NodeBounds[]>(
    () =>
      rfNodes
        .filter((node) => node.selected)
        .map((node) => ({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: node.width ?? 0,
          height: node.height ?? 0,
        })),
    [rfNodes],
  )
  const multiSelected = selectedBoxes.length > 1

  const handleRelayout = useCallback(() => {
    void clearCanvasLayout(selectedBoxes.map((node) => node.id))
  }, [selectedBoxes])

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

  const handleDuplicatePrompt = useCallback((nodeId: string) => {
    void duplicatePromptNode(nodeId)
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

  /** 能不能连：只判形状、识别原图、成环与参考图上限，不合法就静默不接单 */
  const canConnect = useCallback(
    (source: string | null | undefined, target: string | null | undefined): boolean => {
      const from = source ? graph.nodes.find((node) => node.id === source) : undefined
      const to = target ? graph.nodes.find((node) => node.id === target) : undefined
      if (!from || !to || to.kind !== 'prompt' || (from.kind === 'prompt' && from.id === to.id)) {
        return false
      }
      // 识图原图只服务于它自己那条识别边，拉出去当参考图会误导「这张图会进下一次生图」
      if (from.kind === 'image' && from.vision) {
        return false
      }
      if (wouldCreateCycle(graph.edges, from.id, to.id)) {
        return false
      }
      if (from.kind === 'image') {
        return to.refs.filter((ref) => recordIndex.has(ref)).length < MAX_CANVAS_REFS
      }
      return true
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
                vision: node.vision,
                barHidden: multiSelected,
                onOpen: onOpenLightbox,
                onRetry: retryJob,
                onCancel: cancelJob,
                onReference,
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
            refs: node.refs.map((id, index) => {
              const record = recordIndex.get(id)
              return {
                imageId: id,
                label: referenceLabelAt(index, lang),
                name: record?.meta.prompt ?? id,
                url: record ? objectUrlOf(record.id, record.blob) : '',
              }
            }),
            mentions: node.mentions,
            chainCount: node.chain.filter(
              (link) => link !== node.id && graph.nodes.some((item) => item.id === link),
            ).length,
            status: job?.status ?? 'idle',
            errorCode: job?.errorCode,
            params,
            vision: node.vision,
            barHidden: multiSelected,
            createdAt: node.createdAt,
            lang,
            onRename: (nodeId: string, text: string, mentions: string[]) =>
              void renamePromptNode(nodeId, text, mentions),
            onGenerate: handleGenerate,
            onCancel: cancelJob,
            onRetry: retryJob,
            onDelete: handleDeletePrompt,
            onDuplicate: handleDuplicatePrompt,
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
    lang,
    multiSelected,
    onOpenLightbox,
    onReference,
    handleDeleteImage,
    handleGenerate,
    handleDeletePrompt,
    handleDuplicatePrompt,
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

  /** 点线即断开，不再二次确认；产出边由提示词派生，不可断所以不进这里 */
  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    if (edge.deletable === false) {
      return
    }
    const unlink = edge.id.startsWith('chain:') ? linkChain : linkReference
    void unlink(edge.target, edge.source, false)
  }, [])

  /**
   * 落库必须吃第三个参数 nodes：RF 把这一批被拖动的节点全传进来，node 只是被按住的那个，
   * 拖选框整体时它甚至是空的。只存 node 的话其余节点下次图重建会各自弹回原位，
   * 表现为一组节点被拉开、彼此错位。
   */
  const handleDragStop = useCallback((_event: unknown, _node: Node, nodes: Node[]) => {
    void moveCanvasNodes(
      nodes.map((item) => ({ nodeId: item.id, x: item.position.x, y: item.position.y })),
    )
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
        onEdgeClick={handleEdgeClick}
        onNodeDragStop={handleDragStop}
        onSelectionChange={handleSelectionChange}
        isValidConnection={(connection) => canConnect(connection.source, connection.target)}
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
        <Background variant={BackgroundVariant.Dots} gap={22} size={2} />
      </ReactFlow>

      {multiSelected ? (
        <>
          <SelectionFrame boxes={selectedBoxes} />
          <SelectionToolbar boxes={selectedBoxes} onRelayout={handleRelayout} />
        </>
      ) : null}

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

/** 选框与内容之间的留白，与 index.css 里 .canvas-selection-frame 的 outline-offset 同值 */
const SELECTION_PAD = 10
/** 按钮半宽的估算（中英文标签都在 90–110px 之间）与它离容器边、容器顶的最小距离 */
const TOOLBAR_HALF = 56
const TOOLBAR_EDGE = 8
const TOOLBAR_MIN_TOP = 40

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * 多选时圈住选区的边框：位置由选中节点的包围盒换算到容器像素，跟着平移缩放实时走。
 *
 * 不复用 React Flow 自带的 nodesselection-rect：它只在「框选松手」那一刻挂载，之后点一下
 * 节点、或按住节点起拖，库都会把 nodesSelectionActive 置回 false 把整块框摘掉；而且它挂载
 * 即 focus，库的 :focus { outline: none } 会把我们画的描边抹掉（见 index.css 的说明）。
 * 所以边框自己画，只认选区状态，与上方的重排条同源、同寿命。
 */
function SelectionFrame({ boxes }: { boxes: NodeBounds[] }) {
  const [tx, ty, zoom] = useStore((store) => store.transform)
  // 框选拖拽途中由库自己的虚线矩形接手，避免两个框叠在一起
  const userSelectionActive = useStore((store) => store.userSelectionActive)
  if (userSelectionActive) {
    return null
  }
  const box = boundingBoxOf(boxes)
  return (
    <div
      className="canvas-selection-frame pointer-events-none absolute z-10"
      style={{
        left: box.left * zoom + tx,
        top: box.top * zoom + ty,
        width: box.width * zoom,
        height: box.height * zoom,
      }}
    />
  )
}

/**
 * 多选时浮在选框上方的工具条：节点各自的动作条这时让位，重排只在这里做。
 * 位置由选中节点的包围盒换算到容器像素，跟着平移缩放实时走（订阅 RF 的 transform）。
 *
 * 坐标必须夹进容器内：画布容器是 overflow-hidden，选框顶到视野之外时按钮会整颗被裁掉，
 * 表现为「明明还选中着，重排条却不见了」。
 */
function SelectionToolbar({ boxes, onRelayout }: { boxes: NodeBounds[]; onRelayout: () => void }) {
  const { t } = useTranslation('tools-images')
  const [tx, ty, zoom] = useStore((store) => store.transform)
  const width = useStore((store) => store.width)
  const height = useStore((store) => store.height)
  const box = boundingBoxOf(boxes)
  const rawLeft = (box.left + box.width / 2) * zoom + tx
  const rawTop = box.top * zoom + ty - SELECTION_PAD - 8
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
      style={{
        left: width
          ? clamp(rawLeft, TOOLBAR_HALF + TOOLBAR_EDGE, width - TOOLBAR_HALF - TOOLBAR_EDGE)
          : rawLeft,
        top: height ? clamp(rawTop, TOOLBAR_MIN_TOP, height - TOOLBAR_EDGE) : rawTop,
      }}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="pointer-events-auto gap-1.5 rounded-full px-3 text-xs shadow-lg"
        onClick={onRelayout}
      >
        <Layers className="size-3.5" />
        {t('ai-image-gen.canvas.relayout')}
      </Button>
    </div>
  )
}
