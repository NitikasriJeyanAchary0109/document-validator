# Photo reading accuracy

How well "Read from a photo" does, measured on **invented** cards. Run it yourself: `npm run dev`, open `http://localhost:5173/eval.html?run=1&people=6`, and keep that browser tab in front (a hidden tab runs about three times slower and the read-time figures are then wrong). Add `&conditions=clean,blur` to run a subset. The page is dev-only and is not in the production build.

## What was measured, and what it does not tell you

- **288 images**: 6 invented people x 6 document layouts (Aadhaar front, Aadhaar back, PAN, driving licence, voter ID, passport) x 8 conditions. 1,008 field values scored.
- **Conditions**: clean, blur, small (520 px wide), rotated 4 to 8 degrees, sheared, heavy noise with JPEG quality 35, low light, glare patch.
- **The pipeline is the app's own**: the same image preparation, the same Tesseract.js engine and the same `extractFields`, run in the browser.
- **Limits, stated plainly**: every card is drawn by `eval/synth.ts` with clean fonts. The layouts imitate the roles of the printed text, not the exact design of real cards, and the degradations are simulated. So this shows how the reader copes with photo quality and with the text patterns we expect. It does **not** show accuracy on real photos of real cards, which have different fonts, holograms, laminate glare, fold marks and layouts that vary by State and year. Treat the numbers as a floor for what to fix and a way to catch regressions, not as a promise.
- No real ID photo or real value is used anywhere. Names, numbers (Aadhaar with a valid checksum) and addresses are generated.

## How to read the table

- **right**: the value matches (names, numbers and dates exactly after normalising case, spacing and date separators; addresses by token overlap of at least 0.8).
- **silent wrong**: wrong and the person is *not* asked to check it. This is the dangerous column.
- **wrong but flagged**: wrong, but marked "check this" (the system doing its job).
- **missed**: nothing returned. The person types it in. Costs time, not correctness.
- **invented**: a value returned for a field that was not on that image.

## Results

| | right | silent wrong | wrong but flagged | missed |
|---|---|---|---|---|
| First run | 72.3% | 3.2% (32 values) | 5.7% | 18.8% |
| After fixes below | **74.0%** | **0.5%** (5 values) | 6.6% | 18.8% |

By condition, after the fixes (right / silent wrong / missed):

| condition | right | silent | missed |
|---|---|---|---|
| clean | 99.2% | 0.0% | 0.8% |
| skew | 94.4% | 0.0% | 0.8% |
| small | 88.1% | 0.0% | 11.9% |
| glare | 86.5% | 0.0% | 7.9% |
| blur | 73.8% | 0.0% | 26.2% |
| noise | 67.5% | 0.8% | 16.7% |
| rotate | 64.3% | 3.2% | 19.0% |
| low light | **18.3%** | 0.0% | **67.5%** |

