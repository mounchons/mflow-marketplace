// serve.mjs serves mreq/ui/ on 127.0.0.1 only: pages, JSON and folders' index.html, never a file
// outside the folder (encoded traversal included), and nothing but GET and HEAD.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { project, run, start } from "./mreq-helpers.mjs";

let p;
let server;
let base;

before(async () => {
  p = project();
  p.write("mreq/ui/theme/index.html", "<!doctype html><title>kit</title>");
  p.write("mreq/ui/data/users.json", '{"users":[]}');
  p.write(".mreq/secret.txt", "outside the served folder");
  const { child, line } = await start(p, "serve.mjs", ["--port", "0"]);
  server = child;
  const info = JSON.parse(line);
  assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  base = info.url.replace(/\/$/, "");
});
// On Windows a running process keeps its working folder busy: wait for it to exit before deleting it.
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  p?.cleanup();
});

const get = (url, init) => fetch(base + url, { redirect: "manual", ...init });

test("the site root sends people to the kit, and a folder serves its index.html", async () => {
  const root = await get("/");
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/theme/");
  const noSlash = await get("/theme");
  assert.equal(noSlash.status, 301);
  const page = await get("/theme/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /<title>kit<\/title>/);
});

test("JSON is served with its type and no caching", async () => {
  const r = await get("/data/users.json");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /application\/json/);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("nothing outside mreq/ui is served, encoded or not", async () => {
  for (const url of ["/../../.mreq/secret.txt", "/%2e%2e/%2e%2e/.mreq/secret.txt", "/..%2f..%2f.mreq%2fsecret.txt", "/missing.html"]) {
    const r = await get(url);
    assert.equal(r.status, 404, url);
    assert.doesNotMatch(await r.text(), /outside the served folder/, url);
  }
});

test("only GET and HEAD are answered", async () => {
  assert.equal((await get("/theme/", { method: "POST" })).status, 405);
  const head = await get("/theme/", { method: "HEAD" });
  assert.equal(head.status, 200);
});

test("a project without mreq/ui is refused with a hint", () => {
  const q = project();
  try {
    const r = run(q, "serve.mjs", ["--port", "0"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /\/mreq:theme/);
  } finally {
    q.cleanup();
  }
});
