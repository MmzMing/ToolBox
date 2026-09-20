import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import type { Project, GlobalSettings } from '../../../types'
import { normalizeRichTextContent } from '../../../rich-text'
import { formatDisplayDate as formatDateString } from '../../../resume.service'
import { getProjectLinkMeta } from '../../../project-link'

interface ProjectSectionProps {
  projects: Project[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const ProjectSection: React.FC<ProjectSectionProps> = ({
  projects,
  globalSettings,
  showTitle = true,
}) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleProjects = projects?.filter((p) => p.visible)
  const centerSubtitle = globalSettings?.centerSubtitle
  const flexLayout = globalSettings?.flexibleHeaderLayout

  return (
    <SectionWrapper
      sectionId="projects"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="projects" globalSettings={globalSettings} showTitle={showTitle} />
      <motion.div layout="position">
        <AnimatePresence mode="popLayout">
          {visibleProjects.map((project) => {
            const projectLink = getProjectLinkMeta(project, {
              preferFullUrl: centerSubtitle,
            })

            return (
              <motion.div
                key={project.id}
                style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
              >
                <motion.div className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 ${flexLayout ? '' : 'flex-[1.5]'}`}>
                    <h3
                      className="font-bold"
                      style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                    >
                      {project.name}
                    </h3>
                  </div>
                  {projectLink && !centerSubtitle && (
                    <a
                      href={projectLink.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`underline ${flexLayout ? '' : 'flex-1'}`}
                      title={projectLink.title}
                      style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                    >
                      {projectLink.label}
                    </a>
                  )}
                  {!projectLink && !centerSubtitle && !flexLayout && <div className="flex-1" />}
                  {centerSubtitle && (
                    <motion.div
                      layout="position"
                      className={`text-paper-muted ${flexLayout ? 'ml-[16px]' : 'flex-1'}`}
                      style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                    >
                      {project.role}
                    </motion.div>
                  )}
                  <div
                    className={`text-paper-muted shrink-0 ${flexLayout ? 'ml-auto' : 'flex-1 text-right'}`}
                    style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                  >
                    {formatDateString(project.date, locale)}
                  </div>
                </motion.div>
                {project.role && !centerSubtitle && (
                  <motion.div
                    layout="position"
                    className="text-paper-muted"
                    style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                  >
                    {project.role}
                  </motion.div>
                )}
                {projectLink && centerSubtitle && (
                  <a
                    href={projectLink.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    title={projectLink.title}
                    style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                  >
                    {projectLink.label}
                  </a>
                )}
                {project.description && (
                  <motion.div
                    layout="position"
                    className="text-paper-ink mt-1"
                    style={{
                      fontSize: `${globalSettings?.baseFontSize || 14}px`,
                      lineHeight: globalSettings?.lineHeight || 1.6,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: normalizeRichTextContent(project.description),
                    }}
                  />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </motion.div>
    </SectionWrapper>
  )
}

export default ProjectSection
