#!/usr/bin/env node
/**
 * Builds the Record Player music catalog: src/catalog/tracks.json and ATTRIBUTIONS.md.
 *
 * Source: the Openverse API (https://api.openverse.org), which indexes openly licensed
 * media. Only full-length music from Jamendo under CC0, Public Domain Mark, CC BY or
 * CC BY-SA is kept, so the app can stream it with attribution. No API key is needed:
 * anonymous use allows 20 requests a minute and 200 a day, and this script stays under
 * both. Set OPENVERSE_ACCESS_TOKEN to use a registered Openverse client instead.
 *
 * The app never searches at runtime: it picks from this file in the browser, so no
 * patient-derived text ever leaves the browser. Run this script only to refresh the
 * catalog, then review the diff like any other change.
 *
 *   node scripts/build-catalog.mjs                 # build ~1,000 tracks and verify them
 *   node scripts/build-catalog.mjs --target 600    # a smaller catalog
 *   node scripts/build-catalog.mjs --no-verify     # skip checking each audio URL
 *   node scripts/build-catalog.mjs --verify-only   # re-check the committed catalog
 *   node scripts/build-catalog.mjs --refilter      # re-apply the content filters to it
 *
 * Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 so Node's fetch uses it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "src/catalog/tracks.json");
const ATTRIBUTIONS = path.join(ROOT, "ATTRIBUTIONS.md");
const API = "https://api.openverse.org/v1/audio/";
const LICENSES = ["cc0", "pdm", "by", "by-sa"];
const USER_AGENT =
  "AbstractiveRecordPlayer-CatalogBuilder/1.0 (+https://github.com/Abstractive-Health/abstractive-record-player)";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};
const TARGET = option("--target", 1000);
const MAX_REQUESTS = option("--max-requests", 170);
const PAGES_PER_SEED = option("--pages", 2);
const PER_ARTIST = 3;
const TOKEN = process.env.OPENVERSE_ACCESS_TOKEN;
const PAGE_SIZE = TOKEN ? 50 : 20;
// 20 requests a minute anonymously: one every 3.2 s leaves headroom.
const DELAY_MS = TOKEN ? 300 : 3200;

/**
 * Search seeds. Each has the genre it stands for and prior energy (0 calm, 1 driving)
 * and valence (0 somber, 1 bright) for tracks it finds, refined later by each track's
 * own Jamendo speed and mood tags. Single words match the most tracks; the theme words
 * (heart, breath, river, ...) give the picker titles to match clinical themes.
 */
