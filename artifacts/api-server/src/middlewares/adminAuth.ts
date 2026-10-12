import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, userRolesTable } from "@workspace/db";

export function getAuthenticatedUserId(
  request: Parameters<RequestHandler>[0],
): string | null {
  return getAuth(request).userId ?? null;
}

export const requireSignedIn: RequestHandler = (req, res, next): void => {
  if (!getAuthenticatedUserId(req)) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
};

export const requireVyroAdmin: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
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

  if (assignment?.role !== "admin") {
    res.status(403).json({ error: "VYRO administrator access is required." });
    return;
  }

  next();
};
