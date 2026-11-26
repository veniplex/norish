import type { BringHandoff } from "./handoff-store";

type HandoffContent = Pick<BringHandoff, "title" | "servings" | "lines">;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * The schema.org Recipe Bring! reads. `baseUrl` is AUTH_URL without a trailing
 * slash; the image is the static brand icon, never the recipe's own media.
 */
export function jsonLdFor(handoff: HandoffContent, baseUrl: string): string {
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: handoff.title,
    author: { "@type": "Organization", name: "Norish" },
    image: [`${baseUrl}/brand/icon-512.png`],
    recipeYield: String(Math.max(1, Math.round(handoff.servings))),
    recipeIngredient: handoff.lines,
  });

  // Inside a <script> element: `<` could close it, U+2028/2029 end a JS line.
  return json
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** The public page for a handoff: the title and the lines, nothing about who sent them. */
export function renderHandoffHtml(handoff: HandoffContent, baseUrl: string): string {
  const title = escapeHtml(handoff.title);
  const items = handoff.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="robots" content="noindex,nofollow,noarchive"><title>${title}</title>` +
    `<script type="application/ld+json">${jsonLdFor(handoff, baseUrl)}</script>` +
    `</head><body><h1>${title}</h1><ul>${items}</ul></body></html>`
  );
}
