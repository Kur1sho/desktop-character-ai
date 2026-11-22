// Which model the built-in brain runs. "auto" picks the smartest one the PC can
// handle: Qwen3 4B on a graphics card, Qwen3 1.7B on the processor. Both are
// Apache-2.0 (free for commercial use, no extra terms).
// Pure code, no Electron or browser imports, so it can be tested.
import { COPIED_MARKER } from './clipboard'
import { wantsDetail } from './brevity'

export const BRAIN_AUTO = 'auto'
/** Smartest: for PCs with a graphics card (WebGPU). About 2.5 GB, needs ~4 GB of video memory. */
export const BRAIN_LARGE = 'onnx-community/Qwen3-4B-ONNX'
/** For PCs without a usable graphics card. About 1.2 GB. */
export const BRAIN_MEDIUM = 'onnx-community/Qwen3-1.7B-ONNX'
/** Last resort: the old, small brain. About 1 GB. */
export const BRAIN_SMALL = 'onnx-community/gemma-3-1b-it-ONNX'

/** Older defaults that people may have saved. They now mean "auto". */
const OLD_DEFAULTS = new Set([BRAIN_SMALL])

export type BrainDevice = 'gpu' | 'cpu'
export interface BrainChoice {
  model: string
  device: BrainDevice
}

/** A choice as one string, for remembering which ones didn't work on this PC. */
export const choiceKey = (c: BrainChoice) => `${c.device}:${c.model}`

/**
 * The model and device pairs to try, best first. A later one is used only if an
 * earlier one won't load (for example, integrated graphics without enough
 * video memory). Pairs that already failed on this PC are skipped.
 */
export function brainCandidates(requested: string, hasGpu: boolean, failed: string[] = []): BrainChoice[] {
  const r = requested.trim()
  const custom = r && r !== BRAIN_AUTO && !OLD_DEFAULTS.has(r)
  const list: BrainChoice[] = custom
    ? [
        ...(hasGpu ? [{ model: r, device: 'gpu' as const }] : []),
        { model: r, device: 'cpu' }
      ]
    : [
        ...(hasGpu
          ? [
              { model: BRAIN_LARGE, device: 'gpu' as const },
              { model: BRAIN_MEDIUM, device: 'gpu' as const }
            ]
          : []),
        { model: BRAIN_MEDIUM, device: 'cpu' },
        { model: BRAIN_SMALL, device: 'cpu' }
      ]
  const left = list.filter((c) => !failed.includes(choiceKey(c)))
  // If everything failed before, try the safest one again rather than nothing.
  return left.length ? left : list.slice(-1)
}

/** Qwen3 "thinks out loud" by default. We switch that off: it's slow and the user can't see it. */
export function isThinkingModel(model: string): boolean {
  return /qwen3/i.test(model)
}

/** Removes any <think>…</think> block that slipped through. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/<\/think>/gi, '')
    .trim()
}

/** How long a reply may get. Short chat stays fast; asking for detail gets room. */
export function maxTokensFor(userText: string): number {
  if (userText.includes(COPIED_MARKER)) return 400
  return wantsDetail(userText) ? 220 : 100
}

/** Network errors mean "try again later", not "this model is too big for this PC". */
export function isNetworkError(message: string): boolean {
  return /fetch|network|ENOTFOUND|ERR_INTERNET|ERR_NAME|ERR_CONNECTION|timed? ?out/i.test(message)
}
