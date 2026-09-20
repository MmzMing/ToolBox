import type { CustomField } from './types'
import { getProjectLinkHref } from './project-link'

const trim = (value?: string) => value?.trim() || ''

export const getCustomFieldDisplayText = (
  field: Pick<CustomField, 'label' | 'value' | 'displayLabel'>,
) => {
  const label = trim(field.label)
  const value = trim(field.value)

  if (field.displayLabel) {
    return label || value
  }

  return value
}

export const shouldShowCustomFieldLabelPrefix = (
  field: Pick<CustomField, 'label' | 'displayLabel'>,
) => {
  return !field.displayLabel && Boolean(trim(field.label))
}

export const getCustomFieldHref = (field: Pick<CustomField, 'value' | 'displayLabel'>) => {
  if (!field.displayLabel) return null

  return getProjectLinkHref(field.value)
}
