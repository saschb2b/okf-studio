// routes.ts: the one owner of the site's route table. Every internal href on
// every page comes from here, already prefixed with the GitHub Pages base path.

const base = import.meta.env.BASE_URL; // "/okf-studio/"

export const routes = {
  home: base,
  product: `${base}product/`,
  explore: `${base}product/explore/`,
  agents: `${base}product/agents/`,
  review: `${base}product/review/`,
  git: `${base}product/git/`,
  workflows: `${base}workflows/`,
  okf: `${base}okf/`,
  odsf: `${base}okf/#odsf`,
  download: `${base}download/`,
} as const;

export type RouteKey = keyof typeof routes;
