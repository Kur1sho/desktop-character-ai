// What the character says while just hanging out on the desktop: pats, pokes,
// being thrown around, greetings and the odd comment of its own.
import type { Emotion } from './personas'

export type LifeMoment =
  | 'pat'
  | 'patMore'
  | 'poke'
  | 'pokeMany'
  | 'grabbed'
  | 'dropped'
  | 'thrown'
  | 'sitWindow'
  | 'wakeUp'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'breakNudge'
  | 'lateNight'
  | 'gameStart'
  | 'gameStartNamed'
  | 'gameEnd'
  | 'peek'
  | 'catchCursor'
  | 'unlocked'
  | 'musing'

type Lines = Record<LifeMoment, string[]>

const EMOTION: Record<LifeMoment, Emotion> = {
  pat: 'love',
  patMore: 'love',
  poke: 'angry',
  pokeMany: 'angry',
  grabbed: 'surprised',
  dropped: 'surprised',
  thrown: 'confused',
  sitWindow: 'smug',
  wakeUp: 'happy',
  morning: 'happy',
  afternoon: 'happy',
  evening: 'happy',
  night: 'sleepy',
  breakNudge: 'neutral',
  lateNight: 'sleepy',
  gameStart: 'excited',
  gameStartNamed: 'excited',
  gameEnd: 'happy',
  peek: 'smug',
  catchCursor: 'laughing',
  unlocked: 'excited',
  musing: 'neutral'
}

/** Suzu shows some feelings differently. */
const SUZU_EMOTION: Partial<Record<LifeMoment, Emotion>> = {
  pat: 'flustered',
  patMore: 'flustered',
  wakeUp: 'flustered',
  morning: 'neutral',
  afternoon: 'neutral',
  evening: 'neutral',
  sitWindow: 'neutral'
}

const ROBOTICO: Lines = {
  pat: ['Ooh, that tickles!', 'Head pats? I accept.', 'Careful, I just polished that.'],
  patMore: ['Okay, okay, I could get used to this.', "Don't stop. That's an order.", 'Maximum happiness reached.'],
  poke: ['Hey!', 'Boop received.', "That's my screen!"],
  pokeMany: ["Hey! Quit poking me!", "I'm not a button! Well, not THAT kind.", 'Poke me again and I start poking back.'],
  grabbed: ['Whoa! Put me down!', 'Wheee! Wait, no.', 'Hey! Hands off the merchandise!'],
  dropped: ['Oof.', 'Smooth landing. Nailed it.', 'Ten out of ten.'],
  thrown: ['WHOA! Warn me first!', 'My circuits are spinning...', "Okay, that was fun. Don't tell anyone."],
  sitWindow: ['Nice view from up here.', 'King of the window.', "I'll just sit here. Don't mind me."],
  wakeUp: ["Oh! You're back. I wasn't asleep. Just... buffering.", 'Welcome back! I kept your desktop warm.', 'Hey! I missed you. Totally normal amount.'],
  morning: ["Morning! Ready to be awesome? I am.", 'Good morning! Robotico is online.', 'Rise and shine! Well, you rise. I shine.'],
  afternoon: ['Afternoon! Robotico reporting for duty.', "Hey! Good to see you. What're we doing today?"],
  evening: ['Evening! Long day?', "Good evening! I'm here if you need me."],
  night: ["You're up late. Me too. I'm always up.", 'Night owl mode, huh?'],
  breakNudge: ["You've been going a while. Stretch? I'll watch.", 'Water break! Even robots need coolant.', 'Your eyes could use a break. Look at something far away. Not me, I\'m close.'],
  lateNight: ["It's really late. Bed soon? I'll guard the desktop.", 'Hey. Sleep is a thing humans need. I read about it.'],
  gameStart: ['Game time? Go get them!', 'Ooh, playing something? Good luck! I\'ll be quiet.'],
  gameStartNamed: ['{game}? Nice pick. Go win!', "Ooh, {game}! Good luck. I'll stay out of the way."],
  gameEnd: ['How did it go? Did you win? You won, right?', "Welcome back! Tell me you crushed it."],
  peek: ['Peekaboo!', "You can't see me. I'm stealthy."],
  catchCursor: ['Got it! Ha!', 'Gotcha, little arrow!', 'Too slow!'],
  unlocked: ['Ooh, I unlocked {item}! Put it on me in Settings.', 'New stuff! {item}! Check Settings.'],
  musing: ['I wonder what clouds taste like.', 'Fun fact: I am very cool.', 'Is it weird that I like the taskbar?', 'Beep boop. Just checking my voice still works.']
}

