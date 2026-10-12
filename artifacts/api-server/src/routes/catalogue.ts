import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  GetProductBySlugParams,
  GetProductBySlugResponse,
  ListCategoriesResponse,
  ListProductsQueryParams,
  ListProductsResponse,
} from "@workspace/api-zod";
import { categoriesTable, db, productsTable } from "@workspace/db";
import {
  combineConditions,
  getPage,
  normalizeBooleanQuery,
  productSearchConditions,
  publicProductConditions,
  serializeProducts,
  serializeCategory,
} from "../lib/vyroCatalog";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.isActive, true))
    .orderBy(categoriesTable.sortOrder, categoriesTable.name);
  res.json(ListCategoriesResponse.parse(rows.map(serializeCategory)));
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse({
    ...req.query,
    featured: normalizeBooleanQuery(req.query.featured),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "The catalogue filters are not valid." });
    return;
  }

  const params = parsed.data;
  const conditions = [
    ...publicProductConditions(),
    ...productSearchConditions(params.q),
  ];

  if (params.category) {
    const [category] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, params.category))
      .limit(1);
    if (!category) {
      res.json(
        ListProductsResponse.parse({
          items: [],
          page: params.page,
          pageSize: params.pageSize,
          total: 0,
        }),
      );
      return;
    }
    conditions.push(eq(productsTable.categoryId, category.id));
  }
  if (params.featured !== undefined) {
    conditions.push(eq(productsTable.featured, params.featured));
  }

  const page = await getPage(
    combineConditions(conditions),
    params.page,
    params.pageSize,
    params.sort,
  );
  res.json(ListProductsResponse.parse(page));
});

router.get("/products/:slug", async (req, res): Promise<void> => {
  const params = GetProductBySlugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "That product address is not valid." });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.slug, params.data.slug),
        eq(productsTable.status, "published"),
      ),
    )
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  if (product.categoryId) {
    const [activeCategory] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, product.categoryId),
          eq(categoriesTable.isActive, true),
        ),
      )
      .limit(1);
    if (!activeCategory) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
  }

  const [result] = await serializeProducts([product]);
  res.json(GetProductBySlugResponse.parse(result));
});

export default router;
