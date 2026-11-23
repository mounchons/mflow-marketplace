#!/usr/bin/env node
// The user manual of a project's clips, built from the plan itself (clips/plan.md, clips/<id>/lesson.md and the
// pictures in clips/<id>/screen/), so the manual and the clips never tell two stories:
//
//   node manual.mjs [--pdf] [--clips <dir>]    writes clips/manual/manual.md and manual.docx, and with --pdf manual.pdf
//
// The manual: a cover (the plan's title, คู่มือการใช้งาน, the date), the contents, a preface from the plan's fields
// (ระบบ, ผู้ชม, เป้าหมาย, ขอบเขต, ไม่รวม), then one chapter per lesson in the order of the contents: what it teaches,
// its role and what comes before, and per step its words on screen (บนจอ), its pictures and its note (หมายเหตุ).
// Left out: the narration (พูด, written to be spoken), what the recorder does (ทำ: URLs, test values) and the test data
// (ข้อมูลที่ใช้). A topic without lesson.md and a picture not taken yet are left out and listed in the output.
//
// The .docx is written here with the standard library only (WordprocessingML in a zip): Thai text in Leelawadee UI,
// A4, a header with the title, page numbers, a contents field. The PDF is made by Microsoft Word (Windows), which also
// fills in the contents' page numbers and saves them into the .docx. The structure follows the manual style of
// webapp-docs-kit (MIT, github.com/IHanfoxI/webapp-docs-kit); the code is mclip's own.
//
// Exit codes: 0 done, 2 no plan, no lesson with steps, or the PDF could not be made (the .md and .docx are written).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { ensureIgnored, load, platformOf, KINDS } from "./clips.mjs";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const thaiDate = (d) => `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
const PREFACE_KEYS = [["ระบบ", "ระบบ"], ["ผู้ชม", "ผู้ใช้คู่มือนี้"], ["เป้าหมาย", "อ่านจบแล้วทำอะไรได้"], ["ขอบเขต", "เนื้อหาที่ครอบคลุม"], ["ไม่รวม", "ไม่ครอบคลุม"]];
const LESSON_KEYS = ["บทบาท", "ก่อนเริ่ม"];

// ---- the model -------------------------------------------------------------------------------------------------------

/** The manual from the loaded plan: { title, date, preface, chapters, skipped, missing }. Pictures are absolute paths. */
export function buildModel({ plan, lessons }, clipsDir, now = new Date()) {
  const fields = Object.fromEntries((plan?.fields ?? []).map((f) => [f.key, f.value]));
  const model = {
    title: plan?.title ?? "", subtitle: "คู่มือการใช้งาน", date: thaiDate(now),
    preface: PREFACE_KEYS.filter(([k]) => fields[k]).map(([k, label]) => [label, fields[k]]),
    chapters: [], skipped: [], missing: [],
  };
  for (const l of lessons) {
    if (l.status === "topic" || !l.steps.length) { model.skipped.push(l.id); continue; }
    const lf = Object.fromEntries(l.fields.map((f) => [f.key, f.value]));
    const steps = l.steps.map((s) => {
      const figures = [];
      for (const img of s.images) {
        const file = path.join(clipsDir, l.id, img);
        if (!s.present?.[img]) { model.missing.push(`clips/${l.id}/${img}`); continue; }
        const plat = platformOf(img);
        figures.push({ file, rel: `../${l.id}/${img}`, caption: plat ? `${s.title} (${KINDS[plat]})` : s.title });
      }
      return { n: s.n, title: s.title, text: s.manual || s.caption, note: s.note, figures };
    });
    model.chapters.push({
      id: l.id, title: l.title, apps: l.apps.map((a) => a.name), teaches: l.teaches,
      facts: LESSON_KEYS.filter((k) => lf[k]).map((k) => [k, lf[k]]), steps,
    });
  }
  return model;
}

// ---- Markdown --------------------------------------------------------------------------------------------------------

