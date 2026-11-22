export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system: string
  history: ChatTurn[]
  model: string
}

export type ChatFn = (req: ChatRequest) => Promise<string>
