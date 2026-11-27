export interface PresetText {
  en: string;
  bn: string;
}

export interface PresetCategory {
  slug: string;
  name: string;
  name_bn: string;
  parent?: string;
  sort?: number;
}

export interface PresetAttributeField {
  key: string;
  label: PresetText;
  options?: string[];
}

export interface PresetVariant {
  sku: string;
  title: string;
  options: Record<string, string>;
  price?: number | null;
  stock: number;
}

export interface PresetProduct {
  slug: string;
  title: string;
  title_bn: string;
  description: string;
  description_bn: string;
  category: string;
  price: number;
  compareAtPrice?: number | null;
  attributes: Record<string, string>;
  featured?: boolean;
  variants: PresetVariant[];
}

export interface BusinessPreset {
  id: string;
  label: PresetText;
  description: PresetText;
  categories: PresetCategory[];
  attributeFields: PresetAttributeField[];
  products: PresetProduct[];
}
