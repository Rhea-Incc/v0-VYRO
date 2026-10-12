import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  categoriesTable,
  db,
  inventoryTable,
  productImagesTable,
  productVariantsTable,
  productsTable,
} from "@workspace/db";

export type CatalogProductRow = typeof productsTable.$inferSelect;
export type CatalogCategoryRow = typeof categoriesTable.$inferSelect;

export function normalizeBooleanQuery(value: unknown): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

export async function serializeProducts(
  rows: CatalogProductRow[],
  includeInactiveVariants = false,
) {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const categoryIds = rows.flatMap((row) =>
    row.categoryId ? [row.categoryId] : [],
  );

  const [categories, variants, images, stockRows] = await Promise.all([
    categoryIds.length
      ? db
          .select()
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, categoryIds))
      : Promise.resolve([]),
    db
      .select()
      .from(productVariantsTable)
      .where(inArray(productVariantsTable.productId, ids))
      .orderBy(asc(productVariantsTable.createdAt)),
    db
      .select()
      .from(productImagesTable)
      .where(inArray(productImagesTable.productId, ids))
      .orderBy(asc(productImagesTable.sortOrder), asc(productImagesTable.createdAt)),
    db
      .select({
        variantId: inventoryTable.variantId,
        available: sql<number>`greatest(coalesce(sum(${inventoryTable.onHand} - ${inventoryTable.reserved}), 0), 0)::int`,
      })
      .from(inventoryTable)
      .innerJoin(
        productVariantsTable,
        eq(inventoryTable.variantId, productVariantsTable.id),
      )
      .where(inArray(productVariantsTable.productId, ids))
      .groupBy(inventoryTable.variantId),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const stockByVariantId = new Map(
    stockRows.map((stock) => [stock.variantId, stock.available]),
  );

  return rows.map((row) => {
    const category = row.categoryId
      ? categoryById.get(row.categoryId) ?? null
      : null;
    const productVariants = variants
      .filter(
        (variant) =>
          variant.productId === row.id &&
          (includeInactiveVariants || variant.status === "active"),
      )
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        options: variant.options,
        priceMinor: variant.priceMinor,
        currency: variant.currency,
        compareAtPriceMinor: variant.compareAtPriceMinor,
        status: variant.status,
        availableStock: stockByVariantId.get(variant.id) ?? 0,
      }));

    return {
      id: row.id,
      categoryId: row.categoryId,
      category: category
        ? {
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            parentId: category.parentId,
            imagePath: category.imagePath,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            createdAt: category.createdAt.toISOString(),
            updatedAt: category.updatedAt.toISOString(),
          }
        : null,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      status: row.status,
      brand: row.brand,
      featured: row.featured,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      variants: productVariants,
      images: images
        .filter((image) => image.productId === row.id)
        .map((image) => ({
          id: image.id,
          storagePath: image.storagePath,
          altText: image.altText,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
        })),
    };
  });
}

export function productSearchConditions(search: string | undefined): SQL[] {
  if (!search?.trim()) return [];
  const term = `%${search.trim()}%`;
  return [
    or(
      ilike(productsTable.name, term),
      ilike(productsTable.shortDescription, term),
      ilike(productsTable.description, term),
      ilike(categoriesTable.name, term),
    )!,
  ];
}

export async function listActiveCategories() {
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.isActive, true))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  return rows.map(serializeCategory);
}

export function serializeCategory(category: CatalogCategoryRow) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    imagePath: category.imagePath,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export function publicProductConditions(): SQL[] {
  return [
    eq(productsTable.status, "published"),
    or(isNull(productsTable.categoryId), eq(categoriesTable.isActive, true))!,
  ];
}

export async function getPage(
  where: SQL | undefined,
  page: number,
  pageSize: number,
  sort: "featured" | "newest" | "price-asc" | "price-desc" | "name",
  includeInactiveVariants = false,
) {
  const ordering =
    sort === "newest"
      ? [desc(productsTable.publishedAt), desc(productsTable.createdAt)]
      : sort === "name"
        ? [asc(productsTable.name)]
        : sort === "price-asc"
          ? [
              sql`(select min(price_minor) from vyro_product_variants where product_id = ${productsTable.id} and status = 'active') asc`,
            ]
          : sort === "price-desc"
            ? [
                sql`(select min(price_minor) from vyro_product_variants where product_id = ${productsTable.id} and status = 'active') desc`,
              ]
            : [desc(productsTable.featured), desc(productsTable.publishedAt)];

  const [rows, totalRows] = await Promise.all([
    db
      .select({ product: productsTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(where)
      .orderBy(...ordering)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(where),
  ]);

  return {
    items: await serializeProducts(
      rows.map((row) => row.product),
      includeInactiveVariants,
    ),
    page,
    pageSize,
    total: totalRows[0]?.total ?? 0,
  };
}

export function combineConditions(conditions: SQL[]) {
  return conditions.length ? and(...conditions) : undefined;
}
