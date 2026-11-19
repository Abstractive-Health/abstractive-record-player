#!/usr/bin/env node
/**
 * A tiny stand-in for Abstractive Health's SMART authorization server and FHIR API, so you
 * can run the whole launch locally with a synthetic patient. Development only: it approves
 * every launch and serves made-up data.
 *
 *   npm run demo       # starts this server and the app, then open http://localhost:9090/
 *
 * It implements just what Record Player uses: SMART discovery, /authorize (EHR launch with
 * PKCE S256), /token (public client), the AI summary DocumentReference search and its Binary.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 9090);
const APP = process.env.APP_URL || "http://localhost:5173/";
const ORIGIN = `http://localhost:${PORT}`;
const FHIR = `${ORIGIN}/fhir/r4`;
const CATEGORY = "https://abstractivehealth.com/fhir/CodeSystem/document-category";

// Synthetic only. Edit it to hear how the song changes.
const SUMMARIES = {
  "demo-cardiac": `## HPI

72-year-old with atrial fibrillation and hypertension, on apixaban and a statin. Palpitations
have improved since rate control. Stable.

## Allergies

*No known allergies.`,
  "demo-respiratory": `## HPI

34-year-old with moderate persistent asthma. Recent exacerbation treated with albuterol and a
short steroid course; shortness of breath is improving.`,
  "demo-wellness": `## HPI

Healthy 25-year-old here for an annual physical. Immunizations up to date. No acute issues.`,
};

const launches = new Map();
const codes = new Map();
const tokens = new Map();

const b64url = (buffer) => buffer.toString("base64url");
const token = () => b64url(randomBytes(24));

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Cache-Control": "no-store",
    "Content-Type": typeof body === "string" ? "text/html" : "application/fhir+json",
    ...headers,
  });
  res.end(json);
}

async function form(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return new URLSearchParams(raw);
}

function bearer(req) {
  const value = (req.headers.authorization || "").replace(/^Bearer /, "");
  return tokens.get(value);
}

function launchPage() {
  const links = Object.keys(SUMMARIES)
    .map((patient) => {
      const launch = token();
      launches.set(launch, patient);
      const url = `${APP}?iss=${encodeURIComponent(FHIR)}&launch=${launch}`;
      return `<li><a href="${url}">${patient}</a></li>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Mock Abstractive launcher</title>
<body style="font-family:system-ui;max-width:40rem;margin:3rem auto">
<h1>Mock Abstractive launcher</h1>
<p>Launch Record Player for a synthetic patient (each link works once):</p><ul>${links}</ul></body>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (url.pathname === "/") return send(res, 200, launchPage());

  if (url.pathname === "/fhir/r4/.well-known/smart-configuration") {
    return send(res, 200, {
      issuer: FHIR,
      authorization_endpoint: `${ORIGIN}/smart/authorize`,
      token_endpoint: `${ORIGIN}/smart/token`,
      token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      capabilities: ["launch-ehr", "client-public", "context-ehr-patient"],
    });
  }

  if (url.pathname === "/smart/authorize") {
    const p = url.searchParams;
    const patient = launches.get(p.get("launch"));
    launches.delete(p.get("launch"));
    if (!patient || p.get("aud") !== FHIR || p.get("code_challenge_method") !== "S256") {
      return send(res, 400, { error: "invalid_request" });
    }
    const code = token();
    codes.set(code, {
      patient,
      challenge: p.get("code_challenge"),
      redirect: p.get("redirect_uri"),
      scope: p.get("scope"),
    });
    const back = new URL(p.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", p.get("state"));
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (url.pathname === "/smart/token" && req.method === "POST") {
    const p = await form(req);
    const grant = codes.get(p.get("code"));
    codes.delete(p.get("code"));
    const verifier = p.get("code_verifier") || "";
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    if (!grant || grant.challenge !== challenge || grant.redirect !== p.get("redirect_uri")) {
      return send(res, 400, { error: "invalid_grant" });
    }
    const access = token();
    tokens.set(access, grant.patient);
    return send(res, 200, {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      scope: grant.scope,
      patient: grant.patient,
    });
  }

  const patient = bearer(req);
  if (url.pathname.startsWith("/fhir/r4/") && !patient)
    return send(res, 401, { error: "unauthorized" });

  if (url.pathname === "/fhir/r4/DocumentReference") {
    const matches =
      url.searchParams.get("patient") === patient &&
      url.searchParams.get("category") === `${CATEGORY}|ai-summary`;
    return send(res, 200, {
      resourceType: "Bundle",
      type: "searchset",
      total: matches ? 1 : 0,
      entry: matches
        ? [
            {
              resource: {
                resourceType: "DocumentReference",
                id: `summary-${patient}`,
                status: "current",
                category: [{ coding: [{ system: CATEGORY, code: "ai-summary" }] }],
                subject: { reference: `Patient/${patient}` },
                content: [
                  { attachment: { contentType: "text/markdown", url: `Binary/${patient}` } },
                ],
              },
            },
          ]
        : [],
    });
  }

  if (url.pathname === `/fhir/r4/Binary/${patient}`) {
    return send(res, 200, {
      resourceType: "Binary",
      id: patient,
      contentType: "text/markdown",
      data: Buffer.from(SUMMARIES[patient], "utf8").toString("base64"),
    });
  }

  return send(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`Mock Abstractive at ${ORIGIN} (FHIR ${FHIR}); open ${ORIGIN}/ to launch.`);
});
