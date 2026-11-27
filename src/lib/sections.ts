import { z } from 'zod';

export const SECTION_TYPES = [
  'announcement',
  'hero',
  'categories',
  'featured',
  'new',
  'banner',
  'trust',
  'testimonials',
  'faq',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

const localizedSchema = z.object({
  en: z.string(),
  bn: z.string(),
});

const safeHrefSchema = z
  .string()
  .max(500)
  .refine(
    (value) =>
      value === '' ||
      (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) ||
      /^https?:\/\//i.test(value),
    'Expected a site-relative path or an http(s) URL',
  );

const itemSchema = z.object({
  title: localizedSchema,
  text: localizedSchema.optional(),
  icon: z.string().max(40).optional(),
});

const sectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  title: localizedSchema.optional(),
  text: localizedSchema.optional(),
  image: safeHrefSchema.optional(),
  href: safeHrefSchema.optional(),
  items: z.array(itemSchema).max(12).optional(),
});

export const homeSectionsSchema = z.array(sectionSchema).min(1).max(20);

export type HomeSection = z.infer<typeof sectionSchema>;
export type LocalizedText = z.infer<typeof localizedSchema>;

export const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  { type: 'hero' },
  { type: 'categories' },
  { type: 'featured' },
  { type: 'new' },
  { type: 'trust' },
];

export function parseHomeSections(raw: string | undefined): HomeSection[] {
  if (!raw) return DEFAULT_HOME_SECTIONS.map((section) => ({ ...section }));

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_HOME_SECTIONS.map((section) => ({ ...section }));
    }

    // Validate each section independently so one bad entry does not wipe the
    // owner's whole homepage layout.
    const sections = parsed
      .map((section) => sectionSchema.safeParse(section))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(0, 20);

    return sections.length ? sections : DEFAULT_HOME_SECTIONS.map((section) => ({ ...section }));
  } catch {
    return DEFAULT_HOME_SECTIONS.map((section) => ({ ...section }));
  }
}
