import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { brands, categories, productVariants, products, reviews } from "@bd/db";
import type { Db } from "../db";
import type { Env } from "../env";
import { mediaUrl } from "./media";

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  specifications: { label: string; value: string }[] | null;
  pricePaisa: number;
  compareAtPaisa: number | null;
  coverImage: string | null;
  images: { src: string; alt?: string }[] | null;
  categoryId: string | null;
  brandId: string | null;
  stock: number;
  tags: string[] | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  label: string | null;
  saleEndsAt: Date | null;
  videoUrl: string | null;
  viewCount: number;
}

// Fetch categories/brands for the product list in one pass
export async function attachTaxonomy(db: Db, env: Env, baseUrl: string, productsOut: ProductRow[]) {
  const catIds = new Set(productsOut.map((p) => p.categoryId).filter(Boolean) as string[]);
  const brandIds = new Set(productsOut.map((p) => p.brandId).filter(Boolean) as string[]);

  const [cats, brandsOut, ratings] = await Promise.all([
    catIds.size ? db.select().from(categories).where(inArray(categories.id, [...catIds])) : Promise.resolve([]),
    brandIds.size ? db.select().from(brands).where(inArray(brands.id, [...brandIds])) : Promise.resolve([]),
    productsOut.length
      ? db
          .select({
            productId: reviews.productId,
            avg: sql<number>`CAST(AVG(${reviews.rating}) AS REAL)`,
            cnt: sql<number>`COUNT(*)`,
          })
          .from(reviews)
          .where(and(inArray(reviews.productId, productsOut.map((p) => p.id)), eq(reviews.isApproved, true)))
          .groupBy(reviews.productId)
      : Promise.resolve([]),
  ]);

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const brandMap = new Map(brandsOut.map((b) => [b.id, b]));
  const ratingMap = new Map(ratings.map((r) => [r.productId, r]));

  return productsOut.map((p) => {
    const cat = p.categoryId ? catMap.get(p.categoryId) : undefined;
    const brand = p.brandId ? brandMap.get(p.brandId) : undefined;
    const rating = ratingMap.get(p.id);
    const images = (p.images ?? []).map((img) => ({ ...img, src: mediaUrl(env, baseUrl, img.src) ?? img.src }));
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      summary: p.summary,
      pricePaisa: p.pricePaisa,
      compareAtPaisa: p.compareAtPaisa,
      coverImage: mediaUrl(env, baseUrl, p.coverImage ?? p.images?.[0]?.src),
      images: images.length ? images : p.coverImage ? [{ src: mediaUrl(env, baseUrl, p.coverImage)! }] : [],
      stock: p.stock,
      tags: p.tags ?? [],
      label: p.label,
      isFeatured: p.isFeatured,
      isBestSeller: p.isBestSeller,
      isNewArrival: p.isNewArrival,
      saleEndsAt: p.saleEndsAt?.getTime() ?? null,
      rating: rating ? Math.round(rating.avg * 10) / 10 : null,
      reviewCount: rating?.cnt ?? 0,
      category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
      brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug, logo: mediaUrl(env, baseUrl, brand.logo) } : null,
    };
  });
}

export async function productDetail(db: Db, env: Env, baseUrl: string, slug: string) {
  const product = (await db.select().from(products).where(eq(products.slug, slug)).limit(1))[0];
  if (!product) return null;

  const [variantRows, cat, brand, rating] = await Promise.all([
    db.select().from(productVariants).where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true))),
    product.categoryId ? db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1) : Promise.resolve([]),
    product.brandId ? db.select().from(brands).where(eq(brands.id, product.brandId)).limit(1) : Promise.resolve([]),
    db
      .select({
        avg: sql<number>`CAST(AVG(${reviews.rating}) AS REAL)`,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(and(eq(reviews.productId, product.id), eq(reviews.isApproved, true))),
  ]);

  const images = (product.images ?? []).map((img) => ({ ...img, src: mediaUrl(env, baseUrl, img.src) ?? img.src }));
  const cover = mediaUrl(env, baseUrl, product.coverImage ?? product.images?.[0]?.src);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    description: product.description,
    specifications: product.specifications ?? [],
    pricePaisa: product.pricePaisa,
    compareAtPaisa: product.compareAtPaisa,
    costPaisa: product.costPaisa,
    sku: product.sku,
    barcode: product.barcode,
    stock: product.stock,
    weight: product.weight,
    lowStockThreshold: product.lowStockThreshold,
    videoUrl: product.videoUrl,
    tags: product.tags ?? [],
    label: product.label,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    saleEndsAt: product.saleEndsAt?.getTime() ?? null,
    coverImage: cover,
    images,
    rating: rating[0] ? Math.round(rating[0].avg * 10) / 10 : null,
    reviewCount: rating[0]?.cnt ?? 0,
    category: cat[0] ? { id: cat[0].id, name: cat[0].name, slug: cat[0].slug } : null,
    brand: brand[0]
      ? { id: brand[0].id, name: brand[0].name, slug: brand[0].slug, logo: mediaUrl(env, baseUrl, brand[0].logo) }
      : null,
    variants: variantRows.map((v) => ({
      id: v.id,
      name: v.name,
      options: v.options ?? {},
      sku: v.sku,
      pricePaisa: v.pricePaisa,
      stock: v.stock,
      image: mediaUrl(env, baseUrl, v.image),
    })),
  };
}
