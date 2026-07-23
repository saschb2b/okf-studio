import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import type { InteropReport } from "@/features/bundle/interop.ts";
import { InteroperabilityLabView } from "./InteroperabilityLab.tsx";

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
    message: "Variants remain an experiment until link, search, retrieval, move, and projection fixtures pass together.",
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
    message: "JSON-LD exchange covers typed relationships backed by portable Markdown links; every other construct is reported as loss.",
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
    message: "The file remains exportable but Studio will not execute or render it.",
  }],
  diagnostics: [],
  truncated: false,
};

const meta = {
  title: "Bundle/InteroperabilityLab",
  component: InteroperabilityLabView,
  args: {
    bundleRoot: "/mock/workspace/docs",
    report,
    onOpenConcept: fn(),
    onReviewExternal: fn(),
  },
} satisfies Meta<typeof InteroperabilityLabView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeclaredExperiments: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Interoperability Lab")).toBeVisible();
    await expect(canvas.getByText("guides/start")).toBeVisible();
    await expect(canvas.getByText(/never fetch on open/i)).toBeVisible();
    await expect(canvas.getByText(/never executed or rendered/i)).toBeVisible();
  },
};

export const SemanticImportPreview: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Semantic-web exchange"));
    await userEvent.click(canvas.getByRole("button", { name: "Preview JSON-LD import" }));
    await expect(await canvas.findByText(/Imported 1 relationship into a read-only preview/i))
      .toBeVisible();
    await expect(canvas.getByText(/OWL restriction/)).toBeVisible();
  },
};

export const UnavailableAndMismatch: Story = {
  args: {
    report: {
      ...report,
      externalBundles: [{
        ...report.externalBundles[0],
        status: "digest-mismatch",
        cachedDigest: "okf-health-revision-other",
        message: "The cached bundle does not match the declared revision.",
      }],
      sidecars: [{
        ...report.sidecars[0],
        status: "digest-mismatch",
        message: "The file digest does not match the declaration.",
      }],
      diagnostics: ["One experimental declaration used an unknown field."],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/cached bundle does not match/i)).toBeVisible();
    await expect(canvas.getByText(/file digest does not match/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Export copy" })).toBeDisabled();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

