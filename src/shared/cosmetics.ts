// Hats and colours for Robotico, unlocked by spending time together.

export interface Progress {
  /** Different days the app has been used. */
  days: number
  /** Games won against the character in the game window. */
  wins: number
  dances: number
  pats: number
  pokes: number
  /** Messages sent to the character. */
  chats: number
}

export type Stat = keyof Progress

export const EMPTY_PROGRESS: Progress = { days: 0, wins: 0, dances: 0, pats: 0, pokes: 0, chats: 0 }

export interface Unlock {
  stat: Stat
  count: number
}

export interface HatInfo {
  id: string
  label: string
  needs?: Unlock
}

export interface ColorInfo {
  id: string
  label: string
  /** Trim and lights. */
  trim: number
  /** Body plastic. */
  body: number
  needs?: Unlock
}

export const HATS: HatInfo[] = [
  { id: 'none', label: 'No hat' },
  { id: 'party', label: 'Party hat' },
  { id: 'bow', label: 'Bow' },
  { id: 'beanie', label: 'Beanie', needs: { stat: 'days', count: 3 } },
  { id: 'flower', label: 'Flower', needs: { stat: 'pats', count: 20 } },
  { id: 'headphones', label: 'Headphones', needs: { stat: 'dances', count: 3 } },
  { id: 'tophat', label: 'Top hat', needs: { stat: 'wins', count: 3 } },
  { id: 'halo', label: 'Halo', needs: { stat: 'chats', count: 50 } },
  { id: 'crown', label: 'Crown', needs: { stat: 'wins', count: 10 } }
]

export const COLORS: ColorInfo[] = [
  { id: 'teal', label: 'Teal', trim: 0x1fb8b5, body: 0xf3f1ec },
  { id: 'pink', label: 'Pink', trim: 0xff7fb0, body: 0xf7f0f2 },
  { id: 'purple', label: 'Purple', trim: 0x8f6bff, body: 0xf1eff7, needs: { stat: 'days', count: 5 } },
  { id: 'tomato', label: 'Tomato', trim: 0xff5a4e, body: 0xf6efe9, needs: { stat: 'pokes', count: 10 } },
  { id: 'midnight', label: 'Midnight', trim: 0x2de0dc, body: 0x2b3440, needs: { stat: 'chats', count: 25 } },
  { id: 'gold', label: 'Gold', trim: 0xe8b130, body: 0xf6f1e4, needs: { stat: 'wins', count: 5 } }
]

/** What each character wears until you pick something else. */
const PERSONA_LOOK: Record<string, { hat: string; color: string }> = {
  robotico: { hat: 'none', color: 'teal' },
  tsundere: { hat: 'bow', color: 'pink' }
}

export interface Look {
  hat: string
  trim: number
  body: number
}

export function isUnlocked(item: { needs?: Unlock }, p: Progress): boolean {
  return !item.needs || (p[item.needs.stat] ?? 0) >= item.needs.count
}

/** "Win 3 games" - how to unlock it. */
export function unlockHint(u: Unlock): string {
  const what: Record<Stat, [string, string]> = {
    days: ['Spend', 'different days together'],
    wins: ['Win', 'games against me'],
    dances: ['Dance', 'times'],
    pats: ['Give', 'head pats'],
    pokes: ['Poke me', 'times'],
    chats: ['Send', 'messages']
  }
  const [verb, rest] = what[u.stat]
  return `${verb} ${u.count} ${rest}`
}

/** The look to show: the chosen hat and colour if unlocked, otherwise the character's own. */
export function resolveLook(personaId: string, hat: string, color: string, p: Progress): Look {
  const own = PERSONA_LOOK[personaId] ?? PERSONA_LOOK.robotico
  const h = HATS.find((x) => x.id === hat && isUnlocked(x, p)) ?? HATS.find((x) => x.id === own.hat)!
  const c = COLORS.find((x) => x.id === color && isUnlocked(x, p)) ?? COLORS.find((x) => x.id === own.color)!
  return { hat: h.id, trim: c.trim, body: c.body }
}

/** Things that unlocked between two progress readings, by name ("the top hat"). */
export function newlyUnlocked(before: Progress, after: Progress): string[] {
  const out: string[] = []
  for (const h of HATS) if (h.needs && !isUnlocked(h, before) && isUnlocked(h, after)) out.push(`the ${h.label.toLowerCase()}`)
  for (const c of COLORS) if (c.needs && !isUnlocked(c, before) && isUnlocked(c, after)) out.push(`the ${c.label.toLowerCase()} paint job`)
  return out
}
