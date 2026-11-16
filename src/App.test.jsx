import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App, { chooseSong, readChart } from "./App.jsx";
import { LaunchError } from "./smart/launch.js";

const CATALOG = [
  {
    id: "a",
    title: "Heartbeat",
    artist: "A",
    audioUrl: "https://x/a",
    license: "by",
    energy: 0.5,
    valence: 0.7,
    genres: ["pop"],
    tags: [],
    seed: "heart",
  },
  {
    id: "b",
    title: "Calm Sea",
    artist: "B",
    audioUrl: "https://x/b",
    license: "cc0",
    energy: 0.2,
    valence: 0.6,
    genres: ["ambient"],
    tags: [],
    seed: "ocean",
  },
];
const DATE = () => new Date(2026, 10, 15);
const catalog = async () => CATALOG;

describe("App", () => {
  it("launches, reads the chart and shows the chosen song", async () => {
    const read = vi.fn().mockResolvedValue({
      text: "Atrial fibrillation and heart failure.",
      source: "summary",
    });
    render(<App start={async () => "client"} read={read} catalog={catalog} now={DATE} />);
    expect(await screen.findByRole("heading", { name: "Heartbeat" })).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith("client");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("says when the song came from the problem list (SMART App Gallery sandbox)", async () => {
    const read = async () => ({ text: "Problem list:\n- Asthma", source: "problems" });
    render(<App start={async () => "client"} read={read} catalog={catalog} now={DATE} />);
    expect(await screen.findByText(/problem list/)).toBeInTheDocument();
  });

  it("explains launch problems", async () => {
    const start = async () => {
      throw new LaunchError("Open Record Player from a patient's chart in Abstractive Health.");
    };
    render(<App start={start} catalog={catalog} now={DATE} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Open Record Player from a patient's chart",
    );
  });
});

describe("chooseSong", () => {
  it("still picks a song when the chart has no summary or can't be read", async () => {
    const read = async () => ({ text: null, source: "missing" });
    const missing = await chooseSong({ client: {}, read, catalog: CATALOG, date: DATE() });
    expect(missing.source).toBe("missing");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = await chooseSong({
      client: {},
      read: async () => {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      },
      catalog: CATALOG,
      date: DATE(),
    });
    expect(failed.source).toBe("error");
    expect(CATALOG).toContain(failed.track);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("Forbidden"));
  });
});

describe("readChart", () => {
  const bundle = (resources) => ({
    resourceType: "Bundle",
    entry: resources.map((resource) => ({ resource })),
  });
  const client = (serverUrl, onRequest) => ({
    state: { serverUrl },
    patient: { id: "p1" },
    request: vi.fn(onRequest),
  });

  it("falls back to the problem list when a SMART sandbox rejects the AI-summary search", async () => {
    const sandbox = client("https://launch.smarthealthit.org/v/r4/fhir", async (url) => {
      if (url.startsWith("DocumentReference"))
        throw Object.assign(new Error("Bad Request"), { status: 400 });
      if (url.startsWith("Patient/")) return { resourceType: "Patient" };
      return bundle([{ resourceType: "Condition", code: { text: "Asthma" } }]);
    });
    await expect(readChart(sandbox)).resolves.toEqual({
      text: "Problem list:\n- Asthma",
      source: "problems",
    });
  });

  it("on Abstractive reads only the AI summary, and reports a failed read", async () => {
    const abstractive = client("https://test-api.abstractive.ai/fhir/r4", async () => {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    });
    await expect(readChart(abstractive)).rejects.toThrow("Forbidden");
    expect(abstractive.request).toHaveBeenCalledTimes(1);
    const empty = client("https://test-api.abstractive.ai/fhir/r4", async () => bundle([]));
    await expect(readChart(empty)).resolves.toEqual({ text: null, source: "missing" });
  });
});
