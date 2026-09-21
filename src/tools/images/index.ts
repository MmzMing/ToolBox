import type { DefinedTool } from '../define-tool'

import { tool as qrCode } from './qr-code'
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator'
import { tool as imageCompressor } from './image-compressor'

export const imagesTools: readonly DefinedTool[] = [qrCode, wifiQrCodeGenerator, imageCompressor]