export const SEEDS = [
  // Calm and acoustic
  ["piano", "classical", 0.3, 0.55],
  ["ambient", "ambient", 0.2, 0.5],
  ["lullaby", "children", 0.15, 0.65],
  ["meditation", "newage", 0.1, 0.55],
  ["relaxing", "lounge", 0.25, 0.6],
  ["peaceful", "newage", 0.2, 0.65],
  ["acoustic", "folk", 0.4, 0.62],
  ["guitar", "folk", 0.45, 0.6],
  ["classical", "classical", 0.35, 0.55],
  ["orchestral", "classical", 0.45, 0.55],
  ["strings", "classical", 0.35, 0.5],
  ["cello", "classical", 0.3, 0.45],
  ["harp", "classical", 0.25, 0.62],
  ["flute", "world", 0.35, 0.6],
  ["waltz", "classical", 0.45, 0.65],
  ["chillout", "lounge", 0.35, 0.6],
  ["lofi", "hiphop", 0.35, 0.55],
  // Genres
  ["jazz", "jazz", 0.45, 0.6],
  ["swing", "jazz", 0.65, 0.8],
  ["blues", "blues", 0.45, 0.45],
  ["soul", "soul", 0.5, 0.65],
  ["funk", "funk", 0.75, 0.8],
  ["reggae", "reggae", 0.55, 0.75],
  ["folk", "folk", 0.4, 0.6],
  ["country", "country", 0.5, 0.65],
  ["bluegrass", "country", 0.65, 0.75],
  ["celtic", "folk", 0.55, 0.7],
  ["world", "world", 0.5, 0.65],
  ["latin", "latin", 0.7, 0.8],
  ["bossa", "latin", 0.4, 0.7],
  ["salsa", "latin", 0.8, 0.85],
  ["africa", "world", 0.65, 0.75],
  ["pop", "pop", 0.65, 0.75],
  ["indie", "pop", 0.55, 0.6],
  ["rock", "rock", 0.7, 0.6],
  ["electronic", "electronic", 0.65, 0.6],
  ["synthwave", "electronic", 0.6, 0.6],
  ["house", "electronic", 0.8, 0.75],
  ["dance", "electronic", 0.85, 0.8],
  ["disco", "electronic", 0.8, 0.85],
  ["hiphop", "hiphop", 0.65, 0.6],
  ["triphop", "hiphop", 0.4, 0.45],
  ["cinematic", "soundtrack", 0.5, 0.55],
  ["epic", "soundtrack", 0.75, 0.6],
  ["ukulele", "folk", 0.55, 0.85],
  ["whistle", "folk", 0.55, 0.85],
  ["children", "children", 0.55, 0.9],
  // Moods
  ["happy", "pop", 0.7, 0.9],
  ["uplifting", "pop", 0.65, 0.85],
  ["hopeful", "soundtrack", 0.45, 0.75],
  ["cheerful", "pop", 0.7, 0.9],
  ["motivational", "pop", 0.75, 0.8],
  ["energetic", "rock", 0.85, 0.75],
  ["groove", "funk", 0.7, 0.75],
  ["romantic", "pop", 0.4, 0.7],
  ["dreamy", "ambient", 0.25, 0.55],
  // Theme words the picker matches in titles
  ["heart", "pop", 0.5, 0.65],
  ["rhythm", "world", 0.65, 0.7],
  ["breath", "ambient", 0.25, 0.55],
  ["wind", "ambient", 0.35, 0.55],
  ["sky", "ambient", 0.35, 0.65],
  ["dream", "ambient", 0.3, 0.55],
  ["night", "ambient", 0.3, 0.45],
  ["moon", "ambient", 0.25, 0.5],
  ["walk", "folk", 0.5, 0.7],
  ["sweet", "pop", 0.5, 0.8],
  ["hope", "soundtrack", 0.4, 0.7],
  ["light", "ambient", 0.4, 0.7],
  ["sun", "pop", 0.6, 0.8],
  ["summer", "pop", 0.7, 0.85],
  ["morning", "folk", 0.45, 0.75],
  ["river", "ambient", 0.3, 0.6],
  ["ocean", "ambient", 0.25, 0.6],
  ["rain", "ambient", 0.3, 0.45],
  ["home", "folk", 0.4, 0.7],
  ["journey", "soundtrack", 0.5, 0.6],
  ["fire", "rock", 0.75, 0.55],
  ["star", "ambient", 0.35, 0.65],
  ["garden", "folk", 0.4, 0.7],
  ["smile", "pop", 0.6, 0.9],
].map(([q, genre, energy, valence]) => ({ q, genre, energy, valence }));

