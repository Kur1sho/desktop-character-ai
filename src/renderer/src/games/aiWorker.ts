// The character's thinking for board and card games, off the main thread so the window never freezes.
import { bestMove } from '@shared/chessEngine'
import { bestCheckersMove, type CheckersState } from '@shared/checkers'
import { pokerAi, type PokerState } from '@shared/poker'

export type AiJob =
  | { id: number; kind: 'chess'; fen: string; level: Level }
  | { id: number; kind: 'checkers'; state: CheckersState; level: Level }
  | { id: number; kind: 'poker'; state: PokerState }

export type Level = 'easy' | 'normal' | 'hard'

const CHESS = { easy: { maxDepth: 2, timeMs: 400, slack: 120 }, normal: { maxDepth: 4, timeMs: 1200, slack: 15 }, hard: { maxDepth: 7, timeMs: 3000, slack: 0 } }
const CHECKERS = { easy: { depth: 2, timeMs: 300, slack: 60 }, normal: { depth: 6, timeMs: 900, slack: 10 }, hard: { depth: 10, timeMs: 2500, slack: 0 } }

self.onmessage = (e: MessageEvent<AiJob>) => {
  const job = e.data
  let result: unknown = null
  try {
    if (job.kind === 'chess') result = bestMove(job.fen, CHESS[job.level])
    else if (job.kind === 'checkers') result = bestCheckersMove(job.state, CHECKERS[job.level])
    else result = pokerAi(job.state)
  } catch (err) {
    console.error('Game AI failed:', err)
  }
  ;(self as unknown as Worker).postMessage({ id: job.id, result })
}
