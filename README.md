# Hadith video — all ratios, all qualities, rendered on GitHub

This project turns `audio.mp3` + `timestamps.txt` into the same subtitle-card video in **6 ratios × 3 qualities = 18 MP4 files**,
and publishes them in one **GitHub Release**. You only need an Android phone and a browser. Nothing is installed on your phone.

**সংক্ষেপে (বাংলায়):** ১) GitHub-এ নতুন repository খুলুন, ২) সব ফাইল আপলোড করুন (`render.yml` আলাদাভাবে `.github/workflows/render.yml` পাথে তৈরি করুন),
৩) Actions ট্যাবে "Render video (all ratios) and publish Release" → **Run workflow** চাপুন, ৪) কাজ শেষ হলে **Releases** থেকে ভিডিও ডাউনলোড করুন।
নিচের ইংরেজি ধাপগুলোতে বিস্তারিত আছে।

---

## 1. Create the repository and upload the files (once)

1. Open <https://github.com> in your phone browser and sign in. Tap **+** → **New repository**.
2. Give it a name (for example `hadith-video`), choose **Public** or **Private**, tap **Create repository**.
3. Tap **uploading an existing file** (or **Add file → Upload files**) and select **all** the project files from your phone:
   `index.html`, `style.css`, `layout.js`, `scenes.js`, `lines.js`, `brand.js`, `render.js`, `package.json`, `README.md`, `.gitignore`,
   `timestamps.txt`, `audio.mp3`, `logo.png`, `google-play-badge.png`, `brand.txt`. Tap **Commit changes**.
   - `audio.mp3` is about 7 MB — that is fine (the limit is 25 MB per file in the browser uploader).
   - If your phone hides the file `.gitignore` in the file picker, skip it and create it later with **Add file → Create new file**
     (name `.gitignore`, paste the content from this project).
4. **The workflow file cannot be uploaded inside a folder from a phone.** Create it by hand:
   1. **Add file → Create new file**.
   2. In the name box type exactly: `.github/workflows/render.yml`  (typing each `/` makes GitHub create the folders).
   3. Open the delivered `render.yml`, copy **all** of its text, paste it into the big editor box.
   4. Tap **Commit changes**.

Every other file stays in the main folder — there are no other sub-folders.

## 2. Allow the Release step (once)

GitHub must be allowed to create a Release with the built-in token:

**Settings → Actions → General → Workflow permissions → select "Read and write permissions" → Save.**

(If a run is green but no Release appears, or the last job says "Resource not accessible by integration", this setting is the reason.
Set it, then re-run the workflow.)

## 3. Run the workflow

1. Open the **Actions** tab. If GitHub shows a button "I understand my workflows, go ahead and enable them", tap it.
2. Tap **Render video (all ratios) and publish Release** in the list, then **Run workflow**.
3. **First time: do a quick test.** Set `test_seconds` = `10` and `ratios` = `9x16,16x9`, then tap the green **Run workflow** button.
   A test run renders only the first 10 seconds and does **not** create a Release; it only keeps the files as *artifacts* at the bottom of the run page.
4. For the real video leave the defaults (all ratios, all qualities, `test_seconds` empty) and run again.
   The real video is **81.7 seconds** (audio 79.68 s + 2 s end scene). Rendering all 18 files can take roughly 30–90 minutes.
   The six ratios render in parallel as six jobs.

## 4. Find and download the videos

- When the run is green, go to the **main page of the repository** and open **Releases** (right side on desktop view; on the phone scroll down or tap the
  "Releases" link). The newest Release (named `video-<run number>`) holds all files. Tap a file name to download it.
- The same files are also on the run page under **Artifacts** for 30 days (one artifact per ratio).

### File names

`<BASENAME>-<ratio>-<quality>.mp4` — here `BASENAME` is `hadith-video` (from `brand.txt`), for example `hadith-video-9x16-4k.mp4`.

| Ratio | Full HD (fhd) | 4K (4k) | HD (hd) | Use it for |
|---|---|---|---|---|
| `9x16` | 1080×1920 | 2160×3840 | 720×1280 | TikTok, Instagram Reels / Stories, YouTube Shorts, Facebook Reels / Stories |
| `16x9` | 1920×1080 | 3840×2160 | 1280×720 | YouTube long video, websites, client work, TV, presentations |
| `1x1` | 1080×1080 | 2160×2160 | 720×720 | Facebook / Instagram / LinkedIn / X feed |
| `4x5` | 1080×1350 | 2160×2700 | 720×900 | Facebook & Instagram feed (takes the most feed space) |
| `3x4` | 1080×1440 | 2160×2880 | 720×960 | Instagram grid / portrait feed alternative |
| `4x3` | 1440×1080 | 2880×2160 | 960×720 | classic screens, slide decks, some ad placements |

