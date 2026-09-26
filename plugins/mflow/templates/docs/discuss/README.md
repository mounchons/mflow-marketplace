# Discussion documents

One file per topic, `NN-<slug>.md`, written by `/mflow:discuss`. Each one sets out how Claude understands a topic, or the design it proposes (roles and permissions, menus, data visibility…), so พี่ปู can confirm it before screens or code depend on it.

To have other AI tools (Codex, OpenCode, Gemini, a chat UI) analyze a doc too, run `/mflow:discuss NN consult`, run the commands it prints, then `/mflow:discuss NN`. Every tool's picks and findings are laid out in the doc; พี่ปู chooses.

Reply inside the file (an option letter such as `b` after `**พี่ปูเลือก:**`, or a line starting with `> พี่ปู:`) or in chat with `/mflow:discuss NN <feedback>`. When nothing is open, `/mflow:discuss NN approve` merges the agreed items into vision, AGENTS.md, hotspots, decisions and tasks, and freezes the file.

Approval here is พี่ปู's, not the customer's. Questions for the customer move to Open questions or hotspot tickets when the doc is approved.
