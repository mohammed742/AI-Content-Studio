/**
 * STU-C7 (DEV-64): Generate self-contained SVG placeholder portraits for the
 * Presenter Library into `public/presenters/`.
 *
 * These are PLACEHOLDERS. Real, rights-cleared, lip-sync-ready portraits are a
 * Phase-3 carryover — regenerate/replace the files (or repoint `imageUrl` at
 * R2) without changing `src/lib/presenters.ts`. Brand discipline: Zinc + Emerald
 * only (DESIGN §3), portrait 4:5, a monogram on a zinc gradient with an emerald
 * accent ring.
 *
 * Run:  node scripts/seed-presenter-placeholders.mjs
 * The `roster` below mirrors the ids/names in `src/lib/presenters.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const roster = [
  { id: "maya-chen", name: "Maya Chen" },
  { id: "jordan-ellis", name: "Jordan Ellis" },
  { id: "sofia-ramirez", name: "Sofia Ramirez" },
  { id: "marcus-bell", name: "Marcus Bell" },
  { id: "aisha-khan", name: "Aisha Khan" },
  { id: "david-park", name: "David Park" },
  { id: "chloe-bennett", name: "Chloe Bennett" },
  { id: "liam-oconnor", name: "Liam O'Connor" },
  { id: "grace-adeyemi", name: "Grace Adeyemi" },
  { id: "ethan-turner", name: "Ethan Turner" },
];

/** Initials from a display name, e.g. "Maya Chen" -> "MC". */
function initials(name) {
  return name
    .replace(/[^A-Za-z' ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Slightly vary the zinc backdrop per presenter so the grid doesn't read as
// ten identical tiles — but stay within the zinc ramp (no random hues).
const zincTop = ["#27272a", "#3f3f46", "#1f2937", "#292524", "#334155"];
const zincBottom = "#18181b";

function svgFor(person, i) {
  const top = zincTop[i % zincTop.length];
  const mono = initials(person.name);
  // XML-escape not needed: initials are A-Z only.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="${person.name} placeholder portrait">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${zincBottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="500" fill="url(#bg)"/>
  <rect width="400" height="500" fill="url(#glow)"/>
  <circle cx="200" cy="200" r="92" fill="#09090b" fill-opacity="0.35" stroke="#10b981" stroke-width="3"/>
  <text x="200" y="200" dominant-baseline="central" text-anchor="middle"
        font-family="Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="72" font-weight="600" fill="#fafafa">${mono}</text>
  <text x="200" y="360" text-anchor="middle"
        font-family="Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="26" font-weight="500" fill="#e4e4e7">${person.name}</text>
  <text x="200" y="392" text-anchor="middle"
        font-family="Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="14" font-weight="400" letter-spacing="1.5" fill="#10b981">PRESENTER · PLACEHOLDER</text>
</svg>
`;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "presenters");
mkdirSync(outDir, { recursive: true });
for (let i = 0; i < roster.length; i++) {
  const person = roster[i];
  writeFileSync(join(outDir, `${person.id}.svg`), svgFor(person, i), "utf8");
}
console.log(`Wrote ${roster.length} placeholder portraits to public/presenters/`);
