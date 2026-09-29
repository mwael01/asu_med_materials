/**
 * Utility functions for string and name formatting.
 */

/**
 * Formats a user display name or username into a clean, compact representation if it exceeds maxLen.
 * If longer than maxLen (default 10 characters), it takes the first initial of their first name
 * and their second name (e.g. "Mohammed Wael Elshiekh" -> "M. Wael").
 *
 * @param name - The full name, username, or contributor string
 * @param maxLen - The maximum allowed character threshold before shortening (default: 10)
 * @returns The formatted short name, or original if within threshold
 *
 * @example
 * formatShortName("Mohammed Wael Elshiekh") // "M. Wael"
 * formatShortName("Mohammed Wael")          // "M. Wael"
 * formatShortName("mohammed_wael")          // "M. Wael"
 * formatShortName("Ali Omar")               // "Ali Omar"
 * formatShortName("محمد وائل الشيخ")         // "م. وائل"
 */
export function formatShortName(name: string, maxLen: number = 10): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;

  const hasAt = trimmed.startsWith('@');
  const clean = hasAt ? trimmed.slice(1) : trimmed;

  // Split by spaces, underscores, or dots
  let parts = clean.split(/[\s_.]+/).filter(Boolean);

  // Handle compound prefixes like "عبد" or "Abdel" / "Abdul" if 3 or more parts exist
  if (parts.length >= 3) {
    const firstLower = parts[0].toLowerCase();
    if (firstLower === 'عبد' || firstLower === 'abdel' || firstLower === 'abdul') {
      parts = [`${parts[0]} ${parts[1]}`, ...parts.slice(2)];
    }
  }

  if (parts.length >= 2) {
    const firstPart = parts[0];
    const secondPart = parts[1];

    const initial = firstPart.charAt(0).toUpperCase();
    const formattedSecond = secondPart.charAt(0).toUpperCase() + secondPart.slice(1);

    return `${initial}. ${formattedSecond}`;
  }

  // Single word longer than maxLen
  if (clean.length > maxLen) {
    const prefix = hasAt ? '@' : '';
    return prefix + clean.slice(0, Math.max(1, maxLen - prefix.length - 1)) + '…';
  }

  return trimmed;
}
