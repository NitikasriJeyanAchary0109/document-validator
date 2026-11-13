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

## Passport machine-readable lines (sixth round)

The two lines of capitals and "<" at the bottom of a passport (ICAO 9303) carry check digits for the passport number, the birth date and the expiry date, so a value that passes is far more trustworthy than the same value read from the printed text. `src/core/mrz.ts` finds the lines in the OCR text (anchored on the nationality "IND" in line 2), reads the number, dates and names, and checks them; `extractFields` uses it for passports. The check digit routine reproduces the published ICAO specimen values (L898902C3 gives 6, 740812 gives 2, 120415 gives 9), and it is tested.

**The test cards had a fake MRZ, so this round first gave them a real one** (`passportMrz` in `src/core/testkit.ts`, used by `eval/synth.ts`). The passport numbers in the earlier rounds were therefore scored against cards whose second line could never validate.

| 80 invented passports, 8 conditions, both readers | right | silent wrong | missed |
|---|---|---|---|
| Without the lines | 79.1% | 0.0% | 11.9% |
| **With the lines** | **84.7%** | **0.0%** | **5.9%** |

The 32 passports of people 7 to 10 were not used while building it: 78.1% to 82.0%, silent errors unchanged. Dates and numbers gain most (birth date 87.5% to 93.8%, expiry 91.7% to 97.9% on the first 48). The 288-photo table above is now 95.1% right with 0.0% silent errors (those passports still carry the old fake lines, so they gain only from the name changes below and the rule that a value only the cross-check reader found is always marked).

**What was tried and removed.** A first version repaired one misread character in the number or a date by searching look-alike characters until the check digit passed. It raised silent errors (8.3% of numbers on Tesseract-only reads): a check digit has only ten values, so the search accepted a wrong value about one time in ten. Now only the plain letter-for-digit swaps (O for 0 and so on) are made, and the check digit must pass as it is.

**How much it is trusted.** A value that passes its own check digit replaces the printed one. It carries no "check this" mark only if the printed text agrees with it or the composite check digit over the whole of line 2 also passes (the empty personal-number field counts as filler, since photos misread it). Otherwise it is shown and marked. Names have no check digit: they only replace the printed name when they agree with it (which also settles spacing), complete a name whose surname line was missed (marked), or fill in a name that was not read (marked). Filler that a photo turned into letters ("CCS", "KKK") is dropped from the names.

**Still weak:** passport names (about 54%, mostly marked): on blurred, sheared or noisy photos the surname line is often lost and the MRZ name line with it. Low-light passports are about 58%. The lines themselves are read at small size, so a very blurred photo loses them too. As everywhere, these are invented cards, and a real passport's MRZ font, spacing and glare will differ.

## Fewer "check this" marks (seventh round)

With two readers, 18% of the right values were still marked for checking. A mark that is almost never right costs the person time and teaches them to ignore marks. A breakdown of 320 readings showed where they came from: about 140 of the 198 marked right values were three fields that are *always* marked because they are found by position or pattern rather than by a label: the Aadhaar front name (the line above the date of birth), the Aadhaar back address and the driving licence address. Only 2 to 4 of each were actually wrong. By contrast, a marked passport name is wrong 62% of the time, and the other marks catch between 0 and 20%.

**What changed** (`src/core/extract.ts`, `src/core/combine.ts`): every mark now records why it was raised (`Mark`): `format` (failed a format check, or junk was cleaned off), `confidence` (the line was read with low confidence), or `position` (found by position, not by a label); several reasons collapse to the first listed. When both readers find the same value, a mark that only says "found by position" is cleared, because two independent readers finding the same thing is evidence the position guess was right. A `format` mark or a `confidence` mark is never cleared by agreement.
- **Addresses** are compared by their numbers (house number, PIN code: every token with a digit must be identical) and approximately by the other words (85% shared), since one reader often picks up junk from neighbouring lines. For addresses a low-confidence mark is also cleared on agreement.
- **A spacing difference is not agreement.** When the readers produce the same letters with different spacing in a name, the mark stays if either reader was unsure.

| marked right values, as a share of right values | before | after |
|---|---|---|
| People 1 to 4 and passports 1 to 6 (208 images) | 19.2% | **10.4%** |
| Held out: people 5 and 6, passports 7 to 10 (112 images) | 17.2% | **8.6%** |

Silent errors stay at 0 in both sets, and every error that was marked before is still marked (wrong-but-marked: 24 and 15, unchanged).

