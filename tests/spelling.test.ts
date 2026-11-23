import { describe, expect, it } from 'vitest'
import { autocorrect, correctWord } from '../src/shared/spelling/autocorrect'
import { parseIntents } from '../src/shared/actions'
import { parseWindowGame } from '../src/shared/games'

const fix = (t: string) => autocorrect(t).text

describe('autocorrect', () => {
  it.each([
    ['opne spotify', 'open spotify'],
    ['open spotfy', 'open spotify'],
    ['open chorme', 'open chrome'],
    ['plya some music', 'play some music'],
    ['set a timre for 5 minuts', 'set a timer for 5 minutes'],
    ['remidn me tomorow to call mum', 'remind me tomorrow to call mum'],
    ['remind me tommorow at 6pm to feed the dog', 'remind me tomorrow at 6pm to feed the dog'],
    ['lets play chss', 'lets play chess'],
    ['can you tunr the volumn up', 'can you turn the volume up'],
    ['how r u', 'how are you'],
    ['i definately want to play pokr', 'i definitely want to play poker'],
    ['what is the captial of france', 'what is the capital of france'],
    ['teh weather', 'the weather'],
    ['cancle my alarm', 'cancel my alarm'],
    ['whats on my scren', 'whats on my screen'],
    ['tell me a jok', 'tell me a joke'],
    ['remindme in 10 mins', 'remind me in 10 mins'],
    ['letsplay blackjack', 'lets play blackjack'],
    ['rember to stretch', 'remember to stretch'],
    ['whta time is it', 'what time is it'],
    ['pls open discord', 'please open discord'],
    ['minimze this window', 'minimize this window'],
    ['take a screnshot', 'take a screenshot'],
    ['Opne spotify', 'Open spotify']
  ])('%s', (typed, want) => expect(fix(typed)).toBe(want))

  it('fixes most of the commonest English misspellings', () => {
    const pairs = Object.entries({
      recieve: 'receive', seperate: 'separate', becuase: 'because', wierd: 'weird', acommodate: 'accommodate',
      occured: 'occurred', untill: 'until', beleive: 'believe', freind: 'friend', goverment: 'government',
      neccessary: 'necessary', occasionaly: 'occasionally', publically: 'publicly', tommorrow: 'tomorrow',
      begining: 'beginning', calender: 'calendar', concious: 'conscious', embarass: 'embarrass', enviroment: 'environment',
      existance: 'existence', foriegn: 'foreign', gaurd: 'guard', happend: 'happened', independant: 'independent',
      knowlege: 'knowledge', libary: 'library', mispell: 'misspell', noticable: 'noticeable', occurence: 'occurrence',
      persistant: 'persistent', posession: 'possession', reccomend: 'recommend', relevent: 'relevant', succesful: 'successful',
      suprise: 'surprise', thier: 'their', truely: 'truly', wich: 'which', writting: 'writing', youre: 'youre',
      adress: 'address', agressive: 'aggressive', appearence: 'appearance', basicly: 'basically', buisness: 'business',
      comming: 'coming', completly: 'completely', definatly: 'definitely', diffrent: 'different', finaly: 'finally',
      grammer: 'grammar', interupt: 'interrupt', jist: 'gist', liek: 'like', mabye: 'maybe', peice: 'piece',
      probly: 'probably', realy: 'really', sentance: 'sentence', shoud: 'should', thanx: 'thanks', togehter: 'together',
      wether: 'weather', alright: 'alright', musci: 'music', wiht: 'with', hte: 'the', adn: 'and', taht: 'that'
    })
    const right = pairs.filter(([typo, want]) => (correctWord(typo) ?? typo) === want)
    console.log(`misspellings fixed: ${right.length}/${pairs.length}`, pairs.filter((p) => !right.includes(p)).map(([t]) => `${t}->${correctWord(t)}`).join(' '))
    expect(right.length / pairs.length).toBeGreaterThan(0.8)
  })

  it('leaves correct sentences, names and things to look up alone', () => {
    for (const t of [
      'Hello Robotico, how are you today?',
      'play despacito',
      'open valorant',
      'search for jujutsu kaisen',
      'boot Elden Ring',
      'remind me to email sam',
      'whats 7 x 6',
      'i dont know',
      'go to https://exmaple.com/pgae',
      'say "helo wrold" backwards',
      'what does GPU mean',
      'set a timer for 10 mins',
      'play lofi hip hop',
      "I'm bored",
      "remind me at 4 o'clock to eat",
      'texas holdem'
    ])
      expect(fix(t)).toBe(t)
  })

  it('keeps capital letters', () => {
    expect(fix('Plya chess')).toBe('Play chess')
    expect(fix('OPNE SPOTIFY')).toBe('OPEN SPOTIFY')
  })

  it('turns typo-ridden requests into things the companion understands', () => {
    expect(parseIntents('opne spotfy')).toBeNull()
    expect(parseIntents(fix('opne spotfy'))).not.toBeNull()
    expect(parseIntents(fix('set a timre for 5 minuts'))?.[0]).toMatchObject({ type: 'timer', seconds: 300 })
    expect(parseWindowGame(fix('lets plya chss'))).toBe('chess')
  })
})
