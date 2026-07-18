import { describe, expect, it } from "vitest";
import { findOkfMention, okfMentionOptions, replaceOkfMention } from "./OkfMentionMenu.tsx";

describe("OKF context mentions", () => {
  it("finds and replaces the unfinished mention at the prompt tail", () => {
    const mention = findOkfMention("Compare this with @ord");
    expect(mention).toEqual({ start: 18, query: "ord" });
    if (!mention) throw new Error("Expected a trailing mention.");
    expect(replaceOkfMention("Compare this with @ord", mention, "Orders"))
      .toBe("Compare this with Orders ");
  });

  it("ranks the active concept once and keeps the list bounded", () => {
    const mention = findOkfMention("Review @");
    const options = okfMentionOptions({
      mention,
      bundleName: "Product knowledge",
      activeConcept: { id: "orders", title: "Orders" },
      concepts: Array.from({ length: 10 }, (_, index) => ({
        id: index === 0 ? "orders" : `concept-${index}`,
        title: index === 0 ? "Orders" : `Concept ${index}`,
        type: "Concept",
      })),
    });
    expect(options).toHaveLength(6);
    expect(options.filter((option) => option.id === "orders")).toHaveLength(1);
  });
});