By document: driving licence 83.7%, voter ID 81.9%, PAN 76.0%, Aadhaar back (address) 89.6%, Aadhaar front 68.1%, passport 52.1% right. Read time per image: p50 0.6 s, p95 1.5 s (tab in front, on the developer's Mac).

Of the right values, 34% are still marked "check this", because the person confirms uncertain reads anyway.

## What the test found and what was changed

Each fix was made because a number moved, and is covered by a unit test in `src/core/extract.test.ts`.

1. **Bilingual labels** ("नाम / Name"): an English-only engine reads the Devanagari half as Latin junk before the slash, so the label was not recognised. PAN names and father's names were missing. Labels are now matched after the slash.
2. **A letter read as a digit in a number**: an `I` at the start of a passport number came out as `1`, and `O`/`I` in a voter ID came out as `0`/`1`. Letter positions are now repaired the same way digit positions already were.
3. **Dashed dates read as numbers**: a date such as `18-08-1997` could become the 8-digit "passport number" `18081997`. Dates are removed before looking for numbers.
4. **Junk after a name** (`ARJUN PATEL CO`, `ASHA SHARMA O`, `... See`): short or mixed-case tails are dropped and the name is marked for checking.
5. **Incomplete passport names**: with the surname missing, the given name alone was returned as if complete. It is now marked for checking.

Together these cut silent errors from 32 to 5 values and lifted clean-image accuracy from 83% to 99%.

## What did not help

- **Local (adaptive) thresholding** to rescue low-light images made Tesseract roughly 6 to 20 times slower per image, so it was removed. Low light stays the weakest case.
- **A stricter "check this" threshold** (confidence 80, 85 or 90 instead of 70) removed only about four more silent errors out of 1,008 but raised the share of right values the person is asked to recheck from 34% to 40, 44 and 49%. Kept at 70 (`tuning.lowConf` in `src/core/extract.ts`). `window.__replay(n)` on the eval page re-scores the same OCR text at another threshold without reading the images again.

## Low light and blur (second round)

**Low light is fixed by a retry; blur is not.** The app now reads a photo normally and, only if that read looks poor (average line confidence under 60), reads it a second time after dividing out the local background brightness ("flat-field"), then keeps the better read. Both reads happen in the browser.

| | normal read | with retry |
|---|---|---|
| People 1 to 4, all 8 conditions (192 images; the threshold was chosen here) | 73.7% right | **81.1%** right |
| ...of which low light | 11.9% | **70.2%** |
| People 5 and 6, blur, low light, noise, rotate only (48 images the threshold was *not* tuned on) | 53.6% | **67.9%** |
| ...of which low light | 19.0% | **76.2%** |

Silent errors stayed at 0.1% (people 1 to 4) and 1.2% (the held-out hard conditions, all in the rotated images, unchanged by the retry). A retried image costs about 3 to 5 seconds more, so the 95th-percentile read time went from about 3.8 s to 8.4 s on the held-out set while the median stayed at 1.7 s. The retry threshold was flat from 55 to 65, so 60 sits in the middle of the plateau (`retry.below` in `src/ocr/read.ts`).

**Why a retry and not always flat-field:** applied to every image, flat-field hurts the cases that were already fine or only noisy (noise 67.9% to 42.9%, blur 73.8% to 65.5%, clean 97.6% to 96.4%), so it only runs when the first read looked poor.

**Blur: three things tried, none helped** (blur-only images, normal read 73.8%):
- sharpening (unsharp mask) alone: 73.8%, no change
- flat-field plus sharpening: 71.4%
- upscaling to 2,400 px instead of 1,600: 71.4%

Simple preparation cannot recover detail that the blur removed. The next lever for blur is a different or larger OCR model, or asking the person for a sharper photo (the app already says to use a flat, well-lit photo).

**Also learned:** an un-denoised flat-field turns sensor noise into specks that made Tesseract 6 to 20 times slower; a light 3x3 blur before it fixed the speed. Low-light numbers on real photos will differ, since the dimming here is a simulated brightness and contrast change.

## Tilted photos (third round)

**Tilt is fixed by turning the photo level before reading.** `estimateTilt` (`src/ocr/deskew.ts`, pure and unit-tested) marks the ink, tries every angle from -15 to +15 degrees and picks the one at which the ink piles up into the sharpest rows, since lines of text are the strongest rows. If that angle is 1.5 degrees or more, the photo is turned by the opposite amount (`turnLevel` in `src/ocr/prepare.ts`) on a white sheet big enough to keep every corner. If no angle stands clearly above the rest (a blank or mostly dark photo), nothing is turned.

| | not turned | turned level |
|---|---|---|
| People 1 to 4, clean, rotate, skew only (72 images) | 87.3% right | **95.2%** |
| ...of which rotate | 69.0% | **94.0%** |
| People 5 and 6, all 8 conditions (96 images, never used while building it) | 72.6% right, 0.6% silent wrong | **77.1%**, 0.0% silent wrong |
| ...of which rotate | 57.1%, 4.8% silent wrong | **92.9%**, 0.0% silent wrong |

Every other condition on the held-out set (clean, blur, small, shear, noise, low light, glare) scored exactly the same with and without turning, so it does no harm there. Read time barely moved (median 0.7 s both ways, 95th percentile 2.0 s to 2.2 s). A check in the real app with an invented tilted Aadhaar card filled the name, date of birth and number correctly.

**Not fixed:** shear (the card seen from an angle, a perspective effect) is a different distortion that turning cannot undo; it already scored about 95%. Cards tilted more than 15 degrees, or turned sideways, are not handled. The eval page now reads each image three ways, `window.__replay({ mode: 'C' })` scores the turned read, and the app turns every photo by default (`level` in `prepareImage`, `readOnce`).

## Blur and a stronger reader (fourth round)

**Short answer: no model swap was made, and blur is still the weakest condition (70 to 74% right).** Blur is not even across cards. On 36 blurred images (people 1 to 6) the passport read **0%** (the engine returned nothing at all) and the Aadhaar front **33%** (the date-of-birth line was dropped, and the name is found from it), while PAN, driving licence, voter ID and the Aadhaar back read 94 to 100%. So most of the blur loss is small text on two layouts, which is not something a better reading model fixes if the detail is simply gone.

What was tried, on blurred invented images:

| Try | Result |
|---|---|
| The current English model is already Tesseract's "best" integer model | nothing to upgrade to inside Tesseract |
| Deconvolution (Richardson-Lucy) at 1, 2, 3 and 4 pixels of assumed blur, first 6 images | 66.7% to 61.9-71.4%: no reliable gain, 2 to 4 times slower. Removed from the code. |
| Page mode "single block" (6) or "sparse text" (11) as the only read | blur 73.8 / 74.6% against 69.0% (36 images); passport 0% to 21-25% |

Sparse text mode wins because it looks for scattered small lines instead of assuming a page of paragraphs. It is added as a **second retry**, so a poor first read now gets two more reads: dim-light correction, and sparse text. The best of the three (by average line confidence) is kept (`readPhoto` in `src/ocr/read.ts`).

| | before (flat retry only) | with the sparse retry |
|---|---|---|
| People 1 to 4, all 8 conditions (192 images) | 85.1% right | **86.8%** |
| ...blur | 70.2% | **73.8%** |
| ...low light | 71.4% | **81.0%** |
| People 5 and 6, all 8 conditions (96 images, not used to choose it) | 83.7% | **84.3%** |
| ...blur / low light | 66.7% / 71.4% | **69.0% / 73.8%** |

Silent errors are 0.0% in both sets. The gain is modest and smaller on the held-out people, so treat it as about one point overall. The cost is in the slow tail: the 95th-percentile read time went from 3.5 s to 5.3 s, the median stayed at 1.7 s. (Rates here are higher than earlier rounds because the photo is also turned level first, from round three.)

**A silent error found by trying it in the app.** A dim invented Aadhaar read through the sparse mode gave the line "DOB: A 5/03/ 1980", and the extractor turned it into 05/03/1980 (true value 15/03/1980) with no "check this" mark, because the line's confidence was 80. Cards print day and month as two digits, so a one-digit day or month now marks the date for checking (`datesIn` in `src/core/extract.ts`, with a test). The scoreboard did not change, but the case shows that the 0.0% silent-error figure is for a small invented set.

**Not tried: a different engine** (PaddleOCR's detection and recognition models run with ONNX Runtime in the browser). It detects text regions itself, which is exactly where Tesseract fails on the passport, so it is the one remaining option with a real chance on blur. It needs about 15 to 20 MB of model files downloaded from a public model host, plus a new runtime and CSP changes, so it was not done without the owner's go-ahead.

## A second reader: PaddleOCR (fifth round)

**This is the biggest single gain so far.** Blur was the weakest condition, and Tesseract's problem there was finding the text (on blurred passports it returned nothing). PaddleOCR (PP-OCRv4) has a separate neural text detector, and read the same blurred images far better. The app now runs it with ONNX Runtime in the browser as the main reader, and keeps Tesseract as a cross-check.

| 288 invented photos, 8 conditions | right | wrong, silent | wrong, flagged | missed | median read |
|---|---|---|---|---|---|
| Tesseract, one read (the earlier first read) | 76.8% | 0.1% | 5.6% | 17.6% | 1.7 s |
| PaddleOCR alone | 93.8% | 0.4% | 2.4% | 3.5% | 2.0 s |
| **Both: PaddleOCR shown, disagreements flagged** | **94.6%** | **0.1%** | 2.7% | 2.6% | 3.8 s |

By set: people 1 to 4 (the word-spacing rule below was tuned on people 1 and 2): Tesseract 76.6%, PaddleOCR 94.3%, both 94.6%. **Held-out people 5 and 6: Tesseract 77.1%, PaddleOCR 92.6% with 1.2% silent errors, both 94.6% with 0.0% silent errors.** (Tesseract with its retries from the earlier rounds was 86.8% and 84.3% on the two sets.)

| Condition (people 1 to 4) | Tesseract, one read | both readers |
|---|---|---|
| blur | 73.8% | **95.2%** |
| low light | 11.9% | **86.9%** |
| noise | 67.9% | **92.9%** |
| passport layout | 53.1% | **78.1%** |
| clean | 97.6% | 100.0% |

**How it works** (`src/ocr/paddle.ts`, `src/core/combine.ts`, `readFields` in `src/ocr/read.ts`):
- The detector gives a probability map of text; connected blobs become boxes, grown by the standard DB factor of 1.5. Each box is cropped, scaled to 48 pixels high and read by the recognition model with a CTC decoder. Boxes on the same line are joined.
- **Spaces had to be rebuilt.** The model leaves most spaces out ("VIKRAMKHAN"), and counting blank steps in its output could not tell a word gap from a letter gap. Instead, a run of 12 or more ink-free columns in the 48-pixel crop between two recognised characters becomes a space (17 next to narrow glyphs such as 1, I and punctuation, which carry blank space on their sides). Four silent errors remained in the held-out set, three of them name spacing and one a date digit.
- **Cross-checking removes most of them.** A field both readers agree on is shown, and its "check this" mark is dropped unless both readers were unsure. A field they disagree on is shown from PaddleOCR and marked. If only the spacing of a name differs, Tesseract's spacing is used. That is what took the held-out silent errors from 1.2% to 0.0%, at the price of more fields marked for checking (18% of right values, against 15% for PaddleOCR alone).
- If PaddleOCR cannot start on a device (no WebAssembly, no memory), the app falls back to Tesseract alone with its retries.

**What it costs.** About 41 MB of files in `public/ocr` (PaddleOCR models 15.6 MB, ONNX Runtime 14.8 MB, Tesseract 11 MB), downloaded from this site the first time someone reads a photo, not with the page; the main script is unchanged. The first read also loads the models, so it takes longer than the later ones (about 8 s in a test). The median read with both readers is 3.8 s and the 95th percentile 5 to 6 s. Dropping the Tesseract cross-check saves about 1.8 s and 11 MB, at the cost of the silent-error protection above.

**Caveats.** All cards are invented, drawn with clean fonts: PaddleOCR may do better on those than on real printed cards, and real-photo accuracy is still unknown. The models are PP-OCRv4 multilingual (Chinese and English); Hindi text is read as the nearest letters and is ignored by the extractor. The word-gap thresholds were tuned on a few invented layouts and may need re-tuning on real cards.

## Known weak spots (next work)

- **Passport** is still the weakest layout (78% with both readers); the machine-readable lines at the bottom are not used yet.
- **Real photos**: everything here is invented cards. The 18% of right values still marked for checking is a cost worth lowering once real photos can be tried.
- **Aadhaar front** misses the name and date when OCR joins lines or drops them.
- **Tilt beyond 15 degrees, sideways cards and perspective distortion** are not corrected. Tilts of 4 to 8 degrees now read at about 93%, with no silent errors on the held-out set.
- **Hindi and other scripts** are ignored (English data only).
- Add **real-photo checks** done privately by the owner of the documents, never committed: run the app on a few of your own cards and compare by eye.
