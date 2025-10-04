import { createServer } from "http";
import type { AddressInfo } from "net";

import type { VercelApiHandler } from "@vercel/node";

export interface InvokeOptions extends RequestInit {
  path: string;
}

export interface InvokeResult {
  status: number;
  headers: Headers;
  bodyText: string;
  bodyJson?: unknown;
  raw: Response;
}

function serialiseBody(body: BodyInit | null | undefined): BodyInit | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body;
  }

  if (body instanceof URLSearchParams || body instanceof FormData || body instanceof Blob) {
    return body;
  }

  if (typeof body === "object") {
    return JSON.stringify(body);
  }

  return String(body);
}

export async function invokeHandler(handler: VercelApiHandler, options: InvokeOptions): Promise<InvokeResult> {
  const { path, headers, body, ...rest } = options;
  const server = createServer((req, res) => {
    handler(req as any, res as any);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  try {
    const { port } = server.address() as AddressInfo;
    const url = new URL(path, `http://127.0.0.1:${port}`);

    const normalisedHeaders = new Headers(headers);
    const serialisedBody = serialiseBody(body ?? undefined);
    if (serialisedBody && !normalisedHeaders.has("content-type") && !(serialisedBody instanceof FormData)) {
      normalisedHeaders.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      ...rest,
      method: rest.method ?? (serialisedBody ? "POST" : "GET"),
      headers: normalisedHeaders,
      body: serialisedBody,
    });

    const bodyText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const bodyJson = contentType.includes("application/json") && bodyText
      ? JSON.parse(bodyText)
      : undefined;

    return {
      status: response.status,
      headers: response.headers,
      bodyText,
      bodyJson,
      raw: response,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

export function createApiInvoker(handler: VercelApiHandler) {
  return (path: string, init: RequestInit = {}) => invokeHandler(handler, { path, ...init });
}

