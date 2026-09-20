import { resumeFileName } from '../resume.service'
import type { ResumeData } from '../types'
import { downloadText } from './download'

export function downloadResumeJson(resume: ResumeData): void {
  downloadText(JSON.stringify(resume, null, 2), resumeFileName(resume.title), 'application/json')
}
