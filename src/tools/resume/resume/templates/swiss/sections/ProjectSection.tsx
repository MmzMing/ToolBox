import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import * as Icons from 'lucide-react'
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
  const themeColor = globalSettings?.themeColor || '#E31C24'

  return (
    <SectionWrapper
      sectionId="projects"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="projects" globalSettings={globalSettings} showTitle={showTitle} />
      <motion.div
        layout="position"
        className="flex flex-col gap-6"
        style={{ marginTop: `${globalSettings?.paragraphSpacing || 16}px` }}
      >
        <AnimatePresence mode="popLayout">
          {visibleProjects.map((project) => {
            const projectLink = getProjectLinkMeta(project, {
              preferFullUrl: centerSubtitle,
            })

            return (
              <motion.div key={project.id} layout="position" className="group">
                {/* 项目排版头部 */}
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <h4
                      className="font-extrabold tracking-tight text-slate-800"
                      style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                    >
                      {project.name}
                    </h4>
                    {centerSubtitle && (
                      <span
                        className="border-l border-slate-300 pl-3 text-[14px] font-medium text-slate-500"
                        style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 1}px` }}
                      >
                        {project.role}
                      </span>
                    )}

                    {/* 瑞士风格精致小卡片链接 */}
                    {projectLink && (
                      <a
                        href={projectLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100"
                        title={projectLink.title}
                      >
                        <Icons.ExternalLink
                          className="h-3 w-3 shrink-0"
                          style={{ color: themeColor }}
                        />
                        <span>{projectLink.label}</span>
                      </a>
                    )}
                  </div>
                  <div className="ml-auto shrink-0 self-center rounded border border-slate-100/80 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-400">
                    {formatDateString(project.date, locale)}
                  </div>
                </div>

                {/* 非居中模式下的角色展示 */}
                {project.role && !centerSubtitle && (
                  <div
                    className="mt-1 font-semibold tracking-wider text-slate-500 uppercase"
                    style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 2}px` }}
                  >
                    {project.role}
                  </div>
                )}

                {/* 项目描述内容 */}
                {project.description && (
                  <motion.div layout="position" className="relative mt-2.5 pl-4">
                    <div
                      className="absolute top-1 bottom-1 left-0 w-[1.5px] opacity-20 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: themeColor }}
                    />
                    <div
                      className="prose prose-sm prose-p:my-1 max-w-none text-slate-600 marker:text-slate-400 [&>ul]:mt-1 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                      style={{
                        fontSize: `${globalSettings?.baseFontSize || 13}px`,
                        lineHeight: globalSettings?.lineHeight || 1.6,
                      }}
                      dangerouslySetInnerHTML={{
                        __html: normalizeRichTextContent(project.description),
                      }}
                    />
                  </motion.div>
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
