/**
 * Abstractive publishes the patient's AI medical record summary like any other document:
 * a DocumentReference whose attachment points at a Binary. Only its category is special.
 */
export const AI_SUMMARY_CATEGORY =
  "https://abstractivehealth.com/fhir/CodeSystem/document-category|ai-summary";

/**
 * Read the launch patient's AI summary as text, or null when there isn't one yet.
 *
 * The text is only ever held in memory: callers turn it into a song and drop it.
 *
 * @param {object} client fhirclient Client from launch()
 * @returns {Promise<string|null>}
 */
export async function fetchSummaryText(client) {
  const patientId = client.getPatientId?.() ?? client.patient?.id;
  if (!patientId) return null;
  const query = new URLSearchParams({
    patient: patientId,
    category: AI_SUMMARY_CATEGORY,
    _count: "1",
  });
  const bundle = await client.request(`DocumentReference?${query}`);
  const documents = (bundle?.entry || [])
    .map((entry) => entry?.resource)
    .filter((resource) => resource?.resourceType === "DocumentReference")
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  for (const document of documents) {
    for (const content of document.content || []) {
      const text = await attachmentText(client, content?.attachment);
      if (text?.trim()) return text;
    }
  }
  return null;
}

async function attachmentText(client, attachment) {
  if (!attachment) return null;
  if (typeof attachment.data === "string") return decodeBase64(attachment.data);
  const url = attachment.url;
  if (typeof url !== "string" || !/^Binary\/[A-Za-z0-9.-]{1,64}$/.test(url)) return null;
  // Ask for a FHIR Binary (base64 data) rather than raw bytes: same parsing everywhere.
  const binary = await client.request({ url, headers: { Accept: "application/fhir+json" } });
  if (binary?.resourceType === "Binary" && typeof binary.data === "string") {
    return decodeBase64(binary.data);
  }
  return typeof binary === "string" ? binary : null;
}

export function decodeBase64(data) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

const INACTIVE = new Set(["inactive", "resolved", "remission"]);
const NOT_REAL = new Set(["entered-in-error", "refuted"]);

function ageFrom(birthDate, today = new Date()) {
  const born = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/**
 * On SMART servers without an Abstractive AI summary (such as the SMART App Gallery's
 * sandbox), describe the chart from the patient's age and problem list instead, as text the
 * same song picker understands. Like the summary, it's only held in memory.
 *
 * @param {object} client fhirclient Client from launch()
 * @param {Date} [today]
 * @returns {Promise<string|null>}
 */
export async function fetchProblemListText(client, today = new Date()) {
  const patientId = client.getPatientId?.() ?? client.patient?.id;
  if (!patientId) return null;
  const [patient, bundle] = await Promise.all([
    client.request(`Patient/${encodeURIComponent(patientId)}`).catch(() => null),
    client.request(`Condition?${new URLSearchParams({ patient: patientId, _count: "100" })}`),
  ]);
  const problems = new Map();
  for (const entry of bundle?.entry || []) {
    const condition = entry?.resource;
    if (condition?.resourceType !== "Condition") continue;
    const verification = condition.verificationStatus?.coding?.[0]?.code;
    if (NOT_REAL.has(verification)) continue;
    const name = condition.code?.text || condition.code?.coding?.find((c) => c.display)?.display;
    if (!name) continue;
    const status = condition.clinicalStatus?.coding?.[0]?.code;
    problems.set(name, INACTIVE.has(status) ? `${name} (resolved)` : name);
  }
  const age = patient?.birthDate ? ageFrom(patient.birthDate, today) : null;
  const lines = [];
  if (age !== null) lines.push(`${age}-year-old patient.`);
  if (problems.size) lines.push("Problem list:", ...[...problems.values()].map((p) => `- ${p}`));
  return lines.length ? lines.join("\n") : null;
}
