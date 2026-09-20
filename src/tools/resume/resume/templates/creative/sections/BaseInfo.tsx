import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion } from 'motion/react'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDisplayDate as formatDateString } from '../../../resume.service'
import type { BasicInfo, GlobalSettings } from '../../../types'
import { photoBorderRadiusValue as getBorderRadiusValue } from '../../../resume.service'
import type { ResumeTemplate } from '../../../types'
import SectionWrapper from '../../shared/SectionWrapper'
import {
  getCustomFieldDisplayText,
  getCustomFieldHref,
  shouldShowCustomFieldLabelPrefix,
} from '../../../custom-field'

interface BaseInfoProps {
  basic: BasicInfo | undefined
  globalSettings: GlobalSettings | undefined
  template?: ResumeTemplate
}

/**
 * Creative template BaseInfo — white text, designed for the colored header block.
 */
const BaseInfo = ({ basic = {} as BasicInfo, globalSettings }: BaseInfoProps) => {
  const { t, i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const useIconMode = globalSettings?.useIconMode ?? false
  const layout = basic?.layout || 'left'

  const getIcon = (iconName: string | undefined) => {
    const IconComponent = Icons[iconName as keyof typeof Icons] as React.ElementType
    return IconComponent ? <IconComponent className="mt-[0.2em] h-4 w-4 shrink-0" /> : null
  }

  const getOrderedFields = React.useMemo(() => {
    if (!basic.fieldOrder) {
      return [
        {
          key: 'email',
          value: basic.email,
          icon: basic.icons?.email || 'Mail',
          label: '电子邮箱',
          visible: true,
          custom: false,
        },
      ].filter((item) => Boolean(item.value && item.visible))
    }
    return basic.fieldOrder
      .filter((field) => field.visible !== false && field.key !== 'name' && field.key !== 'title')
      .map((field) => ({
        key: field.key,
        value:
          field.key === 'birthDate' && basic[field.key]
            ? formatDateString(basic[field.key] as string, locale)
            : (basic[field.key] as string),
        icon: basic.icons?.[field.key] || 'User',
        label: field.label,
        visible: field.visible,
        custom: field.custom,
      }))
      .filter((item) => Boolean(item.value))
  }, [basic, locale])

  const allFields = [
    ...getOrderedFields,
    ...(basic.customFields
      ?.filter((field) => field.visible !== false && Boolean(getCustomFieldDisplayText(field)))
      .map((field) => ({
        key: field.id,
        value: getCustomFieldDisplayText(field),
        icon: field.icon,
        label: field.label,
        visible: true,
        custom: true,
        displayLabel: field.displayLabel,
        href: getCustomFieldHref(field),
      })) || []),
  ]

  const nameField = basic.fieldOrder?.find((f) => f.key === 'name') || {
    key: 'name',
    visible: true,
  }
  const titleField = basic.fieldOrder?.find((f) => f.key === 'title') || {
    key: 'title',
    visible: true,
  }

  const PhotoComponent = basic.photo && basic.photoConfig?.visible && (
    <motion.div layout="position">
      <div
        style={{
          width: `${basic.photoConfig?.width || 100}px`,
          height: `${basic.photoConfig?.height || 100}px`,
          borderRadius: getBorderRadiusValue(
            basic.photoConfig || { borderRadius: 'none', customBorderRadius: 0 },
          ),
          overflow: 'hidden',
        }}
      >
        <img
          src={basic.photo}
          alt={`${basic.name}'s photo`}
          className="h-full w-full object-cover"
        />
      </div>
    </motion.div>
  )

  const layoutStyles = {
    left: {
      container: 'flex items-center justify-between gap-6',
      leftContent: 'flex items-center gap-6 shrink-0 min-w-0 max-w-[42%]',
      fields: 'grid flex-1 min-w-0 grid-cols-2 gap-x-6 gap-y-2 justify-start',
      nameTitle: 'text-left min-w-0 max-w-[16rem] flex-1',
    },
    right: {
      container: 'flex items-center justify-between gap-6 flex-row-reverse',
      leftContent:
        'flex flex-row-reverse justify-start items-center gap-6 shrink-0 min-w-0 max-w-[42%]',
      fields: 'grid flex-1 min-w-0 grid-cols-2 gap-x-6 gap-y-2 justify-start',
      nameTitle: 'text-right min-w-0 max-w-[16rem] flex-1',
    },
    center: {
      container: 'flex flex-col items-center gap-3',
      leftContent: 'flex flex-col items-center gap-4',
      fields: 'w-full flex justify-center items-center flex-wrap gap-3',
      nameTitle: 'text-center min-w-0 max-w-full',
    },
  }

  const styles = layoutStyles[layout as keyof typeof layoutStyles] || layoutStyles.left

  return (
    <SectionWrapper sectionId="basic">
      <div className={styles.container}>
        <div className={styles.leftContent}>
          {PhotoComponent}
          <div className={cn('flex flex-col', styles.nameTitle)} style={{ color: '#fff' }}>
            {nameField.visible !== false && basic[nameField.key] && (
              <motion.h1
                layout="position"
                className="font-bold break-normal [overflow-wrap:normal] whitespace-normal"
                style={{ fontSize: '30px', color: '#fff' }}
              >
                {basic[nameField.key] as string}
              </motion.h1>
            )}
            {titleField.visible !== false && basic[titleField.key] && (
              <motion.h2
                layout="position"
                className="break-normal [overflow-wrap:normal] whitespace-normal"
                style={{ fontSize: '18px', color: '#fff' }}
              >
                {basic[titleField.key] as string}
              </motion.h2>
            )}
          </div>
        </div>
        <motion.div
          layout="position"
          className={styles.fields}
          style={{
            fontSize: `${globalSettings?.baseFontSize || 14}px`,
            color: '#fff',
            maxWidth: layout === 'center' ? 'none' : '600px',
          }}
        >
          {allFields.map((item) => {
            const customFieldHref =
              item.custom && 'href' in item && typeof item.href === 'string' ? item.href : null

            return (
              <motion.div
                key={item.key}
                className="text-paper-ink flex min-w-0 items-start"
                style={{ color: '#fff' }}
              >
                {useIconMode ? (
                  <div className="flex min-w-0 items-start gap-1" style={{ color: '#fff' }}>
                    {getIcon(item.icon)}
                    {item.key === 'email' ? (
                      <a
                        href={`mailto:${item.value}`}
                        className="min-w-0 [overflow-wrap:anywhere] underline"
                        style={{ color: '#fff' }}
                      >
                        {item.value}
                      </a>
                    ) : customFieldHref ? (
                      <a
                        href={customFieldHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 [overflow-wrap:anywhere] underline"
                        style={{ color: '#fff' }}
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className="min-w-0 [overflow-wrap:anywhere]" style={{ color: '#fff' }}>
                        {item.value}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex min-w-0 items-start gap-2" style={{ color: '#fff' }}>
                    {!item.custom && (
                      <span className="shrink-0" style={{ color: '#fff' }}>
                        {t(`resume.basicPanel.basicFields.${item.key}`)}:
                      </span>
                    )}
                    {item.custom && shouldShowCustomFieldLabelPrefix(item) && (
                      <span className="shrink-0" style={{ color: '#fff' }}>
                        {item.label}:
                      </span>
                    )}
                    {customFieldHref ? (
                      <a
                        href={customFieldHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 [overflow-wrap:anywhere] underline"
                        suppressHydrationWarning
                        style={{ color: '#fff' }}
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span
                        className="min-w-0 [overflow-wrap:anywhere]"
                        suppressHydrationWarning
                        style={{ color: '#fff' }}
                      >
                        {item.value}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </SectionWrapper>
  )
}

export default BaseInfo
