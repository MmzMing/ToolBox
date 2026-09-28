import {
  createDefaultCustomItem,
  createDefaultEducation,
  createDefaultExperience,
  createDefaultProject,
} from './resume.service'
import { useResumeStore } from './store'

/**
 * 章节级快捷操作：编辑面板顶部的「添加一条 / 删除整章」与左栏、dock 的章节行共用，
 * 三处写的是同一份数据，口径必须一致。
 */

/** 只有条目型章节有"一条"可加：富文本章节只有一块正文，证书附图靠上传而非新建 */
export function isItemListSection(sectionId: string): boolean {
  return (
    sectionId === 'experience' ||
    sectionId === 'education' ||
    sectionId === 'projects' ||
    sectionId.startsWith('custom')
  )
}

/** 往章节末尾追加一条空条目 */
export function addSectionItem(sectionId: string) {
  const state = useResumeStore.getState()
  const resume = state.activeResume
  if (!resume) {
    return
  }

  switch (sectionId) {
    case 'experience':
      state.updateExperienceBatch([...resume.experience, createDefaultExperience()])
      break
    case 'education':
      state.updateEducationBatch([...resume.education, createDefaultEducation()])
      break
    case 'projects':
      state.updateProjectsBatch([...resume.projects, createDefaultProject()])
      break
    default:
      if (sectionId.startsWith('custom')) {
        state.updateCustomData(sectionId, [
          ...(resume.customData[sectionId] ?? []),
          createDefaultCustomItem(''),
        ])
      }
  }
}

/** 删除整章：被删的正在编辑时把焦点落到前一章节，自定义章节连带清掉它的数据 */
export function removeSection(sectionId: string) {
  const state = useResumeStore.getState()
  const resume = state.activeResume
  if (!resume) {
    return
  }

  const index = resume.menuSections.findIndex((section) => section.id === sectionId)
  const remaining = resume.menuSections.filter((section) => section.id !== sectionId)
  const fallback = resume.menuSections[index - 1] ?? remaining[0]

  state.updateMenuSections(remaining)
  if (sectionId.startsWith('custom')) {
    state.removeCustomData(sectionId)
  }
  if (fallback) {
    state.setActiveSection(fallback.id)
  }
}
