import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Player, { licenseLabel } from "./Player.jsx";

const TRACK = {
  id: "t1",
  title: "Steady Heartbeat",
  artist: "The Clinicians",
  audioUrl: "https://prod-1.storage.jamendo.com/?trackid=1&format=mp32",
  sourceUrl: "https://www.jamendo.com/track/1",
  license: "by-sa",
  licenseVersion: "3.0",
};

beforeEach(() => {
  let paused = true;
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => paused);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function play() {
    paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function pause() {
    paused = true;
    this.dispatchEvent(new Event("pause"));
  });
});

describe("Player", () => {
  it("shows what is playing, with attribution and the internal-app tag", () => {
    render(<Player track={TRACK} />);
    expect(screen.getByRole("heading", { name: "Steady Heartbeat" })).toBeInTheDocument();
    expect(screen.getByText("The Clinicians")).toBeInTheDocument();
    expect(screen.getByText("Internal app · Built by Abstractive Health")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY-SA 3.0 · Jamendo" })).toHaveAttribute(
      "href",
      TRACK.sourceUrl,
    );
  });

  it("plays and pauses", async () => {
    const user = userEvent.setup();
    render(<Player track={TRACK} />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Now playing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("changes the volume", () => {
    const { container } = render(<Player track={TRACK} />);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "0.25" } });
    expect(container.querySelector("audio").volume).toBe(0.25);
  });

  it("doesn't fetch audio until play is pressed", () => {
    const { container } = render(<Player track={TRACK} />);
    expect(container.querySelector("audio")).toHaveAttribute("preload", "none");
  });

  it("explains a blocked play", async () => {
    HTMLMediaElement.prototype.play.mockRejectedValueOnce(new Error("NotAllowedError"));
    const user = userEvent.setup();
    render(<Player track={TRACK} />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("alert")).toHaveTextContent("blocked playback");
  });

  it("labels licenses", () => {
    expect(licenseLabel({ license: "cc0" })).toBe("CC0");
    expect(licenseLabel({ license: "pdm", licenseVersion: "1.0" })).toBe("Public domain");
    expect(licenseLabel({ license: "by", licenseVersion: "4.0" })).toBe("CC BY 4.0");
  });
});
