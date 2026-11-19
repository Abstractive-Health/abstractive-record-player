import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "./tracks.json";
import { ABSTRACTIVE_ISS, SANDBOX_ISS } from "../config.js";

// Vitest runs from the repository root.
const headers = readFileSync(path.resolve(process.cwd(), "public/_headers"), "utf8");
const directive = (name) => {
  const match = headers.match(new RegExp(`${name} ([^;\\n]+)`));
  return match ? match[1].trim().split(/\s+/) : [];
};

describe("catalog", () => {
  it("holds about a thousand openly licensed, attributable tracks", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(900);
    for (const track of catalog) {
      expect(["cc0", "pdm", "by", "by-sa"]).toContain(track.license);
      expect(track.title && track.artist && track.audioUrl).toBeTruthy();
      expect(track.audioUrl.startsWith("https://")).toBe(true);
      expect(track.energy).toBeGreaterThanOrEqual(0);
      expect(track.valence).toBeLessThanOrEqual(1);
    }
    expect(new Set(catalog.map((t) => t.id)).size).toBe(catalog.length);
  });

  it("only streams from hosts the CSP allows", () => {
    const allowed = directive("media-src");
    const hosts = new Set(catalog.map((t) => new URL(t.audioUrl).origin));
    for (const host of hosts) expect(allowed).toContain(host);
  });

  it("lets the app reach every FHIR server it accepts, and those servers frame it", () => {
    const allowed = directive("connect-src");
    const servers = [...ABSTRACTIVE_ISS, ...SANDBOX_ISS];
    expect(servers.length).toBeGreaterThan(0);
    for (const iss of servers) expect(allowed).toContain(new URL(iss.replace(/\*$/, "")).origin);
    expect(directive("frame-ancestors")).toEqual(
      expect.arrayContaining(["https://app.abstractive.ai", "https://launch.smarthealthit.org"]),
    );
  });
});