**Two clearing rules were tried and rejected on the evidence.** Clearing `confidence` marks on agreement for names created a silent error: a very dark Aadhaar card where both readers returned "PRIYA DEVIPATEL" (true "PRIYA DEVI PATEL"), one with a line confidence of 0. Agreement of two weak reads is not confirmation, and both readers can merge a space the same way. The spacing-difference case also produced that error until the mark was kept for it. Clearing `format` marks saved only three more and was not worth the risk.

**Caveat.** This depends on the readers being independent. A systematic error shared by both readers (a layout where the line above the date of birth is not the name) would now pass unmarked on those fields. That is checked here only on invented layouts. On real cards, watch Aadhaar name and address first.

## Passport names (eighth round)

Passport names were the weakest field (54% right on 80 passports, mostly wrong-but-marked). Reading what the two readers actually returned showed three separate causes, none of them the model:
1. **The "Surname" label is misread** ("Sumame", "Suname", "Sumtame", "Curname"), so the surname value was never attached and the name came out as the given name only. Label words are now matched by edit distance, and "Given Name(s)" likewise ("Civen Namel", "Given Narme(s)"; a "Name(s)" word after "Given" is skipped). If a label cannot be found at all, the plain line above the given-names label is the surname, and the plain line below the surname is the given names; these are marked as found by position (`passportParts` in `src/core/extract.ts`).
2. **Given names run together** under blur and noise ("PRIYADEVI", "GURPREETKUMARI"), the same space problem as before. The machine-readable name line carries the spacing as "<" separators, so it is now read more tolerantly (a first line that is short, "P<TND", or has "<-" for the double filler; `src/core/mrz.ts`) and lined up against the printed surname to find where the surname ends and the given names begin. When its letters agree with the printed name, its spacing is used.
3. **Both lines come from the same recogniser, which merges words the same way on both**, so "agreement" there proves nothing. A name word of 10 or more letters (probably two words run together) or with a dot inside ("AR.JUN") is therefore marked whatever else agrees, for every document, not only passports (`suspectWord`). Cost: genuinely long single names (RAMACHANDRAN, SUBRAMANIAN) are now marked too; the invented names here have none of that length, so the cost on real names is not measured.

| Passport names (invented, both readers) | right | silent wrong |
|---|---|---|
| Before (80 passports) | 54% | 0 |
| **Passports 1 to 6 (48)** | **96%** | **0** |
| **Held-out passports 7 to 10 (32, not used while building it)** | **81%** | **0** |

All passport fields over the 80: 93.8% right (was 84.7%), 0.0% silent errors; names 90.0%, numbers 100%, dates 92.5%. Everything else is unchanged: set 1 98.9% right, held-out 97.4%, with 0 silent errors; the share of right values marked stays at 10.4% and 8.6%. A blurred invented passport that the app returned as "IMRAN" now comes back as "IMRAN SINGH" with no marks.

**A silent error appeared on the way and was fixed.** Once names were found completely, names that used to be marked because they looked incomplete (a surname missing) were no longer marked, and four run-together names became silent (also a dot in "AR.JUN"). Rule 3 above is the fix, and it is why the long-word mark also holds against the machine-readable lines agreeing.

**Still weak:** low-light passports (60% right, 27.5% missed outright: nothing at all is read). Names that the two readers merge under blur are caught only by their length, so a merged name of 9 letters or less (DEVIPATEL) can still pass unmarked when no machine-readable line was read to split it.

## Low-light passports (ninth round)

Low-light passports read 60% right, with 27% of fields missed outright. Reading what the readers returned showed that **PaddleOCR was not failing**: on the ten low-light passports it returned all 13 lines, including both dates, number and names. The fields were lost afterwards, in two places:
1. **Date labels were misread** ("rate of Birth", "Date of Brth", "Dale ot Exply"), so the pattern that finds a date by its label found nothing, even though the date itself sat on the next line, read correctly. For passports the label word is now matched by edit distance (birth and expiry, up to 2 changes: `dateAfter`). If both labels are unreadable, the two dates on the page are taken in printed order (birth, then expiry; the machine-readable lines are skipped), and one date left over goes to the field still empty only if it fits (a birth date before the expiry date, and the other way round). Anything found this way is marked as found by position. Three or more dates, or another kind of document, are never guessed.
2. **The machine-readable line is shorter and mangled** in low light ("L7598775-01ND970818..."), including "IND" read as "1ND". Its anchor now accepts I, 1 or L for the I and D, 0 or O for the D. The check digits still decide whether anything from it is believed.

A smaller one: a separator read as a digit ("09/0772033" for "09/07/2033") lost the expiry date. A date with one damaged separator is accepted when the year is plausible (19xx or 20xx) and the date is real, and it is marked.

