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
    <h3
      className="mb-2 pb-1 font-bold tracking-widest uppercase"
      style={{
        fontSize: `${globalSettings?.headerSize || 16}px`,
        color: themeColor,
        marginBottom: `${globalSettings?.paragraphSpacing}px`,
      }}
    >
      {renderTitle}
    </h3>
  )
}

export default SectionTitle
