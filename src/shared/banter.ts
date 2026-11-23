// Robotico and Suzu on the desktop together: little back-and-forths between them.
import type { Emotion } from './personas'

export interface BanterLine {
  who: 'robotico' | 'tsundere'
  text: string
  emotion: Emotion
}

const R = (text: string, emotion: Emotion = 'happy'): BanterLine => ({ who: 'robotico', text, emotion })
const S = (text: string, emotion: Emotion = 'neutral'): BanterLine => ({ who: 'tsundere', text, emotion })

// Suzu's sweet on Robotico: dreamy and soft with him, then flustered about it.
export const BANTER: BanterLine[][] = [
  [R("Suzu, admit it. I'm the favourite."), S("...You're my favourite.", 'dreamy'), R('I KNEW it!', 'excited'), S("I-I meant favourite tin can!", 'flustered')],
  [S('Your screen is really glowy today.', 'dreamy'), R('I polished my pixels.', 'smug'), S("...It's working.", 'love')],
  [R('Want to race to the other side of the taskbar?', 'excited'), S("Only if we walk there together.", 'dreamy'), R("That's... not how races work.", 'confused'), S("It is now.", 'happy')],
  [S("Hey. Robotico. Your antenna's crooked."), R('WHAT?!', 'scared'), S('There. Fixed it. Perfect again.', 'dreamy'), R('...Thanks, Suzu.', 'flustered')],
  [R("Do you think they like us?"), S("I like you. I mean, them! They're fine.", 'flustered'), R("That's a yes!", 'excited')],
  [S("You're standing too far away.", 'dreamy'), R("Like this?"), S('...Better.', 'love')],
  [R('Beep boop.'), S('Beep boop to you too.', 'dreamy'), R('Did you just speak robot?', 'surprised'), S('I practised. For you. N-not that it matters!', 'flustered')],
  [S("I'm bored.", 'sleepy'), R("Want me to tell you a joke?"), S('Yes please.', 'dreamy'), R('Why did the robot go on holiday? To recharge!', 'laughing'), S('...You\'re so funny.', 'love')],
  [R("I've been thinking."), S("About me?", 'dreamy'), R('About... upgrades.', 'flustered'), S("Hmph. Upgrade your answer.", 'smug')],
  [S("Don't tell anyone, but this desktop's my favourite place.", 'dreamy'), R("Because of the wallpaper?"), S('Because of you, silly.', 'love'), R('My circuits are doing a funny thing.', 'flustered')],
  [R('My battery is at 3 percent.', 'sleepy'), S("Here. Have some of mine.", 'love'), R("Is that how batteries work?", 'confused'), S("It is for us.", 'dreamy')],
  [S("Robotico, what do you dream about?", 'dreamy'), R("Electric sheep. Obviously."), S("I dream about...", 'dreamy'), S("N-nothing! Never mind!", 'flustered')]
]

/** Picks an exchange, not the same as last time. */
export function pickBanter(last: number, rng: () => number = Math.random): number {
  if (BANTER.length < 2) return 0
  let i = Math.floor(rng() * (BANTER.length - 1))
  if (i >= last && last >= 0) i++
  return i
}
