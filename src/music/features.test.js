import { describe, expect, it } from "vitest";
import { ageBand, extractFeatures, NEUTRAL_PROFILE } from "./features.js";

const ids = (profile) => profile.themes.map((t) => t.id);

describe("extractFeatures", () => {
  it("finds clinical themes in a summary", () => {
    const profile = extractFeatures(
      "## HPI\n\n72-year-old with atrial fibrillation and hypertension, on a statin. COPD on an inhaler.",
    );
    expect(ids(profile).slice(0, 2)).toEqual(["cardiac", "respiratory"]);
    expect(profile.ageBand).toBe("older");
    expect(profile.genres.jazz).toBeGreaterThan(0);
  });

  it("ignores negated mentions", () => {
    expect(ids(extractFeatures("Denies chest pain. No history of cancer or diabetes."))).toEqual(
      [],
    );
    expect(ids(extractFeatures("Type 2 diabetes; no history of cancer."))).toEqual(["metabolic"]);
  });

  it("calms down for high-acuity charts and brightens for improving ones", () => {
    const sick = extractFeatures(
      "Admitted to the ICU with septic shock, intubated. Severe pneumonia.",
    );
    const well = extractFeatures(
      "Annual physical. Healthy, immunizations up to date. Stable, improving.",
    );
    expect(sick.energy).toBeLessThan(well.energy);
    expect(sick.valence).toBeLessThan(well.valence);
    expect(ids(well)).toContain("wellness");
  });

  it("returns the neutral profile for an empty summary", () => {
    expect(extractFeatures("")).toEqual(NEUTRAL_PROFILE);
    expect(extractFeatures("   ")).toEqual(NEUTRAL_PROFILE);
  });

  it("keeps energy and valence in range", () => {
    const profile = extractFeatures("ICU ".repeat(50) + "worsening ".repeat(50));
    expect(profile.energy).toBeGreaterThanOrEqual(0.05);
    expect(profile.valence).toBeGreaterThanOrEqual(0.05);
  });
});

describe("ageBand", () => {
  it.each([
    ["A 4-year-old boy", "child"],
    ["16 yo female", "teen"],
    ["32 year old", "young"],
    ["Age: 58", "middle"],
    ["84-year-old woman", "older"],
    ["no age here", null],
    ["300-year-old tree", null],
  ])("%s -> %s", (text, band) => {
    expect(ageBand(text)).toBe(band);
  });
});
