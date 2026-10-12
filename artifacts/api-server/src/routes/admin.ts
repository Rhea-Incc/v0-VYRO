import { Router, type IRouter, type Request } from "express";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import {
  CreateAdminCategoryBody,
  CreateAdminCategoryResponse,
  CreateAdminProductBody,
  CreateAdminProductResponse,
  GetAdminProductParams,
  GetAdminProductResponse,
  GetAdminSessionResponse,
  GetAdminSummaryResponse,
  ListAdminCategoriesResponse,
  ListAdminProductsQueryParams,
  ListAdminProductsResponse,
  UpdateAdminCategoryBody,
  UpdateAdminCategoryParams,
  UpdateAdminCategoryResponse,
  UpdateAdminProductBody,
  UpdateAdminProductParams,
  UpdateAdminProductResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  categoriesTable,
  db,
  inventoryLocationsTable,
  inventoryMovementsTable,
  inventoryTable,
  productImagesTable,
  productVariantsTable,
  productsTable,
  userRolesTable,
} from "@workspace/db";
import {
  combineConditions,
  getPage,
  productSearchConditions,
  serializeCategory,
  serializeProducts,
} from "../lib/vyroCatalog";
import {
  getAuthenticatedUserId,
  requireSignedIn,
  requireVyroAdmin,
} from "../middlewares/adminAuth";

const router: IRouter = Router();
const localAssetPath =
  /^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:avif|webp|png|jpe?g)$/i;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function isValidProductMedia(images: { storagePath: string }[]) {
  return images.every((image) => localAssetPath.test(image.storagePath));
}

async function hasValidCategory(
  categoryId: string | null,
  requireActive: boolean,
) {
  if (!categoryId) return true;
  const conditions = [eq(categoriesTable.id, categoryId)];
  if (requireActive) conditions.push(eq(categoriesTable.isActive, true));
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(and(...conditions))
    .limit(1);
  return Boolean(category);
}

function auditRecord(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId: string | undefined,
  changeSummary: Record<string, unknown>,
) {
  return {
    actorId,
    action,
    entityType,
    entityId,
    requestId: requestId ?? null,
    changeSummary,
  };
}

function requestId(request: Request) {
  return typeof request.id === "string" ? request.id : undefined;
}

async function defaultInventoryLocation() {
  const [location] = await db
    .select({ id: inventoryLocationsTable.id })
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.isActive, true))
    .orderBy(asc(inventoryLocationsTable.createdAt))
    .limit(1);
  return location ?? null;
}

router.get("/admin/session", requireSignedIn, async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const [assignment] = await db
    .select({ role: userRolesTable.role })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId))
    .limit(1);
  res.json(
    GetAdminSessionResponse.parse({
      userId,
      role: assignment?.role ?? null,
      isAdmin: assignment?.role === "admin",
    }),
  );
});

router.get("/admin/summary", requireVyroAdmin, async (_req, res): Promise<void> => {
  const [productSummary, categorySummary, activeVariants] = await Promise.all([
    db
      .select({
        totalProducts: count(),
        publishedProducts: sql<number>`count(*) filter (where ${productsTable.status} = 'published')::int`,
        draftProducts: sql<number>`count(*) filter (where ${productsTable.status} = 'draft')::int`,
      })
      .from(productsTable),
    db
      .select({ categoryCount: count() })
      .from(categoriesTable)
      .where(eq(categoriesTable.isActive, true)),
    db
      .select({
        available: sql<number>`greatest(coalesce(sum(${inventoryTable.onHand} - ${inventoryTable.reserved}), 0), 0)::int`,
      })
      .from(productVariantsTable)
      .leftJoin(
        inventoryTable,
        eq(productVariantsTable.id, inventoryTable.variantId),
      )
      .where(eq(productVariantsTable.status, "active"))
      .groupBy(productVariantsTable.id),
  ]);
  res.json(
    GetAdminSummaryResponse.parse({
      ...productSummary[0],
      ...categorySummary[0],
      lowStockVariants: activeVariants.filter((row) => row.available <= 3).length,
    }),
  );
});

