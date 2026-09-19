import type { DefinedTool } from '../define-tool'

import { tool as qrCodeGenerator } from './qr-code-generator'
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator'
import { tool as svgPlaceholderGenerator } from './svg-placeholder-generator'
import { tool as cameraRecorder } from './camera-recorder'

export const imagesTools: readonly DefinedTool[] = [
  qrCodeGenerator,
  wifiQrCodeGenerator,
  svgPlaceholderGenerator,
  cameraRecorder,
]
