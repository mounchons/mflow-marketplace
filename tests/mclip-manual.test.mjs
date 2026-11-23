// mclip's manual.mjs (/mclip:manual): the manual model from the plan (what goes in, what is left out), the Markdown,
// the .docx read back with a small zip reader (its parts, the Thai text escaped, the pictures and their sizes), and the
// PDF step with a stand-in for Word. Throwaway folders only: no Word, no browser.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL = path.join(REPO, "plugins", "mclip", "scripts", "manual.mjs");
const { buildModel, toMarkdown, toDocx, makeManual, imageSize, thaiDate, zip } = await import(`file://${MANUAL.replace(/\\/g, "/")}`);
const { load } = await import(`file://${path.join(REPO, "plugins", "mclip", "scripts", "clips.mjs").replace(/\\/g, "/")}`);

// a 1x1 PNG and a minimal JPEG header (SOF0 says 640x360)
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f40000000049454e44ae426082", "hex");
const JPG = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108016802800301220002110103110100ffd9", "hex");

const PLAN = `# ร้านค้า — การใช้งาน

- ระบบ: ระบบหลังร้าน
- ผู้ชม: พนักงาน
- stack ทดสอบ: http://localhost:8095

## แอป

### web — หลังร้าน
- ชนิด: web

### mobile — แอปพนักงาน
- ชนิด: ios, android

## สารบัญ

1. 01-add — เพิ่มสินค้า <ใหม่>
   - แอป: web
   - สอน: เพิ่มสินค้าเข้าร้านได้
2. 02-scan — สแกนสินค้า
   - แอป: mobile
3. 03-later — ยังเป็นหัวข้อ
   - แอป: web
`;
const ADD = `# เพิ่มสินค้า <ใหม่>

- บทบาท: ผู้จัดการร้าน
- ข้อมูลที่ใช้: สินค้าทดสอบ A-001

## 1. เปิดหน้าสินค้า
- ทำ: go to http://localhost:8095/products
- บนจอ: กดเมนู สินค้า
- พูด: เริ่มที่เมนูสินค้าค่ะ
- รูป: screen/01-products.png

## 2. บันทึก
- ทำ: click tour:btn-save
- บนจอ: กด บันทึก
- คู่มือ: กดปุ่ม **บันทึก** ที่มุมขวาล่าง ระบบจะแสดงสินค้าใหม่ & ราคาในรายการ
- หมายเหตุ: ราคาต้องมากกว่า 0
- รูป: screen/02-saved.jpg
- รูป: screen/02-missing.jpg
`;
const SCAN = `# สแกนสินค้า

## 1. เปิดกล้อง
- ทำ: tap Scan
- บนจอ: แตะ สแกน
- รูป: screen/01-cam-ios.png
- รูป: screen/01-cam-android.png
`;

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mclip-manual-"));
  const files = { "clips/plan.md": PLAN, "clips/01-add/lesson.md": ADD, "clips/02-scan/lesson.md": SCAN,
    "clips/01-add/screen/01-products.png": PNG, "clips/01-add/screen/02-saved.jpg": JPG,
    "clips/02-scan/screen/01-cam-ios.png": PNG, "clips/02-scan/screen/01-cam-android.png": PNG };
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, clips: path.join(root, "clips"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Reads a zip's entries back: { name: Buffer }. */
function unzip(buf) {
  const out = {};
  let end = buf.length - 22;
  while (buf.readUInt32LE(end) !== 0x06054b50) end--;
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out[name] = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (zlib.crc32) assert.equal(zlib.crc32(out[name]), crc, `${name} crc`);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

test("the model: lessons in contents order, topics and missing pictures listed, recorder words and test data left out", () => {
  const p = project();
  try {
    const m = buildModel(load(p.clips), p.clips, new Date(2026, 10, 23));
    assert.equal(m.date, "23 พฤศจิกายน 2569");
    assert.deepEqual(m.preface, [["ระบบ", "ระบบหลังร้าน"], ["ผู้ใช้คู่มือนี้", "พนักงาน"]], "no test stack in the preface");
    assert.deepEqual(m.chapters.map((c) => c.id), ["01-add", "02-scan"]);
    assert.deepEqual(m.skipped, ["03-later"]);
    assert.deepEqual(m.missing, ["clips/01-add/screen/02-missing.jpg"]);
    const [add, scan] = m.chapters;
    assert.deepEqual(add.facts, [["บทบาท", "ผู้จัดการร้าน"]], "ข้อมูลที่ใช้ (test data) is not in the manual");
    assert.equal(add.steps[0].text, "กดเมนู สินค้า", "บนจอ when there is no คู่มือ");
    assert.match(add.steps[1].text, /^กดปุ่ม \*\*บันทึก\*\*/, "คู่มือ wins");
    assert.equal(add.steps[1].note, "ราคาต้องมากกว่า 0");
    assert.deepEqual(scan.steps[0].figures.map((f) => f.caption), ["เปิดกล้อง (iPhone)", "เปิดกล้อง (Android)"]);
    const md = toMarkdown(m);
    assert.ok(!md.includes("localhost"), "no test stack URL");
    assert.ok(!md.includes("ค่ะ"), "no narration");
    assert.ok(!md.includes("A-001"), "no test data");
    assert.match(md, /!\[บันทึก\]\(\.\.\/01-add\/screen\/02-saved\.jpg\)/);
  } finally { p.cleanup(); }
});

test("the .docx: its parts, the text escaped, each picture embedded at its size, Thai fonts and language", () => {
  const p = project();
  try {
    const parts = unzip(toDocx(buildModel(load(p.clips), p.clips)));
    for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/settings.xml",
      "word/_rels/document.xml.rels", "word/header1.xml", "word/footer1.xml", "docProps/core.xml"]) assert.ok(parts[name], name);
    const doc = parts["word/document.xml"].toString("utf8");
    assert.ok(doc.includes("เพิ่มสินค้า &lt;ใหม่&gt;"), "the title is escaped");
    assert.ok(doc.includes("ระบบจะแสดงสินค้าใหม่ &amp; ราคา"));
    assert.match(doc, /<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">บันทึก<\/w:t>/, "**บันทึก** is bold");
    assert.ok(!doc.includes("**"), "no asterisks left");
    assert.ok(!doc.includes("<ใหม่>"));
    assert.ok(doc.includes(' TOC \\o "1-1"'), "a contents field");
    assert.equal((doc.match(/<w:drawing>/g) ?? []).length, 4, "four pictures there, the missing one left out");
    const media = Object.keys(parts).filter((n) => n.startsWith("word/media/"));
    assert.deepEqual(media.map((n) => path.extname(n)).sort(), [".jpg", ".png", ".png", ".png"]);
    // the 640x360 JPEG at the text width keeps its proportions
    assert.match(doc, /<wp:extent cx="5940000" cy="3341250"\/>/);
    const rels = parts["word/_rels/document.xml.rels"].toString("utf8");
    for (let i = 1; i <= 4; i++) assert.ok(rels.includes(`Id="rIdImg${i}"`) && doc.includes(`r:embed="rIdImg${i}"`));
    const styles = parts["word/styles.xml"].toString("utf8");
    assert.match(styles, /w:cs="Leelawadee UI"/);
    assert.match(styles, /w:bidi="th-TH"/);
    for (const [name, body] of Object.entries(parts)) {
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
      const text = body.toString("utf8");
      const opens = (text.match(/<w:p>/g) ?? []).length, closes = (text.match(/<\/w:p>/g) ?? []).length;
      assert.equal(opens, closes, `${name}: paragraphs closed`);
    }
  } finally { p.cleanup(); }
});

test("makeManual writes the .md and .docx, keeps them out of git, and makes the PDF through the converter given", () => {
  const p = project();
  try {
    const calls = [];
    // the stand-in saves the .docx as Word does, with the machine's user in it
    const asWord = (docx) => fs.writeFileSync(docx, zip(Object.entries(unzip(fs.readFileSync(docx))).map(([n, d]) =>
      [n, n === "docProps/core.xml" ? d.toString("utf8").replace("<dc:language>", "<cp:lastModifiedBy>Somchai Jaidee</cp:lastModifiedBy><dc:language>") : d])));
    const r = makeManual(p.clips, { pdf: true, toPdf: (docx, pdf, work) => { calls.push([docx, work]); asWord(docx); fs.writeFileSync(pdf, "%PDF"); } });
    assert.equal(r.code, 0, r.error);
    const core = unzip(fs.readFileSync(r.docx))["docProps/core.xml"].toString("utf8");
    assert.ok(!core.includes("Somchai") && !core.includes("lastModifiedBy"), "the user Word wrote in is taken out");
    assert.ok(unzip(fs.readFileSync(r.docx))["word/document.xml"].toString("utf8").includes("เพิ่มสินค้า"), "the rest is kept");
    assert.equal(r.chapters, 2);
    assert.equal(r.figures, 4);
    assert.equal(r.pdf, path.join(p.clips, "manual", "manual.pdf"));
    assert.deepEqual(calls, [[path.join(p.clips, "manual", "manual.docx"), path.join(p.clips, "manual", ".work")]]);
    const ignore = fs.readFileSync(path.join(p.clips, ".gitignore"), "utf8");
    for (const line of ["manual/*.docx", "manual/*.pdf", "manual/.work/"]) assert.match(ignore, new RegExp(`^${line.replace(/[.*/]/g, "\\$&")}$`, "m"));

    const failed = makeManual(p.clips, { pdf: true, toPdf: () => { throw new Error("Microsoft Word is not installed"); } });
    assert.deepEqual([failed.code, failed.error, failed.pdf], [2, "Microsoft Word is not installed", null]);
    assert.ok(fs.existsSync(failed.docx) && fs.existsSync(failed.md), "the .md and .docx are still there");
  } finally { p.cleanup(); }
});

test("no plan, or only topics, is refused; the CLI refuses an unknown option", () => {
  const p = project();
  try {
    assert.equal(makeManual(path.join(p.root, "none")).code, 2);
    fs.rmSync(path.join(p.clips, "01-add", "lesson.md"));
    fs.rmSync(path.join(p.clips, "02-scan", "lesson.md"));
    assert.match(makeManual(p.clips).error, /lesson all/);
    const r = spawnSync(process.execPath, [MANUAL, "--pfd", "--clips", p.clips], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /unknown option --pfd/);
  } finally { p.cleanup(); }
});

test("picture sizes from PNG and JPEG headers; the zip of a few entries reads back", () => {
  assert.deepEqual(imageSize(PNG), { w: 1, h: 1 });
  assert.deepEqual(imageSize(JPG), { w: 640, h: 360 });
  assert.equal(imageSize(Buffer.from("not a picture")), null);
  assert.equal(thaiDate(new Date(2027, 0, 5)), "5 มกราคม 2570");
  const back = unzip(zip([["a.xml", "<x>ไทย</x>"], ["m/p.png", PNG]]));
  assert.equal(back["a.xml"].toString("utf8"), "<x>ไทย</x>");
  assert.ok(back["m/p.png"].equals(PNG));
});
