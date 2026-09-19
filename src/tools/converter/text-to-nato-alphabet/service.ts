export type NatoEntry = { char: string; word: string }

const NATO_LETTERS: Record<string, string> = {
  A: 'Alfa',
  B: 'Bravo',
  C: 'Charlie',
  D: 'Delta',
  E: 'Echo',
  F: 'Foxtrot',
  G: 'Golf',
  H: 'Hotel',
  I: 'India',
  J: 'Juliett',
  K: 'Kilo',
  L: 'Lima',
  M: 'Mike',
  N: 'November',
  O: 'Oscar',
  P: 'Papa',
  Q: 'Quebec',
  R: 'Romeo',
  S: 'Sierra',
  T: 'Tango',
  U: 'Uniform',
  V: 'Victor',
  W: 'Whiskey',
  X: 'X-ray',
  Y: 'Yankee',
  Z: 'Zulu',
}

const NATO_DIGITS: Record<string, string> = {
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
}

const SPACE_WORD = '[space]'
const UNKNOWN_WORD = '[unknown]'

/** 文本 → 逐字符 NATO 音标条目：字母按 NATO 表、数字 0-9 → Zero..Nine、空格 → [space]、其余 → [unknown] */
export function toNatoAlphabet(input: string): NatoEntry[] {
  const entries: NatoEntry[] = []
  for (const char of input) {
    const upper = char.toUpperCase()
    const word =
      NATO_LETTERS[upper] ?? NATO_DIGITS[char] ?? (char === ' ' ? SPACE_WORD : UNKNOWN_WORD)
    entries.push({ char, word })
  }
  return entries
}

/** 整段转写文本（空格不产生词，其余以空格连接） */
export function toNatoText(input: string): string {
  return toNatoAlphabet(input)
    .filter((entry) => entry.word !== SPACE_WORD)
    .map((entry) => entry.word)
    .join(' ')
}
