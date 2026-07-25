// @ts-check
import { defineConfig } from "astro/config";

// Project page: https://saschb2b.github.io/okf-studio/
//
// `base` is the repository name, because a GitHub project page is served under
// it. GitHub does NOT redirect project-site URLs after a repository rename (it
// redirects git, issues, and releases, but not Pages), so this value and the
// repository name must be changed in the same breath: the old URL 404s the
// moment the rename lands, and the new one serves a broken site until this
// value follows.
export default defineConfig({
  site: "https://saschb2b.github.io",
  base: "/okf-studio/",
  trailingSlash: "ignore",
  build: { assets: "_assets" },
});
