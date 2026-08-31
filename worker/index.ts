/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DATABASE_GATEWAY_URL?: string;
  DATABASE_GATEWAY_TOKEN?: string;
  CUSTOMER_HTTP_POSTGRES_GATEWAY?: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

async function proxyDatabaseRequest(request: Request, env: Env) {
  const sourceUrl = new URL(request.url);
  const gatewayPath = sourceUrl.pathname.replace(/^\/api\/database/, "") || "/health";
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  if (env.DATABASE_GATEWAY_TOKEN) {
    headers.set("x-portal-token", env.DATABASE_GATEWAY_TOKEN);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  };
  const pathAndQuery = `${gatewayPath}${sourceUrl.search}`;

  try {
    if (env.CUSTOMER_HTTP_POSTGRES_GATEWAY) {
      return await env.CUSTOMER_HTTP_POSTGRES_GATEWAY.fetch(
        new Request(`http://postgres-gateway.internal${pathAndQuery}`, init),
      );
    }
    if (env.DATABASE_GATEWAY_URL) {
      const base = env.DATABASE_GATEWAY_URL.endsWith("/")
        ? env.DATABASE_GATEWAY_URL
        : `${env.DATABASE_GATEWAY_URL}/`;
      return await fetch(new Request(new URL(pathAndQuery.replace(/^\//, ""), base), init));
    }
  } catch {
    return Response.json(
      { ok: false, configured: true, error: "Database gateway is unreachable." },
      { status: 502 },
    );
  }

  return Response.json(
    { ok: false, configured: false, error: "Database gateway is not configured." },
    { status: 503 },
  );
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname.startsWith("/api/database")) {
      return proxyDatabaseRequest(request, env);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
