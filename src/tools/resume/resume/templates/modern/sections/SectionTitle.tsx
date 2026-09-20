import type { GlobalSettings } from '../../../types'
import { useTemplateContext } from '../../TemplateContext'
import { cn } from '@/lib/utils'

interface SectionTitleProps {
  globalSettings?: GlobalSettings
  type: string
  title?: string
  showTitle?: boolean
  variant?: 'default' | 'sidebar'
}

const SectionTitle = ({
  type,
  title,
  globalSettings,
  showTitle = true,
  variant = 'default',
}: SectionTitleProps) => {
  const templateContext = useTemplateContext()
  const menuSections = templateContext?.menuSections ?? []
  const renderTitle = type === 'custom' ? title : menuSections.find((s) => s.id === type)?.title

  const themeColor = globalSettings?.themeColor
  if (!showTitle) return null

  const isSidebar = variant === 'sidebar'

  return (
    <h3
      className={cn(
        'mb-2 pb-1 font-semibold tracking-wider uppercase',
        isSidebar ? 'border-b border-white/20' : 'border-b',
      )}
      style={{
        fontSize: `${isSidebar ? (globalSettings?.headerSize || 18) - 2 : globalSettings?.headerSize || 18}px`,
        fontWeight: 'bold',
        color: isSidebar ? '#ffffff' : themeColor,
        borderColor: isSidebar ? 'rgba(255,255,255,0.2)' : themeColor,
        marginBottom: isSidebar ? '12px' : `${globalSettings?.paragraphSpacing}px`,
      }}
    >
      {renderTitle}
    </h3>
  )
}

export default SectionTitle
