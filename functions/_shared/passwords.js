const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export function generateTemporaryPassword(prefix = 'A7!') {
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  let value = prefix;
  for (const byte of bytes) value += ALPHABET[byte % ALPHABET.length];
  return value;
}
