// trust.ts: the product's boundary claims, shared by the homepage trust
// section and referenced by detail pages. Each claim mirrors a shipped
// product boundary; none describes planned behavior.

import { routes } from "./routes";

export interface TrustClaim {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}

export const trustClaims: TrustClaim[] = [
  {
    title: "Your files stay yours",
    body: "A bundle is a folder of plain Markdown on your disk. Studio is local-first: no account, no sync service, no telemetry.",
    href: routes.okf,
    linkLabel: "What a bundle is",
  },
  {
    title: "External activity is explicit",
    body: "The network is used only when you act: downloading a bundle URL, installing an agent, or an explicit fetch, pull, or push. Studio never runs a remote operation on its own.",
    href: routes.git,
    linkLabel: "How Git stays explicit",
  },
  {
    title: "You choose the agent",
    body: "Install a pinned, checksum-verified agent from the registry, or run a fully local model. Login and billing stay with the provider; Studio never owns the account.",
    href: routes.agents,
    linkLabel: "How agents connect",
  },
  {
    title: "Writes are reviewed, always",
    body: "Proposed changes land in a staged tree. You review each diff hunk, validate against the spec, and apply in one transaction you can restore. No agent can apply its own change.",
    href: routes.review,
    linkLabel: "How review works",
  },
  {
    title: "Credentials stay in your OS",
    body: "API keys live in the operating system's credential store, never in the app. Agent sign-in belongs to the agent you installed.",
    href: routes.agents,
    linkLabel: "Local and provider agents",
  },
];