Which quality? **4k** for archive / YouTube / client delivery, **fhd** for normal uploads, **hd** for small files and slow connections.
Portrait (9:16) gives fast reach on short-form platforms; landscape (16:9) is the format for YouTube long videos and most client work; 4:5 / 1:1 are for feed posts.
All files are 30 fps and exactly the same length. Each file is kept under 1.9 GiB automatically (GitHub's limit is 2 GiB per file).

## 5. Render only some ratios or qualities

In **Run workflow** you can change:

| Input | Meaning | Example |
|---|---|---|
| `ratios` | which ratios | `9x16,16x9` |
| `tiers` | which qualities | `fhd` or `4k,fhd` |
| `test_seconds` | test only the first N seconds (no Release) | `10` |
| `workers` | parallel browsers per ratio (empty = auto) | `2` |
| `release_tag` | tag/name of the Release (empty = `video-<run number>`) | `hadith-1` |
| `release_title` | title of the Release | `Niyyat hadith` |

## 6. If one ratio fails (red job)

The Release is only created when **every** requested ratio succeeded, so you never get a half-published Release.
The ratios that did succeed stay downloadable as artifacts of that run (30 days).

- **Easiest:** open the failed job, read the last lines of its log, fix the cause (often: a typo in `timestamps.txt`), and run the workflow again.
- **To save time:** run again with only the failed ratio in `ratios` **and** a tag name of your choice in `release_tag` (for example `hadith-1`).
  That run creates the Release with that ratio. Then run once more with the ratios that had succeeded and the **same** `release_tag`:
  each run adds its files to that Release (existing files with the same name are replaced).

## 7. Change timing or text later

1. In the repository tap `timestamps.txt` → pencil icon (**Edit**) → change it → **Commit changes**.
   Format, one line per segment: `start | end | text | emotion_tag` (seconds). Every line becomes one subtitle card in every ratio, with your exact wording.
2. To replace the voice-over, upload a new `audio.mp3` with the same name (**Add file → Upload files**, it replaces the old one).
3. Run the workflow again (optionally with a new `release_tag` so the old Release stays untouched).

`lines.js` and `brand.js` are rewritten by `render.js` on every run from `timestamps.txt`, `brand.txt` and the real audio length, so you never edit them by hand.

**Length rule:** the video ends 2.0 seconds after the later of (the last timestamp end, the real end of `audio.mp3`), rounded up to a whole frame.
The audio is padded with silence to that length. The last 2 seconds are the final call-to-action scene.

**Emotion tags:** `respectful`, `solemn`, `serious`, `store` → gold accent. `informative`, `calm`, `thoughtful`, `warm`, `compassionate`, `optimistic`,
`friendly`, `encouraging` and any unknown tag → mint accent. If the **last** line has the tag `store`, the final scene starts at that line's start and
its text is shown as a caption under the button (no card for that line).

## 8. `brand.txt` keys

One `KEY=VALUE` per line (UTF-8). Lines starting with `#` are comments. A key that is missing means that element is simply left out — nothing is invented.

| Key | Where it appears |
|---|---|
| `APP_NAME` | gold text under the header icon and in the final scene |
| `PILL` | small outlined label under the app name (header only) |
| `FEATURES` | one line of text under the app name in the final scene |
| `CTA_BUTTON` | text on the gold button in the final scene |
| `BASENAME` | prefix of the output file names (default `video`; here `hadith-video`) |

## 9. What is in the project (flat folder)

| File | Purpose |
|---|---|
| `index.html`, `style.css` | page skeleton and all styling (Bengali + Arabic font stacks, CSS-only background lattice) |
| `layout.js` | layout profiles for all six ratios |
| `scenes.js` | the timeline engine: background, header, cards, wave, progress bar, final scene, `window.renderAt(t)` |
| `lines.js`, `brand.js` | generated from `timestamps.txt` / `brand.txt` / audio length |
| `render.js` | Playwright frame capture + FFmpeg encode (4K / Full HD / HD from the same frames) |
| `package.json`, `.gitignore` | Node dependency (`playwright`) and ignore list |
| `.github/workflows/render.yml` | the workflow (the only file in a sub-folder) |
| `timestamps.txt`, `audio.mp3`, `logo.png`, `google-play-badge.png`, `brand.txt` | your files, unchanged |

Fonts: the workflow installs Noto (Bengali, Arabic), Amiri, FreeFont and DejaVu on the render machine. If you ever want a specific Bengali font,
upload its `.ttf` into the main folder and declare it in `style.css` with `@font-face` (the comment at the top of `style.css` shows how).

## 10. Run it on a computer (optional)

```
npm install
npx playwright install chromium
node render.js --test 10 --ratios 9x16        # quick test
node render.js --still 5,40,70 --ratios 9x16   # PNG stills to check the look
node render.js                                 # everything (needs ffmpeg and the Noto/Amiri fonts installed)
```
