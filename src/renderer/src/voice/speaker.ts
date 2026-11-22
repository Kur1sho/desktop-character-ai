// Speaks replies with the voices built into Windows (free and offline).
// A higher quality neural voice can be added later as an optional download.
import type { VoiceProfile } from '@shared/personas'

const FEMALE_HINTS = ['female', 'zira', 'aria', 'jenny', 'hazel', 'susan', 'ana', 'sonia', 'libby']

/** Picks the best available voice for a profile. Exported for tests. */
export function pickVoice<V extends { name: string; lang: string }>(voices: V[], profile: VoiceProfile): V | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const accent = profile.lang ? english.filter((v) => v.lang.toLowerCase().replace('_', '-') === profile.lang!.toLowerCase()) : []
  const pool = accent.length ? accent : english.length ? english : voices
  for (const want of profile.prefer) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(want.toLowerCase()))
    if (hit) return hit
  }
  const female = (v: V) => FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h))
  return pool.find((v) => (profile.gender === 'female' ? female(v) : !female(v))) ?? pool[0] ?? null
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

/**
 * Speaks text. `onMouth` gets 0..1 values for lip sync while talking.
 * Resolves when speech ends.
 */
export async function speak(text: string, profile: VoiceProfile, onMouth: (open: number) => void): Promise<void> {
  if (!('speechSynthesis' in window) || !text.trim()) return
  speechSynthesis.cancel()
  const voices = await voicesReady()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(voices, profile)
  if (voice) u.voice = voice
  u.pitch = profile.pitch
  u.rate = profile.rate

  // System voices don't expose their audio, so animate the mouth from word timing:
  // open on each word, then close, with a little wobble while talking.
  let talking = false
  let wordAt = 0
  let raf = 0
  const animate = () => {
    if (!talking) return
    const since = performance.now() - wordAt
    const base = Math.max(0, 1 - since / 220)
    const wobble = 0.25 + 0.25 * Math.sin(performance.now() / 55)
    onMouth(Math.min(1, base * 0.8 + wobble * 0.6))
    raf = requestAnimationFrame(animate)
  }

  await new Promise<void>((resolve) => {
    const stop = () => {
      talking = false
      cancelAnimationFrame(raf)
      onMouth(0)
      resolve()
    }
    u.onstart = () => {
      talking = true
      wordAt = performance.now()
      animate()
    }
    u.onboundary = () => (wordAt = performance.now())
    u.onend = stop
    u.onerror = stop
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}
