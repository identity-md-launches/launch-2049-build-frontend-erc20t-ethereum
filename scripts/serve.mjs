import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

export async function serveExport(root = resolve("dist"), port = 0) {
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".json": "application/json",
  };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/preview/")) {
      response.writeHead(302, { Location: "/preview/" });
      response.end();
      return;
    }
    const file = resolve(
      root,
      pathname.slice("/preview/".length) || "index.html",
    );
    if (!file.startsWith(root + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/preview/` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serveExport(
    resolve("dist"),
    Number(process.argv[2] || 4173),
  );
  process.stdout.write(`Static export available at ${url}\n`);
}