// Titles and tags that would be jarring next to a patient's chart.
// Grouped: mortality and illness; violence and fear; drink and drugs; sex and profanity;
// stigmatizing words; sadness.
const BLOCKED_WORDS = new RegExp(
  "\\b(" +
    [
      "death|dead|die|dies|dying|kill\\w*|suicid\\w*|funeral|grave|cancer|tumou?r|sick\\w*",
      "diseas\\w*|virus|plague|hospital|doctor|nurse|morgue|coffin|corpse|overdose|ill|pain|agony",
      "hell|blood\\w*|war|wars|guns?|murder\\w*|zombie\\w*|horror|nightmare|demon\\w*|satan\\w*",
      "devil\\w*|assassin\\w*|fear|scream\\w*|terror\\w*|bomb\\w*|weapon\\w*|fight\\w*|hate\\w*",
      "drugs?|cocaine|heroin|booze|beer|drunk\\w*|whiske?y|vodka|tequila|rum|wasted|stoned|weed",
      "sex\\w*|nsfw|porn\\w*|nude|naked|boob\\w*|ass|butt|fuck\\w*|shit\\w*|bitch\\w*|damn",
      "crazy|insane|psycho\\w*|lunatic|mad|stupid|idiot\\w*|ugly|fat",
      "cry\\w*|tears?|goodbye|farewell|lonely|alone|broken|lost|loss|lose|losing|end|grief|sorrow\\w*",
      "mourn\\w*|despair|regret\\w*|heartbreak\\w*|heartache|bleed\\w*|wounds?|hurt\\w*|sad|sadness",
      "revenge|vengeance|shoot\\w*|shot|attack\\w*|enem(y|ies)|battle\\w*|destroy\\w*|rage|fire at will",
    ].join("|") +
    ")\\b",
  "i",
);
const BLOCKED_TAGS = new Set([
  "metal",
  "heavymetal",
  "deathmetal",
  "blackmetal",
  "hardcore",
  "industrial",
  "noise",
  "horror",
  "grindcore",
  "dark",
  "aggressive",
  "angry",
  "scary",
  "violent",
]);
const SPEED_ENERGY = {
  speed_verylow: 0.1,
  speed_low: 0.3,
  speed_medium: 0.5,
  speed_high: 0.72,
  speed_veryhigh: 0.9,
};
const BRIGHT = new Set([
  "happy",
  "joyful",
  "upbeat",
  "positive",
  "cheerful",
  "fun",
  "funny",
  "uplifting",
  "optimistic",
  "bright",
  "energetic",
  "romantic",
  "love",
  "hopeful",
  "playful",
  "sunny",
  "summer",
  "feelgood",
]);
const SOMBER = new Set([
  "sad",
  "melancholic",
  "melancholy",
  "tense",
  "dramatic",
  "gloomy",
  "nostalgic",
  "sombre",
  "somber",
  "mysterious",
  "suspense",
  "emotional",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value) => Math.min(1, Math.max(0, value));
const round = (value) => Math.round(value * 100) / 100;
const norm = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let requests = 0;
let lastRequest = 0;

async function search(seed, page) {
  if (requests >= MAX_REQUESTS) return null;
  const wait = lastRequest + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const url = new URL(API);
  url.search = new URLSearchParams({
    q: seed.q,
    category: "music",
    source: "jamendo",
    license: LICENSES.join(","),
    mature: "false",
    page_size: String(PAGE_SIZE),
    page: String(page),
  }).toString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    requests += 1;
    lastRequest = Date.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
    const left = response.headers.get("x-ratelimit-available-anon_sustained");
    if (left !== null && Number(left) < 3) {
      console.warn(`Openverse daily allowance nearly used (${left} left); stopping searches.`);
      requests = MAX_REQUESTS;
    }
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after")) || 60;
      console.warn(`Rate limited; waiting ${retry}s`);
      await sleep(retry * 1000);
      continue;
    }
    if (response.status === 400 || response.status === 404) return { results: [], page_count: 0 };
    if (!response.ok) throw new Error(`Openverse ${response.status} for "${seed.q}" page ${page}`);
    return response.json();
  }
  return null;
}

/** Whether a track is fit to play next to a patient's chart (title, artist, tags, genres). */
export function suitable({ title, artist, tags = [], genres = [] }) {
  if (BLOCKED_WORDS.test(title) || BLOCKED_WORDS.test(artist)) return false;
  return ![...tags, ...genres].some((tag) => BLOCKED_TAGS.has(tag));
}

