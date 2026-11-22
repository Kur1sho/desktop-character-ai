// One shared microphone stream. The wake word keeps it open, so when it hands
// over to command listening there is no delay waiting for the mic to start.

let stream: Promise<MediaStream> | null = null
let users = 0

export function acquireMic(): Promise<MediaStream> {
  users++
  if (!stream) {
    stream = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    stream.catch(() => (stream = null))
  }
  return stream.catch((err) => {
    users = Math.max(0, users - 1)
    throw err
  })
}

export function releaseMic(): void {
  users = Math.max(0, users - 1)
  if (users > 0 || !stream) return
  const s = stream
  stream = null
  void s.then((m) => m.getTracks().forEach((t) => t.stop())).catch(() => {})
}
