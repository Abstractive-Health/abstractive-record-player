/** The spinning record (decorative). Matches the app icon. */
export default function Vinyl({ spinning }) {
  return (
    <svg
      className={spinning ? "vinyl spinning" : "vinyl"}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="100" cy="100" r="96" fill="var(--navy)" />
      <g fill="none" stroke="var(--cream)" strokeLinecap="round" strokeWidth="2.5" opacity="0.85">
        <path d="M100 18a82 82 0 0 1 71 41" />
        <path d="M100 30a70 70 0 0 1 61 35" />
        <path d="M168 128a72 72 0 0 1-37 37" />
        <path d="M158 122a60 60 0 0 1-31 31" />
      </g>
      <circle cx="100" cy="100" r="36" fill="var(--lilac)" />
      <polyline
        points="70,100 85,100 91,88 99,114 107,80 113,106 117,100 130,100"
        fill="none"
        stroke="var(--navy)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
