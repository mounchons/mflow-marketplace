#!/usr/bin/env node
// The plan page, live: edit a step's narration and hear it again, set the voice's speed and the project's words, from
// the page in the browser. A file:// page cannot write files or run the voice, so this small server does, on this
// machine only:
//
//   node serve.mjs [--clips <dir>] [--port <n>] [--open] [--tts <dir>]
//     prints {"url": "http://127.0.0.1:<port>/?t=<token>"} and serves until stopped (Ctrl+C, or the process is killed)
//
// Safety: it listens on 127.0.0.1 only; every request must name this host (no other site can reach it through a
// renamed domain), every write carries the token printed at start (a page of another site cannot read it), a request
// from another origin is refused, and no CORS header is ever sent. It writes six things only: a step's '- พูด:' line,
// the plan's '- ความเร็วเสียง:', '- เสียงพากย์:' and '- สไตล์เสียง:' lines, clips/lexicon.txt, the edit requests (clips/requests.json,
// which /mclip:plan edit reads), and the voice (clips/<id>/voice/). One voice run at a time. API keys
// (tools/TutorialRecorder/tts/keys.json or the environment) stay on this machine: the page learns only whether each is
// set, and this server uses the ElevenLabs one to list the account's voices.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { load, renderPage, makeVoice, pyThaiTts, setNarration, setPlanField, writeProjectLexicon, SPEED_FIELD, ensureIgnored,
  readRequests, addRequest, removeRequests, VOICE_FIELD, parseVoice, voiceField, keyStatus, apiKey, elevenLabsVoices,
  GEMINI_VOICES, GLOBAL_LEXICON, ENGINES, ensureKeysIgnored, withStyle, STYLE_FIELD, partKey } from "./clips.mjs";

// what "ลองฟัง" says: a closing particle, an English word of the rules and a price
export const SAMPLE = "สวัสดีค่ะ กดปุ่ม Login เพื่อเข้าสู่ระบบ แล้วดูราคา 5,877.50 บาท ได้ที่หน้านี้ค่ะ";

const TYPES = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp3": "audio/mpeg",
  ".mp4": "video/mp4", ".srt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".pdf": "application/pdf" };

