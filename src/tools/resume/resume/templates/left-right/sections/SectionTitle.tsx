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

  return (
    <div className="relative">
      <div className="absolute inset-0" style={{ backgroundColor: themeColor, opacity: 0.1 }} />
      <h3
        className="relative flex items-center py-1 pl-4 font-bold"
        style={{
          fontSize: `${globalSettings?.headerSize || 18}px`,
          color: themeColor,
          borderLeft: `3px solid ${themeColor}`,
          marginBottom: `${globalSettings?.paragraphSpacing}px`,
        }}
      >
        {renderTitle}
      </h3>
    </div>
  )
}

export default SectionTitle