export function toMarkdown(m) {
  const out = [`# ${m.title}`, "", `${m.subtitle} · ${m.date}`, ""];
  if (m.preface.length) {
    out.push("## เกี่ยวกับคู่มือนี้", "");
    for (const [k, v] of m.preface) out.push(`- **${k}:** ${v}`);
    out.push("");
  }
  m.chapters.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.title}`, "");
    if (c.apps.length) out.push(`แอป: ${c.apps.join(", ")}`, "");
    if (c.teaches) out.push(c.teaches, "");
    if (c.facts.length) { out.push("| | |", "|---|---|"); for (const [k, v] of c.facts) out.push(`| ${k} | ${v.replace(/\|/g, "\\|")} |`); out.push(""); }
    for (const s of c.steps) {
      out.push(`### ขั้นที่ ${s.n}: ${s.title}`, "", s.text, "");
      for (const f of s.figures) out.push(`![${f.caption}](${f.rel.split("/").map(encodeURIComponent).join("/")})`, "");
      if (s.note) out.push(`> **หมายเหตุ:** ${s.note}`, "");
    }
  });
  return out.join("\n");
}

// ---- docx ------------------------------------------------------------------------------------------------------------

const xml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const FONT = "Leelawadee UI";
const EMU_CM = 360000;
const TEXT_CM = 16.5; // A4 21 cm less 2.25 cm margins
const MAX_FIG_H_CM = 11;

/** Width and height of a JPEG or PNG, or null. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

const run = (text, { bold = false, size = null, color = null } = {}) =>
  `<w:r><w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
/** `**button**` in a lesson's words becomes bold; the rest stays plain text. */
const rich = (text) => String(text ?? "").split("**").map((part, i) => (part ? run(part, { bold: i % 2 === 1 }) : "")).join("");
const para = (inner, style = null, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;
const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

function table(rows, widths) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const cell = (text, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? `<w:shd w:val="clear" w:color="auto" w:fill="EEF2FB"/>` : ""}</w:tcPr>${para(run(text, { bold: head }), "TableText")}</w:tc>`;
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>`
    + rows.map(([k, v]) => `<w:tr>${cell(k, widths[0], true)}${cell(v, widths[1], false)}</w:tr>`).join("") + `</w:tbl>${para("", "Gap")}`;
}

function drawing(rid, id, wCm, hCm, name) {
  const cx = Math.round(wCm * EMU_CM), cy = Math.round(hCm * EMU_CM);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(name)}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** The manual as a .docx (a Buffer). Pictures are read from model figures' files. */
