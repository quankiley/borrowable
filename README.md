# Borrowable 👚

A pastel little PWA for keeping track of clothes you've borrowed from friends.
**No build step.** Just static files — drop them in a GitHub repo, turn on
GitHub Pages, and visit the public URL.

## What's in this folder

| file | what it does |
| --- | --- |
| `index.html` | The whole UI shell. Loads Tailwind + Google Fonts from CDNs. |
| `app.js` | All the logic — auth, items, modals, routing, color rules. |
| `icon.svg` | Pastel 👚 favicon, also used as the home-screen icon. |
| `manifest.json` | PWA manifest so phones can "Add to Home Screen". |
| `sw.js` | Service worker that caches the shell for offline. |
| `README.md` | This file. |

The Supabase URL + publishable key are hardcoded near the top of `app.js`.
The publishable key is designed to be public (it's the new name for what used
to be the `anon` key) — so it's safe to commit and ship to the browser.

## Deploy via GitHub web UI

1. **Create the repo.** Go to [github.com/new](https://github.com/new). Name
   it whatever you want (e.g. `borrowable`), make it **Public** (free GitHub
   Pages requires public), and **don't** check any of the "Initialize" boxes.
   Click **Create**.

2. **Upload these files.** On the empty repo page, click the
   **"uploading an existing file"** link. Drag in everything from this
   folder: `index.html`, `app.js`, `icon.svg`, `manifest.json`, `sw.js`,
   `README.md`. Type a commit message ("first commit") and click
   **Commit changes**.

3. **Turn on Pages.** In the repo, go to **Settings → Pages**. Under "Build
   and deployment", set **Source** to **Deploy from a branch**, **Branch** to
   **`main`** with folder **`/ (root)`**, and click **Save**.

4. **Wait ~1 minute**, then refresh the Pages settings page. You'll see
   "Your site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`".
   Visit that URL on your phone or laptop. Done.

## Updating the app later

To change anything, edit the file in GitHub's web UI (pencil icon at the top
right of any file), commit the change, and Pages will redeploy in ~30s.

If you ever want to nuke the service worker cache (e.g. after big updates),
bump the `CACHE` version in `sw.js` from `borrowable-shell-v1` to `v2`.

## Add to home screen (mobile)

- **iOS Safari:** open the site → Share button → "Add to Home Screen"
- **Android Chrome:** menu → "Install app" / "Add to Home screen"

It opens fullscreen with no browser chrome.

## Local testing

You can't just double-click `index.html` because browsers block ES module
imports over `file://`. Use any tiny static server. Easiest options:

- VS Code: install "Live Server" extension, right-click `index.html` →
  "Open with Live Server"
- Python: `python -m http.server 8000` in this folder, visit
  `http://localhost:8000/`
- Node: `npx serve .`

## Supabase reminder

The database schema and RLS policies were already applied when you first set
this up. If you're starting a fresh Supabase project, run the SQL from the
original setup file (creates `profiles`, `borrowed_items`, RLS policies, and
the auto-profile-on-signup trigger).
