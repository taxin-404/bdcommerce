export function slugify(input: string): string {
  const map: Record<string, string> = {
    অ: "o", আ: "a", ই: "i", ঈ: "i", উ: "u", ঊ: "u", ঋ: "ri",
    এ: "e", ঐ: "oi", ও: "o", ঔ: "ou",
    ক: "k", খ: "kh", গ: "g", ঘ: "gh", ঙ: "ng", চ: "ch", ছ: "chh",
    জ: "j", ঝ: "jh", ঞ: "n", ট: "t", ঠ: "th", ড: "d", ঢ: "dh",
    ণ: "n", ত: "t", থ: "th", দ: "d", ধ: "dh", ন: "n",
    প: "p", ফ: "ph", ব: "b", ভ: "bh", ম: "m",
    য: "j", র: "r", ল: "l", শ: "sh", ষ: "sh", স: "s", হ: "h",
    ড়: "r", ঢ়: "rh", য়: "y", ৎ: "t", "ং": "ng", "ঃ": "h", "ঁ": "n",
    "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
  };

  const transliterated = input
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");

  return transliterated
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u00C0-\u017F]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
