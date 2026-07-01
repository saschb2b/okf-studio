// Copy the ODSF design-system runnable stylesheets into the site so the build is
// self-contained. The design system (../design-system) is the source of truth;
// never edit the copies under src/styles/design-system/ by hand.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dsStyles = resolve(here, "../../design-system/styles");
const out = resolve(here, "../src/styles/design-system");
mkdirSync(out, { recursive: true });
for (const f of ["tokens.css", "components.css"]) {
  copyFileSync(resolve(dsStyles, f), resolve(out, f));
  console.log("synced", f);
}
