import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranscriptSurface } from "./TranscriptSurface.tsx";

function TranscriptItems({ revision }: { revision: number }) {
  return (
    <>
      <div data-transcript-role="user">First prompt</div>
      <div>Response {revision}</div>
      <div data-transcript-role="user">Latest prompt</div>
      <div>Streaming response</div>
      <button type="button">Transcript action</button>
    </>
  );
}

function setGeometry(surface: HTMLElement) {
  Object.defineProperties(surface, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 1_000 },
    scrollTop: { configurable: true, writable: true, value: 800 },
  });
  const latestPrompt = screen.getByText("Latest prompt");
  Object.defineProperty(latestPrompt, "offsetTop", { configurable: true, value: 520 });
}

describe("TranscriptSurface", () => {
  it("stops following streamed content after the user leaves the tail", () => {
    const { rerender } = render(
      <TranscriptSurface hasItems hasUserMessage contentVersion={1}>
        <TranscriptItems revision={1} />
      </TranscriptSurface>,
    );
    const surface = screen.getByRole("region", { name: "Conversation transcript" });
    setGeometry(surface);

    surface.scrollTop = 400;
    fireEvent.scroll(surface);
    rerender(
      <TranscriptSurface hasItems hasUserMessage contentVersion={2}>
        <TranscriptItems revision={2} />
      </TranscriptSurface>,
    );
    expect(surface.scrollTop).toBe(400);

    fireEvent.click(screen.getByRole("button", { name: "Jump to transcript bottom" }));
    expect(surface.scrollTop).toBe(1_000);
    rerender(
      <TranscriptSurface hasItems hasUserMessage contentVersion={3}>
        <TranscriptItems revision={3} />
      </TranscriptSurface>,
    );
    expect(surface.scrollTop).toBe(1_000);
  });

  it("supports the visible controls and transcript keyboard targets", () => {
    render(
      <TranscriptSurface hasItems hasUserMessage contentVersion={1}>
        <TranscriptItems revision={1} />
      </TranscriptSurface>,
    );
    const surface = screen.getByRole("region", { name: "Conversation transcript" });
    setGeometry(surface);

    fireEvent.keyDown(surface, { key: "Home" });
    expect(surface.scrollTop).toBe(0);
    fireEvent.keyDown(surface, { key: "Home", shiftKey: true });
    expect(surface.scrollTop).toBe(520);
    fireEvent.keyDown(surface, { key: "End" });
    expect(surface.scrollTop).toBe(1_000);

    fireEvent.click(screen.getByRole("button", { name: "Jump to latest user prompt" }));
    expect(surface.scrollTop).toBe(520);

    surface.scrollTop = 400;
    fireEvent.keyDown(screen.getByRole("button", { name: "Transcript action" }), { key: "Home" });
    expect(surface.scrollTop).toBe(400);
  });
});
