// nav.ts: the one owner of primary and footer navigation. The header and
// footer components render these records; no page defines its own nav.

import { routes } from "./routes";
import { repo, releases, issues, license, docsUrl, roadmapUrl, okfSpec, odsfSpec } from "./site";

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Product overview and capability-family routes. */
export const productMenu: NavLink[] = [
  { label: "Overview", href: routes.product },
  { label: "Explore knowledge", href: routes.explore },
  { label: "Work with agents", href: routes.agents },
  { label: "Review and improve", href: routes.review },
  { label: "Version with Git", href: routes.git },
];

/** Direct links beside the Product disclosure. */
export const primaryLinks: NavLink[] = [
  { label: "Workflows", href: routes.workflows },
  { label: "OKF", href: routes.okf },
  { label: "Docs", href: docsUrl, external: true },
  { label: "GitHub", href: repo, external: true },
];

export interface FooterGroup {
  label: string;
  links: NavLink[];
}

/** The footer is a durable directory, not a repeat of the header. */
export const footerGroups: FooterGroup[] = [
  {
    label: "Product",
    links: [
      { label: "Overview", href: routes.product },
      { label: "Explore knowledge", href: routes.explore },
      { label: "Work with agents", href: routes.agents },
      { label: "Review and improve", href: routes.review },
      { label: "Version with Git", href: routes.git },
      { label: "Download", href: routes.download },
    ],
  },
  {
    label: "Learn",
    links: [
      { label: "What is OKF?", href: routes.okf },
      { label: "ODSF", href: routes.odsf },
      { label: "Docs", href: docsUrl, external: true },
      { label: "Workflows", href: routes.workflows },
    ],
  },
  {
    label: "Project",
    links: [
      { label: "GitHub", href: repo, external: true },
      { label: "Releases", href: releases, external: true },
      { label: "Roadmap", href: roadmapUrl, external: true },
      { label: "Issues", href: issues, external: true },
    ],
  },
  {
    label: "Terms",
    links: [
      { label: "MIT License", href: license, external: true },
      { label: "OKF spec", href: okfSpec, external: true },
      { label: "ODSF spec", href: odsfSpec, external: true },
    ],
  },
];
