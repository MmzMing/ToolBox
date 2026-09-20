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
    <div className="relative mb-4 flex w-full items-center justify-center">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t" style={{ borderColor: themeColor, opacity: 0.3 }} />
      </div>
      <h3
        className="relative bg-white px-4 text-center font-bold"
        style={{
          fontSize: `${globalSettings?.headerSize || 20}px`,
          color: themeColor,
        }}
      >
        {renderTitle}
      </h3>
    </div>
  )
}

export default SectionTitle
