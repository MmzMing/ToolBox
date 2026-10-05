import type { DefinedTool } from '../define-tool'

import { tool as aiImageGen } from './ai-image-gen'
import { tool as gifBgRemover } from './gif-bg-remover'
import { tool as gifCompressor } from './gif-compressor'
import { tool as gifEditor } from './gif-editor'
import { tool as gifMaker } from './gif-maker'
import { tool as imageStack } from './image-stack'
import { tool as imageToBeads } from './image-to-beads'
import { tool as qrCode } from './qr-code'
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator'
import { tool as imageCompressor } from './image-compressor'

export const imagesTools: readonly DefinedTool[] = [
  qrCode,
  wifiQrCodeGenerator,
  imageCompressor,
  gifCompressor,
  gifMaker,
  gifEditor,
  gifBgRemover,
  imageStack,
  imageToBeads,
  aiImageGen,
]
