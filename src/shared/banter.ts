// Robotico and Suzu on the desktop together: little back-and-forths between them.
import type { Emotion } from './personas'

export interface BanterLine {
  who: 'robotico' | 'tsundere'
  text: string
  emotion: Emotion
}

const R = (text: string, emotion: Emotion = 'happy'): BanterLine => ({ who: 'robotico', text, emotion })
const S = (text: string, emotion: Emotion = 'neutral'): BanterLine => ({ who: 'tsundere', text, emotion })

export const BANTER: BanterLine[][] = [
  [R("Suzu, admit it. I'm the favourite."), S('In your dreams, tin can.', 'angry'), R('I do have great dreams.', 'smug')],
  [S("Why are you always smiling?", 'confused'), R("It's my face. It's a screen. It's stuck on awesome."), S('...Hmph. Fair.')],
  [R('Want to race to the other side of the taskbar?', 'excited'), S("No. You'd cheat."), R('I would absolutely cheat.', 'laughing')],
  [S("Hey. Robotico. Your antenna's crooked."), R('WHAT?!', 'scared'), S('...Made you look.', 'smug')],
  [R("Do you think they like us?"), S("They'd better.", 'flustered'), R("That's a yes!", 'excited')],
  [S("You're standing too close.", 'angry'), R("You're standing too far."), S('...Idiot.', 'flustered')],
  [R('Beep boop.'), S('Did you just say beep boop out loud?', 'confused'), R('I contain multitudes.', 'smug')],
  [S("I'm bored.", 'sleepy'), R("Want me to tell you a joke?"), S('No.'), R('Why did the robot go on holiday? To recharge!', 'laughing'), S('...I hate you.', 'flustered')],
  [R("I've been thinking."), S('Careful. Don\'t overheat.', 'smug'), R('Too late.', 'confused')],
  [S("Don't tell anyone, but this desktop's kind of cosy."), R("I'm telling everyone!", 'excited'), S("Don't you DARE.", 'angry')]
]

/** Picks an exchange, not the same as last time. */
export function pickBanter(last: number, rng: () => number = Math.random): number {
  if (BANTER.length < 2) return 0
  let i = Math.floor(rng() * (BANTER.length - 1))
  if (i >= last && last >= 0) i++
  return i
}
