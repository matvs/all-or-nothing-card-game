// Room codes: 4 letters, excluding I and O (which read as 1 and 0) so they are
// easy to say aloud and retype.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code) && [...code].every((ch) => CODE_ALPHABET.includes(ch));
}
