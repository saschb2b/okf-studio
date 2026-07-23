import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openFolder, renderApp } from "@/test/appHarness.tsx";

it("inspects known and unknown profile relationships and filters the graph", async () => {
  const user = userEvent.setup();
  renderApp();
  await openFolder(user);
  await user.click(screen.getByRole("button", {
    name: /Overview What OKF Studio is and who it's for/i,
  }));

  expect(await screen.findByRole("complementary", { name: "Reliability advisory" }))
    .toHaveTextContent("Current");
  expect(screen.getByRole("complementary", { name: "Reliability advisory" }))
    .toHaveTextContent("Authored confidence: 100%");
  expect(await screen.findByRole("heading", { name: /Typed relationships 2/i }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Supports → Graph View/i }))
    .toBeInTheDocument();
  expect(screen.getByRole("button", {
    name: /producer-relation → Glossary Unknown type/i,
  })).toBeInTheDocument();

  const filter = await screen.findByRole("combobox", {
    name: "Filter by relationship type",
  });
  await user.selectOptions(filter, "com.example.knowledge::supports");
  expect(screen.getByRole("button", {
    name: "Showing isolated set: Supports · 1. Click to clear.",
  })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Supports → Graph View/i }));
  expect(await screen.findByRole("heading", { name: "Graph View" })).toBeInTheDocument();
});
