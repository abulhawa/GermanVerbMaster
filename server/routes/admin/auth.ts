import type { NextFunction, Request, Response } from "express";
import { getSessionRole, normalizeStringParam, sendError } from "../shared.js";

let adminAuthWarningLogged = false;

export function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  const sessionRole = getSessionRole(req.authSession);
  if (sessionRole === "admin") {
    return next();
  }

  const expectedToken = process.env.ADMIN_API_TOKEN?.trim();
  if (expectedToken) {
    const providedToken = normalizeStringParam(req.headers["x-admin-token"])?.trim();
    if (providedToken === expectedToken) {
      return next();
    }

    return sendError(res, 401, "Invalid admin token", "ADMIN_AUTH_FAILED");
  }

  if (!adminAuthWarningLogged) {
    console.warn(
      "ADMIN_API_TOKEN is not configured; admin routes now require an authenticated Better Auth admin session.",
    );
    adminAuthWarningLogged = true;
  }

  if (!req.authSession) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  return res.status(403).json({ error: "Admin privileges required", code: "FORBIDDEN" });
}
