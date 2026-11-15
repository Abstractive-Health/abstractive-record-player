import { describe, expect, it, vi } from "vitest";
import { clientKind, launch, LaunchError } from "./launch.js";
import { matchesIss, serverKind } from "../config.js";

const SERVERS = {
  abstractive: ["https://test-api.abstractive.ai/fhir/r4"],
  sandbox: ["https://launch.smarthealthit.org/v/r4/*"],
};
const kindOf = (iss) => serverKind(iss, SERVERS);
const at = (search) => ({ search, origin: "https://record-player.abstractive.ai" });
const ABSTRACTIVE_ISS = encodeURIComponent("https://test-api.abstractive.ai/fhir/r4");

describe("launch", () => {
  it("authorizes an Abstractive launch as a PKCE public client, summary scopes only", async () => {
    const smartInit = vi.fn().mockResolvedValue("client");
    const location = at(`?iss=${ABSTRACTIVE_ISS}&launch=abc`);
    await expect(launch({ location, smartInit, kindOf })).resolves.toBe("client");
    expect(smartInit).toHaveBeenCalledWith({
      clientId: "abstractive-record-player",
      scope: "launch patient/DocumentReference.read patient/Binary.read",
      redirectUri: "https://record-player.abstractive.ai/",
      pkceMode: "required",
      completeInTarget: true,
    });
  });

  it("works from the SMART App Launcher with the problem-list scopes", async () => {
    const smartInit = vi.fn().mockResolvedValue("client");
    const iss = encodeURIComponent("https://launch.smarthealthit.org/v/r4/sim/WzAsIiJd/fhir");
    await launch({ location: at(`?iss=${iss}&launch=abc`), smartInit, kindOf });
    expect(smartInit.mock.calls[0][0].scope).toBe(
      "launch patient/DocumentReference.read patient/Binary.read patient/Patient.read patient/Condition.read",
    );
  });

  it("refuses other FHIR servers", async () => {
    const smartInit = vi.fn();
    const location = at("?iss=https%3A%2F%2Fevil.example%2Ffhir&launch=abc");
    await expect(launch({ location, smartInit, kindOf })).rejects.toThrow(
      "Record Player can't be opened from this FHIR server.",
    );
    expect(smartInit).not.toHaveBeenCalled();
  });

  it("explains how to open the app when visited directly", async () => {
    const smartInit = vi.fn();
    await expect(launch({ location: at(""), smartInit, kindOf })).rejects.toBeInstanceOf(
      LaunchError,
    );
    expect(smartInit).not.toHaveBeenCalled();
  });

  it("completes the redirect back with a code", async () => {
    const smartInit = vi.fn().mockResolvedValue("client");
    await expect(launch({ location: at("?code=c&state=s"), smartInit, kindOf })).resolves.toBe(
      "client",
    );
  });

  it("turns authorization failures into a friendly message", async () => {
    const smartInit = vi.fn().mockRejectedValue(new Error("No 'state' parameter found."));
    await expect(launch({ location: at("?code=c&state=s"), smartInit, kindOf })).rejects.toThrow(
      "This launch has expired.",
    );
  });

  it("tells the server kind from the authorized client", () => {
    const client = { state: { serverUrl: "https://launch.smarthealthit.org/v/r4/fhir" } };
    expect(clientKind(client, kindOf)).toBe("sandbox");
    expect(clientKind({}, kindOf)).toBeNull();
  });
});

describe("matchesIss", () => {
  it("matches exact servers, ignoring a trailing slash", () => {
    const exact = ["https://test-api.abstractive.ai/fhir/r4"];
    expect(matchesIss("https://test-api.abstractive.ai/fhir/r4/", exact)).toBe(true);
    expect(matchesIss("https://test-api.abstractive.ai/fhir/r4/x", exact)).toBe(false);
    expect(matchesIss("https://test-api.abstractive.ai.evil.example/fhir/r4", exact)).toBe(false);
    expect(matchesIss("http://test-api.abstractive.ai/fhir/r4", exact)).toBe(false);
    expect(matchesIss("https://test-api.abstractive.ai/fhir/r4?x=1", exact)).toBe(false);
    expect(matchesIss("", exact)).toBe(false);
  });

  it("matches paths below a /* pattern on the same origin only", () => {
    const below = ["https://launch.smarthealthit.org/v/r4/*"];
    expect(matchesIss("https://launch.smarthealthit.org/v/r4/fhir", below)).toBe(true);
    expect(matchesIss("https://launch.smarthealthit.org/v/r4/sim/abc/fhir", below)).toBe(true);
    expect(matchesIss("https://launch.smarthealthit.org/v/r3/fhir", below)).toBe(false);
    expect(matchesIss("https://launch.smarthealthit.org.evil.example/v/r4/fhir", below)).toBe(
      false,
    );
    expect(matchesIss("https://user@launch.smarthealthit.org/v/r4/fhir", below)).toBe(false);
  });
});
