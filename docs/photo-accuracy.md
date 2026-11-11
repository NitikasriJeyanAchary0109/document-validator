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

## Known weak spots (next work)

- **Blur** still loses about a quarter of fields and **heavy noise** a third (see the second round above). A different or larger OCR model is the lever; test it against this table.
- **Passport** is the weakest layout (52%), mostly small text lost at low resolution. The machine-readable lines at the bottom are not used yet, and would be a strong cross-check.
- **Aadhaar front** misses the name and date when OCR joins lines or drops them.
- **Tilt beyond 15 degrees, sideways cards and perspective distortion** are not corrected. Tilts of 4 to 8 degrees now read at about 93%, with no silent errors on the held-out set.
- **Hindi and other scripts** are ignored (English data only).
- Add **real-photo checks** done privately by the owner of the documents, never committed: run the app on a few of your own cards and compare by eye.
