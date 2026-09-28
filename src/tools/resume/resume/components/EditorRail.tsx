import { Reorder, useDragControls } from 'motion/react'
import { GripVertical, LayoutList, LayoutTemplate, Palette, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { AddSectionButton } from './AddSectionButton'
import { SectionIcon } from './SectionIcon'
import { STYLE_GROUPS, styleAnchorId } from './style-groups'
import { useResumeStore } from '../store'
import type { RailMode } from '../editor-ui'
import type { MenuSection } from '../types'

type ModeButtonProps = {
  icon: typeof LayoutList
  label: string
  active: boolean
  onClick: () => void
}

const railItemBase =
  'flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-4 transition-colors'

function RailButton({ icon: Icon, label, active, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        railItemBase,
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )
}

type SectionItemProps = {
  item: MenuSection
  active: boolean
  /** 基本信息钉在首位：不参与拖拽 */
  pinned?: boolean
  /** 选中之后的附加动作：编辑栏收起时由页面把它展开 */
  onSelected?: () => void
}

function RailSectionItem({ item, active, pinned = false, onSelected }: SectionItemProps) {
  const { t } = useTranslation('tools-resume')
  const dragControls = useDragControls()
  const setActiveSection = useResumeStore((state) => state.setActiveSection)

  const select = (
    <button
      type="button"
      onClick={() => {
        setActiveSection(item.id)
        onSelected?.()
      }}
      aria-pressed={active}
      title={item.enabled === false ? t('resume.layout.hide') : item.title}
      className={cn(
        railItemBase,
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        item.enabled === false && 'opacity-50',
      )}
    >
      <SectionIcon name={item.icon} className="size-4 shrink-0" />
      <span className="line-clamp-2 w-full text-center break-all">{item.title}</span>
    </button>
  )

  if (pinned) {
    return <div className="flex flex-col">{select}</div>
  }

  return (
    <Reorder.Item
      id={item.id}
      value={item}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.05 }}
      className="flex list-none flex-col items-stretch gap-0.5"
    >
      <span
        aria-label={t('resume.layout.drag')}
        onPointerDown={(event) => dragControls.start(event)}
        className="text-muted-foreground/60 hover:text-muted-foreground flex h-4 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      {select}
    </Reorder.Item>
  )
}

/** 内容层：章节列表，点选切章节、拖圆点排序 */
function RailSections({
  activeSection,
  onSectionSelect,
}: {
  activeSection: string
  onSectionSelect?: () => void
}) {
  const { t } = useTranslation('tools-resume')
  const menuSections = useResumeStore((state) => state.activeResume?.menuSections) ?? []
  const reorderSections = useResumeStore((state) => state.reorderSections)
  const basicSection = menuSections.find((section) => section.id === 'basic')
  const draggableSections = menuSections.filter((section) => section.id !== 'basic')

  return (
    <div className="flex flex-col gap-1">
      {basicSection && (
        <RailSectionItem
          item={basicSection}
          active={activeSection === basicSection.id}
          pinned
          onSelected={onSectionSelect}
        />
      )}

      <Reorder.Group
        as="div"
        axis="y"
        values={draggableSections}
        onReorder={reorderSections}
        className="flex flex-col gap-1"
      >
        {draggableSections.map((item) => (
          <RailSectionItem
            key={item.id}
            item={item}
            active={activeSection === item.id}
            onSelected={onSectionSelect}
          />
        ))}
      </Reorder.Group>

      <AddSectionButton side="right">
        <button
          type="button"
          className={cn(
            railItemBase,
            'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground border border-dashed',
          )}
        >
          <Plus className="size-4 shrink-0" />
          <span className="w-full text-center">{t('resume.sidePanel.layout.addSection')}</span>
        </button>
      </AddSectionButton>
    </div>
  )
}

/** 样式层：四个锚点，点了把编辑区对应分组滚到顶 */
function RailStyleLinks() {
  const { t } = useTranslation('tools-resume')

  return (
    <div className="flex flex-col gap-1">
      {STYLE_GROUPS.map(({ key, labelKey, icon }) => (
        <RailButton
          key={key}
          icon={icon}
          label={t(labelKey)}
          active={false}
          onClick={() =>
            document
              .getElementById(styleAnchorId(key))
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      ))}
    </div>
  )
}

type EditorRailProps = {
  mode: RailMode
  onModeChange: (mode: RailMode) => void
  activeSection: string
  onSectionSelect?: () => void
}

/**
 * 编辑器左侧操作栏，两层：
 * 第一层是内容 / 样式 / 模板三种工作区，分界线下方随第一层切换——
 * 内容给章节列表，样式给分组锚点，模板没有第二层（模板九宫格直接铺在编辑区）。
 */
export function EditorRail({
  mode,
  onModeChange,
  activeSection,
  onSectionSelect,
}: EditorRailProps) {
  const { t } = useTranslation('tools-resume')

  const modes: Array<{ key: RailMode; icon: typeof LayoutList; label: string }> = [
    { key: 'content', icon: LayoutList, label: t('resume.rail.content') },
    { key: 'style', icon: Palette, label: t('resume.rail.style') },
    { key: 'template', icon: LayoutTemplate, label: t('resume.rail.template') },
  ]

  return (
    <aside className="border-border bg-card flex w-20 shrink-0 flex-col border-r">
      <div className="flex flex-col gap-1 p-2">
        {modes.map(({ key, icon, label }) => (
          <RailButton
            key={key}
            icon={icon}
            label={label}
            active={mode === key}
            onClick={() => onModeChange(key)}
          />
        ))}
      </div>

      <div className="bg-border mx-2 h-px" />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {mode === 'content' && (
          <RailSections activeSection={activeSection} onSectionSelect={onSectionSelect} />
        )}
        {mode === 'style' && <RailStyleLinks />}
      </div>
    </aside>
  )
}
