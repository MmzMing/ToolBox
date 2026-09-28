import { AnimatePresence, Reorder, motion } from 'motion/react'
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { DEFAULT_FIELD_ORDER } from '../../constants'
import { isFixedBasicField } from '../../resume.service'
import { useResumeStore } from '../../store'
import type { BasicField, CustomField } from '../../types'
import { AlignSelector } from './AlignSelector'
import { PhotoSelector } from './PhotoSelector'
import { Field } from '../Field'
import { IconSelector } from '../IconSelector'

/**
 * 基本信息面板：纸面布局、头像、基础字段与自定义字段。
 *
 * 字段顺序与显隐直接写回 store，不在本地留镜像——旧实现用 useState + 两个 ref
 * 复刻了一份数据，切换简历时会读到上一份的残留。
 */
export function BasicPanel() {
  const { t } = useTranslation('tools-resume')
  const basic = useResumeStore((state) => state.activeResume?.basic)
  const updateBasicInfo = useResumeStore((state) => state.updateBasicInfo)

  if (!basic) {
    return null
  }

  const fields: BasicField[] = basic.fieldOrder?.length ? basic.fieldOrder : DEFAULT_FIELD_ORDER
  const customFields = basic.customFields ?? []
  // 姓名与职位在头像那一排就是编辑入口，字段列表里不再重复一份
  //（纸面渲染同样把它们排除在字段循环外）；名单仍留在 fieldOrder 里，写回时原样带着
  const orderedFields = fields.filter((field) => !isFixedBasicField(field))

  const writeFields = (next: BasicField[]) => updateBasicInfo({ fieldOrder: next })
  const reorderFields = (next: BasicField[]) =>
    writeFields([...fields.filter(isFixedBasicField), ...next])
  const writeCustomFields = (next: CustomField[]) => updateBasicInfo({ customFields: next })

  return (
    <div className="@container flex flex-col gap-6">
      {/* 纸面抬头：左侧头像，右侧布局 / 姓名 / 职位三层；窄到放不下时整块换行 */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <PhotoSelector />

        <div className="grid min-w-72 flex-1 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {t('resume.basicPanel.layout')}
          </h2>
          <AlignSelector
            value={basic.layout ?? 'left'}
            onChange={(layout) => updateBasicInfo({ layout })}
          />

          <Label htmlFor="basic-name" className="text-muted-foreground text-sm font-medium">
            {t('resume.basicPanel.basicFields.name')}
          </Label>
          <Input
            id="basic-name"
            value={basic.name}
            placeholder={t('resume.basicPanel.basicFields.name')}
            onChange={(event) => updateBasicInfo({ name: event.target.value })}
          />

          <Label htmlFor="basic-title" className="text-muted-foreground text-sm font-medium">
            {t('resume.basicPanel.basicFields.title')}
          </Label>
          <Input
            id="basic-title"
            value={basic.title}
            placeholder={t('resume.basicPanel.basicFields.title')}
            onChange={(event) => updateBasicInfo({ title: event.target.value })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-medium">{t('resume.basicPanel.basicField')}</h2>
        <Reorder.Group
          as="div"
          axis="y"
          values={orderedFields}
          onReorder={reorderFields}
          className="flex flex-col gap-3"
        >
          {orderedFields.map((field) => {
            return (
              <Reorder.Item
                key={field.id}
                id={field.id}
                value={field}
                as="div"
                className="group list-none"
              >
                <div
                  className={cn(
                    // 与自定义字段行同一套卡片样式：带边框的圆角块
                    'bg-card border-border flex items-center gap-2 rounded-xl border p-3 transition-opacity',
                    !field.visible && 'opacity-60',
                  )}
                >
                  <GripVertical className="text-muted-foreground size-5 shrink-0 cursor-grab touch-none active:cursor-grabbing" />

                  <IconSelector
                    value={basic.icons?.[field.key]}
                    onChange={(icon) =>
                      updateBasicInfo({ icons: { ...basic.icons, [field.key]: icon } })
                    }
                  />

                  {/* 面板拉窄时把字段名让给输入框：名字在 placeholder 里已经有了 */}
                  <span className="w-20 shrink-0 text-sm font-medium @max-[24rem]:hidden">
                    {t(`resume.basicPanel.basicFields.${field.key}`)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Field
                      type={field.type}
                      value={String(basic[field.key] ?? '')}
                      placeholder={t(`resume.basicPanel.basicFields.${field.key}`)}
                      onChange={(value) => updateBasicInfo({ [field.key]: value })}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={field.visible ? t('resume.layout.hide') : t('resume.layout.show')}
                    onClick={() =>
                      writeFields(
                        fields.map((each) =>
                          each.id === field.id ? { ...each, visible: !each.visible } : each,
                        ),
                      )
                    }
                  >
                    {field.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={t('resume.basicPanel.deleteField')}
                    onClick={() => writeFields(fields.filter((each) => each.id !== field.id))}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                </div>
              </Reorder.Item>
            )
          })}
        </Reorder.Group>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-medium">{t('resume.basicPanel.customField')}</h2>
        <AnimatePresence mode="popLayout">
          <Reorder.Group
            as="div"
            axis="y"
            values={customFields}
            onReorder={writeCustomFields}
            className="flex flex-col gap-3"
          >
            {customFields.map((field) => (
              <Reorder.Item
                key={field.id}
                id={field.id}
                value={field}
                as="div"
                className="group list-none"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'bg-card border-border grid grid-cols-[auto_auto_1fr_1fr_auto_auto] items-center gap-2 rounded-xl border p-3',
                    !field.visible && 'opacity-60',
                  )}
                >
                  <GripVertical className="text-muted-foreground size-4 cursor-grab touch-none active:cursor-grabbing" />
                  <IconSelector
                    value={field.icon}
                    onChange={(icon) =>
                      writeCustomFields(
                        customFields.map((each) =>
                          each.id === field.id ? { ...each, icon } : each,
                        ),
                      )
                    }
                  />
                  <Field
                    value={field.label}
                    placeholder={t('resume.basicPanel.customLabelPlaceholder')}
                    onChange={(value) =>
                      writeCustomFields(
                        customFields.map((each) =>
                          each.id === field.id ? { ...each, label: value } : each,
                        ),
                      )
                    }
                  />
                  <Field
                    value={field.value}
                    placeholder={t('resume.basicPanel.customValuePlaceholder')}
                    onChange={(value) =>
                      writeCustomFields(
                        customFields.map((each) =>
                          each.id === field.id ? { ...each, value } : each,
                        ),
                      )
                    }
                  />
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Switch
                      checked={field.displayLabel ?? false}
                      onCheckedChange={(checked) =>
                        writeCustomFields(
                          customFields.map((each) =>
                            each.id === field.id ? { ...each, displayLabel: checked } : each,
                          ),
                        )
                      }
                    />
                    <span className="text-muted-foreground text-xs @max-[26rem]:hidden">
                      {t('resume.basicPanel.displayLabel')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={field.visible ? t('resume.layout.hide') : t('resume.layout.show')}
                      onClick={() =>
                        writeCustomFields(
                          customFields.map((each) =>
                            each.id === field.id ? { ...each, visible: !each.visible } : each,
                          ),
                        )
                      }
                    >
                      {field.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('resume.basicPanel.deleteField')}
                      onClick={() =>
                        writeCustomFields(customFields.filter((each) => each.id !== field.id))
                      }
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </div>
                </motion.div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </AnimatePresence>

        <Button
          type="button"
          className="w-full gap-1.5"
          onClick={() =>
            writeCustomFields([
              ...customFields,
              {
                id: uuidv4(),
                label: '',
                value: '',
                icon: 'User',
                visible: true,
                displayLabel: false,
              },
            ])
          }
        >
          <Plus className="size-4" />
          {t('resume.basicPanel.addCustomField')}
        </Button>
      </section>
    </div>
  )
}
