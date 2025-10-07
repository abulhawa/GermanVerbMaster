import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApiApp, type CreateApiAppOptions } from './app.js';

export interface CreateVercelHandlerOptions extends CreateApiAppOptions {}

export type VercelApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

function runExpressApp(
  app: ReturnType<typeof createApiApp>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('finish', handleFinish);
      response.off('close', handleFinish);
      response.off('error', handleError);
    };

    const handleFinish = () => {
      cleanup();
      resolve();
    };

    const handleError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    response.once('finish', handleFinish);
    response.once('close', handleFinish);
    response.once('error', handleError);

    try {
      app(request as any, response as any, (error?: unknown) => {
        if (error) {
          handleError(error);
        } else {
          handleFinish();
        }
      });
    } catch (error) {
      handleError(error);
    }
  });
}

export function createVercelApiHandler(options: CreateVercelHandlerOptions = {}): VercelApiHandler {
  const { rethrowErrors, ...rest } = options;
  const app = createApiApp({
    ...rest,
    // Re-throwing errors causes unhandled rejections in serverless runtimes.
    rethrowErrors: rethrowErrors ?? false,
  });

  return async (request, response) => {
    await runExpressApp(app, request, response);
  };
}

export const handler = createVercelApiHandler();
export default handler;
