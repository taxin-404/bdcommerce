// Minimal server-side HTML sanitizer tuned for admin-entered rich content.
// Prevents XSS by stripping script/iframe/event-handler attributes and
// javascript: URLs while preserving common formatting tags.

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "mark",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "code",
  "pre", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "a", "img", "hr", "span", "div", "figure", "figcaption", "video", "iframe", "source",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "target", "rel", "width", "height", "class",
  "colspan", "rowspan", "align", "style", "controls", "autoplay", "muted", "loop", "poster", "allowfullscreen",
]);

const ALLOWED_ATTR_PREFIXES = ["data-", "aria-", "src"];

const CSS_BLOCKLIST = /(expression|javascript|vbscript|url\s*\(|@import|behavior|-webkit-|position|z-index)/i;

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g, (full, closing: string, tag: string, rest: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return "";
      const attrs = sanitizeAttrs(rest, t);
      return `<${closing}${t}${attrs}>`;
    });
}

function sanitizeAttrs(raw: string, tag: string): string {
  const out: string[] = [];
  const attrRe = /([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1]!.toLowerCase();
    let value = m[2]!;
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);

    if (!ALLOWED_ATTRS.has(name) && !ALLOWED_ATTR_PREFIXES.some((p) => name.startsWith(p))) continue;
    if (/^on/i.test(name)) continue;
    if (name === "href" || name === "src" || name === "srcset" || name === "poster") {
      if (/^\s*(javascript|vbscript|data:text\/html)/i.test(value)) continue;
      if (tag === "iframe" && !/^https?:/i.test(value) && !/^\/\//i.test(value)) continue;
      if (name === "src" && tag === "img" && !/^https?:|^data:image\//i.test(value) && !/^\//.test(value)) continue;
    }
    if (name === "style" && CSS_BLOCKLIST.test(value)) continue;
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(input: string, max = 120): string {
  const clean = stripHtml(input);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}