router.get(
  "/admin/products",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const parsed = ListAdminProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "The product filters are not valid." });
      return;
    }
    const conditions = productSearchConditions(parsed.data.q);
    if (parsed.data.status) {
      conditions.push(eq(productsTable.status, parsed.data.status));
    }
    const page = await getPage(
      combineConditions(conditions),
      parsed.data.page,
      parsed.data.pageSize,
      "newest",
      true,
    );
    res.json(ListAdminProductsResponse.parse(page));
  },
);

router.post(
  "/admin/products",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateAdminProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Product details are incomplete or invalid." });
      return;
    }
    const input = parsed.data;
    if (!isValidProductMedia(input.images)) {
      res.status(400).json({ error: "Product images must use local /assets paths." });
      return;
    }
    if (
      input.variants.some(
        (variant) =>
          variant.compareAtPriceMinor !== null &&
          variant.compareAtPriceMinor <= variant.priceMinor,
      )
    ) {
      res.status(400).json({ error: "A compare-at price must exceed the current price." });
      return;
    }
    if (
      input.status === "published" &&
      !input.variants.some((variant) => variant.status === "active")
    ) {
      res.status(400).json({ error: "A published product needs an active variant." });
      return;
    }
    if (!(await hasValidCategory(input.categoryId, input.status === "published"))) {
      res.status(400).json({ error: "Choose an existing, active category." });
      return;
    }
    const location = await defaultInventoryLocation();
    if (!location) {
      res.status(503).json({ error: "Set up an active inventory location before adding products." });
      return;
    }

    const actorId = getAuthenticatedUserId(req);
    if (!actorId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    try {
      const product = await db.transaction(async (tx) => {
        const now = new Date();
        const [created] = await tx
          .insert(productsTable)
          .values({
            categoryId: input.categoryId,
            name: input.name,
            slug: input.slug,
            shortDescription: input.shortDescription,
            description: input.description,
            status: input.status,
            brand: input.brand,
            featured: input.featured,
            metadata: input.metadata,
            publishedAt: input.status === "published" ? now : null,
          })
          .returning();
        const createdVariants = await tx
          .insert(productVariantsTable)
          .values(
            input.variants.map((variant) => ({
              productId: created.id,
              sku: variant.sku,
              name: variant.name,
              options: variant.options,
              priceMinor: variant.priceMinor,
              currency: variant.currency,
              compareAtPriceMinor: variant.compareAtPriceMinor,
              status: variant.status,
            })),
          )
          .returning();
        await tx.insert(inventoryTable).values(
          createdVariants.map((variant, index) => ({
            variantId: variant.id,
            locationId: location.id,
            onHand: input.variants[index].stockOnHand,
          })),
        );
        const movements = createdVariants.flatMap((variant, index) => {
          const quantity = input.variants[index].stockOnHand;
          return quantity > 0
            ? [
                {
                  variantId: variant.id,
                  locationId: location.id,
                  movementType: "initial_stock",
                  quantityDelta: quantity,
                  referenceType: "product_creation",
                  referenceId: created.id,
                  actorId,
                  reason: "Initial stock entered during product creation.",
                },
              ]
            : [];
        });
        if (movements.length) {
          await tx.insert(inventoryMovementsTable).values(movements);
        }
        if (input.images.length) {
          await tx.insert(productImagesTable).values(
            input.images.map((image) => ({ productId: created.id, ...image })),
          );
        }
        await tx.insert(auditLogsTable).values(
          auditRecord(
            actorId,
            "product.created",
            "product",
            created.id,
            requestId(req),
            { status: created.status, slug: created.slug },
          ),
        );
        return created;
      });
      const [result] = await serializeProducts([product], true);
      res.status(201).json(CreateAdminProductResponse.parse(result));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "That product slug or SKU is already in use." });
        return;
      }
      req.log.error({ err: error }, "Failed to create VYRO product");
      res.status(500).json({ error: "The product could not be saved." });
    }
  },
);

router.get(
  "/admin/products/:id",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const params = GetAdminProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "The product address is not valid." });
      return;
    }
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const [result] = await serializeProducts([product], true);
    res.json(GetAdminProductResponse.parse(result));
  },
);

