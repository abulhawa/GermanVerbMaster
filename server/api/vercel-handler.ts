import type { VercelApiHandler } from "@vercel/node";

import { createApiApp, type CreateApiAppOptions } from "./app";

export interface CreateVercelHandlerOptions extends CreateApiAppOptions {}

export function createVercelApiHandler(
  options: CreateVercelHandlerOptions = {},
): VercelApiHandler {
  const app = createApiApp({
    enableCors: options.enableCors,
    allowedOrigins: options.allowedOrigins,
    rethrowErrors: options.rethrowErrors ?? false,
  });

  return async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      const onFinish = () => resolve();
      const onError = (error: unknown) => reject(error);

      res.once("finish", onFinish);
      res.once("close", onFinish);
      res.once("error", onError);

      app(req as any, res as any, (error?: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };
}

export const handler: VercelApiHandler = createVercelApiHandler({ enableCors: false });

