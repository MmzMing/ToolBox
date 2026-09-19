import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  convertUnit,
  getCategory,
  unitCategories,
  type UnitCategoryId,
} from './unit-converter.service'

/** 单位换算：类别（长度/重量/数据/速度/面积）+ 双单位下拉，实时换算 */
export default function UnitConverter() {
  const { t } = useTranslation('tools-life', { keyPrefix: 'unit-converter' })

  const [categoryId, setCategoryId] = useState<UnitCategoryId>('length')
  const category = getCategory(categoryId)
  const [fromUnit, setFromUnit] = useState('m')
  const [toUnit, setToUnit] = useState('km')
  const [valueInput, setValueInput] = useState('1')

  const switchCategory = (id: UnitCategoryId) => {
    setCategoryId(id)
    const units = getCategory(id).units
    setFromUnit(units[0].symbol)
    setToUnit(units[1]?.symbol ?? units[0].symbol)
  }

  const result = useMemo(() => {
    const value = Number(valueInput)
    if (valueInput.trim() === '' || !Number.isFinite(value)) {
      return ''
    }
    try {
      const converted = convertUnit(categoryId, value, fromUnit, toUnit)
      // 有效数字展示，避免浮点尾巴
      return String(Number(converted.toPrecision(10)))
    } catch {
      return ''
    }
  }, [categoryId, valueInput, fromUnit, toUnit])

  const unitSelect = (value: string, onChange: (value: string) => void, label: string) => (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {category.units.map((unit) => (
            <SelectItem key={unit.symbol} value={unit.symbol}>
              {unit.symbol}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('categoryLabel')}</Label>
        <Select
          value={categoryId}
          onValueChange={(value) => switchCategory(value as UnitCategoryId)}
        >
          <SelectTrigger className="md:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitCategories.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {t(item.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <div className="flex flex-col gap-3">
          {unitSelect(fromUnit, setFromUnit, t('fromUnit'))}
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs">{t('valueLabel')}</Label>
            <Input
              type="number"
              value={valueInput}
              onChange={(event) => setValueInput(event.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="text-muted-foreground hidden pb-2 md:block" aria-hidden="true">
          →
        </div>

        <div className="flex flex-col gap-3">
          {unitSelect(toUnit, setToUnit, t('toUnit'))}
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground text-xs">{t('resultLabel')}</Label>
            <div className="bg-muted/40 rounded-md border px-3 py-2.5 font-mono text-sm">
              {result === '' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  {result} <span className="text-muted-foreground">{toUnit}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
