import { db, inventoryLocationsTable } from "@workspace/db";

export async function ensureDefaultInventoryLocation() {
  await db
    .insert(inventoryLocationsTable)
    .values({ code: "default", name: "Default inventory" })
    .onConflictDoNothing({ target: inventoryLocationsTable.code });
}
