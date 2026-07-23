import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import type { ProfileReport } from "@/shared/types.ts";
import { TypedRelationships } from "./TypedRelationships.tsx";

const report: ProfileReport = {
  schemaVersion: 1,
  profiles: [],
  diagnostics: [],
  edges: [{
    sourceId: "product/overview",
    targetId: "features/graph-view",
    namespace: "com.example.knowledge",
    type: "supports",
    label: "Supports",
    inverse: "supported-by",
    recognized: true,
    targetExists: true,
    portableLink: true,
  }, {
    sourceId: "product/overview",
    targetId: "reference/glossary",
    namespace: "org.producer.graph",
    type: "producer-relation",
    label: "producer-relation",
    inverse: null,
    recognized: false,
    targetExists: true,
    portableLink: true,
  }, {
    sourceId: "product/overview",
    targetId: "missing/evidence",
    namespace: "com.example.knowledge",
    type: "supports",
    label: "Supports",
    inverse: "supported-by",
    recognized: true,
    targetExists: false,
    portableLink: false,
  }],
  truncated: false,
};

const meta = {
  title: "Reader/TypedRelationships",
  component: TypedRelationships,
  decorators: [
    (Story) => (
      <aside className="reader-rail typed-relationships-story">
        <Story />
      </aside>
    ),
  ],
  args: {
    bundle: MOCK_BUNDLE,
    conceptId: "product/overview",
    hasMetadata: true,
    status: "ready",
    report,
    message: "",
    onSelect: fn(),
    onPeek: fn(),
    onPeekEnd: fn(),
  },
} satisfies Meta<typeof TypedRelationships>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KnownUnknownAndMissing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Unknown type")).toBeVisible();
    await expect(canvas.getByText("Missing target")).toBeVisible();
    await expect(canvas.getByText("No prose link")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /Supports → Graph View/i }));
    await expect(args.onSelect).toHaveBeenCalledWith(
      "features/graph-view",
      expect.anything(),
    );
  },
};

export const Loading: Story = {
  args: {
    status: "loading",
    report: null,
  },
};

export const Error: Story = {
  args: {
    status: "error",
    report: null,
    message: "The local relationship profile is unavailable.",
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