function toTrack(result, seed) {
  const license = String(result.license || "").toLowerCase();
  const duration = Number(result.duration);
  const title = String(result.title || "").trim();
  const artist = String(result.creator || "").trim();
  if (!LICENSES.includes(license) || result.mature) return null;
  if (!title || !artist || title.length > 80 || artist.length > 80) return null;
  if (!(duration >= 60_000 && duration <= 600_000)) return null;
  let audio;
  try {
    audio = new URL(result.url);
  } catch {
    return null;
  }
  if (audio.protocol !== "https:") return null;
  const tags = (result.tags || []).map((tag) => norm(tag?.name).replace(/ /g, "")).filter(Boolean);
  const genres = [...new Set([...(result.genres || []).map(norm).filter(Boolean)])];
  if (!suitable({ title, artist, tags, genres })) return null;

  const speed = tags.find((tag) => tag in SPEED_ENERGY);
  const energy = speed ? 0.7 * SPEED_ENERGY[speed] + 0.3 * seed.energy : seed.energy;
  const bright = tags.filter((tag) => BRIGHT.has(tag)).length;
  const somber = tags.filter((tag) => SOMBER.has(tag)).length;
  const valence = seed.valence + 0.12 * Math.min(2, bright) - 0.12 * Math.min(2, somber);
  return {
    id: result.id,
    title,
    artist,
    audioUrl: audio.toString(),
    sourceUrl: result.foreign_landing_url || null,
    artistUrl: result.creator_url || null,
    license,
    licenseVersion: result.license_version || null,
    licenseUrl: result.license_url || null,
    durationSec: Math.round(duration / 1000),
    // The seed's genre too, so the picker's genre preferences always have something to match.
    genres: [...new Set([...genres, seed.genre])],
    tags: tags.filter((tag) => !tag.startsWith("speed")).slice(0, 10),
    energy: round(clamp(energy)),
    valence: round(clamp(valence)),
    seed: seed.q,
  };
}

/** Round-robin over seeds so every genre and theme keeps a share of the catalog. */
function balance(bySeed, target) {
  const queues = [...bySeed.values()].map((tracks) => [...tracks]);
  const picked = [];
  const perArtist = new Map();
  const seen = new Set();
  while (picked.length < target && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      while (queue.length) {
        const track = queue.shift();
        const key = `${norm(track.title)}|${norm(track.artist)}`;
        const artist = norm(track.artist);
        if (seen.has(track.id) || seen.has(key) || (perArtist.get(artist) || 0) >= PER_ARTIST) {
          continue;
        }
        seen.add(track.id);
        seen.add(key);
        perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
        picked.push(track);
        break;
      }
      if (picked.length >= target) break;
    }
  }
  return picked;
}

async function playable(track) {
  // A one-byte range request: some hosts refuse HEAD but stream with ranges.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(track.audioUrl, {
        headers: { Range: "bytes=0-1", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      const type = response.headers.get("content-type") || "";
      if (response.ok && /^audio\//i.test(type)) return true;
      if (response.status === 404 || response.status === 410) return false;
    } catch {
      // Retry once below.
    }
    await sleep(1000);
  }
  return false;
}

async function verify(tracks) {
  const ok = [];
  let index = 0;
  let checked = 0;
  async function worker() {
    while (index < tracks.length) {
      const track = tracks[index];
      index += 1;
      if (await playable(track)) ok.push(track);
      checked += 1;
      if (checked % 100 === 0) console.log(`  verified ${checked}/${tracks.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return ok;
}

function sortTracks(tracks) {
  return [...tracks].sort(
    (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  );
}

const LICENSE_NAMES = { cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA" };

function attributions(tracks) {
  const escape = (text) => String(text).replace(/([\\`*_[\]<>|])/g, "\\$1");
  const lines = tracks.map((t) => {
    const license =
      `${LICENSE_NAMES[t.license] || t.license.toUpperCase()} ${t.licenseVersion || ""}`.trim();
    const title = t.sourceUrl ? `[${escape(t.title)}](${t.sourceUrl})` : escape(t.title);
    const artist = t.artistUrl ? `[${escape(t.artist)}](${t.artistUrl})` : escape(t.artist);
    const licensed = t.licenseUrl ? `[${license}](${t.licenseUrl})` : license;
    return `- ${title} by ${artist}, ${licensed}`;
  });
  return [
    "# Music attributions",
    "",
    "Record Player streams these openly licensed tracks from Jamendo. The catalog was built from",
    "the [Openverse](https://openverse.org) index by `scripts/build-catalog.mjs`. Each track is",
    "used under the license shown; the app shows the title, artist, license and a link to the",
    "source while a track plays. The tracks are not modified.",
    "",
    `${tracks.length} tracks.`,
    "",
    ...lines,
    "",
  ].join("\n");
}