export function toDocx(m) {
  const media = [];
  const body = [];
  // cover
  body.push(para("", "Gap", `<w:spacing w:before="3000"/>`));
  body.push(para(run(m.title), "Title"));
  body.push(para(run(m.subtitle), "Subtitle"));
  body.push(para(run(m.date), "CoverDate"));
  body.push(pageBreak);
  // contents: Word fills it in (the PDF step does; opening the .docx asks to update it)
  body.push(para(run("สารบัญ"), "TOCHeading"));
  body.push(`<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("สารบัญจะแสดงเมื่อเปิดใน Word แล้วเลือกอัปเดตฟิลด์ (F9)", { color: "64748B" })}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
  // each heading 1 starts a new page
  if (m.preface.length) {
    body.push(para(run("เกี่ยวกับคู่มือนี้"), "Heading1"));
    body.push(table(m.preface, [2600, 6750]));
  }
  let fig = 0;
  m.chapters.forEach((c, i) => {
    body.push(para(run(`${i + 1}. ${c.title}`), "Heading1"));
    if (c.apps.length) body.push(para(run(`แอป: ${c.apps.join(", ")}`, { color: "475569" })));
    if (c.teaches) body.push(para(run(c.teaches)));
    if (c.facts.length) body.push(table(c.facts, [2600, 6750]));
    for (const s of c.steps) {
      body.push(para(run(`ขั้นที่ ${s.n}: ${s.title}`), "Heading2"));
      // the step's words stay on the page of its first picture
      body.push(para(rich(s.text), null, s.figures.length ? "<w:keepNext/>" : ""));
      for (const f of s.figures) {
        const buf = fs.readFileSync(f.file);
        const size = imageSize(buf) ?? { w: 1920, h: 1080 };
        let wCm = TEXT_CM, hCm = (TEXT_CM * size.h) / size.w;
        if (hCm > MAX_FIG_H_CM) { wCm = (wCm * MAX_FIG_H_CM) / hCm; hCm = MAX_FIG_H_CM; }
        const ext = /\.png$/i.test(f.file) ? "png" : "jpeg";
        media.push({ name: `image${media.length + 1}.${ext === "png" ? "png" : "jpg"}`, buf });
        const rid = `rIdImg${media.length}`;
        fig++;
        body.push(para(drawing(rid, fig, wCm, hCm, path.basename(f.file)), "Figure"));
        body.push(para(run(`รูปที่ ${fig} ${f.caption}`), "Caption"));
      }
      if (s.note) body.push(para(run("หมายเหตุ: ", { bold: true }) + rich(s.note), "Note"));
    }
  });
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1276" w:bottom="1300" w:left="1276" w:header="600" w:footer="600" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${para(run(`${m.title} — ${m.subtitle}`, { color: "64748B", size: 18 }), "Header")}</w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>${run("หน้า ", { color: "64748B", size: 18 })}<w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`
    + `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`
    + `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`
    + media.map((x, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${x.name}"/>`).join("")
    + `</Relationships>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(`${m.title} — ${m.subtitle}`)}</dc:title><dc:language>th-TH</dc:language></cp:coreProperties>`],
    ["word/_rels/document.xml.rels", rels],
    ["word/document.xml", document],
    ["word/styles.xml", STYLES],
    ["word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="en-US" w:bidi="th-TH"/></w:settings>`],
    ["word/header1.xml", header],
    ["word/footer1.xml", footer],
    ...media.map((x) => [`word/media/${x.name}`, x.buf]),
  ];
  return zip(files);
}

const rPr = (size, extra = "") => `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/>${extra}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="th-TH" w:bidi="th-TH"/></w:rPr>`;
// pPr children in the schema's order (Word refuses a file whose order is wrong)
const style = (id, name, { size = 22, bold = false, color = null, before = 0, after = 120, basedOn = "Normal", next = null, outline = null, keep = false,
  breakBefore = false, border = "", shade = "", tabs = "", ind = "", jc = "" } = {}) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${basedOn && id !== "Normal" ? `<w:basedOn w:val="${basedOn}"/>` : ""}${next ? `<w:next w:val="${next}"/>` : ""}<w:qFormat/>`
  + `<w:pPr>${keep ? "<w:keepNext/>" : ""}${breakBefore ? "<w:pageBreakBefore/>" : ""}${border}${shade}${tabs}<w:spacing w:before="${before}" w:after="${after}" w:line="300" w:lineRule="auto"/>${ind}${jc ? `<w:jc w:val="${jc}"/>` : ""}${outline !== null ? `<w:outlineLvl w:val="${outline}"/>` : ""}</w:pPr>`
  + rPr(size, `${bold ? "<w:b/><w:bCs/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}`) + `</w:style>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  + `<w:docDefaults><w:rPrDefault>${rPr(22)}</w:rPrDefault></w:docDefaults>`
  + style("Normal", "Normal", { size: 22, basedOn: null })
  + style("Title", "Title", { size: 56, bold: true, color: "173F8F", after: 240 })
  + style("Subtitle", "Subtitle", { size: 32, color: "F97316", after: 480 })
  + style("CoverDate", "Cover date", { size: 24, color: "475569" })
  + style("TOCHeading", "TOC Heading", { size: 32, bold: true, color: "173F8F", after: 240 })
  + style("Heading1", "heading 1", { size: 34, bold: true, color: "173F8F", before: 0, after: 200, next: "Normal", outline: 0, keep: true, breakBefore: true,
    border: `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="F97316"/></w:pBdr>` })
  + style("Heading2", "heading 2", { size: 26, bold: true, color: "0F172A", before: 280, after: 100, next: "Normal", outline: 1, keep: true })
  + style("Figure", "Figure", { after: 60, keep: true, jc: "center" })
  + style("Caption", "caption", { size: 18, color: "475569", after: 200, jc: "center" })
  + style("Note", "Note", { size: 20, after: 160, border: `<w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="F97316"/></w:pBdr>`,
    shade: `<w:shd w:val="clear" w:color="auto" w:fill="FFF7ED"/>`, ind: `<w:ind w:left="200" w:right="200"/>` })
  + style("TableText", "Table text", { size: 20, after: 40 })
  + style("Gap", "Gap", { size: 8, after: 0 })
  + style("Header", "header", { size: 18, after: 0 })
  + style("Footer", "footer", { size: 18, after: 0 })
  + style("TOC1", "toc 1", { size: 22, after: 80, tabs: `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs>` })
  + `</w:styles>`;

// ---- zip (stored and deflated entries, enough for a .docx) -----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const store = /\.(jpe?g|png)$/i.test(name); // pictures are compressed already
    const packed = store ? data : zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, packed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(store ? 0 : 8, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cdir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdir, end]);
}

/** A zip's entries, in order: [[name, Buffer]] (stored or deflated entries, as Word writes them). */
export function unzip(buf) {
  let end = buf.length - 22;
  while (end > 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end <= 0) throw new Error("not a zip file");
  const out = [];
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.push([name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)]);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

/** Word writes the machine's user into "last modified by" when it saves: the manual goes to customers, so it goes. */
export function scrubAuthor(docxFile) {
  const entries = unzip(fs.readFileSync(docxFile));
  let changed = false;
  const clean = entries.map(([name, data]) => {
    if (name !== "docProps/core.xml") return [name, data];
    const text = data.toString("utf8");
    const next = text.replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>|<cp:lastModifiedBy\/>|<dc:creator>[\s\S]*?<\/dc:creator>/g, "");
    changed = next !== text;
    return [name, Buffer.from(next, "utf8")];
  });
  if (changed) fs.writeFileSync(docxFile, zip(clean));
  return changed;
}

