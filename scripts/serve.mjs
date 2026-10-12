import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const directory = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 5174);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
createServer(async (request, response) => {
  try {
    const path = resolve(
      directory,
      "." +
        decodeURIComponent(new URL(request.url, "http://localhost").pathname),
    );
    if (!path.startsWith(directory + sep) || !(await stat(path)).isFile())
      throw new Error("Not found");
    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `WebScaly local preview: http://127.0.0.1:${port}/lab.html (${directory})`,
  ),
);