async function write(tracks) {
  const sorted = sortTracks(tracks);
  await mkdir(path.dirname(CATALOG), { recursive: true });
  // One track per line: small, and every change shows up as a readable diff.
  await writeFile(CATALOG, `[\n${sorted.map((t) => JSON.stringify(t)).join(",\n")}\n]\n`);
  await writeFile(ATTRIBUTIONS, attributions(sorted));
  const hosts = [...new Set(sorted.map((t) => new URL(t.audioUrl).host))].sort();
  const licenses = sorted.reduce(
    (acc, t) => ({ ...acc, [t.license]: (acc[t.license] || 0) + 1 }),
    {},
  );
  console.log(`Wrote ${sorted.length} tracks to ${path.relative(ROOT, CATALOG)}`);
  console.log(`Licenses: ${JSON.stringify(licenses)}`);
  console.log(`Audio hosts (must be in public/_headers media-src): ${hosts.join(" ")}`);
}

async function main() {
  if (flag("--refilter")) {
    // Re-apply the content filters (after editing them) without searching again.
    const tracks = JSON.parse(await readFile(CATALOG, "utf8"));
    const kept = tracks.filter(suitable);
    for (const track of tracks.filter((t) => !suitable(t))) {
      console.log(`  removed "${track.title}" by ${track.artist}`);
    }
    await write(kept);
    return;
  }
  if (flag("--verify-only")) {
    const tracks = JSON.parse(await readFile(CATALOG, "utf8"));
    const ok = await verify(tracks);
    console.log(`${ok.length}/${tracks.length} tracks are playable.`);
    if (ok.length !== tracks.length && flag("--prune")) await write(ok);
    process.exitCode = ok.length === tracks.length ? 0 : 1;
    return;
  }

  const bySeed = new Map();
  const seenIds = new Set();
  for (let page = 1; page <= PAGES_PER_SEED; page += 1) {
    for (const seed of SEEDS) {
      if (page > 1 && (bySeed.get(seed.q)?.exhausted ?? false)) continue;
      const data = await search(seed, page);
      if (!data) break;
      const list = bySeed.get(seed.q) || Object.assign([], { exhausted: false });
      for (const result of data.results || []) {
        if (seenIds.has(result.id)) continue;
        const track = toTrack(result, seed);
        if (track) {
          seenIds.add(result.id);
          list.push(track);
        }
      }
      list.exhausted = page >= (data.page_count || 0);
      bySeed.set(seed.q, list);
      const total = [...bySeed.values()].reduce((sum, l) => sum + l.length, 0);
      console.log(
        `[${requests}] ${seed.q} p${page}: ${data.results?.length ?? 0} results, ${total} candidates`,
      );
    }
    if (requests >= MAX_REQUESTS) break;
  }

  // Over-select so tracks that fail verification can be dropped and still reach the target.
  let tracks = balance(bySeed, flag("--no-verify") ? TARGET : Math.round(TARGET * 1.08));
  if (!flag("--no-verify")) {
    console.log(`Verifying ${tracks.length} audio URLs...`);
    tracks = await verify(tracks);
  }
  await write(balance(groupBySeed(tracks), TARGET));
}

function groupBySeed(tracks) {
  const map = new Map();
  for (const track of tracks) map.set(track.seed, [...(map.get(track.seed) || []), track]);
  return map;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
