# Borrowable 👚

A bubbly, pastel little app for keeping track of clothes you've borrowed from
friends — and getting them back before someone gets mad. Built with React +
Vite + TypeScript + Tailwind, talking to Supabase for auth and storage.

![status: works on my machine](https://img.shields.io/badge/status-soft%20launch-FFC8DD)

## What it does

- 🔐 Sign up / sign in with email + a display name
- ✨ Add items you borrowed: description, brand, color, place, date, and how
  long you can keep them
- ⏳ Live countdown for each item — turns **green** while it's safe,
  **yellow** when it's coming due, and **red** when you're overdue
- 👯 Tap a person to see everything you've borrowed from them
- 🟦 Tap an item to mark it **Returning** / **Returned** or **Extend** the
  borrow time
- 💖 Pastel rainbow shapes that bob around because life is short

---

## 1) Set up Supabase

1. Make a free project at [supabase.com](https://supabase.com).
2. From your project page, copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **publishable key** (starts with `sb_publishable_...`) — this is the
     successor to the old `anon` key and is safe to ship to the browser.
3. Open the **SQL editor** in Supabase, paste the contents of
   [`SUPABASE_SETUP.sql`](./SUPABASE_SETUP.sql), and hit **Run**. This creates
   the `profiles` and `borrowed_items` tables, the row-level-security policies
   so each user only sees their own stuff, and a trigger that auto-creates a
   profile on signup using the name you give it.
4. (Optional but nice for local dev) **Authentication → Providers → Email →**
   turn off "Confirm email" so you can sign in immediately without clicking a
   link in your inbox.

## 2) Run the app locally

```bash
# install deps
npm install

# create your env file from the example, then fill it in
cp .env.example .env
# edit .env and paste in your VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY

# run dev server
npm run dev
```

Open whatever URL Vite prints (usually `http://localhost:5173`).

## 3) Build for production

```bash
npm run build      # type-check + bundle into ./dist
npm run preview    # serve the built bundle locally to sanity check
```

The `dist/` folder is a plain static site — drop it on Netlify, Vercel,
GitHub Pages, Cloudflare Pages, anywhere.

---

## File map

```
src/
├── App.tsx                 router + auth gate + 1-minute timer tick
├── lib/
│   ├── supabase.ts         Supabase client (reads env vars)
│   └── timeUtils.ts        due-date math + bubble color logic
├── contexts/
│   ├── AuthContext.tsx     session + profile, signUp/signIn/signOut
│   └── ItemsContext.tsx    items list, addItem, updateStatus, extendDueDate
├── pages/
│   ├── Login.tsx           sign up / sign in
│   ├── Dashboard.tsx       bubble grid + Items / People toggle
│   └── PersonView.tsx      everything borrowed from one person
├── components/
│   ├── Layout.tsx          header w/ name + sign out
│   ├── ItemBubble.tsx      one borrowed thing, color-coded
│   ├── PersonBubble.tsx    one lender, with item count
│   ├── AddItemModal.tsx    form for a new borrow
│   └── ItemActionModal.tsx Returning / Returned / Extend / Delete
└── types.ts                shared TypeScript types
```

## Color rules

- 🟢 **Green (pastel mint)** — within timeline
- 🟡 **Yellow (butter)** — due in 3 days or less
- 🔴 **Red (coral)** — overdue
- 🟣 **Lavender** — already returned

The clock ticks every 60s in `App.tsx` so colors flip in real time without a
page refresh.

## Deploy to GitHub

```bash
git init
git add .
git commit -m "first commit: Borrowable"
gh repo create borrowable --public --source=. --push
```

(Or do it through github.com — `git remote add origin …` + `git push`.)

`.env` is in `.gitignore`, so your friend will need to copy `.env.example` to
`.env` and paste their own Supabase URL + publishable key after they clone.

---

made with 🌸 and one too many bubble shapes
