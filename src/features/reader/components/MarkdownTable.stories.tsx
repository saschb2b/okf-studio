import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import "./Reader.css";

const markdown = `# Implementation record

| Package | Result | Evidence and boundary |
| --- | --- | --- |
| RI0 | Complete | A frozen corpus covers exact, lexical, relationship, global, temporal conflict, structured, semantic fallback, abstention, and full-context cases. |
| RI0A | Complete | Whole-panel cases cover live-work pressure, narrow widths, long evidence, recovery, and a reachable composer. |
| RI1 | Complete | Rust builds revision-bound manifests with deterministic section IDs, source ranges, content hashes, table context, graph metadata, fingerprints, and provider-neutral JSONL. |
| RI4 | Complete, provider activation withheld | Typed local, configured, unavailable, degraded, and cancelled provider states are wired into routing and receipts. |
| schema-v2-content-addressed-manifest | Experimental | A deliberately long technical identifier tests the table's horizontal overflow boundary without collapsing neighboring columns. |`;

const html = renderMarkdown(markdown);

function MarkdownTable() {
  return (
    <article className="concept-reader">
      <div className="body markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

const meta = {
  title: "Reader/MarkdownTable",
  component: MarkdownTable,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MarkdownTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DenseProse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole("table");
    const scroll = table.parentElement;
    const packageHeader = canvas.getByRole("columnheader", { name: "Package" });

    await expect(table).toBeVisible();
    await expect(scroll).toHaveClass("markdown-table-scroll");
    await expect(scroll).toHaveAttribute("tabindex", "0");
    await expect(packageHeader.getBoundingClientRect().width).toBeGreaterThan(56);
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole("table");
    const scroll = table.parentElement;

    await expect(table).toBeVisible();
    await expect(scroll).toHaveClass("markdown-table-scroll");
    await expect(scroll?.scrollWidth).toBeGreaterThan(scroll?.clientWidth ?? 0);
    await expect(document.body.scrollWidth).toBe(document.body.clientWidth);
  },
};
