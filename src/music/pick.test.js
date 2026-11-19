import { describe, expect, it } from "vitest";
import catalog from "../catalog/tracks.json";
import { extractFeatures, NEUTRAL_PROFILE } from "./features.js";
import { pickTrack, scoreTrack } from "./pick.js";
import { dayKey, hash, songSeed } from "./rng.js";

const track = (overrides) => ({
  id: overrides.title,
  artist: "A",
  energy: 0.5,
  valence: 0.6,
  genres: [],
  tags: [],
  seed: "pop",
  ...overrides,
});

const SUMMARIES = [
  "68-year-old with CHF and atrial fibrillation, on a beta blocker.",
  "Asthma exacerbation, albuterol inhaler; shortness of breath improving.",
  "Chronic insomnia and migraines; poor sleep.",
  "Right hip fracture after a fall, starting physical therapy.",
  "Type 2 diabetes, A1c 8.1, on metformin and insulin.",
  "Breast cancer on chemotherapy; tolerating well.",
  "28 weeks pregnant, routine prenatal care.",
  "Generalized anxiety and depression, on sertraline, seeing counseling.",
  "CKD stage 3, followed by nephrology for renal function.",
  "Cellulitis of the leg treated with antibiotics; fever resolved.",
  "Status post knee surgery, discharged home, recovering well.",
  "Annual wellness visit, healthy 25-year-old, vaccines up to date.",
  "Parkinson disease with tremor, stable.",
  "COPD on home oxygen, 79-year-old.",
  "GERD and reflux, Crohn disease in remission.",
  "Hypertension and hyperlipidemia, on a statin.",
  "ADHD in a 9-year-old, doing well at school.",
  "Seizure disorder on levetiracetam.",
  "Post-op day 2 after appendectomy.",
  "Healthy 40-year-old, no acute issues.",
];

describe("scoreTrack", () => {
  it("prefers titles that fit the chart's themes", () => {
    const profile = extractFeatures("Atrial fibrillation and heart failure.");
    const heart = track({ title: "My Heart Beats" });
    const other = track({ title: "Untitled" });
    expect(scoreTrack(heart, profile)).toBeGreaterThan(scoreTrack(other, profile));
  });

  it("prefers tracks whose mood is close", () => {
    const calm = { ...NEUTRAL_PROFILE, energy: 0.2, valence: 0.5 };
    expect(scoreTrack(track({ title: "a", energy: 0.2, valence: 0.5 }), calm)).toBeGreaterThan(
      scoreTrack(track({ title: "b", energy: 0.9, valence: 0.9 }), calm),
    );
  });
});

describe("pickTrack", () => {
  it("is stable for the same chart on the same day", () => {
    const profile = extractFeatures(SUMMARIES[0]);
    const seed = songSeed(SUMMARIES[0], new Date(2026, 10, 15));
    expect(pickTrack(catalog, profile, seed).id).toBe(pickTrack(catalog, profile, seed).id);
  });

  it("gives different charts a wide variety of songs", () => {
    const date = new Date(2026, 10, 15);
    const picks = SUMMARIES.map((text) =>
      pickTrack(catalog, extractFeatures(text), songSeed(text, date)),
    );
    expect(new Set(picks.map((p) => p.id)).size).toBeGreaterThanOrEqual(SUMMARIES.length - 2);
  });

  it("changes the song from day to day", () => {
    const profile = extractFeatures(SUMMARIES[1]);
    const days = Array.from(
      { length: 10 },
      (_, i) => pickTrack(catalog, profile, songSeed(SUMMARIES[1], new Date(2026, 10, 1 + i))).id,
    );
    expect(new Set(days).size).toBeGreaterThan(3);
  });

  it("rejects an empty catalog", () => {
    expect(() => pickTrack([], NEUTRAL_PROFILE, 1)).toThrow();
  });
});

describe("rng", () => {
  it("hashes deterministically and keys by local day", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
