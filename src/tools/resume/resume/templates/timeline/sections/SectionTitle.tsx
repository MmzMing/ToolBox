import type { GlobalSettings } from '../../../types'
import { useTemplateContext } from '../../TemplateContext'

interface SectionTitleProps {
  globalSettings?: GlobalSettings
  type: string
  title?: string
  showTitle?: boolean
}

const SectionTitle = ({ type, title, globalSettings, showTitle = true }: SectionTitleProps) => {
  const templateContext = useTemplateContext()
  const menuSections = templateContext?.menuSections ?? []
  const renderTitle = type === 'custom' ? title : menuSections.find((s) => s.id === type)?.title

  const themeColor = globalSettings?.themeColor
  if (!showTitle) return null

  // Timeline SectionTitle is rendered by the template wrapper (renderTimelineItem)
  // This is a minimal fallback for basic section
  return (
    <div
      className="mb-4 text-xl font-bold"
      style={{
        color: themeColor,
        fontSize: `${globalSettings?.headerSize || 20}px`,
      }}
    >
      {renderTitle}
    </div>
  )
}

export default SectionTitle
