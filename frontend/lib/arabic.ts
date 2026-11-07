/** Same normalisation idea as src/retrieve.py: أإآ→ا, ة→ه, ى→ي, remove tashkeel and tatweel. */
export function normalizeAr(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
