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
      className="border-b pb-2 font-bold"
      style={{
        fontSize: `${globalSettings?.headerSize || 18}px`,
        color: themeColor,
        borderColor: themeColor,
        marginBottom: `${globalSettings?.paragraphSpacing}px`,
      }}
    >
      {renderTitle}
    </h3>
  )
}

export default SectionTitle
