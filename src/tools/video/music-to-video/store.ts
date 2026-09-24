/**
 * 项目设置的持久化状态。
 *
 * 只存"可复现的参数"（歌词、风格、滑块、输出设置）；音频文件与分析结果
 * 是运行期数据，不入库。所有回灌数据都过 normalizeProject 校验（AGENTS.md §8）。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Project } from './engine/types'
import { defaultProject, normalizeProject } from './music-to-video.service'

interface MusicVideoState {
  project: Project
  /** 局部覆盖项目设置（歌词、滑块、输出参数等都走这里） */
  patch: (part: Partial<Project>) => void
  /** 覆盖某个 fx 滑块 */
  patchFx: (part: Partial<Project['fx']>) => void
  /** 覆盖某一行的手工指定（布局/入场/锁定…） */
  patchOverride: (line: number, part: Partial<Project['overrides'][number]>) => void
  reset: () => void
}

export const useMusicVideoStore = create<MusicVideoState>()(
  persist(
    (set) => ({
      project: defaultProject(),
      patch: (part) => set((s) => ({ project: normalizeProject({ ...s.project, ...part }) })),
      patchFx: (part) =>
        set((s) => ({
          project: normalizeProject({ ...s.project, fx: { ...s.project.fx, ...part } }),
        })),
      patchOverride: (line, part) =>
        set((s) => ({
          project: normalizeProject({
            ...s.project,
            overrides: {
              ...s.project.overrides,
              [line]: { ...s.project.overrides[line], ...part },
            },
          }),
        })),
      reset: () => set({ project: defaultProject() }),
    }),
    {
      name: 'toolbox.music-to-video.v1',
      version: 1,
      /** 老版本或手工改坏的数据：只认 project 字段，其余全部回退默认 */
      migrate: (state, version) => {
        if (version !== 1 || !state || typeof state !== 'object')
          return { project: defaultProject() }
        const raw = (state as { project?: unknown }).project
        return { project: normalizeProject(raw) }
      },
    },
  ),
)
