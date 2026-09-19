import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Download, Square, Video, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { pickRecordingMime } from './camera-recorder.service'

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

export default function CameraRecorder() {
  const { t } = useTranslation('tools-images')

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [recordingUrl, setRecordingUrl] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isRecorderSupported = typeof MediaRecorder !== 'undefined'

  // 切换/卸载时停止全部轨道，释放摄像头
  useEffect(() => {
    return () => {
      for (const track of stream?.getTracks() ?? []) {
        track.stop()
      }
    }
  }, [stream])

  // 卸载时回收录制对象 URL
  useEffect(() => {
    return () => {
      if (recordingUrl !== '') {
        URL.revokeObjectURL(recordingUrl)
      }
    }
  }, [recordingUrl])

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const handleStart = async () => {
    setError(null)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(mediaStream)
    } catch {
      setError(t('camera-recorder.permissionError'))
    }
  }

  const handleStop = () => {
    if (isRecording) {
      recorderRef.current?.stop()
      setIsRecording(false)
    }
    for (const track of stream?.getTracks() ?? []) {
      track.stop()
    }
    recorderRef.current = null
    setStream(null)
  }

  const handleTakePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) {
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    setPhotoDataUrl(dataUrl)
    downloadUrl(dataUrl, `photo-${Date.now()}.png`)
  }

  const handleToggleRecording = () => {
    if (isRecording) {
      recorderRef.current?.stop()
      setIsRecording(false)
      return
    }
    if (!stream) {
      return
    }
    const mimeType = pickRecordingMime()
    const recorder = new MediaRecorder(stream, mimeType === '' ? undefined : { mimeType })
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onstop = () => {
      setRecordingUrl((previous) => {
        if (previous !== '') {
          URL.revokeObjectURL(previous)
        }
        return URL.createObjectURL(new Blob(chunksRef.current, { type: mimeType || 'video/webm' }))
      })
    }
    recorder.start()
    recorderRef.current = recorder
    setIsRecording(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {stream ? (
          <>
            <Button variant="outline" onClick={handleStop}>
              <X data-icon="inline-start" />
              {t('camera-recorder.stop')}
            </Button>
            <Button onClick={handleTakePhoto} disabled={isRecording}>
              <Camera data-icon="inline-start" />
              {t('camera-recorder.takePhoto')}
            </Button>
            <Button
              variant={isRecording ? 'destructive' : 'secondary'}
              onClick={handleToggleRecording}
              disabled={!isRecorderSupported}
            >
              {isRecording ? (
                <>
                  <Square data-icon="inline-start" />
                  {t('camera-recorder.stopRecording')}
                </>
              ) : (
                <>
                  <Circle data-icon="inline-start" />
                  {t('camera-recorder.startRecording')}
                </>
              )}
            </Button>
          </>
        ) : (
          <Button onClick={() => void handleStart()}>
            <Video data-icon="inline-start" />
            {t('camera-recorder.start')}
          </Button>
        )}
      </div>

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="max-h-96 w-full max-w-2xl rounded-lg border bg-black"
        />
      ) : (
        <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm">
          {t('camera-recorder.previewLabel')}
        </div>
      )}

      {!isRecorderSupported && (
        <Alert variant="destructive">
          <AlertDescription>{t('camera-recorder.recordingUnsupported')}</AlertDescription>
        </Alert>
      )}

      {photoDataUrl !== '' && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('camera-recorder.photoLabel')}</h2>
          <div className="flex items-start gap-3">
            <img src={photoDataUrl} alt="Captured photo" className="max-h-48 rounded-lg border" />
            <Button
              variant="outline"
              onClick={() => downloadUrl(photoDataUrl, `photo-${Date.now()}.png`)}
            >
              <Download data-icon="inline-start" />
              {t('camera-recorder.downloadPhoto')}
            </Button>
          </div>
        </div>
      )}

      {recordingUrl !== '' && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('camera-recorder.recordingLabel')}</h2>
          <div className="flex items-start gap-3">
            <video src={recordingUrl} controls className="max-h-48 rounded-lg border" />
            <Button
              variant="outline"
              onClick={() => downloadUrl(recordingUrl, `recording-${Date.now()}.webm`)}
            >
              <Download data-icon="inline-start" />
              {t('camera-recorder.downloadRecording')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
