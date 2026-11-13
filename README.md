# Ready for the counter

A one-stop **pre-appointment document checker** for RTO, passport and Aadhaar visits. You say what you are going in for, enter what your documents say, and it tells you what is missing or likely to cause trouble *before* you spend a morning in a queue.

Runs entirely in the browser. There is no server: nothing you type or photograph is uploaded, stored or logged, and the production build ships a Content-Security-Policy that only lets the page talk to its own origin (no CDN, no third-party host).

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
| Driving licence: duplicate, address or name change | documents checked against Form 2; which papers a name change needs is unverified |
| Vehicle ownership transfer | document list unverified; time limits (14/45 days seller, 30 days buyer) from the Act |
| Aadhaar update: name, address or date of birth | verified 11 Nov 2026 against the UIDAI acceptable-documents list (List IV) |
| Passport: fresh (adult), re-issue, child under 18 | verified 10 Oct 2026 (carried over from the Passport Mitra rule files) |

For every service it checks: required documents (with "any one of" groups and age or answer-dependent variants), age eligibility, number formats (Aadhaar checksum, PAN, passport, driving licence, vehicle registration, voter ID), expiry on the appointment date, timing windows, and consistency across documents (names, date of birth, address, father's name). Output: a verdict (Not ready yet / Almost ready / Looks ready), each issue as *what we found, why it matters, what to do*, and a "bring on the day" list.

Wording rule: "commonly causes problems", never "will be rejected"; no promised outcomes or timelines.

## Reading a document from a photo

Each document card has **Read from a photo**. The photo is shrunk, greyed, turned level and contrast-stretched in a canvas (`src/ocr/prepare.ts`), read by two independent readers, and the text is turned into fields by `src/core/extract.ts`: PaddleOCR (text detector plus recogniser, run with ONNX Runtime, `src/ocr/paddle.ts`; it first checks whether the card is sideways or upside down and turns the photo, `src/ocr/orientation.ts`) whose values are shown, and Tesseract.js in a web worker (`src/ocr/read.ts`) as a cross-check. A field the two disagree on is marked "check this", and a field both read the same is not marked merely for being found by position (`src/core/combine.ts`). For passports the two machine-readable lines at the bottom are read as well, and a number or date that passes their check digits replaces the printed one (`src/core/mrz.ts`). The user always sees the filled fields and confirms them; anything guessed by position, failing a format check (for example the Aadhaar checksum) or read with low confidence is marked "check this".

- **Design follows the earlier extraction research** (`~/google-gdg-devfest-2026/docs/handoff-extraction.md`): classic on-device OCR plus rules, validators as a soft confidence signal (a failing checksum flags the field, it does not discard it), front of the document only, and no model that needs a server. NuExtract was not used: it needs a GPU and uploading photos, which this app never does.
- **Everything is served from this site.** `npm run ocr:assets` (run automatically before `dev` and `build`) copies both engines (Tesseract, its WebAssembly core and English data; the PaddleOCR detection, recognition and text-direction models; ONNX Runtime and its WebAssembly file) from `node_modules` into `public/ocr` (about 42 MB, git-ignored, loaded only when someone reads a photo). Caching is off, so nothing persists in the browser. If PaddleOCR cannot run on a device, Tesseract alone reads the photo.
- **Credits.** PaddleOCR PP-OCRv4 models (Apache-2.0, PaddlePaddle), packaged for npm as `@gutenye/ocr-models` (MIT); ONNX Runtime Web (MIT, Microsoft); Tesseract.js (Apache-2.0).
- **Tesseract-only fallback gets retries.** When PaddleOCR is unavailable, a poor first Tesseract read (average confidence under 60) is read again after correcting dim light, and again in sparse-text mode, keeping the best (`readPhoto` in `src/ocr/read.ts`).
- **Tilted photos are turned level first.** The tilt of the text lines is measured and the photo is turned back before reading (`src/ocr/deskew.ts`), which took 4 to 8 degree tilts from 57-69% to 93-94% right.
- **Measured on invented cards only** (`docs/photo-accuracy.md`): about 95% of values right across eight kinds of damage (both readers; passports about 85%), 100% on clean images, 87% on low-light ones, 95% on blurred ones, with 0.1% wrong without a warning. These are simulated photos of invented layouts, so real-photo accuracy is still unknown. Re-run with `npm run dev` and open `/eval.html?run=1&people=6` (keep the tab in front). Real ID photos must never go in the repo (`samples/real/` is git-ignored).
- English text only for now; Hindi lines on cards are ignored.

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

- Better handling of blurred and noisy photos, a measured passport fix (use its machine-readable lines), and Hindi or other-script text.
- State-specific rule variants; Hindi and other languages (UI strings are inline in the components for now and should move to message files first).
- More services: driving licence duplicate or address change, RC renewal, PAN, Aadhaar update, voter ID, police clearance.
- Checking the printed values against each other on one document (for example the year inside a driving licence number against its issue date).

## Never

- Persist or upload anything the user types, or log it.
- Put real ID numbers or photos in tests, fixtures or screenshots. Tests build Aadhaar-format numbers with `aadhaarFrom()` in `src/core/testkit.ts`.
- Present an unverified rule as official, or promise an outcome.
