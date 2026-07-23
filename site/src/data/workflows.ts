// workflows.ts: task-led entries into the product. Each workflow starts from
// a user's objective and references capability families by stable id.

import type { Family } from "./families";

export interface Workflow {
  id: string;
  title: string;
  question: string;
  steps: string[];
  families: Family["id"][];
}

export const workflows: Workflow[] = [
  {
    id: "understand",
    title: "Understand an unfamiliar bundle",
    question: "Someone handed you a bundle. What is actually in it?",
    steps: [
      "Open the folder, or explicitly download a GitHub URL, and land on Bundle Home to see recent activity and the next maintenance step.",
      "Switch among graph, treemap, sunburst, and circle packing to see shape, hubs, and clusters.",
      "Read concepts with hover previews, and branch side quests into tabs with their own history.",
      "Trace dependencies across hops in the lineage panel.",
      "Let inline validation flag what is broken; a sloppy bundle still opens.",
    ],
    families: ["explore"],
  },
  {
    id: "ask",
    title: "Ask a bundle with evidence",
    question: "You need an answer whose evidence you can inspect.",
    steps: [
      "Connect the agent you already use, or a fully local model.",
      "Ask in a thread beside the graph and reader; a local structural search runs before the prompt is sent.",
      "See exactly what context goes in, and remove what should not.",
      "Open Inspect on the answer: excerpts, source conflicts, and missing chronology.",
      "Follow citations back into the reader.",
    ],
    families: ["agents", "explore"],
  },
  {
    id: "improve",
    title: "Create or improve knowledge",
    question: "The bundle is missing something, or says it badly.",
    steps: [
      "Create a bundle from zero with a short form, no agent involved, or start authoring from the object in view.",
      "The agent writes with a versioned method that names the reader's question and preserves claims.",
      "Review the proposed change claim by claim in the staged tree.",
      "Validate against the OKF spec, then apply in one restorable transaction.",
    ],
    families: ["agents", "review"],
  },
  {
    id: "ship",
    title: "Check and ship a bundle",
    question: "Is it good enough to hand to an agent or a teammate?",
    steps: [
      "Run health checks: conformance, connectivity, provenance, freshness, duplication, coverage.",
      "Repair findings with suggestions tied to observed problems.",
      "Review repository changes and stage exactly what should land.",
      "Commit, then fetch, pull, or push when you decide.",
    ],
    families: ["review", "git"],
  },
];