router.patch(
  "/admin/products/:id",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminProductParams.safeParse(req.params);
    const parsed = UpdateAdminProductBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Product details are incomplete or invalid." });
      return;
    }
    const input = parsed.data;
    if (!isValidProductMedia(input.images)) {
      res.status(400).json({ error: "Product images must use local /assets paths." });
      return;
    }
    if (
      input.variants.some(
        (variant) =>
          variant.compareAtPriceMinor !== null &&
          variant.compareAtPriceMinor <= variant.priceMinor,
      )
    ) {
      res.status(400).json({ error: "A compare-at price must exceed the current price." });
      return;
    }
    if (
      input.status === "published" &&
      !input.variants.some((variant) => variant.status === "active")
    ) {
      res.status(400).json({ error: "A published product needs an active variant." });
      return;
    }
    if (!(await hasValidCategory(input.categoryId, input.status === "published"))) {
      res.status(400).json({ error: "Choose an existing, active category." });
      return;
    }
    const [current] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const actorId = getAuthenticatedUserId(req);
    if (!actorId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    try {
      const updated = await db.transaction(async (tx) => {
        await tx
          .update(productsTable)
          .set({
            categoryId: input.categoryId,
            name: input.name,
            slug: input.slug,
            shortDescription: input.shortDescription,
            description: input.description,
            status: input.status,
            brand: input.brand,
            featured: input.featured,
            metadata: input.metadata,
            publishedAt:
              input.status === "published"
                ? current.publishedAt ?? new Date()
                : current.publishedAt,
          })
          .where(eq(productsTable.id, current.id));

        const currentVariants = await tx
          .select()
          .from(productVariantsTable)
          .where(eq(productVariantsTable.productId, current.id));
        const existingBySku = new Map(
          currentVariants.map((variant) => [variant.sku, variant]),
        );
        const existingInventoryLocation = await tx
          .select({ id: inventoryLocationsTable.id })
          .from(inventoryLocationsTable)
          .where(eq(inventoryLocationsTable.isActive, true))
          .orderBy(asc(inventoryLocationsTable.createdAt))
          .limit(1);
        const locationId = existingInventoryLocation[0]?.id;

        for (const variant of input.variants) {
          const existing = existingBySku.get(variant.sku);
          if (existing) {
            await tx
              .update(productVariantsTable)
              .set({
                name: variant.name,
                options: variant.options,
                priceMinor: variant.priceMinor,
                currency: variant.currency,
                compareAtPriceMinor: variant.compareAtPriceMinor,
                status: variant.status,
              })
              .where(eq(productVariantsTable.id, existing.id));
            existingBySku.delete(variant.sku);
          } else {
            if (!locationId) {
              throw new Error("No active inventory location is configured.");
            }
            const [createdVariant] = await tx
              .insert(productVariantsTable)
              .values({
                productId: current.id,
                sku: variant.sku,
                name: variant.name,
                options: variant.options,
                priceMinor: variant.priceMinor,
                currency: variant.currency,
                compareAtPriceMinor: variant.compareAtPriceMinor,
                status: variant.status,
              })
              .returning();
            await tx.insert(inventoryTable).values({
              variantId: createdVariant.id,
              locationId,
              onHand: variant.stockOnHand,
            });
            if (variant.stockOnHand > 0) {
              await tx.insert(inventoryMovementsTable).values({
                variantId: createdVariant.id,
                locationId,
                movementType: "initial_stock",
                quantityDelta: variant.stockOnHand,
                referenceType: "product_edit",
                referenceId: current.id,
                actorId,
                reason: "Initial stock entered for a new variant.",
              });
            }
          }
        }
        for (const removed of existingBySku.values()) {
          await tx
            .update(productVariantsTable)
            .set({ status: "inactive" })
            .where(eq(productVariantsTable.id, removed.id));
        }
        await tx
          .delete(productImagesTable)
          .where(eq(productImagesTable.productId, current.id));
        if (input.images.length) {
          await tx.insert(productImagesTable).values(
            input.images.map((image) => ({
              productId: current.id,
              ...image,
            })),
          );
        }
        await tx.insert(auditLogsTable).values(
          auditRecord(
            actorId,
            "product.updated",
            "product",
            current.id,
            requestId(req),
            { status: input.status, slug: input.slug },
          ),
        );
        const [fresh] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, current.id))
          .limit(1);
        return fresh;
      });
      const [result] = await serializeProducts([updated], true);
      res.json(UpdateAdminProductResponse.parse(result));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "That product slug or SKU is already in use." });
        return;
      }
      if (
        error instanceof Error &&
        error.message === "No active inventory location is configured."
      ) {
        res.status(503).json({ error: "Set up an active inventory location before adding variants." });
        return;
      }
      req.log.error({ err: error }, "Failed to update VYRO product");
      res.status(500).json({ error: "The product could not be saved." });
    }
  },
);

