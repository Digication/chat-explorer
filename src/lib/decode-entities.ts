/**
 * Decodes common HTML entities that appear in CSV-imported text.
 * Handles the most frequent entities found in Digication exports.
 */
const ENTITIES: Record<string, string> = {
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x2F;": "/",
  "&nbsp;": " ",
};

const ENTITY_RE = new RegExp(
  Object.keys(ENTITIES)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "gi",
);

export function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match) => ENTITIES[match.toLowerCase()] ?? match);
}
