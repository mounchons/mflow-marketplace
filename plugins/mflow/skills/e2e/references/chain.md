# A chain of steps across systems, webs and people

Some flows do not start on a screen. Data arrives from another system, a job turns it into records, a role
on the admin web sets things up, edits the content and approves it, the system sends mail, and an outside
party on another web opens it and answers. For example:

1. A notice arrives from an external system (an API, a document store, an RPA drop), and an import job
   stores it.
2. On the admin web, a role sets how notices of that kind behave (a setting), edits the content, and
   approves it; the system sends the mail.
3. On the supplier web, supplier A opens the link in the mail, reads the notice and acknowledges it.
4. Back on the admin web, the notice shows the acknowledgement; supplier B never sees any of it.

This file says how to prove such a chain in the browser. `/mflow:e2e flow` lists the steps first (its §1);
"A flow across screens, people and webs" in the skill holds the rules each step follows.

## Before writing: how the test drives each step

List every step with who acts and how the test makes it happen:

| Step | Who acts | How the test makes it happen | How the test sees it happened |
|---|---|---|---|
| 1 | the external system | puts the input into the project's fake of that system (its test endpoint or fixture folder), as the real one would deliver it | the record exists, through the API |
| 1 | the import job | the project's trigger (an endpoint or the admin page that runs it), never a wait for its schedule | the job's run is newer than before the test and no longer running |
| 2 | the admin | the screens, signed in on the admin web | the page state, and the API when the page only hides something |
| 2 | the mail | the system sends it on approval | the project's fake mailer, outbox or mailbox page |
| 3 | supplier A | the screens, signed in on the supplier web, from the link in the mail | the page state |
| 4 | the admin, supplier B | the screens of each | the acknowledgement shown; nothing of A's shown to B, by list or by direct link |

A step whose "how" the project has no seam for (no fake of the external system, no trigger for the job, no
fake mailer) is reported, with the seam to add as an `/opsx:propose` change. The test never calls the real
external system, never waits for a schedule, and never reads real mail.

A chain needs the real API, its jobs and its mail queue: it runs in the Playwright project that runs on
the real stack (with `/mflow:night --stack` when nobody is there to start it). A project that mocks the API
proves each page alone; see "Where each part of a setting is proven" in the skill.

## The main path: one test, a `test.step` per step

The path from the first step to the end walks every step through the screens, in one test. Each business
step is a `test.step` named with its step number, so a failure says which step broke. The timeout is set
for the whole chain, since the jobs and the mail take time.

A sketch; the helpers stand for the project's own (find them first, in its E2E helpers folder):

```ts
import { expect, test } from "@playwright/test";
// The project's helpers: sign-in per web, API calls with the session and CSRF token, the fake of the
// external system, the job trigger, the mail reader, the cleanup the rules allow.
import { ADMIN_URL, SUPPLIER_URL, signIn, placeInFake, runJob, mailsTo, cleanUp } from "../helpers";

const RUN = Date.now().toString(36);

test("F3 a notice from the external system: imported, approved, mailed, acknowledged", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await (await browser.newContext({ baseURL: ADMIN_URL })).newPage();
  const supplierA = await (await browser.newContext({ baseURL: SUPPLIER_URL })).newPage();
  const supplierB = await (await browser.newContext({ baseURL: SUPPLIER_URL })).newPage();
  const title = `Notice ${RUN}`;
  const deadline = "30/11/2026";
  let link = "";
  try {
    await test.step("1 the notice arrives from the external system and is imported", async () => {
      await placeInFake(admin.request, { title, supplier: "A" });
      await runJob(admin, "import-notices", async () => (await admin.request.get(`/api/v1/notices?search=${encodeURIComponent(title)}`)).ok());
    });

    await test.step("2 the admin sets the deadline, edits the content and approves", async () => {
      await signIn(admin, "admin");
      await admin.goto(`/notices?search=${encodeURIComponent(title)}`);
      await admin.getByRole("link", { name: title }).click();
      await admin.getByLabel("Deadline").fill(deadline);
      await admin.getByLabel("Content").fill(`Please confirm by ${deadline}.`);
      await admin.getByRole("button", { name: "Approve" }).click();
      await admin.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
      await expect(admin.getByTestId("status")).toHaveText("Approved");
    });

    await test.step("3 the mail reaches supplier A only, with what the admin set", async () => {
      // The mail line sends in the background: wait until it has, then read what it sent.
      await expect.poll(async () => (await mailsTo(admin.request, "a@supplier.example", title)).length, { timeout: 60_000 }).toBe(1);
      const [mail] = await mailsTo(admin.request, "a@supplier.example", title);
      expect(mail.body).toContain(deadline);
      link = mail.link;
      expect(new URL(link).origin).toBe(new URL(SUPPLIER_URL).origin);
      expect(await mailsTo(admin.request, "b@supplier.example", title)).toHaveLength(0);
    });

    await test.step("4 supplier A opens the link, reads the notice and acknowledges", async () => {
      await signIn(supplierA, "supplier-a");
      await supplierA.goto(link);
      await expect(supplierA.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(supplierA.getByTestId("deadline")).toHaveText(deadline);
      await supplierA.getByRole("button", { name: "Acknowledge" }).click();
      await expect(supplierA.getByTestId("acknowledged")).toBeVisible();
    });

    await test.step("5 the admin sees the acknowledgement; supplier B sees nothing", async () => {
      await admin.reload();
      await expect(admin.getByTestId("acknowledgements")).toContainText("Supplier A");
      await signIn(supplierB, "supplier-b");
      await supplierB.goto(new URL(link).pathname + new URL(link).search);
      await expect(supplierB.getByTestId("not-found")).toBeVisible();
    });
  } finally {
    await cleanUp(admin.request, { title });
  }
});
```

What the sketch keeps:
- **Values set are values seen:** the deadline and the content the admin typed are in the test's own
  variables and asserted on the mail and on the supplier's page.
- **Mail is a step:** who got it (A, and not B), its subject and the values in it, and that its link opens
  on the supplier web.
- **Waiting is for a state:** the job is polled for a newer finished run (`expect.poll` with intervals and a
  message that prints the last state), the pages by `expect`; never `waitForTimeout`.
- **Data of this run only:** the title carries the run stamp; `finally` cleans up the way the rules allow
  (delete, or withdraw then reject when an approved record may not be deleted).
- **A setting the step changes for everyone** (a mail switch, a notice type) changes it in a project of
  tests that write, run after the read-only ones, and is put back in `finally`.

## The other paths: arrange up to the branch, walk the branch

Each path the specs name (the admin rejects, the admin withdraws after approval, a new revision arrives
from the external system, the supplier misses the deadline) gets its own test. Walking every earlier step
through the screens again would make each test as long as the main path and fail for reasons that are not
its own. So a branch test arranges the steps before its branch point through the API helpers (the same
calls the screens make, with the session and CSRF token), then walks the branch and what follows it in the
screens, with the same `test.step` names and checks. The main path test is the one that proves the early
steps in the browser.

## The project's helpers first

Before writing a helper, look for the project's: sign-in per web (a saved state, or sign-in through the
API), API calls that send what the web sends, the fake of each external system and its test endpoints, the
job trigger and its status, the mail reader, the test clock, the cleanup. Use them as they are; a second
helper that does the same thing drifts from the first. A helper that is missing is written once, next to
the others, in the project's style.
