// OpenAI, OpenRouter and Gemini all accept the OpenAI chat completions format.
import type { ChatRequest } from './types'

const BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai'
} as const

export type CompatProvider = keyof typeof BASE_URLS

export async function openaiCompatibleChat(
  provider: CompatProvider,
  req: ChatRequest,
  apiKey: string
): Promise<string> {
  const res = await fetch(`${BASE_URLS[provider]}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter' ? { 'X-Title': 'Desktop Companion' } : {})
    },
    body: JSON.stringify({
      model: req.model,
      messages: [{ role: 'system', content: req.system }, ...req.history]
    })
  })
  if (!res.ok) throw new Error(`${provider} error ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}
