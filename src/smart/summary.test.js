import { describe, expect, it, vi } from "vitest";
import {
  AI_SUMMARY_CATEGORY,
  decodeBase64,
  fetchProblemListText,
  fetchSummaryText,
} from "./summary.js";

const b64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function fakeClient(responses) {
  return {
    patient: { id: "p1" },
    request: vi.fn(async (request) => {
      const key = typeof request === "string" ? request.split("?")[0] : request.url;
      return responses[key];
    }),
  };
}

describe("fetchSummaryText", () => {
  it("finds the AI summary DocumentReference by category and reads its Binary", async () => {
    const client = fakeClient({
      DocumentReference: {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "DocumentReference",
              content: [{ attachment: { contentType: "text/markdown", url: "Binary/ah123" } }],
            },
          },
        ],
      },
      "Binary/ah123": {
        resourceType: "Binary",
        contentType: "text/markdown",
        data: b64("## HPI\n\nAFib — stable ♥"),
      },
    });
    await expect(fetchSummaryText(client)).resolves.toBe("## HPI\n\nAFib — stable ♥");
    const search = new URL(`https://x/${client.request.mock.calls[0][0]}`);
    expect(search.pathname).toBe("/DocumentReference");
    expect(Object.fromEntries(search.searchParams)).toEqual({
      patient: "p1",
      category: AI_SUMMARY_CATEGORY,
      _count: "1",
    });
    expect(client.request.mock.calls[1][0]).toEqual({
      url: "Binary/ah123",
      headers: { Accept: "application/fhir+json" },
    });
  });

  it("returns null when the chart has no summary yet", async () => {
    const client = fakeClient({ DocumentReference: { resourceType: "Bundle", entry: [] } });
    await expect(fetchSummaryText(client)).resolves.toBeNull();
  });

  it("reads inline attachment data and ignores attachment URLs that aren't local Binaries", async () => {
    const client = fakeClient({
      DocumentReference: {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "DocumentReference",
              content: [
                { attachment: { url: "https://elsewhere.example/doc" } },
                { attachment: { data: b64("Asthma, well controlled.") } },
              ],
            },
          },
        ],
      },
    });
    await expect(fetchSummaryText(client)).resolves.toBe("Asthma, well controlled.");
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("decodes UTF-8 base64", () => {
    expect(decodeBase64(b64("café ♪"))).toBe("café ♪");
  });
});

describe("fetchProblemListText", () => {
  it("describes the chart from age and problem list, skipping errors and refuted entries", async () => {
    const client = {
      patient: { id: "p1" },
      request: vi.fn(async (url) =>
        url.startsWith("Patient/")
          ? { resourceType: "Patient", birthDate: "1954-03-20" }
          : {
              resourceType: "Bundle",
              entry: [
                {
                  resource: { resourceType: "Condition", code: { text: "Essential hypertension" } },
                },
                {
                  resource: {
                    resourceType: "Condition",
                    code: { coding: [{ display: "Acute bronchitis" }] },
                    clinicalStatus: { coding: [{ code: "resolved" }] },
                  },
                },
                {
                  resource: {
                    resourceType: "Condition",
                    code: { text: "Wrong chart" },
                    verificationStatus: { coding: [{ code: "entered-in-error" }] },
                  },
                },
              ],
            },
      ),
    };
    await expect(fetchProblemListText(client, new Date(2026, 10, 15))).resolves.toBe(
      "72-year-old patient.\nProblem list:\n- Essential hypertension\n- Acute bronchitis (resolved)",
    );
    expect(client.request).toHaveBeenCalledWith("Condition?patient=p1&_count=100");
  });

  it("returns null with nothing to go on", async () => {
    const client = {
      patient: { id: "p1" },
      request: vi.fn(async (url) => (url.startsWith("Patient/") ? {} : { entry: [] })),
    };
    await expect(fetchProblemListText(client)).resolves.toBeNull();
  });
});
