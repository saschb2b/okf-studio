import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import type { InteropReport } from "@/features/bundle/interop.ts";
import { BundleConnectionsSummaryView } from "./BundleConnections.tsx";

const report: InteropReport = {
  schemaVersion: 1,
  multilingual: {
    groups: [{
      identity: "guides/start",
      variants: [{
        conceptId: "guides/start",
        title: "Start",
        language: "en",
        convention: "frontmatter",
        translationOf: null,
        targetExists: true,
      }, {
        conceptId: "guides/start.de",
        title: "Starten",
        language: "de",
        convention: "translation-reference",
        translationOf: "guides/start",
        targetExists: true,
      }],
    }],
    conventions: [{
      convention: "frontmatter",
      observed: 1,
      strengths: ["Keeps filenames stable."],
      gaps: ["Does not identify sibling variants."],
    }, {
      convention: "filename-suffix",
      observed: 0,
      strengths: ["Visible without parsing frontmatter."],
      gaps: ["A base rename can split the set."],
    }, {
      convention: "translation-reference",
      observed: 1,
      strengths: ["Names an explicit base concept."],
      gaps: ["Safe move does not rewrite this producer field yet."],
    }],
    adoptionReady: false,
    message: "Variants remain experimental until the adoption fixtures pass together.",
  },
  externalBundles: [{
    alias: "upstream",
    url: "https://github.com/GoogleCloudPlatform/knowledge-catalog",
    expectedDigest: null,
    cachePath: null,
    status: "not-resolved",
    cachedDigest: null,
    identityPrefix: "external:upstream:",
    message: "Not fetched. Resolution begins only from the named user action.",
  }],
  semanticWeb: {
    exportableRelationships: 8,
    unsupportedRelationships: 2,
    message: "JSON-LD exchange covers relationships backed by portable Markdown links.",
  },
  sidecars: [{
    conceptId: "guides/start",
    path: "assets/example.notebook",
    mediaType: "application/x-ipynb+json",
    authoredDigest: null,
    actualDigest: "sha256:fixture",
    size: 14_280,
    status: "ready",
    openPolicy: "download-only",
    message: "Studio will not execute or render this file.",
  }],
  diagnostics: [],
  truncated: false,
};

const meta = {
  title: "Bundle/BundleConnections",
  component: BundleConnectionsSummaryView,
  args: {
    report,
    onOpen: fn(),
  },
} satisfies Meta<typeof BundleConnectionsSummaryView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Connections" })).toBeVisible();
    await expect(canvas.getByText("1 item needs review")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Open connections" })).toBeVisible();
    await expect(canvas.queryByText("upstream")).not.toBeInTheDocument();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: Summary.play,
};
