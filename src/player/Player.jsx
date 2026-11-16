import { useEffect, useRef, useState } from "react";
import Vinyl from "./Vinyl.jsx";

const LOAD_FAILED = "This song couldn't be loaded right now.";

const LICENSES = { cc0: "CC0", pdm: "Public domain", by: "CC BY", "by-sa": "CC BY-SA" };

export function licenseLabel(track) {
  const name = LICENSES[track.license] || String(track.license || "").toUpperCase();
  return track.licenseVersion && track.license !== "pdm" ? `${name} ${track.licenseVersion}` : name;
}

/**
 * The whole interface: what's playing, play/pause, and volume.
 *
 * Audio is only requested when the user presses play (preload="none"), from the
 * track's fixed catalog URL. Nothing about the patient is in that request.
 */
export default function Player({ track, note }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  async function toggle() {
    const element = audio.current;
    if (!element) return;
    setProblem(null);
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      await element.play();
    } catch (error) {
      // NotAllowedError: autoplay policy. Anything else: the audio itself failed, which onError
      // may already have reported.
      setProblem((current) =>
        error?.name === "NotAllowedError"
          ? "The browser blocked playback. Press play again."
          : current || LOAD_FAILED,
      );
    }
  }

  return (
    <main className="player">
      <Vinyl spinning={playing} />
      <section className="now-playing" aria-live="polite">
        <p className="eyebrow">{playing ? "Now playing" : "This chart's song"}</p>
        <h1 className="title">{track.title}</h1>
        <p className="artist">{track.artist}</p>
        {note ? <p className="note">{note}</p> : null}
        {problem ? (
          <p className="note" role="alert">
            {problem}
          </p>
        ) : null}
      </section>
      <div className="controls">
        <button
          type="button"
          className="play"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>
        <label className="volume">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h3l4.5-4v14L7 15H4z" />
            <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" fill="none" />
          </svg>
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
      </div>
      <audio
        ref={audio}
        src={track.audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setProblem(LOAD_FAILED);
        }}
      />
      <footer className="footer">
        <span className="tag">Internal app · Built by Abstractive Health</span>
        <a href={track.sourceUrl || track.licenseUrl} target="_blank" rel="noreferrer noopener">
          {licenseLabel(track)} · Jamendo
        </a>
      </footer>
    </main>
  );
}
