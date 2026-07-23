import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MetadataInspector,
  ODSF_METADATA_KEYS,
} from "./MetadataInspector.tsx";

describe("MetadataInspector", () => {
  it("renders hostile values as bounded text with their source location", () => {
    const many = Object.fromEntries(
      Array.from({ length: 70 }, (_, index) => [`field-${index}`, index]),
    );
    const deep = { one: { two: { three: { four: { five: { six: "hidden" } } } } } };
    render(
      <MetadataInspector
        title="Bundle metadata"
        source="index.md"
        values={{
          hostile: "<img src=x onerror=alert(1)>",
          deep,
          many,
        }}
      />,
    );

    expect(screen.getByLabelText("Bundle metadata from index.md")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Nested value omitted at the five-level display limit.")).toBeInTheDocument();
    expect(screen.getByText("Additional fields omitted.")).toBeInTheDocument();
  });

  it("copies a bounded visible value and excludes ODSF-owned fields", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const values = {
      tokens: { colors: { accent: "#fff" } },
      examples: ["button.example.html"],
      status: "stable",
      applies_to: ["web"],
      owner: { team: "Knowledge" },
    };
    render(
      <MetadataInspector
        title="Concept metadata"
        source="guide.md"
        values={values}
        excludeKeys={ODSF_METADATA_KEYS}
      />,
    );

    expect(screen.queryByText("tokens")).toBeNull();
    expect(screen.getByText("owner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy owner" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("\"team\": \"Knowledge\""));
    });
  });
});