| passports (invented, both readers) | before | after |
|---|---|---|
| Low-light fields (40: 6 passports from set 1, 4 held out) | 60% right, 27.5% missed | **87.5%**, 0 missed |
| All passport fields, passports 1 to 6 (192 fields) | 98% (names fixed in round 8) | **98.4%** |
| All passport fields, held-out passports 7 to 10 (128 fields) | 94% | **95.3%** |
| Silent errors, both sets | 0 | **0** |

The rest of the table is unchanged: set 1 98.5% right, held-out 97.5%, share of right values marked 9.7% and 9.0%. **Low-light passports: 35 of 40 fields right. The 5 that are not are names** that were already marked: junk characters ("AR.JUN"), a letter misread ("PAYEL" for PATEL, "KARTNIKLAL" for KARTHIK LAL) and given names run together. A low-light invented passport in the real app gave the right number, birth date and expiry, with its name wrong and marked.

**Caveat:** low light here is a simulated brightness and contrast drop with a little noise on a cream page. Real dim photos have other problems (colour cast, motion), and real passports have security patterns and holograms across the text.

## Real-photo hazards (tenth round)

Nothing here uses a real photo. But the first eight conditions left out things that real phone photos are full of, so the generator (`eval/degrade.ts`) gained six more, run on 4 people and all 6 layouts (144 images), with both readers:

| hazard | what it is | before | after |
|---|---|---|---|
| sideways | card laid across the frame, a quarter turn either way | **0%** (nothing read) | **100%** |
| upside | rotated 180 degrees | **0%** (93% missed) | **100%** |
| perspective | keystone: the far edge 10 to 20% narrower | 95% | 95% |
| pattern | tinted card, wavy security lines, holographic stripe over the text | 100% | 100% |
| shadow | a hand's shadow over half the card, warm colour cast | 100% | 100% |
| motion | 4 to 8 pixel directional blur (an earlier 7 to 13 pixel version read 13%) | 13% | **77%** (14% missed, 0 silent) |

Over all six: **95.4% right, 0.0% silent errors** (Tesseract alone: 69.6%; PaddleOCR alone: 94.0% with 0.2% silent). Three of the six were already fine, so the app was only exposed on orientation and on heavy motion blur. Nothing was silently wrong even where it failed: failures were reads that found nothing.

**What was added for orientation** (`findTurns` in `src/ocr/paddle.ts`, rules in `src/ocr/orientation.ts`): the detector runs once on a small copy of the photo. If the text boxes are mostly tall (at least three, and twice as many tall as wide) the photo is turned a quarter turn. The text-direction classifier that ships in the same model package (`cls.onnx`, 0.6 MB) then votes on up to ten text lines to say whether the text is also upside down, and a clear majority is required (at least 4 votes and 3 times the upright votes). The turn found is applied to both readers, so Tesseract benefits too (its sideways and upside-down reads went from 0% to 97.6% and 96.4%). Cost: about one extra detection pass (roughly one second) on every photo.

**The orientation check was itself tested for false alarms.** Across 504 invented photos (6 people, 6 layouts, all 14 conditions) it made the right call every time: no normal photo was turned, all 72 upside-down cards got 2 turns, all 72 sideways cards an odd number. A first version made one wrong call (an upright, slightly tilted Aadhaar flipped on 3 votes to 2); a clear-majority rule fixed that without affecting the real upside-down cards (7 to 10 votes against 0 or 1). A wrong flip would ruin a read, so that margin matters. A wrong sideways call is guarded by needing mostly tall boxes.

**Not covered, and what real photos would still bring:** strong perspective beyond keystone (a card tilted away at 45 degrees), a card partly out of frame, a finger over a line of text, glossy reflections that hide whole words, creases, and the fonts and layouts of real cards, which differ by state and year. Orientation is found from the text boxes, so a card with very little printed text could be misjudged. These are the right things to check on a few of your own cards, privately, before trusting any figure here.

## Known weak spots (next work)

- **Passport names** under low light, blur and noise: junk characters and given names run together are caught by marks (not fixed). All other passport fields are about 97%.
- **Real photos**: everything here is invented cards, so the readers' agreement and the rate of marks need checking on real ones (privately, by the owner of the documents). Sideways, upside-down, keystone, security-pattern and shadow photos are covered by the tenth round; heavy motion blur (about 77%) is the weakest of those.
- **Aadhaar front** misses the name and date when OCR joins lines or drops them.
- **Tilt beyond 15 degrees, sideways cards and perspective distortion** are not corrected. Tilts of 4 to 8 degrees now read at about 93%, with no silent errors on the held-out set.
- **Hindi and other scripts** are ignored (English data only).
- Add **real-photo checks** done privately by the owner of the documents, never committed: run the app on a few of your own cards and compare by eye.
