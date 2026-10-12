import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const productStatus = pgEnum("vyro_product_status", [
  "draft",
  "published",
  "archived",
]);
export const variantStatus = pgEnum("vyro_variant_status", [
  "active",
  "inactive",
]);
export const userRole = pgEnum("vyro_user_role", [
  "customer",
  "staff",
  "admin",
]);

export const categoriesTable = pgTable(
  "vyro_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    imagePath: text("image_path"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("vyro_categories_slug_uq").on(table.slug),
    index("vyro_categories_active_order_idx").on(
      table.isActive,
      table.sortOrder,
    ),
  ],
);

export const productsTable = pgTable(
  "vyro_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    status: productStatus("status").notNull().default("draft"),
    brand: text("brand"),
    featured: boolean("featured").notNull().default(false),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("vyro_products_slug_uq").on(table.slug),
    index("vyro_products_status_featured_idx").on(
      table.status,
      table.featured,
      table.publishedAt,
    ),
    index("vyro_products_category_idx").on(table.categoryId, table.status),
  ],
);

export const productVariantsTable = pgTable(
  "vyro_product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    options: jsonb("options")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    compareAtPriceMinor: integer("compare_at_price_minor"),
    status: variantStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("vyro_product_variants_sku_uq").on(table.sku),
    index("vyro_product_variants_product_status_idx").on(
      table.productId,
      table.status,
    ),
    check(
      "vyro_product_variants_price_nonnegative",
      sql`${table.priceMinor} >= 0`,
    ),
    check(
      "vyro_product_variants_compare_price_nonnegative",
      sql`${table.compareAtPriceMinor} IS NULL OR ${table.compareAtPriceMinor} >= 0`,
    ),
  ],
);

export const productImagesTable = pgTable(
  "vyro_product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariantsTable.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    altText: text("alt_text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vyro_product_images_product_order_idx").on(
      table.productId,
      table.sortOrder,
    ),
  ],
);

export const inventoryLocationsTable = pgTable(
  "vyro_inventory_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("vyro_inventory_locations_code_uq").on(table.code)],
);

export const inventoryTable = pgTable(
  "vyro_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocationsTable.id),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("vyro_inventory_variant_location_uq").on(
      table.variantId,
      table.locationId,
    ),
    check("vyro_inventory_on_hand_nonnegative", sql`${table.onHand} >= 0`),
    check("vyro_inventory_reserved_nonnegative", sql`${table.reserved} >= 0`),
    check(
      "vyro_inventory_reserved_not_over_on_hand",
      sql`${table.reserved} <= ${table.onHand}`,
    ),
  ],
);

export const inventoryMovementsTable = pgTable(
  "vyro_inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariantsTable.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocationsTable.id),
    movementType: text("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    actorId: text("actor_id"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vyro_inventory_movements_variant_time_idx").on(
      table.variantId,
      table.createdAt,
    ),
  ],
);

export const userRolesTable = pgTable("vyro_user_roles", {
  userId: text("user_id").primaryKey(),
  role: userRole("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogsTable = pgTable(
  "vyro_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    changeSummary: jsonb("change_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("vyro_audit_logs_entity_time_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);
