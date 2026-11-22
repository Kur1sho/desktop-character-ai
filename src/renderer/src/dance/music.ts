// Hears what the PC is playing (Spotify, YouTube, games) using Windows' audio
// loopback, and turns it into a beat for dancing. The sound is only measured,
// on this PC: it isn't recorded, kept or sent anywhere.
import { BeatTracker, type BeatState } from './beat'

export interface MusicFrame extends BeatState {
  /** How bright the sound is (spectral centroid, Hz): high for energetic, treble-heavy music. */
  centroid: number
  /** Any drum hit on this frame, hi-hats and snares included (for how busy the music is). */
  hit: boolean
}

export interface MusicListener {
  /** Call every animation frame. */
  read(nowMs: number): MusicFrame
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
  // A second tracker on the change across the whole spectrum ("spectral flux")
  // hears every hit, not just the kick, so busy songs are known to be busy.
  const hits = new BeatTracker()
  const prev = new Float32Array(analyser.frequencyBinCount)

  return {
    read(nowMs) {
      analyser.getFloatFrequencyData(bins)
      let bass = 0
      let weighted = 0
      let total = 0
      let flux = 0
      for (let i = 1; i < bins.length; i++) {
        const amp = Math.pow(10, bins[i] / 20) // dB to amplitude
        if (i >= lo && i <= hi) bass += amp
        weighted += amp * i * hz
        total += amp
        if (amp > prev[i]) flux += amp - prev[i]
        prev[i] = amp
      }
      const state = tracker.push(bass / (hi - lo + 1), nowMs)
      const hit = hits.push(total > 0 ? flux / bins.length : 0, nowMs).onset
      return { ...state, centroid: total > 0 ? weighted / total : 0, hit }
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop())
      source.disconnect()
      void ctx.close()
    }
  }
}
