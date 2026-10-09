# Discussion documents

One file per topic, `NN-<slug>.md`, written by `/mflow:discuss`. Each one sets out how Claude understands a topic, or the design it proposes (roles and permissions, menus, data visibility…), so the user (the SA, PM or system owner driving the project) can confirm it before screens or code depend on it.

To have other AI tools (Codex, OpenCode, Gemini, a chat UI) analyze a doc too, run `/mflow:discuss NN consult`, run the commands it prints, then `/mflow:discuss NN`. Every tool's picks and findings are laid out in the doc; the user chooses.

Reply inside the file (an option letter such as `b` after `**เลือก:**`, or a line starting with `> ความเห็น:`) or in chat with `/mflow:discuss NN <feedback>`. When nothing is open, `/mflow:discuss NN approve` merges the agreed items into vision, AGENTS.md, hotspots, decisions and tasks (section 5's checks become the acceptance criteria of a `ทดสอบใช้งาน` task), and freezes the file.

`AGENDA.md` recommends which topics are worth a doc here, why, and when to take them. `/mflow:capture` and `/mflow:screen inventory` add to it, `/mflow:discuss agenda` builds or refreshes it, and its status column updates itself from the docs. It is advice: take any topic, in any order, or skip one with `ข้าม: <reason>` in its status.

The user's answers and approval are the customer's: nothing here waits for the customer to confirm again. Build first, test it in use, then refine; a correction found in testing becomes a new doc or an OpenSpec change.
