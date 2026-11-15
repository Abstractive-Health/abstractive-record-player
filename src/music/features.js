import { ACUITY_TERMS, AGE_GENRES, IMPROVING_TERMS, THEMES, WORSENING_TERMS } from "./lexicon.js";

/** The profile used when a chart has no AI summary yet: easygoing and bright. */
export const NEUTRAL_PROFILE = Object.freeze({
  themes: [],
  energy: 0.55,
  valence: 0.75,
  ageBand: null,
  genres: {},
});

const NEGATION =
  /\b(no|denies|denied|negative for|without|not|never|free of|ruled out)\b[^.;:\n]*$/i;
const MAX_HITS = 6;

function compile(terms) {
  return new RegExp(`\\b(?:${terms.join("|")})`, "gi");
}

const THEME_PATTERNS = THEMES.map((theme) => ({ theme, pattern: compile(theme.terms) }));
const ACUITY = compile(ACUITY_TERMS);
const IMPROVING = compile(IMPROVING_TERMS);
const WORSENING = compile(WORSENING_TERMS);

/** Count mentions that aren't negated within the same clause ("no history of CHF"). */
function countMentions(text, pattern) {
  let hits = 0;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    if (!NEGATION.test(before)) hits += 1;
    if (hits >= MAX_HITS) break;
  }
  return hits;
}

const clamp = (value, low = 0.05, high = 0.95) => Math.min(high, Math.max(low, value));

export function ageBand(text) {
  const match =
    /\b(\d{1,3})[- ]?(?:year|yr)s?[- ]?old\b/i.exec(text) ||
    /\b(\d{1,3})\s?(?:yo|y\/o|y\.o\.)\b/i.exec(text) ||
    /\bage(?:d)?:?\s+(\d{1,3})\b/i.exec(text);
  const age = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(age) || age > 120) return null;
  if (age < 13) return "child";
  if (age < 20) return "teen";
  if (age < 40) return "young";
  if (age < 65) return "middle";
  return "older";
}

/**
 * Turn an AI summary into a musical profile, entirely in the browser.
 *
 * @param {string} text The summary (Markdown or plain text).
 * @returns {{themes: {id: string, weight: number}[], energy: number, valence: number,
 *   ageBand: string|null, genres: Record<string, number>}}
 */
export function extractFeatures(text) {
  if (!text || !text.trim()) return { ...NEUTRAL_PROFILE };
  const themes = THEME_PATTERNS.map(({ theme, pattern }) => ({
    id: theme.id,
    weight: countMentions(text, pattern),
    theme,
  }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  // Mood: a weighted blend of the themes' moods, pulled toward the neutral profile.
  const total = themes.reduce((sum, entry) => sum + entry.weight, 0);
  const blend = (key) =>
    total
      ? 0.6 * (themes.reduce((sum, e) => sum + e.weight * e.theme[key], 0) / total) +
        0.4 * NEUTRAL_PROFILE[key]
      : NEUTRAL_PROFILE[key];
  let energy = blend("energy");
  let valence = blend("valence");

  const acuity = countMentions(text, ACUITY);
  const improving = countMentions(text, IMPROVING);
  const worsening = countMentions(text, WORSENING);
  energy -= 0.06 * Math.min(acuity, 4);
  valence +=
    0.04 * Math.min(improving, 3) - 0.04 * Math.min(worsening, 3) - 0.02 * Math.min(acuity, 3);

  const band = ageBand(text);
  const genres = {};
  for (const entry of themes) {
    for (const genre of entry.theme.genres) {
      genres[genre] = (genres[genre] || 0) + entry.weight / total;
    }
  }
  for (const genre of AGE_GENRES[band] || []) genres[genre] = (genres[genre] || 0) + 0.6;

  return {
    themes: themes.map(({ id, weight }) => ({ id, weight })),
    energy: Math.round(clamp(energy) * 100) / 100,
    valence: Math.round(clamp(valence) * 100) / 100,
    ageBand: band,
    genres,
  };
}
