/**
 * Build-time settings, read from VITE_* variables (see .env). They are public: they ship in
 * the browser bundle, so never put a secret here (a SMART public client has none).
 */
const env = import.meta.env;

/** The client id registered for this app in Abstractive's SMART_CLIENTS_JSON. */
export const CLIENT_ID = env.VITE_SMART_CLIENT_ID || "abstractive-record-player";

/**
 * On Abstractive, only what the app needs: the launch context and read access to the
 * patient's documents (the AI summary DocumentReference and the Binary holding its text).
 * No openid/fhirUser (no user profile) and no offline_access (no refresh tokens).
 */
export const ABSTRACTIVE_SCOPE = "launch patient/DocumentReference.read patient/Binary.read";

/**
 * On other SMART servers (the SMART App Gallery's sandbox), the same plus the patient's age
 * and problem list, which stand in for the AI summary those servers don't have.
 */
export const SANDBOX_SCOPE = `${ABSTRACTIVE_SCOPE} patient/Patient.read patient/Condition.read`;

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

export const ABSTRACTIVE_ISS = list(env.VITE_ABSTRACTIVE_ISS);
export const SANDBOX_ISS = list(env.VITE_SANDBOX_ISS);

/** Whether `iss` is one of `patterns`: exact, or below a pattern ending in `/*`. */
export function matchesIss(iss, patterns) {
  let url;
  try {
    url = new URL(iss);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return false;
  if (url.search || url.hash || url.username || url.password) return false;
  const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  return patterns.some((pattern) =>
    pattern.endsWith("/*")
      ? normalized.startsWith(pattern.slice(0, -1)) && !normalized.includes("/../")
      : normalized === pattern,
  );
}

/** "abstractive", "sandbox", or null for a FHIR server this build refuses. */
export function serverKind(iss, { abstractive = ABSTRACTIVE_ISS, sandbox = SANDBOX_ISS } = {}) {
  if (matchesIss(iss, abstractive)) return "abstractive";
  if (matchesIss(iss, sandbox)) return "sandbox";
  return null;
}

export const scopeFor = (kind) => (kind === "abstractive" ? ABSTRACTIVE_SCOPE : SANDBOX_SCOPE);
