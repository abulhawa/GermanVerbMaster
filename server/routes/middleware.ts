import type { RequestHandler } from "express";
import { getSessionFromRequest } from "../auth/index.js";

export const attachAuthSessionMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const session = await getSessionFromRequest(req);
    req.authSession = session;
    next();
  } catch (error) {
    next(error);
  }
};
