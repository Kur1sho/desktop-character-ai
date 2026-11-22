// Local models through Ollama. Nothing leaves the user's PC.
import type { ChatRequest } from './types'

export async function ollamaChat(req: ChatRequest, baseUrl: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        stream: false,
        messages: [{ role: 'system', content: req.system }, ...req.history]
      })
    })
  } catch {
    throw new Error('Could not reach Ollama. Is it installed and running?')
  }
  if (res.status === 404) {
    throw new Error(`Ollama doesn't have "${req.model}" yet. Run: ollama pull ${req.model}`)
  }
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content ?? ''
}
