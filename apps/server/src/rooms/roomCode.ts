const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, avoids visual ambiguity

function randomSegment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateRoomCode(): string {
  return `${randomSegment(3)}-${Math.floor(100 + Math.random() * 900)}`;
}
