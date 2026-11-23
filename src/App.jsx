import { useEffect, useState } from "react";
import { clientKind, connect, LaunchError } from "./smart/launch.js";
import { fetchProblemListText, fetchSummaryText } from "./smart/summary.js";
import { loadCatalog } from "./catalog/loadCatalog.js";
import { extractFeatures, NEUTRAL_PROFILE } from "./music/features.js";
import { pickTrack } from "./music/pick.js";
import { songSeed } from "./music/rng.js";
import Player from "./player/Player.jsx";
import Vinyl from "./player/Vinyl.jsx";

/**
 * What the app reads about the chart: the Abstractive AI summary, or on other SMART servers
 * (the SMART App Gallery's sandbox) without one, the patient's age and problem list.
 *
 * @returns {Promise<{text: string|null, source: "summary"|"problems"|"missing"}>}
 */
export async function readChart(client) {
  if (clientKind(client) !== "sandbox") {
    const summary = await fetchSummaryText(client);
    return summary ? { text: summary, source: "summary" } : { text: null, source: "missing" };
  }
  // Other SMART servers may not support the AI-summary search at all; that's no reason to
  // skip the problem list.
  const summary = await fetchSummaryText(client).catch(() => null);
  if (summary) return { text: summary, source: "summary" };
  const problems = await fetchProblemListText(client);
  return problems ? { text: problems, source: "problems" } : { text: null, source: "missing" };
}

/**
 * Launch, read the chart, pick a song, play it. The chart text lives only inside
 * chooseSong(): it becomes a profile and a seed, and only the chosen track is kept.
 */
export async function chooseSong({ client, read, catalog, date }) {
  // Without chart text, seed by patient so charts still differ (hashed, never kept).
  const fallbackSeed = () => songSeed(`patient:${patientIdOf(client)}`, date);
  let chart;
  try {
    chart = await read(client);
  } catch (error) {
    // Still play something; say why without logging any patient data.
    console.warn("Record Player: the chart could not be read", error?.status ?? "");
    return { track: pickTrack(catalog, NEUTRAL_PROFILE, fallbackSeed()), source: "error" };
  }
  if (!chart.text) {
    return { track: pickTrack(catalog, NEUTRAL_PROFILE, fallbackSeed()), source: chart.source };
  }
  const track = pickTrack(catalog, extractFeatures(chart.text), songSeed(chart.text, date));
  return { track, source: chart.source };
}

function patientIdOf(client) {
  try {
    return client?.getPatientId?.() ?? client?.patient?.id ?? "";
  } catch {
    return "";
  }
}

const today = () => new Date();

const NOTES = {
  problems: "Picked from this patient's problem list.",
  missing: "An easygoing pick for this chart.",
  error: "The chart couldn't be read, so here's an easygoing pick.",
};

export default function App({
  start = connect,
  read = readChart,
  catalog = loadCatalog,
  now = today,
}) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [client, tracks] = await Promise.all([start(), catalog()]);
        const result = await chooseSong({ client, read, catalog: tracks, date: now() });
        if (active) setState({ status: "ready", ...result });
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof LaunchError
            ? error.message
            : "Something went wrong loading this chart's song. Open Record Player again from the chart.";
        setState({ status: "error", message });
      }
    })();
    return () => {
      active = false;
    };
  }, [start, read, catalog, now]);

  if (state.status === "ready") {
    return <Player track={state.track} note={NOTES[state.source]} />;
  }
  return (
    <main className="player">
      <Vinyl spinning={state.status === "loading"} />
      <section className="now-playing" aria-live="polite">
        {state.status === "error" ? (
          <>
            <h1 className="title">Record Player</h1>
            <p className="note" role="alert">
              {state.message}
            </p>
          </>
        ) : (
          <p className="eyebrow">Finding this chart's song…</p>
        )}
      </section>
      <footer className="footer">
        <span className="tag">Internal app · Built by Abstractive Health</span>
      </footer>
    </main>
  );
}
