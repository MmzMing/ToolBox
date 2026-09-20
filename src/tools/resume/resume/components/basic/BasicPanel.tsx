import { AnimatePresence, Reorder, motion } from 'motion/react'
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'

import { Button } from '@/components/ui/button'
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

  const writeFields = (next: BasicField[]) => updateBasicInfo({ fieldOrder: next })
  const writeCustomFields = (next: CustomField[]) => updateBasicInfo({ customFields: next })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t('resume.basicPanel.layout')}</h2>
        <AlignSelector
          value={basic.layout ?? 'left'}
          onChange={(layout) => updateBasicInfo({ layout })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t('resume.basicPanel.profile')}</h2>

        <div className="border-border bg-card rounded-xl border p-3">
          <PhotoSelector />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="px-1 text-sm font-medium">{t('resume.basicPanel.basicField')}</h3>
          <Reorder.Group
            as="div"
            axis="y"
            values={fields}
            onReorder={writeFields}
            className="flex flex-col gap-3"
          >
            {fields.map((field) => {
              const fixed = isFixedBasicField(field)
              return (
                <Reorder.Item
                  key={field.id}
                  id={field.id}
                  value={field}
                  dragListener={!fixed}
                  as="div"
                  className="group list-none"
                >
                  <div
                    className={cn(
                      'bg-card flex items-center gap-3 rounded-lg p-3 transition-opacity',
                      !field.visible && 'opacity-60',
                    )}
                  >
                    {!fixed && (
                      <GripVertical className="text-muted-foreground size-5 shrink-0 cursor-grab touch-none active:cursor-grabbing" />
                    )}

                    {!fixed && (
                      <IconSelector
                        value={basic.icons?.[field.key]}
                        onChange={(icon) =>
                          updateBasicInfo({ icons: { ...basic.icons, [field.key]: icon } })
                        }
                      />
                    )}

                    <span className="w-20 shrink-0 text-sm font-medium">
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

                    {!fixed && (
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
                    )}
                  </div>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="px-1 text-sm font-medium">{t('resume.basicPanel.customField')}</h3>
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
                      <span className="text-muted-foreground text-xs">
                        {t('resume.basicPanel.displayLabel')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          field.visible ? t('resume.layout.hide') : t('resume.layout.show')
                        }
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
        </div>
      </section>
    </div>
  )
}
