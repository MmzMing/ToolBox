import type { DefinedTool } from '../define-tool'

import { tool as qrCodeGenerator } from './qr-code-generator'
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator'
import { tool as cameraRecorder } from './camera-recorder'
import { tool as imageCompressor } from './image-compressor'

export const imagesTools: readonly DefinedTool[] = [
  qrCodeGenerator,
  wifiQrCodeGenerator,
  cameraRecorder,
  imageCompressor,
]
