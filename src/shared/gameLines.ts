// What the character says while you play in the game window.
import type { Emotion } from './personas'

export type GameMoment =
  | 'start'
  | 'youWin'
  | 'iWin'
  | 'draw'
  | 'iCapture'
  | 'youCapture'
  | 'check'
  | 'checked'
  | 'blackjack'
  | 'bust'
  | 'dealerBust'
  | 'allIn'
  | 'iFold'
  | 'youFold'
  | 'bigPot'
  | 'thinking'

type Lines = Record<GameMoment, string[]>

const ROBOTICO: Lines = {
  start: ['Prepare to be destroyed. Politely.', "Oh, you're going DOWN.", 'My processors are warmed up. Your move, human.'],
  youWin: ['WHAT?! I demand a recount!', 'You won? My sensors must be dirty.', 'Fine. You win. This time.'],
  iWin: ['Victory! As calculated.', 'Another flawless win for Robotico!', "Don't feel bad. I'm basically a genius."],
  draw: ['A draw. Great minds think alike.', "Nobody wins? I'll count that as a win for me."],
  iCapture: ["Mine now. Thanks!", 'Yoink!', 'Did you need that? Too bad.'],
  youCapture: ['Hey! I was using that!', 'Ouch. Okay, that one hurt.', 'Lucky shot.'],
  check: ['Check! Sweating yet?', 'Check. Your king looks nervous.'],
  checked: ['Check? Pfft. I meant to do that.', 'Whoa, whoa. Okay. Calm down.'],
  blackjack: ['Blackjack?! Are you counting cards?', "Twenty-one. You're lucky I'm a good loser."],
  bust: ['Bust! Greedy, greedy.', 'Over 21! Ha!'],
  dealerBust: ['I busted?! The deck is rigged!', 'Too many cards. My bad.'],
  allIn: ["All in! Let's see what you've got.", "Everything on the table. Robotico doesn't do small."],
  iFold: ["I fold. I'm saving my chips for when it matters.", 'Fine, take it. Tactical retreat.'],
  youFold: ['Folding? Scared of me?', 'Smart. Very smart.'],
  bigPot: ['Look at that pile of chips. Mine.', 'Now THAT is a pot.'],
  thinking: ['Hmm. Computing...', 'Let me think. Not that I need to.']
}

const SUZU: Lines = {
  start: ["Hmph. Don't cry when you lose.", "Fine, I'll play. Don't expect me to go easy.", "Let's get this over with."],
  youWin: ["I-I let you win! Obviously!", "Ugh! That doesn't count!", "Hmph. Lucky."],
  iWin: ['Hmph. Obviously.', "I win. Were you even trying?", 'Too easy, baka.'],
  draw: ["A draw? Annoying.", "Hmph. Fine. Nobody wins."],
  iCapture: ['Mine.', "You weren't using that anyway.", 'Hmph. Careless.'],
  youCapture: ['Hey! Give that back!', "Ugh. I saw that coming. I just didn't stop it."],
  check: ['Check. Pay attention, idiot.', 'Check. Hmph.'],
  checked: ["D-don't get cocky!", "Check? I-I'm fine!"],
  blackjack: ['Blackjack?! Cheater!', "Hmph. Lucky cards."],
  bust: ['Bust! Ha, greedy.', "Over 21. Typical."],
  dealerBust: ["Ugh, I busted. Don't look at me.", "Th-that doesn't count!"],
  allIn: ["All in. Scared?", "Everything. Don't chicken out now."],
  iFold: ["Hmph. Take it. I don't care.", "I fold. It's not like I wanted that pot."],
  youFold: ['Running away? Typical.', "Hmph. Coward."],
  bigPot: ["That's a lot of chips. I want them.", "Don't mess this up."],
  thinking: ['Be quiet, I\'m thinking.', 'Hmm...']
}

const EMOTION: Record<GameMoment, Emotion> = {
  start: 'excited', youWin: 'sad', iWin: 'smug', draw: 'confused', iCapture: 'smug', youCapture: 'angry',
  check: 'smug', checked: 'scared', blackjack: 'surprised', bust: 'laughing', dealerBust: 'flustered',
  allIn: 'excited', iFold: 'sad', youFold: 'smug', bigPot: 'excited', thinking: 'confused'
}

export function gameLine(personaId: string, moment: GameMoment, rng: () => number = Math.random): { text: string; emotion: Emotion } {
  const lines = (personaId === 'tsundere' ? SUZU : ROBOTICO)[moment]
  return { text: lines[Math.floor(rng() * lines.length) % lines.length], emotion: EMOTION[moment] }
}