const SUZU: Lines = {
  pat: ["Wh-what are you doing?!", "D-don't pat me! ...Okay, maybe a little.", 'Hmph. Fine.'],
  patMore: ["...That's enough. ...Okay, just a bit more.", "D-don't get the wrong idea!", "...You're not bad at this."],
  poke: ['Hey!', "Don't touch!", 'What?!'],
  pokeMany: ['Stop poking me, idiot!', "One more poke and I'm not talking to you.", 'Do you WANT me to be mad?!'],
  grabbed: ['Put me down this instant!', 'Hey! Who said you could pick me up?!', 'Eek! Not so high!'],
  dropped: ['Hmph. Rude.', 'Gently, next time!', 'I landed perfectly. Obviously.'],
  thrown: ["Did you just THROW me?!", "I'm dizzy. This is your fault.", 'Unbelievable!'],
  sitWindow: ["I'm only sitting here because the view's okay.", "Don't move this window. I mean it."],
  wakeUp: ["Oh. You're back. I-it's not like I was waiting.", "Took you long enough.", "Hmph. Welcome back, I guess."],
  morning: ['Morning. You look tired.', "Oh. Morning. Don't slack off today."],
  afternoon: ["Oh, it's you. Hi, I guess.", 'Afternoon. Try to be productive.'],
  evening: ['Evening. Long day? Not that I care.', "You're here. Fine. I'll keep you company."],
  night: ["It's late. You should sleep. N-not that I'm worried.", 'Night owl. Typical.'],
  breakNudge: ["Take a break, dummy. Your eyes will thank you.", 'Drink some water. I-I just think it\'s smart.', "You've been at it forever. Stretch already."],
  lateNight: ["Go to bed! ...I'll still be here tomorrow.", "It's way too late. Seriously."],
  gameStart: ["Playing something? Don't lose.", "Fine, go play. I'll wait. Patiently. Sort of."],
  gameStartNamed: ['{game}? You better win.', "{game}, huh. Don't embarrass me."],
  gameEnd: ['Done? Did you at least win?', "Back already? Hmph. How was it?"],
  peek: ["I'm not hiding. I'm... observing.", "Don't look at me!"],
  catchCursor: ['Caught it! Ha!', "Too slow, little arrow.", 'Hmph. Easy.'],
  unlocked: ["I unlocked {item}. Y-you can put it on me in Settings. If you want.", "{item}, huh. It's in Settings. Whatever."],
  musing: ['...Hmph.', "I'm not bored. You're bored.", "Don't mind me. I'm just here."]
}

export function lifeLine(
  personaId: string,
  moment: LifeMoment,
  fill: Record<string, string> = {},
  rng: () => number = Math.random
): { text: string; emotion: Emotion } {
  const suzu = personaId === 'tsundere'
  const options = (suzu ? SUZU : ROBOTICO)[moment]
  let text = options[Math.floor(rng() * options.length)] ?? ''
  for (const [k, v] of Object.entries(fill)) text = text.replaceAll(`{${k}}`, v)
  return { text, emotion: (suzu && SUZU_EMOTION[moment]) || EMOTION[moment] }
}

/** Which greeting fits the hour. */
export function greetingFor(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 23) return 'evening'
  return 'night'
}
