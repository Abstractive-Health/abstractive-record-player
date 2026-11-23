import { init } from "fhirclient/browser";
import { ABSTRACTIVE_SCOPE, CLIENT_ID, scopeFor, serverKind } from "../config.js";

/** A launch problem to show the user as is (it never contains patient data). */
export class LaunchError extends Error {}

/**
 * Run the SMART EHR launch with fhirclient (https://docs.smarthealthit.org/client-js/).
 *
 * Abstractive (or the SMART App Launcher) opens the app at `/?iss=<FHIR base>&launch=<token>`.
 * `init` sends the browser to that server's authorize endpoint (PKCE, no client secret: this
 * is a public client), which redirects back here with `?code=`. The second `init` exchanges
 * the code and resolves to a client bound to the launch patient. fhirclient keeps only that
 * SMART session (token, patient id) in this tab's sessionStorage.
 *
 * @param {object} [options]
 * @param {Location} [options.location] window.location (injected for tests)
 * @param {typeof init} [options.smartInit] fhirclient's init (injected for tests)
 * @param {(iss: string) => string|null} [options.kindOf] which FHIR servers are accepted
 * @returns {Promise<import("fhirclient/lib/Client").default>}
 */
export async function launch({
  location = window.location,
  smartInit = init,
  kindOf = serverKind,
} = {}) {
  const params = new URLSearchParams(location.search);
  const iss = params.get("iss");
  const kind = iss ? kindOf(iss) : null;
  if (iss && !kind) {
    throw new LaunchError("Record Player can't be opened from this FHIR server.");
  }
  if (!iss && !params.get("code") && !params.get("state") && !hasSession()) {
    throw new LaunchError(
      "Open Record Player from a patient's chart in Abstractive Health or from the SMART App Launcher.",
    );
  }
  // fhirclient revives a stored session before honoring a new launch, so a second chart
  // opened in the same tab would get the first chart's patient.
  if (params.get("launch")) forgetSession();
  try {
    return await smartInit({
      clientId: CLIENT_ID,
      // On the redirect back (no iss) the scope was already fixed by the authorize step.
      scope: kind ? scopeFor(kind) : ABSTRACTIVE_SCOPE,
      redirectUri: `${location.origin}/`,
      pkceMode: "required",
      // Abstractive shows the app in an iframe: finish the sign-in in that same frame.
      completeInTarget: true,
    });
  } catch (error) {
    throw new LaunchError(
      /No 'state'|No state/.test(error?.message || "")
        ? "This launch has expired. Open Record Player again from the chart."
        : "The EHR didn't authorize this launch. Open Record Player again from the chart.",
      { cause: error },
    );
  }
}

/** "abstractive" or "sandbox": which kind of server the authorized client talks to. */
export function clientKind(client, kindOf = serverKind) {
  return kindOf(client?.state?.serverUrl || "");
}

function hasSession() {
  try {
    return Boolean(window.sessionStorage.getItem("SMART_KEY"));
  } catch {
    return false;
  }
}

/** Drop fhirclient's stored session (SMART_KEY points at the state entry). */
export function forgetSession(storage) {
  try {
    storage ??= window.sessionStorage;
    const key = JSON.parse(storage.getItem("SMART_KEY") || "null");
    if (typeof key === "string") storage.removeItem(key);
    storage.removeItem("SMART_KEY");
  } catch {
    // No usable sessionStorage: fhirclient has nothing stored to revive either.
  }
}

let connection;

/** One launch per page load, even if React mounts twice in development. */
export function connect(options) {
  connection ??= launch(options);
  return connection;
}
