import type { GlobalSettings } from '../../../types'
import { useTemplateContext } from '../../TemplateContext'

interface SectionTitleProps {
  type: string
  title?: string
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const SectionTitle = ({ type, title, globalSettings, showTitle = true }: SectionTitleProps) => {
  const templateContext = useTemplateContext()
  const menuSections = templateContext?.menuSections ?? []
  const renderTitle = type === 'custom' ? title : menuSections.find((s) => s.id === type)?.title

  if (!showTitle) return null

  return (
    <div className="mb-6 w-full shrink-0">
      <h3
        className="font-bold tracking-[0.2em] uppercase"
        style={{
          fontSize: `${globalSettings?.headerSize || 18}px`,
          color: globalSettings?.themeColor || '#8e8e8e',
          marginBottom: `${globalSettings?.paragraphSpacing || 16}px`,
        }}
      >
        {renderTitle}
      </h3>
    </div>
  )
}

export default SectionTitle
