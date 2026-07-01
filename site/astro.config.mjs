// @ts-check
import { defineConfig } from "astro/config";

// Project page: https://saschb2b.github.io/okf-viewer/
export default defineConfig({
  site: "https://saschb2b.github.io",
  base: "/okf-viewer/",
  trailingSlash: "ignore",
  build: { assets: "_assets" },
});
