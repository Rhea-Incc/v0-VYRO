import { db, inventoryLocationsTable } from "@workspace/db";

let defaultInventoryLocation: Promise<void> | undefined;

export function ensureDefaultInventoryLocation(): Promise<void> {
  defaultInventoryLocation ??= db
    .insert(inventoryLocationsTable)
    .values({ code: "default", name: "Default inventory" })
    .onConflictDoNothing({ target: inventoryLocationsTable.code })
    .then(() => undefined);

  return defaultInventoryLocation;
}
