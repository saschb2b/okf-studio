import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import type { InteropReport } from "@/features/bundle/interop.ts";
import {
  ConceptLanguageSelect,
  ConceptResources,
} from "./ConceptExtensions.tsx";

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
    conventions: [],
    adoptionReady: false,
    message: "",
  },
  externalBundles: [],
  semanticWeb: {
    exportableRelationships: 0,
    unsupportedRelationships: 0,
    message: "",
  },
  sidecars: [{
    conceptId: "guides/start",
    path: "assets/getting-started.json",
    mediaType: "application/json",
    authoredDigest: null,
    actualDigest: "sha256:fixture",
    size: 512,
    status: "ready",
    openPolicy: "safe-preview",
    message: "The file passed its containment, size, and digest checks.",
  }],
  diagnostics: [],
  truncated: false,
};

const meta = {
  title: "Reader/ConceptExtensions",
  component: ConceptResources,
  args: {
    bundleRoot: "/mock/workspace/docs",
    conceptId: "guides/start",
    report,
  },
  decorators: [
    (Story) => (
      <aside className="reader-rail" style={{ width: 300 }}>
        <ConceptLanguageSelect
          conceptId="guides/start"
          report={report}
          onSelect={fn()}
        />
        <Story />
      </aside>
    ),
  ],
} satisfies Meta<typeof ConceptResources>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LanguagesAndResources: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Concept language" })).toBeVisible();
    await expect(canvas.getByText("assets/getting-started.json")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save copy" }));
    await expect(await canvas.findByText(/Saved .*getting-started/i)).toBeVisible();
  },
};

export const ResourceNeedsAttention: Story = {
  args: {
    report: {
      ...report,
      sidecars: [{
        ...report.sidecars[0],
        status: "digest-mismatch",
        message: "The file digest does not match its declaration.",
      }],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/digest does not match/i)).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Save copy" })).not.toBeInTheDocument();
  },
};