router.get(
  "/admin/categories",
  requireVyroAdmin,
  async (_req, res): Promise<void> => {
    const categories = await db
      .select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
    res.json(
      ListAdminCategoriesResponse.parse(categories.map(serializeCategory)),
    );
  },
);

router.post(
  "/admin/categories",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateAdminCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Category details are incomplete or invalid." });
      return;
    }
    const input = parsed.data;
    if (input.imagePath && !localAssetPath.test(input.imagePath)) {
      res.status(400).json({ error: "Category images must use local /assets paths." });
      return;
    }
    if (input.parentId) {
      const [parent] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.id, input.parentId),
            eq(categoriesTable.isActive, true),
          ),
        )
        .limit(1);
      if (!parent) {
        res.status(400).json({ error: "Choose an existing, active parent category." });
        return;
      }
    }
    const actorId = getAuthenticatedUserId(req);
    if (!actorId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    try {
      const category = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(categoriesTable)
          .values(input)
          .returning();
        await tx.insert(auditLogsTable).values(
          auditRecord(
            actorId,
            "category.created",
            "category",
            created.id,
            requestId(req),
            { slug: created.slug },
          ),
        );
        return created;
      });
      res.status(201).json(
        CreateAdminCategoryResponse.parse(serializeCategory(category)),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "That category slug is already in use." });
        return;
      }
      req.log.error({ err: error }, "Failed to create VYRO category");
      res.status(500).json({ error: "The category could not be saved." });
    }
  },
);

router.patch(
  "/admin/categories/:id",
  requireVyroAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminCategoryParams.safeParse(req.params);
    const parsed = UpdateAdminCategoryBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Category details are incomplete or invalid." });
      return;
    }
    const input = parsed.data;
    if (input.imagePath && !localAssetPath.test(input.imagePath)) {
      res.status(400).json({ error: "Category images must use local /assets paths." });
      return;
    }
    if (input.parentId === params.data.id) {
      res.status(400).json({ error: "A category cannot be its own parent." });
      return;
    }
    if (input.parentId) {
      const [parent] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(
          and(
            eq(categoriesTable.id, input.parentId),
            eq(categoriesTable.isActive, true),
          ),
        )
        .limit(1);
      if (!parent) {
        res.status(400).json({ error: "Choose an existing, active parent category." });
        return;
      }
    }
    const actorId = getAuthenticatedUserId(req);
    if (!actorId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    try {
      const category = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(categoriesTable)
          .set(input)
          .where(eq(categoriesTable.id, params.data.id))
          .returning();
        if (!updated) return null;
        await tx.insert(auditLogsTable).values(
          auditRecord(
            actorId,
            "category.updated",
            "category",
            updated.id,
            requestId(req),
            { slug: updated.slug, isActive: updated.isActive },
          ),
        );
        return updated;
      });
      if (!category) {
        res.status(404).json({ error: "Category not found." });
        return;
      }
      res.json(
        UpdateAdminCategoryResponse.parse(serializeCategory(category)),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "That category slug is already in use." });
        return;
      }
      req.log.error({ err: error }, "Failed to update VYRO category");
      res.status(500).json({ error: "The category could not be saved." });
    }
  },
);

export default router;