// ---- PDF -------------------------------------------------------------------------------------------------------------

/**
 * Microsoft Word (Windows, through COM): opens the .docx, fills in the contents and the page numbers, saves them into
 * the .docx and saves the PDF beside it. Word is always closed, even on failure. Throws when Word is not there.
 */
export function wordPdf(docx, pdf, workDir) {
  if (process.platform !== "win32") throw new Error("the PDF needs Microsoft Word on Windows: open the .docx in Word or LibreOffice and save it as PDF");
  const ps = `param([string]$Docx, [string]$Pdf)
$ErrorActionPreference = 'Stop'
try { $word = New-Object -ComObject Word.Application } catch { [Console]::Error.WriteLine('Microsoft Word is not installed'); exit 3 }
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx, $false, $false)
  foreach ($t in $doc.TablesOfContents) { $t.Update() }
  $doc.Fields.Update() | Out-Null
  foreach ($t in $doc.TablesOfContents) { $t.Update() }
  $doc.Save()
  $doc.SaveAs2([ref]$Pdf, [ref]17)
  $doc.Close([ref]0)
} finally {
  try { $word.Quit([ref]0) } catch { }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
`;
  fs.mkdirSync(workDir, { recursive: true });
  const script = path.join(workDir, "to-pdf.ps1");
  fs.writeFileSync(script, "﻿" + ps);
  try {
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Docx", docx, "-Pdf", pdf],
      { encoding: "utf8", timeout: 180000, windowsHide: true });
    if (r.status !== 0) throw new Error(r.status === 3 ? "Microsoft Word is not installed: open manual.docx in LibreOffice and export it as PDF" : `Word could not make the PDF (${r.status ?? r.error?.message}): ${(r.stderr ?? "").trim().split("\n").at(-1)}`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ---- the whole run ---------------------------------------------------------------------------------------------------

export function makeManual(clipsDir, { pdf = false, toPdf = wordPdf, now = new Date() } = {}) {
  const data = load(clipsDir);
  if (!data.plan) return { code: 2, error: data.problems[0] };
  const model = buildModel(data, clipsDir, now);
  if (!model.chapters.length) return { code: 2, error: "no lesson has steps yet: /mclip:plan lesson all writes them" };
  const out = path.join(clipsDir, "manual");
  fs.mkdirSync(out, { recursive: true });
  const md = path.join(out, "manual.md"), docx = path.join(out, "manual.docx");
  fs.writeFileSync(md, toMarkdown(model));
  fs.writeFileSync(docx, toDocx(model));
  ensureIgnored(clipsDir);
  const result = {
    code: 0, md, docx, pdf: null, chapters: model.chapters.length, figures: model.chapters.reduce((n, c) => n + c.steps.reduce((k, s) => k + s.figures.length, 0), 0),
    skipped: model.skipped, missing: model.missing, problems: data.problems,
  };
  if (pdf) {
    const file = path.join(out, "manual.pdf");
    try {
      fs.rmSync(file, { force: true });
      toPdf(docx, file, path.join(out, ".work"));
      if (!fs.existsSync(file)) throw new Error("no PDF was written");
      scrubAuthor(docx);
      result.pdf = file;
    } catch (e) {
      return { ...result, code: 2, error: e.message };
    }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bad = args.find((a, i) => a.startsWith("--") && !["--pdf", "--clips"].includes(a) && args[i - 1] !== "--clips");
  if (bad) { console.log(JSON.stringify({ error: `unknown option ${bad}` })); process.exit(2); }
  const i = args.indexOf("--clips");
  const clips = path.resolve(i >= 0 ? args[i + 1] : path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "clips"));
  const r = makeManual(clips, { pdf: args.includes("--pdf") });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.code);
}
