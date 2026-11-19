import { THEMES } from "./lexicon.js";
import { seededRandom } from "./rng.js";

const THEME_BY_ID = Object.fromEntries(THEMES.map((theme) => [theme.id, theme]));
const SHORTLIST = 25;

const words = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * How well a track fits a profile. Higher is better; roughly 0 to 9.
 *
 *  - mood (0-2.5): closeness of the track's energy and valence to the profile's
 *  - themes (0-4): theme keywords in the title (strongest), the catalog search seed or
 *    tags, and theme genres, weighted by how much the chart talks about each theme
 *  - genres (0-1.5): age-band and theme genre preferences
 */
export function scoreTrack(track, profile) {
  const distance =
    0.6 * Math.abs(track.energy - profile.energy) + 0.4 * Math.abs(track.valence - profile.valence);
  const mood = 2.5 * (1 - distance);

  const title = new Set(words(track.title));
  const tags = new Set(track.tags || []);
  const genres = new Set(track.genres || []);
  const strongest = Math.max(1, ...profile.themes.map((t) => t.weight));
  let themes = 0;
  for (const { id, weight } of profile.themes) {
    const theme = THEME_BY_ID[id];
    if (!theme) continue;
    const share = weight / strongest;
    let fit = 0;
    for (const keyword of theme.keywords) {
      if (title.has(keyword)) fit = Math.max(fit, 3);
      else if (track.seed === keyword) fit = Math.max(fit, 1.5);
      else if (tags.has(keyword)) fit = Math.max(fit, 1);
    }
    if (theme.genres.some((genre) => genres.has(genre))) fit += 0.6;
    themes += share * fit;
  }

  let genreFit = 0;
  for (const genre of genres) genreFit += profile.genres[genre] || 0;

  return mood + Math.min(themes, 4) + 1.5 * Math.min(genreFit, 1);
}

/**
 * Choose one track: score the whole catalog, keep the best SHORTLIST, then draw one with
 * a seeded weighted lottery. The same chart on the same day gets the same song; similar
 * charts still get different songs from the shortlist.
 *
 * @param {object[]} catalog tracks.json
 * @param {object} profile from extractFeatures()
 * @param {number} seed from songSeed()
 */
export function pickTrack(catalog, profile, seed) {
  if (!catalog.length) throw new Error("The music catalog is empty");
  const ranked = catalog
    .map((track) => ({ track, score: scoreTrack(track, profile) }))
    .sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id))
    .slice(0, SHORTLIST);
  const floor = ranked[ranked.length - 1].score;
  const weights = ranked.map(({ score }) => (score - floor + 0.25) ** 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let ticket = seededRandom(seed)() * total;
  for (let i = 0; i < ranked.length; i += 1) {
    ticket -= weights[i];
    if (ticket < 0) return ranked[i].track;
  }
  return ranked[0].track;
}
