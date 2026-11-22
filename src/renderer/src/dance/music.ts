// Hears what the PC is playing (Spotify, YouTube, games) using Windows' audio
// loopback, and turns it into a beat for dancing. The sound is only measured,
// on this PC: it isn't recorded, kept or sent anywhere.
import { BeatTracker, type BeatState } from './beat'

export interface MusicListener {
  /** Call every animation frame. */
  read(nowMs: number): BeatState
  stop(): void
}

export async function listenToMusic(): Promise<MusicListener> {
  // The main process answers this with the system audio straight away (no picker).
  const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
  // Only the sound is needed; drop the screen video at once.
  stream.getVideoTracks().forEach((t) => t.stop())
  if (stream.getAudioTracks().length === 0) {
    throw new Error("I can't hear your PC's sound on this system.")
  }
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0
  source.connect(analyser) // measured only, not played back
  const bins = new Float32Array(analyser.frequencyBinCount)
  const hz = ctx.sampleRate / analyser.fftSize
  const lo = Math.max(1, Math.floor(40 / hz))
  const hi = Math.max(lo + 1, Math.ceil(150 / hz))
  const tracker = new BeatTracker()

  return {
    read(nowMs) {
      analyser.getFloatFrequencyData(bins)
      let sum = 0
      for (let i = lo; i <= hi; i++) sum += Math.pow(10, bins[i] / 20) // dB to amplitude
      return tracker.push(sum / (hi - lo + 1), nowMs)
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop())
      source.disconnect()
      void ctx.close()
    }
  }
}
