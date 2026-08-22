/**
 * Flags as images, because emoji flags are a lie on half the world's devices:
 * Windows browsers render them as two-letter codes and plenty of tablets show
 * empty boxes, which turns "which country flies this flag" into no question at
 * all.
 *
 * The dataset still speaks emoji — it is a compact, readable id, and screen
 * readers pronounce it as the country name — but everything shown to a kid
 * goes through here and comes out as an <img> backed by src/assets/flags/
 * (fetched by scripts/fetch-flags.mjs, committed, nothing loads from the
 * internet).
 */
import { h } from './dom.js';

const FLAG_EMOJI = /\p{RI}\p{RI}/u; // two regional-indicator symbols
const SPLIT = /(\p{RI}\p{RI})/u;

/** 🇫🇷 -> "fr". Null for anything that is not a two-letter emoji flag. */
export function flagCode(text) {
  if (typeof text !== 'string') return null;
  const symbols = [...text];
  if (symbols.length !== 2 || !FLAG_EMOJI.test(text)) return null;
  return symbols
    .map((s) => String.fromCharCode(s.codePointAt(0) - 0x1f1e6 + 97))
    .join('');
}

/**
 * The image for one emoji flag. `variant` picks a CSS size: 'media' beside a
 * prompt, 'large' as the question itself, 'tile' on an answer button, 'inline'
 * inside a sentence. Falls back to the raw text if it is not a flag, so a
 * non-flag emoji in a hint cannot break rendering.
 */
export function flagNode(emoji, variant = 'inline') {
  const code = flagCode(emoji);
  if (!code) return emoji;
  return h(`img.flag.flag--${variant}`, {
    src: `src/assets/flags/${code}.svg`,
    // The emoji itself is the accessible text: screen readers speak it as the
    // country name, exactly as they did when the emoji was rendered as text.
    alt: emoji,
    draggable: 'false',
  });
}

/**
 * A sentence with any emoji flags swapped for inline images, for feedback
 * lines like "🇫🇷 is the flag of France." Returns children for h().
 */
export function withFlags(text) {
  if (typeof text !== 'string' || !FLAG_EMOJI.test(text)) return [text];
  return text.split(SPLIT).map((part) => (flagCode(part) ? flagNode(part) : part));
}
