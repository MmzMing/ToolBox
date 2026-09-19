import { afterEach, describe, expect, it, vi } from 'vitest'

import { pickRecordingMime } from '@/tools/images/camera-recorder/camera-recorder.service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickRecordingMime', () => {
  it('returns empty string when MediaRecorder is unavailable (node environment)', () => {
    expect(pickRecordingMime()).toBe('')
  })

  it('prefers vp9 when supported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime.startsWith('video/webm'),
    })
    expect(pickRecordingMime()).toBe('video/webm;codecs=vp9')
  })

  it('falls back to plain webm when vp9 is unsupported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime === 'video/webm',
    })
    expect(pickRecordingMime()).toBe('video/webm')
  })

  it('returns empty string when no candidate is supported', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false })
    expect(pickRecordingMime()).toBe('')
  })
})
