let audio: AudioContext | null = null

/** 出图完成的提示音：两个上行短音，不引音频文件也不往用户磁盘上放东西 */
export function playDoneChime() {
  audio ??= new AudioContext()
  void audio.resume()
  const at = audio.currentTime
  for (const [offset, hz] of [
    [0, 659.25],
    [0.13, 880],
  ]) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.0001, at + offset)
    gain.gain.exponentialRampToValueAtTime(0.14, at + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.18)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(at + offset)
    osc.stop(at + offset + 0.2)
  }
}