/** The request handler, separate from listening so tests drive it on any port. `speak` is the voice (pyThaiTts). */
export function createHandler({ clips, token, speak, port: getPort, tts = path.join(path.dirname(path.resolve(clips)), "tools", "TutorialRecorder", "tts"), globalLexicon = GLOBAL_LEXICON, env = process.env }) {
  const root = path.resolve(clips);
  // the voice the page names: { engine, id, model } as the plan field would say it
  const chosenVoice = (body) => {
    const engine = String(body.engine ?? "");
    const v = parseVoice(engine === "paradee" ? "paradee" : `${engine} ${String(body.id ?? "").trim() || "?"} ${String(body.model ?? "").trim()}`.trim());
    if (v.error) throw new Error(v.error);
    return withStyle({ ...v, name: String(body.name ?? "").replace(/[()\r\n\u2028\u2029]/g, "").trim().slice(0, 60) }, body.style);
  };
  const send = (res, code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  const json = (req) => new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on("data", (c) => { size += c.length; if (size > 65536) { reject(new Error("the request is too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}")); } catch { reject(new Error("the request is not JSON")); } });
    req.on("error", reject);
  });
  const sameToken = (t) => typeof t === "string" && t.length === token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
  const voice = (id, step) => {
    const r = makeVoice(root, id, { step, speak });
    if (r.code) throw new Error(r.error);
    return r;
  };

  return async (req, res) => {
    const port = getPort();
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host ?? "")) return send(res, 403, { error: "this server answers 127.0.0.1 only" });
    const origin = req.headers.origin;
    if (origin && !hosts.some((h) => origin === `http://${h}`)) return send(res, 403, { error: "another site cannot use this server" });
    const u = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
      if (!sameToken(u.searchParams.get("t"))) return send(res, 403, "<p>เปิดด้วยลิงก์ที่ server พิมพ์ไว้ (มี ?t=...)</p>", "text/html; charset=utf-8");
      const data = load(root);
      if (!data.plan) return send(res, 404, `<p>${String(data.problems[0]).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</p>`, "text/html; charset=utf-8");
      return send(res, 200, renderPage(data, new Date(), { live: { token, requests: readRequests(root), keys: keyStatus(tts, env) } }), "text/html; charset=utf-8");
    }
    if (req.method === "GET") {
      // the lessons' pictures, voices and videos: files under clips/ only, never above it, never a dot-file
      let rel;
      try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, ""); } catch { return send(res, 400, { error: "bad path" }); }
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || rel.split(/[\\/]/).some((p) => p.startsWith(".")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "not found" });
      const type = TYPES[path.extname(file).toLowerCase()];
      if (!type) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET or POST" });
    if (!sameToken(req.headers["x-mclip-token"])) return send(res, 403, { error: "no token: open the page with the link the server printed" });
    if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return send(res, 415, { error: "JSON only" });
    try {
      const body = await json(req);
      if (u.pathname === "/api/narration") {
        const step = partKey(body.step);  // a step number, or a title card: open, close
        if (step === null) throw new Error("step is a step number, open or close");
        setNarration(root, String(body.id ?? ""), step, body.text);
        const out = { saved: true };
        if (body.voice && String(body.text ?? "").trim()) out.voice = voice(String(body.id), step);
        return send(res, 200, out);
      }
      if (u.pathname === "/api/voice") {
        const step = body.step === undefined || body.step === null ? null : partKey(body.step);
        if (step === null && body.step !== undefined && body.step !== null) throw new Error("step is a step number, open or close");
        return send(res, 200, { voice: voice(String(body.id ?? ""), step) });
      }
      if (u.pathname === "/api/speed") {
        const speed = Number(body.speed);
        if (!(speed >= 0.7 && speed <= 1)) throw new Error("the speed is from 0.7 (slow) to 1.0 (normal)");
        setPlanField(root, SPEED_FIELD, speed.toFixed(2));
        return send(res, 200, { speed });
      }
      if (u.pathname === "/api/lexicon") return send(res, 200, { rules: writeProjectLexicon(root, body.text) });
      if (u.pathname === "/api/voice-engine") {
        const v = chosenVoice(body);
        setPlanField(root, VOICE_FIELD, voiceField(v));
        setPlanField(root, STYLE_FIELD, v.style);  // "" (no style, or not Gemini) removes the line
        return send(res, 200, { voice: v.key });
      }
      if (u.pathname === "/api/voices") {
        if (body.engine === "gemini") return send(res, 200, { voices: GEMINI_VOICES.map(([id, note]) => ({ id, name: id, note, thai: true })) });
        if (body.engine !== "elevenlabs") throw new Error("the voices of gemini or elevenlabs");
        const key = apiKey(tts, ENGINES.elevenlabs.key, env);
        if (!key) throw new Error(`no ${ENGINES.elevenlabs.key} in tools/TutorialRecorder/tts/keys.json`);
        return send(res, 200, { voices: await elevenLabsVoices(key) });
      }
      if (u.pathname === "/api/voice-sample") {
        const v = chosenVoice(body);
        const speed = Number(body.speed ?? 1);
        if (!(speed >= 0.7 && speed <= 1)) throw new Error("the speed is from 0.7 (slow) to 1.0 (normal)");
        const work = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-sample-"));
        try {
          // the words and price rules are Paradee's: an API voice reads the line as written
          const lexicons = v.engine === "paradee" ? [globalLexicon, path.join(root, "lexicon.txt")].filter((f) => fs.existsSync(f)) : [];
          const [item] = speak([SAMPLE], work, speed, lexicons, v);
          if (!item || !fs.existsSync(item.file)) throw new Error("the voice made no sample");
          return send(res, 200, { text: SAMPLE, voice: v.key, durationMs: item.durationMs, mp3: fs.readFileSync(item.file).toString("base64") });
        } finally { fs.rmSync(work, { recursive: true, force: true }); }
      }
      if (u.pathname === "/api/requests") {
        // {add: {target, quote, text}} | {remove: id} | {clear: true} | {} (read); answers with the list
        let items;
        if (body.add) items = addRequest(root, body.add);
        else if (typeof body.remove === "string") items = removeRequests(root, [body.remove]);
        else if (body.clear === true) items = removeRequests(root, null);
        else items = readRequests(root);
        return send(res, 200, { items });
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const clips = path.resolve(opt("--clips") ?? path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "clips"));
  if (!fs.existsSync(path.join(clips, "plan.md"))) { console.log(JSON.stringify({ error: `no plan: ${path.join(clips, "plan.md")}` })); process.exit(2); }
  const tts = path.resolve(opt("--tts") ?? path.join(path.dirname(clips), "tools", "TutorialRecorder", "tts"));
  const token = crypto.randomBytes(24).toString("hex");
  let port = 0;
  ensureIgnored(clips);
  ensureKeysIgnored(tts);
  const server = http.createServer(createHandler({ clips, token, speak: pyThaiTts(tts), port: () => port, tts }));
  server.listen(Number(opt("--port") ?? 0), "127.0.0.1", () => {
    port = server.address().port;
    const url = `http://127.0.0.1:${port}/?t=${token}`;
    console.log(JSON.stringify({ url, clips, stop: "Ctrl+C, or stop this process" }));
    if (args.includes("--open") && !process.env.CLAUDE_CODE_REMOTE) {
      // the token stays out of other programs' command lines: open a local file that sends the browser there
      const hop = path.join(clips, ".mclip-open.html");
      fs.writeFileSync(hop, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}">`);
      import("node:child_process").then(({ spawn }) => {
        const [cmd, a] = process.platform === "win32" ? ["explorer.exe", [hop]] : process.platform === "darwin" ? ["open", [hop]] : ["xdg-open", [hop]];
        spawn(cmd, a, { stdio: "ignore", detached: true }).unref();
        setTimeout(() => fs.rmSync(hop, { force: true }), 15000);
      });
    }
  });
}
