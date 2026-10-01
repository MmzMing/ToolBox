import { optimizeGif } from '@/modules/gif/optimize'
import { ImageBase, type ProcessOutput } from './image-base'

export class GifImage extends ImageBase {
  async compress(): Promise<ProcessOutput> {
    const { width, height, x, y } = this.getOutputDimension()
    const resizeMethod = this.option.resize.method
    const isCrop =
      resizeMethod === 'presetCrop' ||
      resizeMethod === 'setCropRatio' ||
      resizeMethod === 'setCropSize'

    const blob = await optimizeGif(await this.info.blob.arrayBuffer(), {
      optimizeLevel: 3,
      maxColors: this.option.gif.colors,
      dither: this.option.gif.dithering,
      ...(isCrop
        ? { crop: { x, y, width, height } }
        : width !== this.info.width || height !== this.info.height
          ? { resize: { width, height } }
          : {}),
    })

    return {
      width,
      height,
      blob,
      src: URL.createObjectURL(blob),
    }
  }

  async preview(): Promise<ProcessOutput> {
    const { width, height } = this.getPreviewDimension()
    const bitmap = await createImageBitmap(this.info.blob)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: this.info.blob.type })
    return {
      width,
      height,
      blob,
      src: URL.createObjectURL(blob),
    }
  }
}
