import type { DefinedTool } from '../define-tool'

import { tool as musicToVideo } from './music-to-video'
import { tool as videoToGif } from './video-to-gif'

export const videoTools: readonly DefinedTool[] = [musicToVideo, videoToGif]
