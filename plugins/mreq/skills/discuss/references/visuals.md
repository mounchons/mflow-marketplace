# Visuals for discussion docs

The user confirms a design fastest by looking at it. A discussion doc explains with pictures as well as sentences. Section 3 opens with at least one picture. A decision whose options look or flow differently gets one small picture per option, all of the same type.

**The text is authoritative.** A picture illustrates the tagged statements and tables and never holds a fact the text lacks. The approve merge works from the text, and so does any tool that reads the doc later. A revision that changes a fact updates every picture of it in the same revision.

Fenced blocks (mermaid, wireframes, folder trees) do not count toward the ~200-line cap, so pictures are never cut to save lines.

## Which picture for which question

| Question the reader has | Picture | Form |
|---|---|---|
| Which apps exist, who uses each, what they talk to | system map | `flowchart LR`, parts left for later dashed and marked (later) |
| How the code is laid out | folder tree | a `text` fence |
| Which project may reference which | dependency graph | `flowchart TB`, with the forbidden direction noted under it |
| What happens, in what order, who does it | flow, one lane per role | `flowchart LR` with a `subgraph` per role |
| Who talks to whom, and what happens when it fails (a login, an SSO redirect) | interaction | `sequenceDiagram` with `alt` / `opt` |
| Which states a record goes through | lifecycle | `stateDiagram-v2` |
| What the data looks like | tables and relations | `erDiagram` |
| Who sits above whom, which unit sees what | hierarchy | `flowchart TB` |
| What the screen shows for each role | wireframe | a real screenshot once one exists, else ASCII in a `text` fence |
| When things happen (peak periods, cut-off, go-live) | timeline | `gantt`; `timeline` optional |

Default to flowchart, sequenceDiagram, stateDiagram-v2 and erDiagram. `mindmap`, `timeline` and `journey` are newer and some previews do not render them. Use them only when a flowchart would read worse.

## Showing where a picture comes from

A picture carries the same origin as the text, marked in a way that works in every diagram type:
- **In the label:** a node, participant, state or attribute that is inferred or proposed says so in its text, for example `BM["หัวหน้าเขต (อนุมาน)"]` or `"Redis cache (เสนอ)"`.
- **Legend line under every picture**, in Thai: the question the picture answers, and which parts are inferred or proposed. For example: `ภาพนี้ตอบ: ระบบมีแอปอะไรบ้าง และคุยกับอะไร | (อนุมาน) = Claude ตีความเอง ยังไม่มีในเอกสารลูกค้า`
- **Dashes as an extra, flowcharts only:** `-.->` for an inferred edge, and a class for inferred nodes:

~~~text
classDef guess stroke-dasharray: 5 5
class BM,RM guess
~~~

## Mermaid rules that avoid broken diagrams

- Quote every label that has Thai, spaces or punctuation: `A["หัวหน้าสาขา (บางนา)"]`. Parentheses, brackets, braces, `;` and `#` inside an unquoted label break the parser, and `discuss.mjs check` warns about them in flowcharts. Quoting avoids every such case.
- Node ids are ASCII (`Api`, `WebBackend`); only labels are Thai. Use `<br/>` for a line break inside a label.
- About 15 nodes at most per picture. Split by question rather than shrinking the picture.
- `erDiagram`: entity and attribute names in ASCII, Thai in the attribute comment: `string JobNo "เลขงาน"`.
- `stateDiagram-v2`: ASCII state ids, with Thai through `state "รอรับงาน" as Waiting`.
- `sequenceDiagram`: `participant BM as หัวหน้าสาขา`.
- Optional check: if `mmdc --version` works (mermaid-cli, which needs a browser, so it is never required), render the doc into a temporary folder outside `mreq/` (for example `.mreq/cache/discuss-<NN>/`) to catch syntax errors before handing it over. Otherwise re-read each block against these rules.

## Folder trees

- A layout is drawn as a `text` fence, one entry per line, two spaces per level, folders ending in `/`.
- A short comment after an entry says what lives there: `SchoolHr.Web.Backend/      ← หลังบ้าน (เจ้าหน้าที่ HR)`. Put the arrow and the Thai last on the line, so the columns before it stay aligned.
- An entry that is proposed rather than agreed carries `(เสนอ)` in its comment, and the legend line under the tree says so.

## Screens: screenshots first, wireframes before

- Once a prototype screen exists, link its screenshot from the doc with a relative path. Every screenshot still needs its statements in the text.
- Before a screen exists, draw an ASCII wireframe in a `text` fence. Characters that work: `+--+`, `|`, `[ บันทึก ]` for buttons, `[x]` for checkboxes, `(o)` for radio buttons, `____` for inputs, `▼` for dropdowns.
- Thai vowels and tone marks take no column in a monospace font, so right-hand borders drift. Leave boxes open on the right, or put Thai text last on a line.
- Draw only what the decision needs: which menus, columns, buttons and fields appear. Leave out colours and spacing; the UI kit decides those.
- Access control is clearest as the same screen drawn once per role, with a line saying what disappears.
- Use the same example people and data as the scenarios (คุณสมชาย, สาขาบางนา).

## Examples

A system map with one part left for later:

~~~text
```mermaid
flowchart LR
    Staff["เจ้าหน้าที่ HR"] --> WB["SchoolHr.Web.Backend<br/>หลังบ้าน"]
    Teacher["ครู"] --> WF["SchoolHr.Web.Frontend<br/>หน้าบ้าน"]
    WB --> Api["SchoolHr.Api"]
    WF --> Api
    Api --> Db[("PostgreSQL")]
    Api -.-> Mobile["แอปมือถือ (later)"]
    classDef later stroke-dasharray: 5 5
    class Mobile later
```
ภาพนี้ตอบ: ระบบมีแอปอะไรบ้าง ใครใช้ และคุยกับอะไร | เส้นประ = ทำในรุ่นถัดไป
~~~

The same screen for two roles:

~~~text
```text
หน้ารายการงาน: คุณสมชาย (หัวหน้าสาขาบางนา)
+-------------------------------------------------------------
| ค้นหา ____________  สถานะ ▼   [ ค้นหา ]      [ + สร้างงาน ]
| เลขงาน          | ลูกค้า     | สถานะ   | ยอดขาย   | ต้นทุน
| JOB-2569-00012  | บริษัท ก   | รอรับ   | 12,500   | 9,800
+-------------------------------------------------------------

หน้ารายการงาน: คุณวิภา (พนักงานขาย สาขาบางนา)
+-------------------------------------------------------------
| ค้นหา ____________  สถานะ ▼   [ ค้นหา ]
| เลขงาน          | ลูกค้า     | สถานะ   | ยอดขาย
| JOB-2569-00012  | บริษัท ก   | รอรับ   | 12,500
+-------------------------------------------------------------
```
ต่างกัน: พนักงานขายไม่เห็นคอลัมน์ต้นทุน และไม่มีปุ่มสร้างงาน [ที่มา: tor-v1 §4.2]
~~~
