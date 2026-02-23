import { join, toFileUrl } from "@std/path";
import { transpile } from "@deno/emit";

const contentTypeForPath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".ts")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

const tsCache = new Map<string, { mtimeMs: number; code: Uint8Array }>();

const transpileTsModule = async (relPath: string): Promise<Uint8Array> => {
  const absPath = join(Deno.cwd(), relPath);
  const stat = await Deno.stat(absPath);
  const mtimeMs = stat.mtime?.getTime() ?? 0;

  const cached = tsCache.get(absPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.code;

  const url = toFileUrl(absPath);
  const emitted = await transpile(url, {
    allowRemote: false,
    compilerOptions: {
      inlineSourceMap: true,
      inlineSources: true,
    },
  });

  const js = emitted.get(url.href);
  if (typeof js !== "string") {
    throw new Error(`Failed to transpile: ${relPath}`);
  }
  const code = new TextEncoder().encode(js);
  tsCache.set(absPath, { mtimeMs, code });
  return code;
};

const safePathFromUrl = (url: URL): string => {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  // Basic traversal protection.
  if (pathname.includes("..") || pathname.includes("\\")) return "";

  // Strip leading '/'
  return pathname.replace(/^\//, "");
};

if (import.meta.main) {
  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = safePathFromUrl(url);
    if (!path) return new Response("Bad Request", { status: 400 });

    try {
      const file: Uint8Array = path.toLowerCase().endsWith(".ts")
        ? await transpileTsModule(path)
        : (await Deno.readFile(path) as Uint8Array);
      const body = file as unknown as BodyInit;
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": contentTypeForPath(path),
          "cache-control": "no-cache",
        },
      });
    } catch (_err) {
      return new Response("Not Found", { status: 404 });
    }
  };

  const port = 8000;
  Deno.serve({ port }, handler);
  console.log(`Serving on http://localhost:${port}/`);
}
