const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const alphabetLength = alphabet.length;
const targetLength = 16;
const maxMultiple = Math.floor(256 / alphabetLength) * alphabetLength;

export function generateShortCode(): string {
  let code = '';

  while (code.length < targetLength) {
    const bytes = crypto.getRandomValues(new Uint8Array(targetLength));

    for (const byte of bytes) {
      if (byte >= maxMultiple) {
        continue;
      }

      code += alphabet[byte % alphabetLength];
      if (code.length === targetLength) {
        return code;
      }
    }
  }

  return code;
}
