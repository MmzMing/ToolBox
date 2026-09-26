import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

/** 四列固定栅格，表头与所有行列对齐；操作列用 visibility 占位以免草稿行错位 */
const ROW_GRID = 'grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.4fr)_5.5rem] items-center gap-2'

export interface ListRow {
  readonly id: string
  name: string
  value: string
  enabled: boolean
}

interface KeyValueListProps<R extends ListRow> {
  rows: readonly R[]
  onChange: (rows: R[]) => void
  /** 新增行用的空白模板 */
  blank: () => R
  nameHeader: string
  valueHeader: string
  namePlaceholder: string
  valuePlaceholder: string
  /** 值列换成开关 / 文件标记等自定义控件时传入 */
  renderValue?: (row: R, update: (patch: Partial<R>) => void) => ReactNode
}

function isEmpty(row: ListRow): boolean {
  return row.name === '' && row.value === ''
}

/**
 * 键值行编辑表：启用勾选 + 名称 + 值 + 排序删除，行顺序即生成命令里的顺序。
 * 末尾常驻一行草稿，直接就能敲；失焦且有内容时才落进 rows，所以生成侧永远
 * 不会看到空行（空 name 的行在 buildCurl 里也会被跳过）。
 */
export function KeyValueList<R extends ListRow>({
  rows,
  onChange,
  blank,
  nameHeader,
  valueHeader,
  namePlaceholder,
  valuePlaceholder,
  renderValue,
}: KeyValueListProps<R>) {
  const { t: tr } = useTranslation('tools-development')
  const [draft, setDraft] = useState<R>(blank)

  /** R 只保证包含 name/value/enabled，合并时用一次断言收敛回行类型 */
  const update = (id: string, patch: Partial<ListRow>) => {
    onChange(rows.map((row) => (row.id === id ? ({ ...row, ...patch } as R) : row)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next)
  }

  const commitDraft = () => {
    if (isEmpty(draft)) return
    onChange([...rows, draft])
    setDraft(blank())
  }

  const addRow = () => {
    if (!isEmpty(draft)) {
      onChange([...rows, draft, blank()])
      setDraft(blank())
      return
    }
    onChange([...rows, blank()])
  }

  const renderCells = (row: R, write: (patch: Partial<ListRow>) => void) => (
    <>
      <Checkbox
        checked={row.enabled}
        onCheckedChange={(checked) => write({ enabled: checked === true })}
        aria-label={tr('curl-generator.rows.enable')}
      />
      <Input
        value={row.name}
        placeholder={namePlaceholder}
        onChange={(event) => write({ name: event.target.value })}
        className="min-w-0 font-mono text-xs"
      />
      {renderValue ? (
        renderValue(row, (patch) => write(patch as Partial<ListRow>))
      ) : (
        <Input
          value={row.value}
          placeholder={valuePlaceholder}
          onChange={(event) => write({ value: event.target.value })}
          className="min-w-0 font-mono text-xs"
        />
      )}
    </>
  )

  /** 焦点离开整行才提交；行内两个输入框之间跳转不算离开，否则会落进一半的空行 */
  const commitOnLeave = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    commitDraft()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`${ROW_GRID} text-muted-foreground text-xs`}>
        <span />
        <span>{nameHeader}</span>
        <span>{valueHeader}</span>
        <span className="text-right">{tr('curl-generator.cols.action')}</span>
      </div>

      {rows.map((row, index) => (
        <div key={row.id} className={ROW_GRID}>
          {renderCells(row, (patch) => update(row.id, patch))}
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={tr('curl-generator.rows.moveUp')}
            >
              <ArrowUp size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => move(index, 1)}
              disabled={index === rows.length - 1}
              aria-label={tr('curl-generator.rows.moveDown')}
            >
              <ArrowDown size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
              aria-label={tr('curl-generator.rows.delete')}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      ))}

      <div
        className={`${ROW_GRID} border-border/60 rounded-md border border-dashed py-0.5`}
        onBlur={commitOnLeave}
      >
        {renderCells(draft, (patch) => setDraft({ ...draft, ...patch } as R))}
        <span />
      </div>

      <Button
        variant="outline"
        className="mt-2 h-9 w-full justify-center gap-1.5 border-dashed text-xs"
        onClick={addRow}
      >
        <Plus size={14} />
        {tr('curl-generator.rows.add')}
      </Button>
    </div>
  )
}
