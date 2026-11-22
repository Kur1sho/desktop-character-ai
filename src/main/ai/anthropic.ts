import Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest } from './types'

// Models that support the server-side refusal fallback.
const FALLBACK_MODELS = /^claude-(opus-5-5|sonnet-5-5|opus-5|fable-5)/

export async function anthropicChat(req: ChatRequest, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const useFallback = FALLBACK_MODELS.test(req.model)
  const response = await client.beta.messages.create({
    model: req.model,
    max_tokens: 400,
    // Chat replies are short, so keep thinking light for snappy answers.
    output_config: { effort: 'low' },
    // The persona prompt never changes mid-chat, so cache it.
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    messages: req.history.map((t) => ({ role: t.role, content: t.content })),
    ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
  })
  if (response.stop_reason === 'refusal') {
    return "[flustered] I can't help with that one. Let's talk about something else."
  }
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}
