#!/usr/bin/env node
// Serves mreq/ui/ (the UI kit and the prototype screens) on 127.0.0.1 so a browser can open them.
// Pages fetch JSON and keep small preferences in storage, which browsers restrict on file:// pages.
//
//   node serve.mjs [--port 8810] [--root <folder>]
// Prints one JSON line {url, port, root} once listening, then serves until stopped. --port 0 takes any
// free port. GET and HEAD only; a folder serves its index.html; nothing outside the root is served, a
// link that leads out included; no folder listings.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PATHS, findRoot, realInside } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const fail = (msg) => {
  process.stderr.write(msg + "\n");
  process.exit(1);
};

let root = opt("--root");
if (!root) {
  const project = findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!project) fail("not an mreq project (no .mreq/config.json above this folder): run /mreq:init first, or give --root");
  root = path.join(project, PATHS.ui);
}
root = path.resolve(root);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`${root} is not a folder: build the kit first with /mreq:theme`);
const port = Number(opt("--port") ?? 8810);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail("--port must be a whole number from 0 to 65535");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function send(res, code, body, type = "text/plain; charset=utf-8", head = false) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(head ? undefined : body);
}

const server = http.createServer((req, res) => {
  const head = req.method === "HEAD";
  if (req.method !== "GET" && !head) return send(res, 405, "method not allowed");
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "bad path");
  }
  if (rel.includes("\0")) return send(res, 400, "bad path");
  let target = path.resolve(root, "." + path.posix.normalize("/" + rel.replaceAll("\\", "/")));
  const inside = path.relative(root, target);
  if (inside.startsWith("..") || path.isAbsolute(inside) || !realInside(root, target)) return send(res, 404, "not found");
  let stat;
  try { stat = fs.statSync(target); } catch { stat = null; }
  if (stat?.isDirectory()) {
    if (!rel.endsWith("/")) {
      res.writeHead(301, { Location: new URL(req.url, "http://localhost").pathname + "/" });
      return res.end();
    }
    target = path.join(target, "index.html");
    try { stat = fs.statSync(target); } catch { stat = null; }
    // The site root has no page of its own: send people to the kit.
    if (!stat && rel === "/" && fs.existsSync(path.join(root, "theme", "index.html"))) {
      res.writeHead(302, { Location: "/theme/" });
      return res.end();
    }
  }
  if (!stat || !stat.isFile() || !realInside(root, target)) return send(res, 404, "not found");
  const type = TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
  fs.readFile(target, (err, data) => (err ? send(res, 500, "could not read the file") : send(res, 200, data, type, head)));
});

server.on("error", (err) => {
  fail(err.code === "EADDRINUSE" ? `port ${port} is in use: give another with --port, or stop the server already running` : String(err.message || err));
});
server.listen(port, "127.0.0.1", () => {
  const actual = server.address().port;
  process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${actual}/`, port: actual, root }) + "\n");
});
