# Ready for the counter

A one-stop **pre-appointment document checker** for RTO and passport visits. You say what you are going in for, enter what your documents say, and it tells you what is missing or likely to cause trouble *before* you spend a morning in a queue.

Runs entirely in the browser. There is no server: nothing you type is uploaded, stored or logged, and the production build ships a Content-Security-Policy that blocks all network requests.

## Run it

Node 20.19+ is needed (on this Mac: `export PATH=/Users/nitikasri/development/node/bin:$PATH`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests; run before every commit
npm run build      # production build in dist/
```

## What it checks today

| Service | Rules status |
|---|---|
| Learner's licence | documents, Form 1/1A, photos, guardian consent and ages checked against Form 2 and the Motor Vehicles Act on 10 Nov 2026; state additions not covered |
| Driving licence (after a learner's licence) | six-month validity checked; the 30-day wait is unverified |
| Driving licence renewal | grace period and five-year limit from the Act; documents from Form 2; how early you may renew is unverified |
| New vehicle registration | unverified (Central Rules and Vahan pages could not be read) |
| Vehicle ownership transfer | document list unverified; time limits (14/45 days seller, 30 days buyer) from the Act |
| Passport: fresh (adult), re-issue, child under 18 | verified 10 Oct 2026 (carried over from the Passport Mitra rule files) |

For every service it checks: required documents (with "any one of" groups and age or answer-dependent variants), age eligibility, number formats (Aadhaar checksum, PAN, passport, driving licence, vehicle registration, voter ID), expiry on the appointment date, timing windows, and consistency across documents (names, date of birth, address, father's name). Output: a verdict (Not ready yet / Almost ready / Looks ready), each issue as *what we found, why it matters, what to do*, and a "bring on the day" list.

Wording rule: "commonly causes problems", never "will be rejected"; no promised outcomes or timelines.

## How it is organised

```
src/core/       pure logic, no UI: engine.ts (the checker), validators.ts, names.ts, dates.ts
src/rules/      DATA: one file per service in services/, shared pieces in common.ts, document catalogue in documents.ts
src/ui/         React components
```

The engine never mentions a specific service. Everything it asks for comes from a `Service` object, so **adding or changing a rule means editing a file in `src/rules/services/`**, not the engine. `src/rules/rules.test.ts` fails if a rules file refers to a document, question or answer that does not exist.

### Add a service

1. Copy a file in `src/rules/services/`, change the requirements, questions, eligibility rules and date windows.
2. Add it to `SERVICES` in `src/rules/index.ts`.
3. Add scenarios to `src/core/engine.test.ts`. `npm run check`.

### Verify a rule (the most valuable thing to do next)

Each requirement and window carries its own `provisional` flag. Policy: a rule may be marked verified only if it cites a deep link on a `.gov.in` or `.nic.in` page that someone actually read (`rules.test.ts` enforces the link). Unverified rules show an "unverified rule" badge and no source link, so nothing looks cited when it is not. On 10 Nov 2026 the licence rules were compared with the official Form 2 annexure, the Sarathi learner licence FAQ and the Motor Vehicles Act text (only a secondary copy on devgan.in was readable, because India Code blocks automated access, so Act-only rules stay unverified). Still unverified: the 30-day wait between licences, how early renewal is allowed, the minimum age for transport classes, all vehicle registration and transfer documents (Central Motor Vehicles Rules and Vahan pages could not be read), and any state variation. To read an official PDF, fetch it with WebFetch and open the saved file with the Read tool; the web-fetch subagent cannot parse PDFs. For each requirement:

1. Open the official page for your state (Sarathi / Vahan / the state transport department) and compare.
2. Fix the rule if it differs; set `provisional` to false on that requirement (or `status: 'verified'` on the service once all are checked) and update `retrieved` and `sourceNote`.
3. Rules are national defaults. If a state differs, that needs a state variant (not built yet).

## Not built yet

- **Reading documents from photos** (on-device OCR with Tesseract.js, then the user confirms each field). The checker already takes the same fields a scan would produce, so OCR only has to fill them in. Notes on accuracy and speed are in `~/google-gdg-devfest-2026/docs/handoff-extraction.md`.
- State-specific rule variants; Hindi and other languages (UI strings are inline in the components for now and should move to message files first).
- More services: driving licence duplicate or address change, RC renewal, PAN, Aadhaar update, voter ID, police clearance.
- Checking the printed values against each other on one document (for example the year inside a driving licence number against its issue date).

## Never

- Persist or upload anything the user types, or log it.
- Put real ID numbers or photos in tests, fixtures or screenshots. Tests build Aadhaar-format numbers with `aadhaarFrom()` in `src/core/testkit.ts`.
- Present an unverified rule as official, or promise an outcome.
