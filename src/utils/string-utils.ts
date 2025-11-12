/**
 * Creates a canonical, normalized key from a string.
 * This is used for creating a reliable lookup key from a display name.
 * - Trims whitespace from both ends.
 * - Replaces multiple whitespace characters with a single space.
 * - Applies Unicode normalization (NFKC form).
 * - Converts to lowercase.
 * @param {string} str The input string.
 * @returns {string} The normalized, canonical key.
 */
export function createCanonicalNameKey(str: string): string {
   if (!str) return ''
   return str
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFKC')
      .toLowerCase()
}
