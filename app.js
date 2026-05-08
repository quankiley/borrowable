// Borrowable — pure-static, no build step. Uses Supabase via ESM CDN.
// Drop this file (and index.html) into a GitHub repo, enable Pages, done.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import morphdom from 'https://esm.sh/morphdom@2.7.4'

// ─── config ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qjwbuzpvzsmyxqhiijap.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9LraTX2p54bXKt_6DaFUQg_25TbIWDA'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'borrowable-auth' },
})

// ─── tiny helpers ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id)
const root = $('root')

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function fmt(d) { return new Date(d).toISOString().slice(0, 10) }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addWeeks(d, n) { return addDays(d, n * 7) }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

function daysUntil(dateStr) {
  const due = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((due - now) / 86400000)
}

function timeStatus(item) {
  if (item.status === 'returned') return 'ok'
  const d = daysUntil(item.due_date)
  if (d < 0) return 'overdue'
  if (d <= 3) return 'soon'
  return 'ok'
}

function dueLabel(item) {
  if (item.status === 'returned') return 'Returned'
  const d = daysUntil(item.due_date)
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d < 30) return `Due in ${d} days`
  const months = Math.round(d / 30)
  return months === 1 ? 'Due in about 1 month' : `Due in about ${months} months`
}

function statusLabel(s) { return s === 'returning' ? 'Returning' : s === 'returned' ? 'Returned' : 'Borrowed' }

function bubbleClasses(item) {
  if (item.status === 'returned') return { bg: 'bg-status-done', ring: '#7C7CC7', chipBg: 'bg-status-doneDeep', chipText: 'text-white' }
  const t = timeStatus(item)
  if (t === 'overdue') return { bg: 'bg-status-due', ring: '#FF6B6B', chipBg: 'bg-status-dueDeep', chipText: 'text-white' }
  if (t === 'soon') return { bg: 'bg-status-warn', ring: '#F7C035', chipBg: 'bg-status-warnDeep', chipText: 'text-amber-900' }
  return { bg: 'bg-status-ok', ring: '#7FD89C', chipBg: 'bg-status-okDeep', chipText: 'text-emerald-900' }
}

function hashHue(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xfffffff
  return h % 360
}

function initials(name) {
  return (name || '').split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '🤝'
}

// ─── confetti burst ────────────────────────────────────────────────
function spawnConfetti(originX, originY) {
  const emojis = ['✨', '🎉', '💖', '🌸', '⭐', '💫', '🌷', '🦋']
  const n = 22
  for (let i = 0; i < n; i++) {
    const span = document.createElement('span')
    span.className = 'confetti-piece'
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)]
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2
    const dist = 180 + Math.random() * 220
    const dx = Math.cos(angle) * dist + (Math.random() - 0.5) * 80
    const dy = Math.sin(angle) * dist + (Math.random() - 0.5) * 80
    const dur = 0.9 + Math.random() * 0.7
    const size = 18 + Math.random() * 22
    span.style.cssText = `left:${originX}px; top:${originY}px; font-size:${size}px; --dx:${dx}px; --dy:${dy}px; --dur:${dur}s; transform:translate(-50%,-50%);`
    document.body.appendChild(span)
    setTimeout(() => span.remove(), (dur + 0.2) * 1000)
  }
}

function celebrateFromEvent(e) {
  const r = (e?.target?.getBoundingClientRect && e.target.getBoundingClientRect()) || null
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2
  spawnConfetti(x, y)
}

// ─── state ──────────────────────────────────────────────────────────
const state = {
  loading: true,
  session: null,
  profile: null,
  items: [],          // ALL items I'm involved in (borrower OR lender)
  friends: [],        // {id, name, email}
  profiles: {},       // id -> {id, name, email} cache
  view: 'dashboard',  // 'dashboard' | { type: 'person', name }
  dashboardMode: 'borrowed', // 'borrowed' | 'lent'
  modeTab: 'items',   // 'items' | 'people' (within borrowed view)
  filter: 'active',   // 'active' | 'all' | 'returned'
  modal: null,        // null | { type: 'add', defaultPerson?, defaultLenderId? } | { type: 'item', id } | { type: 'friends' }
  busy: false,
  loginMode: 'signup',
  loginErr: null,
  loginInfo: null,
  friendErr: null,
  friendInfo: null,
}

// ─── data layer ────────────────────────────────────────────────────
async function loadProfile() {
  if (!state.session) { state.profile = null; return }
  const userId = state.session.user.id
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) { console.error(error); return }
  if (data) {
    state.profile = data
    state.profiles[data.id] = data
    return
  }
  const fallback = state.session.user.user_metadata?.name || (state.session.user.email || '').split('@')[0] || 'Friend'
  const { data: ins, error: insErr } = await supabase
    .from('profiles')
    .insert({ id: userId, name: fallback, email: state.session.user.email })
    .select()
    .single()
  if (insErr) { console.error(insErr); return }
  state.profile = ins
  state.profiles[ins.id] = ins
}

async function loadItems() {
  if (!state.session) { state.items = []; return }
  // RLS allows reading items where I'm borrower OR lender; one query gets both.
  const { data, error } = await supabase
    .from('borrowed_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return }
  state.items = data || []
  await ensureProfilesLoaded()
}

async function loadFriends() {
  if (!state.session) { state.friends = []; return }
  const me = state.session.user.id
  const { data: links, error } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', me)
  if (error) { console.error(error); return }
  const ids = (links || []).map((l) => l.friend_id)
  if (ids.length === 0) { state.friends = []; return }
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', ids)
  if (pErr) { console.error(pErr); return }
  state.friends = (profs || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  for (const p of profs || []) state.profiles[p.id] = p
}

async function ensureProfilesLoaded() {
  // Make sure we have profiles for every user_id and lender_id in items.
  const need = new Set()
  for (const item of state.items) {
    if (item.user_id && !state.profiles[item.user_id]) need.add(item.user_id)
    if (item.lender_id && !state.profiles[item.lender_id]) need.add(item.lender_id)
  }
  if (need.size === 0) return
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', Array.from(need))
  if (error) { console.error(error); return }
  for (const p of data || []) state.profiles[p.id] = p
}

async function addItem(payload) {
  const { data, error } = await supabase
    .from('borrowed_items')
    .insert({ ...payload, user_id: state.session.user.id, status: 'borrowed' })
    .select()
    .single()
  if (error) throw error
  state.items = [data, ...state.items]
}

async function updateStatus(id, status) {
  const { error } = await supabase.from('borrowed_items').update({ status }).eq('id', id)
  if (error) throw error
  state.items = state.items.map((i) => (i.id === id ? { ...i, status } : i))
}

async function extendItem(id, newDueDate) {
  const { error } = await supabase.from('borrowed_items').update({ due_date: newDueDate }).eq('id', id)
  if (error) throw error
  state.items = state.items.map((i) => (i.id === id ? { ...i, due_date: newDueDate } : i))
}

async function deleteItem(id) {
  const { error } = await supabase.from('borrowed_items').delete().eq('id', id)
  if (error) throw error
  state.items = state.items.filter((i) => i.id !== id)
}

async function addFriendByEmail(email) {
  const { data, error } = await supabase.rpc('add_friend_by_email', { friend_email: email })
  if (error) throw error
  // RPC returns array of one row {id, name, email}
  const row = Array.isArray(data) ? data[0] : data
  if (row) {
    state.profiles[row.id] = row
    if (!state.friends.find((f) => f.id === row.id)) {
      state.friends = [...state.friends, row].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
  }
  return row
}

async function removeFriendRpc(id) {
  const { error } = await supabase.rpc('remove_friend', { target_id: id })
  if (error) throw error
  state.friends = state.friends.filter((f) => f.id !== id)
}

// ─── auth handlers ─────────────────────────────────────────────────
async function handleAuth(e) {
  e.preventDefault()
  const f = new FormData(e.target)
  const email = (f.get('email') || '').toString().trim()
  const password = (f.get('password') || '').toString()
  const name = (f.get('name') || '').toString().trim()
  state.loginErr = null; state.loginInfo = null; state.busy = true; render()
  try {
    if (state.loginMode === 'signup') {
      if (!name) { state.loginErr = 'Tell us your name so friends know who borrowed!'; return }
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) throw error
      state.loginInfo = 'Check your email to confirm — then sign in. (If confirmations are off in Supabase, just sign in.)'
      state.loginMode = 'signin'
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    }
  } catch (err) {
    state.loginErr = err.message || 'Something went wrong'
  } finally {
    state.busy = false; render()
  }
}

async function handleSignOut() {
  // Show busy state immediately so the click feels responsive even if the
  // network is slow. Then clear local state regardless of what the server
  // says — if the server call fails (already signed out, network blip),
  // we still want the UI to reflect a logged-out state.
  state.busy = true
  render()
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.error('signOut error (clearing locally anyway)', err)
  }
  state.session = null
  state.profile = null
  state.items = []
  state.friends = []
  state.profiles = {}
  state.view = 'dashboard'
  state.modal = null
  state.dashboardMode = 'borrowed'
  state.modeTab = 'items'
  state.filter = 'active'
  state.busy = false
  // Drop any persisted Supabase session for this storage key — belt and
  // braces in case signOut() didn't clear it (e.g. server returned 4xx).
  try { localStorage.removeItem('borrowable-auth') } catch {}
  render()
}

// ─── views ──────────────────────────────────────────────────────────
function viewLogin() {
  const { loginMode: mode, loginErr: err, loginInfo: info, busy } = state
  return `
    <div style="min-height:100vh" class="flex items-center justify-center px-4 py-10 relative">
      <div class="absolute -z-10 left-10 top-20 w-40 h-40 bg-pastel-rose/60 blob anim-bob"></div>
      <div class="absolute -z-10 right-16 top-40 w-28 h-28 bg-pastel-mint/70 squish anim-bob" style="animation-delay:.6s"></div>
      <div class="absolute -z-10 left-1/3 bottom-20 w-32 h-32 bg-pastel-sky/70 blob anim-bob" style="animation-delay:1.2s"></div>

      <div class="card-bubble w-full max-w-md p-8 sm:p-10 anim-pop">
        <div class="text-center mb-8">
          <div class="mx-auto w-20 h-20 bg-pastel-rose blob shadow-bubble flex items-center justify-center text-3xl mb-4 anim-wiggle">👚</div>
          <h1 class="text-4xl font-bold" style="color:#E11D74;">Borrowable</h1>
          <p class="text-pastel-lilac mt-2 font-medium">keep track of what you've borrowed</p>
        </div>

        <div class="toggle-pill mb-6">
          <button type="button" class="${mode === 'signup' ? 'active' : ''}" data-act="login-mode" data-mode="signup" style="flex:1; padding-top:.5rem; padding-bottom:.5rem;">Sign up</button>
          <button type="button" class="${mode === 'signin' ? 'active' : ''}" data-act="login-mode" data-mode="signin" style="flex:1; padding-top:.5rem; padding-bottom:.5rem;">Sign in</button>
        </div>

        <form id="auth-form" class="space-y-4">
          ${mode === 'signup' ? `
            <div>
              <label class="label-soft block mb-1">your name</label>
              <input class="input-bubble" name="name" placeholder="e.g. Sam" autocomplete="name" maxlength="40" required />
            </div>` : ''}
          <div>
            <label class="label-soft block mb-1">email</label>
            <input class="input-bubble" name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
          </div>
          <div>
            <label class="label-soft block mb-1">password</label>
            <input class="input-bubble" name="password" type="password" placeholder="•••••••" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required />
          </div>

          ${err ? `<div class="rounded-2xl bg-status-due/70 border-2 border-status-dueDeep/40 px-4 py-3 text-sm font-medium" style="color:#881337">${escapeHtml(err)}</div>` : ''}
          ${info ? `<div class="rounded-2xl bg-status-ok/70 border-2 border-status-okDeep/40 px-4 py-3 text-sm font-medium" style="color:#064E3B">${escapeHtml(info)}</div>` : ''}

          <button type="submit" class="btn-pop btn-primary w-full" ${busy ? 'disabled' : ''}>
            ${busy ? 'just a sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>`
}

function header() {
  const name = state.profile?.name || 'You'
  const initial = name.slice(0, 1).toUpperCase()
  return `
    <header class="px-4 sm:px-8 py-5 flex items-center justify-between gap-3">
      <a href="#/" data-act="go-home" class="logo-link flex items-center gap-3" style="text-decoration:none">
        <div class="logo-blob w-12 h-12 bg-pastel-rose blob shadow-bubble flex items-center justify-center text-xl">👚</div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:#E11D74">Borrowable</h1>
      </a>
      <div class="flex items-center gap-2 sm:gap-3">
        <button data-act="open-friends" class="rounded-full px-3 sm:px-4 py-2 text-sm font-semibold bg-pastel-lavender/70 hover:bg-pastel-lavender text-white shadow-soft transition flex items-center gap-1.5" style="border:0; cursor:pointer; font-family:inherit">
          <span>👯</span>
          <span class="hidden sm:inline">Friends${state.friends.length ? ` · ${state.friends.length}` : ''}</span>
        </button>
        <div class="hidden sm:flex items-center gap-2 bg-white/70 rounded-full pl-2 pr-4 py-1.5 shadow-soft" style="backdrop-filter:blur(6px)">
          <div class="w-8 h-8 rounded-full bg-pastel-lavender flex items-center justify-center font-bold text-white text-sm">${escapeHtml(initial)}</div>
          <span class="font-semibold" style="color:#3a2f4a">${escapeHtml(name)}</span>
        </div>
        <button data-act="sign-out" class="rounded-full px-4 py-2 text-sm font-semibold bg-white/70 hover:bg-white text-pastel-lilac shadow-soft transition" style="border:0; cursor:pointer; font-family:inherit">Sign out</button>
      </div>
    </header>`
}

function itemBubbleHtml(item, perspective, idx = 0) {
  // perspective: 'borrowed' (I borrowed it) | 'lent' (I lent it)
  const cls = bubbleClasses(item)
  const counterparty =
    perspective === 'lent'
      ? (state.profiles[item.user_id]?.name || 'someone')
      : item.borrowed_from
  const prefix = perspective === 'lent' ? 'borrowed by' : 'from'
  const enterDelay = (idx * 0.05).toFixed(2)
  const idleDelay = ((idx * 0.7) % 4).toFixed(2)
  return `
    <button data-act="open-item" data-id="${item.id}" class="item-card ring-status ${cls.bg} p-5 text-left" style="--ring-color:${cls.ring}; --enter-delay:${enterDelay}s; --idle-delay:${idleDelay}s;">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${cls.chipBg} ${cls.chipText}">${statusLabel(item.status)}</div>
        ${item.color ? `<div class="w-6 h-6 rounded-full border-2 border-white shadow-soft shrink-0" style="background:${escapeHtml(item.color)}"></div>` : ''}
      </div>
      <div class="font-semibold text-lg leading-tight line-clamp-3" style="color:#292524; word-break:break-word;">${escapeHtml(item.description)}</div>
      ${item.brand ? `<div class="text-sm italic mt-0.5 truncate" style="color:rgba(68,64,60,0.8)">${escapeHtml(item.brand)}</div>` : ''}
      <div class="mt-3 text-sm" style="color:#44403c">${prefix} <span class="font-semibold">${escapeHtml(counterparty)}</span>${item.lender_id && perspective === 'borrowed' ? ' <span class="text-xs">🔗</span>' : ''}</div>
      <div class="mt-1 text-xs font-bold" style="color:#292524">${escapeHtml(dueLabel(item))}</div>
    </button>`
}

function personBubbleHtml(p, idx = 0) {
  const hue = hashHue(p.name)
  const bg = `hsl(${hue}, 80%, 86%)`
  const ring = `hsl(${hue}, 65%, 70%)`
  const enterDelay = (idx * 0.05).toFixed(2)
  const idleDelay = ((idx * 0.9) % 4.5).toFixed(2)
  return `
    <a href="#/person/${encodeURIComponent(p.name)}" data-act="go-person" data-name="${escapeHtml(p.name)}" class="person-card ring-status p-5 flex items-center gap-4" style="--ring-color:${ring}; background:${bg}; --enter-delay:${enterDelay}s; --idle-delay:${idleDelay}s;">
      <div class="w-14 h-14 squish flex items-center justify-center text-xl font-bold text-white shadow-soft shrink-0" style="background:${ring}">${escapeHtml(initials(p.name))}</div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-lg leading-tight truncate" style="color:#292524">${escapeHtml(p.name)}</div>
        <div class="text-sm" style="color:#44403c">
          ${p.count} ${p.count === 1 ? 'item' : 'items'}
          ${p.overdue > 0 ? `<span class="ml-2 text-xs font-bold uppercase tracking-wider bg-status-due px-2 py-0.5 rounded-full" style="color:#881337">${p.overdue} overdue</span>` : ''}
        </div>
      </div>
    </a>`
}

function emptyStateHtml(kind) {
  if (kind === 'returned') {
    return `<div class="card-bubble p-10 text-center"><div class="text-5xl mb-3">📦</div><h3 class="text-xl font-bold mb-1" style="color:#292524">Nothing returned yet</h3><p class="text-pastel-lilac">when you give stuff back, it'll show up here</p></div>`
  }
  if (kind === 'lent') {
    return `
      <div class="card-bubble p-10 text-center">
        <div class="text-5xl mb-3 anim-wiggle inline-block">🤝</div>
        <h3 class="text-xl font-bold mb-1" style="color:#292524">Nothing lent out yet</h3>
        <p class="text-pastel-lilac mb-5">when a friend logs that they borrowed something from you, it'll show up here</p>
        <button data-act="open-friends" class="btn-pop btn-primary">Manage friends</button>
      </div>`
  }
  return `
    <div class="card-bubble p-10 text-center">
      <div class="text-5xl mb-3 anim-wiggle inline-block">👚</div>
      <h3 class="text-xl font-bold mb-1" style="color:#292524">Nothing borrowed yet!</h3>
      <p class="text-pastel-lilac mb-5">add something you've borrowed to start tracking it</p>
      <button data-act="open-add" class="btn-pop btn-primary"><span class="text-xl leading-none">＋</span> Add an item</button>
    </div>`
}

function viewDashboard() {
  const me = state.session.user.id
  const myBorrows = state.items.filter((i) => i.user_id === me)
  const myLent = state.items.filter((i) => i.lender_id === me && i.user_id !== me)

  const heroName = state.profile?.name || 'friend'
  const filterTabs = ['active', 'all', 'returned']

  let body = ''

  if (state.dashboardMode === 'borrowed') {
    const items = myBorrows
    const visible = state.filter === 'all' ? items : state.filter === 'returned' ? items.filter((i) => i.status === 'returned') : items.filter((i) => i.status !== 'returned')
    const overdue = items.filter((i) => i.status !== 'returned' && timeStatus(i) === 'overdue').length
    const active = items.filter((i) => i.status !== 'returned').length

    const map = new Map()
    const now = new Date()
    for (const item of items) {
      if (item.status === 'returned') continue
      const e = map.get(item.borrowed_from) || { count: 0, overdue: 0 }
      e.count += 1
      if (new Date(item.due_date) < now) e.overdue += 1
      map.set(item.borrowed_from, e)
    }
    const people = Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.overdue - a.overdue || b.count - a.count)

    body = `
      <section class="card-bubble p-6 sm:p-8 mb-6 relative overflow-hidden">
        <div class="absolute -right-6 -top-6 w-32 h-32 bg-pastel-butter/70 blob anim-bob" style="z-index:0"></div>
        <div class="absolute -right-16 top-20 w-20 h-20 bg-pastel-mint/70 squish anim-bob" style="z-index:0; animation-delay:.8s"></div>
        <div class="relative" style="z-index:1">
          <p class="text-pastel-lilac font-semibold mb-1">hi, ${escapeHtml(heroName)} 👋</p>
          <h2 class="text-3xl sm:text-4xl font-bold" style="color:#292524">you've borrowed <span style="color:#E11D74" class="anim-count-pop">${active}</span> ${active === 1 ? 'thing' : 'things'}</h2>
          ${overdue > 0 ? `<p class="mt-2 font-bold text-lg anim-pulse-soft" style="color:#FF6B6B">⚠ ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue</p>` : ''}
          <button data-act="open-add" class="btn-pop btn-primary mt-5 text-base ${active === 0 ? 'anim-attention' : ''}"><span class="text-2xl leading-none">＋</span> Add something I borrowed</button>
        </div>
      </section>

      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="toggle-pill">
          <button class="${state.modeTab === 'items' ? 'active' : ''}" data-act="set-tab" data-tab="items">Items</button>
          <button class="${state.modeTab === 'people' ? 'active' : ''}" data-act="set-tab" data-tab="people">People</button>
        </div>
        ${state.modeTab === 'items' ? `
          <div class="toggle-pill lavender" style="text-transform:uppercase;">
            ${filterTabs.map((f) => `<button class="${state.filter === f ? 'active' : ''}" data-act="set-filter" data-filter="${f}" style="font-size:.7rem; letter-spacing:.08em;">${f}</button>`).join('')}
          </div>` : ''}
      </div>

      ${state.modeTab === 'items'
        ? (visible.length === 0
            ? emptyStateHtml(state.filter)
            : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">${visible.map((i, idx) => itemBubbleHtml(i, 'borrowed', idx)).join('')}</div>`)
        : (people.length === 0
            ? emptyStateHtml('active')
            : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">${people.map((p, idx) => personBubbleHtml(p, idx)).join('')}</div>`)}`
  } else {
    // dashboardMode === 'lent'
    const items = myLent
    const visible = state.filter === 'all' ? items : state.filter === 'returned' ? items.filter((i) => i.status === 'returned') : items.filter((i) => i.status !== 'returned')
    const overdue = items.filter((i) => i.status !== 'returned' && timeStatus(i) === 'overdue').length
    const active = items.filter((i) => i.status !== 'returned').length

    body = `
      <section class="card-bubble p-6 sm:p-8 mb-6 relative overflow-hidden">
        <div class="absolute -right-6 -top-6 w-32 h-32 bg-pastel-sky/70 blob anim-bob" style="z-index:0"></div>
        <div class="absolute -right-16 top-20 w-20 h-20 bg-pastel-pink/70 squish anim-bob" style="z-index:0; animation-delay:.8s"></div>
        <div class="relative" style="z-index:1">
          <p class="text-pastel-lilac font-semibold mb-1">friends are borrowing</p>
          <h2 class="text-3xl sm:text-4xl font-bold" style="color:#292524"><span style="color:#E11D74" class="anim-count-pop">${active}</span> ${active === 1 ? 'thing' : 'things'} from you</h2>
          ${overdue > 0 ? `<p class="mt-2 font-bold text-lg anim-pulse-soft" style="color:#FF6B6B">⚠ ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue</p>` : ''}
          ${state.friends.length === 0 ? `<button data-act="open-friends" class="btn-pop btn-primary mt-5 text-base"><span class="text-xl">👯</span> Add a friend</button>` : ''}
        </div>
      </section>

      <div class="flex flex-wrap items-center justify-end gap-3 mb-6">
        <div class="toggle-pill lavender" style="text-transform:uppercase;">
          ${filterTabs.map((f) => `<button class="${state.filter === f ? 'active' : ''}" data-act="set-filter" data-filter="${f}" style="font-size:.7rem; letter-spacing:.08em;">${f}</button>`).join('')}
        </div>
      </div>

      ${visible.length === 0
        ? emptyStateHtml(state.filter === 'returned' ? 'returned' : 'lent')
        : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">${visible.map((i, idx) => itemBubbleHtml(i, 'lent', idx)).join('')}</div>`}`
  }

  return `
    ${header()}
    <main class="flex-1 px-4 sm:px-8 pb-20">
      <div class="max-w-6xl mx-auto">
        <div class="flex justify-center mb-6">
          <div class="toggle-pill">
            <button class="${state.dashboardMode === 'borrowed' ? 'active' : ''}" data-act="set-dashmode" data-mode="borrowed" style="padding-left:1.25rem; padding-right:1.25rem;">I borrowed</button>
            <button class="${state.dashboardMode === 'lent' ? 'active' : ''}" data-act="set-dashmode" data-mode="lent" style="padding-left:1.25rem; padding-right:1.25rem;">I lent</button>
          </div>
        </div>
        ${body}
      </div>
    </main>`
}

function viewPerson(name) {
  const me = state.session.user.id
  const personItems = state.items
    .filter((i) => i.user_id === me && i.borrowed_from === name)
    .sort((a, b) => {
      const aA = a.status !== 'returned', bA = b.status !== 'returned'
      if (aA !== bA) return aA ? -1 : 1
      return a.due_date.localeCompare(b.due_date)
    })
  const active = personItems.filter((i) => i.status !== 'returned')
  const overdue = active.filter((i) => timeStatus(i) === 'overdue').length

  return `
    ${header()}
    <main class="flex-1 px-4 sm:px-8 pb-20">
      <div class="max-w-6xl mx-auto">
        <a href="#/" data-act="go-home" class="inline-flex items-center gap-2 mb-4 text-pastel-lilac font-semibold transition" style="text-decoration:none">← back</a>
        <section class="card-bubble p-6 sm:p-8 mb-6 relative overflow-hidden">
          <div class="absolute -right-6 -top-8 w-32 h-32 bg-pastel-pink/60 blob anim-bob" style="z-index:0"></div>
          <div class="relative" style="z-index:1">
            <p class="text-pastel-lilac font-semibold mb-1">borrowed from</p>
            <h2 class="text-3xl sm:text-4xl font-bold" style="color:#292524">${escapeHtml(name)}</h2>
            <p class="mt-2 font-medium" style="color:#44403c">
              ${active.length} active
              ${overdue > 0 ? `<span class="ml-3 font-bold" style="color:#FF6B6B">· ${overdue} overdue</span>` : ''}
            </p>
            <button data-act="open-add" data-default-person="${escapeHtml(name)}" class="btn-pop btn-primary mt-4"><span class="text-xl leading-none">＋</span> Borrow another from ${escapeHtml(name)}</button>
          </div>
        </section>

        ${personItems.length === 0
          ? `<div class="card-bubble p-10 text-center"><div class="text-5xl mb-3">🤷</div><p class="text-pastel-lilac font-semibold">no items from ${escapeHtml(name)} (yet)</p></div>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">${personItems.map((i, idx) => itemBubbleHtml(i, 'borrowed', idx)).join('')}</div>`}
      </div>
    </main>`
}

// ─── modals ─────────────────────────────────────────────────────────
const PRESET_DURATIONS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '2 months', days: 60 },
  { label: '3 months', days: 90 },
]
const COLORS = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#A0E7E5', '#BDB2FF', '#FFC8DD', '#3a2f4a', '#FFFFFF']

const addState = {
  borrowedFrom: '', description: '', brand: '', color: '', place: '',
  borrowDate: '', duration: 14, customDuration: '', unit: 'weeks',
  lenderId: null, // optional friend id
  err: null,
}

function calcAddDueDate() {
  const base = new Date(addState.borrowDate || todayISO())
  if (addState.customDuration) {
    const n = parseInt(addState.customDuration, 10)
    if (!Number.isNaN(n) && n > 0) {
      if (addState.unit === 'days') return fmt(addDays(base, n))
      if (addState.unit === 'weeks') return fmt(addWeeks(base, n))
      return fmt(addMonths(base, n))
    }
  }
  return fmt(addDays(base, addState.duration))
}

function modalAddHtml() {
  const due = calcAddDueDate()
  return `
    <div class="modal-backdrop" data-act="modal-backdrop">
      <div class="modal-card anim-pop card-bubble" style="background:rgba(255,255,255,0.95)">
        <div style="position:sticky; top:0; background:rgba(255,255,255,0.95); backdrop-filter:blur(6px); border-radius:2.5rem 2.5rem 0 0; padding:1.5rem 2rem 1rem; display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid rgba(255,200,221,0.3); z-index:1">
          <h2 class="text-2xl font-bold" style="color:#E11D74">Add a borrowed item</h2>
          <button data-act="close-modal" type="button" class="w-9 h-9 rounded-full bg-pastel-pink/40 hover:bg-pastel-pink font-bold transition" style="border:0; cursor:pointer; color:#9F1239">✕</button>
        </div>
        <form id="add-form" class="p-6 sm:p-8 space-y-5">
          <div>
            <label class="label-soft block mb-1">what did you borrow? *</label>
            <input class="input-bubble" name="description" placeholder="e.g. red carpet dress" value="${escapeHtml(addState.description)}" required autofocus />
          </div>

          <div>
            <label class="label-soft block mb-1">borrowed from *</label>
            ${state.friends.length > 0 ? `
              <div class="flex gap-2 flex-wrap mb-2">
                ${state.friends.map((f) => `<button type="button" data-act="pick-lender" data-id="${f.id}" data-name="${escapeHtml(f.name)}" class="rounded-full px-3 py-1.5 text-sm font-semibold border-2 transition flex items-center gap-1.5" style="cursor:pointer; font-family:inherit; ${addState.lenderId === f.id ? 'background:#BDB2FF; color:white; border-color:#BDB2FF;' : 'background:white; color:#7C7CC7; border-color:#BDB2FF;'}"><span style="font-size:.85em;">👯</span>${escapeHtml(f.name)}</button>`).join('')}
                ${addState.lenderId ? `<button type="button" data-act="pick-lender" data-id="" data-name="" class="rounded-full px-3 py-1.5 text-xs font-semibold transition" style="cursor:pointer; font-family:inherit; background:transparent; color:#CDB4DB; border:0;">clear</button>` : ''}
              </div>
            ` : ''}
            <input class="input-bubble" name="borrowed_from" placeholder="who lent it to you?" value="${escapeHtml(addState.borrowedFrom)}" required />
            ${addState.lenderId ? `<p class="text-xs text-pastel-lavender mt-1.5 font-semibold">🔗 they'll see this in their "Lent" tab</p>` : state.friends.length === 0 ? `<p class="text-xs text-pastel-lilac mt-1.5">tip: <button type="button" data-act="open-friends" style="background:none; border:0; padding:0; color:#BDB2FF; font-weight:700; cursor:pointer; font-family:inherit;">add a friend</button> to share this entry with them</p>` : ''}
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label-soft block mb-1">brand</label>
              <input class="input-bubble" name="brand" placeholder="optional" value="${escapeHtml(addState.brand)}" />
            </div>
            <div>
              <label class="label-soft block mb-1">place</label>
              <input class="input-bubble" name="place" placeholder="where you got it" value="${escapeHtml(addState.place)}" />
            </div>
          </div>
          <div>
            <label class="label-soft block mb-2">color</label>
            <div class="flex gap-2 flex-wrap">
              ${COLORS.map((c) => `<button type="button" data-act="pick-color" data-color="${c}" class="w-9 h-9 rounded-full border-2 transition-transform" style="background:${c}; border-color:${addState.color === c ? '#CDB4DB' : 'white'}; transform:${addState.color === c ? 'scale(1.1)' : 'scale(1)'}; cursor:pointer;"></button>`).join('')}
              <button type="button" data-act="pick-color" data-color="" class="px-3 h-9 rounded-full border-2 text-xs font-semibold transition" style="background:${addState.color === '' ? 'rgba(205,180,219,0.2)' : 'rgba(255,255,255,0.6)'}; border-color:${addState.color === '' ? '#CDB4DB' : 'white'}; cursor:pointer; font-family:inherit;">none</button>
            </div>
          </div>
          <div>
            <label class="label-soft block mb-1">date borrowed</label>
            <input class="input-bubble" type="date" name="borrow_date" value="${escapeHtml(addState.borrowDate || todayISO())}" required />
          </div>
          <div>
            <label class="label-soft block mb-2">borrow for…</label>
            <div class="flex gap-2 flex-wrap mb-3">
              ${PRESET_DURATIONS.map((p) => `<button type="button" data-act="pick-duration" data-days="${p.days}" class="rounded-full px-4 py-2 text-sm font-semibold border-2 transition" style="cursor:pointer; font-family:inherit; ${(!addState.customDuration && addState.duration === p.days) ? 'background:#FFAFCC; color:white; border-color:#FFAFCC; box-shadow:0 6px 0 rgba(0,0,0,0.08), 0 14px 30px -8px rgba(0,0,0,0.18);' : 'background:rgba(255,255,255,0.7); color:#CDB4DB; border-color:white;'}">${p.label}</button>`).join('')}
            </div>
            <div class="flex gap-2">
              <input class="input-bubble flex-1" type="number" min="1" name="custom_duration" placeholder="custom" value="${escapeHtml(addState.customDuration)}" />
              <select class="input-bubble" name="unit" style="width:8rem">
                <option value="days" ${addState.unit === 'days' ? 'selected' : ''}>days</option>
                <option value="weeks" ${addState.unit === 'weeks' ? 'selected' : ''}>weeks</option>
                <option value="months" ${addState.unit === 'months' ? 'selected' : ''}>months</option>
              </select>
            </div>
            <p class="text-xs text-pastel-lilac mt-2 font-medium">due back by <span class="font-bold" style="color:#E11D74">${due}</span></p>
          </div>
          ${addState.err ? `<div class="rounded-2xl bg-status-due/70 border-2 border-status-dueDeep/40 px-4 py-3 text-sm font-medium" style="color:#881337">${escapeHtml(addState.err)}</div>` : ''}
          <div class="flex gap-3 pt-2">
            <button type="button" data-act="close-modal" class="btn-pop btn-secondary flex-1">Cancel</button>
            <button type="submit" class="btn-pop btn-primary flex-1" ${state.busy ? 'disabled' : ''}>${state.busy ? 'saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>`
}

const itemModalState = { extendDays: 7, showExtend: false, confirmDelete: false }

function modalItemHtml() {
  const item = state.items.find((i) => i.id === state.modal.id)
  if (!item) { state.modal = null; return '' }
  const cls = bubbleClasses(item)
  const newDue = fmt(addDays(new Date(item.due_date), itemModalState.extendDays))
  const me = state.session.user.id
  const amBorrower = item.user_id === me
  const amLender = item.lender_id === me
  const borrowerName = state.profiles[item.user_id]?.name || 'someone'

  return `
    <div class="modal-backdrop" data-act="modal-backdrop">
      <div class="modal-card anim-pop">
        <div class="${cls.bg} px-6 sm:px-8 pt-6 pb-5 relative" style="border-radius:2.5rem 2.5rem 0 0;">
          <button data-act="close-modal" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/60 hover:bg-white font-bold transition" style="border:0; cursor:pointer; color:#44403c">✕</button>
          <div class="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${cls.chipBg} ${cls.chipText} mb-2">${statusLabel(item.status)}</div>
          <h2 class="text-2xl font-bold leading-tight" style="color:#292524">${escapeHtml(item.description)}</h2>
          <div class="mt-1" style="color:#44403c">
            ${amLender && !amBorrower
              ? `borrowed by <span class="font-semibold">${escapeHtml(borrowerName)}</span>`
              : `from <span class="font-semibold">${escapeHtml(item.borrowed_from)}</span>`}
          </div>
        </div>
        <div class="p-6 sm:p-8 space-y-4">
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${item.brand ? `<div><div class="label-soft text-xs">brand</div><div class="font-semibold" style="color:#292524">${escapeHtml(item.brand)}</div></div>` : ''}
            ${item.color ? `<div><div class="label-soft text-xs">color</div><div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full border-2 border-white shadow-soft" style="background:${escapeHtml(item.color)}"></div><span class="font-semibold" style="color:#292524">${escapeHtml(item.color)}</span></div></div>` : ''}
            ${item.place ? `<div><div class="label-soft text-xs">place</div><div class="font-semibold" style="color:#292524">${escapeHtml(item.place)}</div></div>` : ''}
            <div><div class="label-soft text-xs">borrowed</div><div class="font-semibold" style="color:#292524">${escapeHtml(item.borrow_date)}</div></div>
            <div><div class="label-soft text-xs">due</div><div class="font-semibold" style="color:#292524">${escapeHtml(item.due_date)}</div></div>
            <div class="col-span-2"><div class="label-soft text-xs">timer</div><div class="font-bold" style="color:#E11D74">${escapeHtml(dueLabel(item))}</div></div>
            ${item.lender_id && amBorrower ? `<div class="col-span-2"><div class="label-soft text-xs">linked friend</div><div class="font-semibold" style="color:#292524">🔗 ${escapeHtml(state.profiles[item.lender_id]?.name || 'friend')}</div></div>` : ''}
          </div>

          ${itemModalState.showExtend ? `
            <div class="space-y-3 pt-2">
              <div>
                <label class="label-soft block mb-2">extend by</label>
                <div class="flex gap-2 flex-wrap">
                  ${[3, 7, 14, 30].map((d) => `<button type="button" data-act="set-extend-days" data-days="${d}" class="rounded-full px-4 py-2 text-sm font-semibold border-2 transition" style="cursor:pointer; font-family:inherit; ${itemModalState.extendDays === d ? 'background:#BDB2FF; color:white; border-color:#BDB2FF; box-shadow:0 6px 0 rgba(0,0,0,0.08), 0 14px 30px -8px rgba(0,0,0,0.18);' : 'background:white; color:#CDB4DB; border-color:white;'}">${d} days</button>`).join('')}
                </div>
                <p class="text-xs text-pastel-lilac mt-3 font-medium">new due date <span class="font-bold" style="color:#E11D74">${newDue}</span></p>
              </div>
              <div class="flex gap-2">
                <button type="button" class="btn-pop btn-secondary flex-1" data-act="cancel-extend">Back</button>
                <button type="button" class="btn-pop btn-primary flex-1" data-act="confirm-extend" data-id="${item.id}" data-due="${newDue}" ${state.busy ? 'disabled' : ''}>${state.busy ? 'saving…' : 'Confirm extend'}</button>
              </div>
            </div>
          ` : itemModalState.confirmDelete ? `
            <div class="space-y-3 pt-2">
              <p class="text-sm font-medium" style="color:#292524">Delete this entry forever? This can't be undone.</p>
              <div class="flex gap-2">
                <button class="btn-pop btn-secondary flex-1" data-act="cancel-delete">Cancel</button>
                <button class="btn-pop btn-coral flex-1" data-act="confirm-delete" data-id="${item.id}" ${state.busy ? 'disabled' : ''}>${state.busy ? 'deleting…' : 'Delete'}</button>
              </div>
            </div>
          ` : `
            <div class="space-y-2 pt-2">
              <button class="btn-pop btn-sky w-full" style="justify-content:flex-start" data-act="set-status" data-id="${item.id}" data-status="returning" ${item.status === 'returned' || state.busy ? 'disabled' : ''}>
                <span class="text-xl">📦</span><span style="flex:1; text-align:left">${amLender && !amBorrower ? 'Mark as on its way back' : 'Returning it now'}</span>
              </button>
              <button class="btn-pop btn-mint w-full" style="justify-content:flex-start" data-act="set-status" data-id="${item.id}" data-status="returned" ${item.status === 'returned' || state.busy ? 'disabled' : ''}>
                <span class="text-xl">✅</span><span style="flex:1; text-align:left">${amLender && !amBorrower ? 'Got it back!' : 'Returned!'}</span>
              </button>
              ${amBorrower ? `
                <button class="btn-pop btn-secondary w-full" style="justify-content:flex-start" data-act="show-extend" ${state.busy ? 'disabled' : ''}>
                  <span class="text-xl">⏳</span><span style="flex:1; text-align:left">Extend the time</span>
                </button>` : ''}
              ${item.status === 'returning' ? `
                <button class="btn-pop btn-secondary w-full" style="justify-content:flex-start" data-act="set-status" data-id="${item.id}" data-status="borrowed" ${state.busy ? 'disabled' : ''}>
                  <span class="text-xl">↩︎</span><span style="flex:1; text-align:left">Still ${amLender && !amBorrower ? 'lent out' : 'borrowing'}</span>
                </button>` : ''}
              ${amBorrower ? `<button class="w-full text-pastel-lilac/80 hover:text-rose-500 text-sm font-semibold py-2 transition" style="background:transparent; border:0; cursor:pointer; font-family:inherit" data-act="show-delete" ${state.busy ? 'disabled' : ''}>delete this entry</button>` : ''}
            </div>`}
        </div>
      </div>
    </div>`
}

function modalFriendsHtml() {
  return `
    <div class="modal-backdrop" data-act="modal-backdrop">
      <div class="modal-card anim-pop card-bubble" style="background:rgba(255,255,255,0.95)">
        <div style="position:sticky; top:0; background:rgba(255,255,255,0.95); backdrop-filter:blur(6px); border-radius:2.5rem 2.5rem 0 0; padding:1.5rem 2rem 1rem; display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid rgba(189,178,255,0.3); z-index:1">
          <div>
            <h2 class="text-2xl font-bold" style="color:#7C7CC7">Friends</h2>
            <p class="text-xs text-pastel-lilac mt-0.5">connect by email so they can see what they lent you</p>
          </div>
          <button data-act="close-modal" type="button" class="w-9 h-9 rounded-full bg-pastel-lavender/30 hover:bg-pastel-lavender/60 font-bold transition" style="border:0; cursor:pointer; color:#7C7CC7">✕</button>
        </div>

        <div class="p-6 sm:p-8 space-y-5">
          <form id="friend-form" class="space-y-3">
            <label class="label-soft block">add a friend by email</label>
            <div class="flex gap-2">
              <input class="input-bubble flex-1" name="email" type="email" placeholder="friend@example.com" autocomplete="off" required />
              <button type="submit" class="btn-pop btn-primary" ${state.busy ? 'disabled' : ''} style="white-space:nowrap">${state.busy ? '…' : '+ Add'}</button>
            </div>
            ${state.friendErr ? `<div class="rounded-2xl bg-status-due/70 border-2 border-status-dueDeep/40 px-4 py-3 text-sm font-medium" style="color:#881337">${escapeHtml(state.friendErr)}</div>` : ''}
            ${state.friendInfo ? `<div class="rounded-2xl bg-status-ok/70 border-2 border-status-okDeep/40 px-4 py-3 text-sm font-medium" style="color:#064E3B">${escapeHtml(state.friendInfo)}</div>` : ''}
            <p class="text-xs text-pastel-lilac">your friend needs to have signed up for Borrowable first</p>
          </form>

          <div>
            <div class="label-soft mb-3">your friends ${state.friends.length > 0 ? `· ${state.friends.length}` : ''}</div>
            ${state.friends.length === 0 ? `
              <div class="text-center py-8">
                <div class="text-5xl mb-2 anim-wiggle inline-block">👯</div>
                <p class="text-pastel-lilac font-semibold">no friends added yet</p>
              </div>
            ` : `
              <div class="space-y-2">
                ${state.friends.map((f) => {
                  const hue = hashHue(f.name)
                  const ring = `hsl(${hue}, 65%, 70%)`
                  return `
                    <div class="flex items-center gap-3 p-3 rounded-2xl bg-white/70 border-2 border-white shadow-soft anim-pop">
                      <div class="w-10 h-10 squish flex items-center justify-center text-sm font-bold text-white shadow-soft shrink-0" style="background:${ring}">${escapeHtml(initials(f.name))}</div>
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold truncate" style="color:#292524">${escapeHtml(f.name)}</div>
                        <div class="text-xs text-pastel-lilac truncate">${escapeHtml(f.email || '')}</div>
                      </div>
                      <button data-act="remove-friend" data-id="${f.id}" data-name="${escapeHtml(f.name)}" class="w-8 h-8 rounded-full bg-pastel-coral/40 hover:bg-pastel-coral text-rose-700 font-bold transition shrink-0" style="border:0; cursor:pointer; font-family:inherit">✕</button>
                    </div>`
                }).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    </div>`
}

// ─── render ────────────────────────────────────────────────────────
// Uses morphdom to diff the new tree against the existing DOM, so unchanged
// elements (e.g. item cards underneath an open modal) keep their identity and
// don't restart their CSS animations. This is what kills the "whole window
// shakes when I click a color" bug.
function render() {
  let html = ''
  if (state.loading) {
    html = `<div style="min-height:100dvh" class="flex items-center justify-center"><div class="anim-pulse-soft" style="width:64px; height:64px; background:#FFAFCC; border-radius: 40% 60% 55% 45% / 50% 45% 55% 50%; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.18), inset 0 -6px 0 rgba(0,0,0,0.06);"></div></div>`
  } else if (!state.session) {
    html = viewLogin()
  } else if (state.view === 'dashboard') {
    html = viewDashboard()
  } else if (state.view?.type === 'person') {
    html = viewPerson(state.view.name)
  }

  if (state.modal?.type === 'add') html += modalAddHtml()
  else if (state.modal?.type === 'item') html += modalItemHtml()
  else if (state.modal?.type === 'friends') html += modalFriendsHtml()

  // Build a target tree with the same id/style as #root so morphdom can
  // morph the existing root in place rather than replacing it.
  const target = document.createElement('div')
  target.id = 'root'
  target.style.cssText = 'position:relative; z-index:1;'
  target.innerHTML = html

  morphdom(root, target, {
    onBeforeElUpdated(fromEl, toEl) {
      // If the rendered HTML for this element didn't change at all, skip
      // touching the DOM node entirely. This is the cheap escape hatch that
      // keeps idle animations smooth when only a sibling changed.
      if (fromEl.isEqualNode(toEl)) return false
      // Don't clobber the value of an input that the user is typing into.
      if (
        fromEl.tagName === 'INPUT' &&
        document.activeElement === fromEl &&
        fromEl.type !== 'submit' &&
        fromEl.type !== 'button'
      ) {
        // sync the new attribute set but keep the live value
        const liveValue = fromEl.value
        // let morphdom apply attribute updates...
        setTimeout(() => { fromEl.value = liveValue }, 0)
      }
      return true
    },
  })

  attachListeners()
}

// ─── event delegation ──────────────────────────────────────────────
function attachListeners() {
  const authForm = $('auth-form')
  if (authForm) authForm.onsubmit = handleAuth

  const addForm = $('add-form')
  if (addForm) {
    // Use the form's oninput property (not addEventListener) so morphdom
    // re-renders don't accumulate stacked listeners.
    addForm.oninput = () => {
      addState.description     = addForm.description?.value     ?? addState.description
      addState.borrowedFrom    = addForm.borrowed_from?.value   ?? addState.borrowedFrom
      addState.brand           = addForm.brand?.value           ?? addState.brand
      addState.place           = addForm.place?.value           ?? addState.place
      addState.borrowDate      = addForm.borrow_date?.value     ?? addState.borrowDate
      addState.customDuration  = addForm.custom_duration?.value ?? addState.customDuration
      addState.unit            = addForm.unit?.value            ?? addState.unit
      // If the user manually edits borrowed_from to something other than the
      // linked friend's name, clear the link so we don't tag the wrong lender.
      if (addState.lenderId && addForm.borrowed_from?.value !== state.profiles[addState.lenderId]?.name) {
        addState.lenderId = null
      }
      // Update only the due-date label live — no full re-render needed.
      const dueP = root.querySelector('#add-form p.text-xs.text-pastel-lilac span')
      if (dueP) dueP.textContent = calcAddDueDate()
    }
    addForm.onsubmit = handleAddSubmit
  }

  const friendForm = $('friend-form')
  if (friendForm) friendForm.onsubmit = handleAddFriend

  root.onclick = onClickRoot
}

async function onClickRoot(e) {
  const target = e.target.closest('[data-act]')
  if (!target) return
  const act = target.dataset.act

  if (act === 'login-mode') {
    state.loginMode = target.dataset.mode
    state.loginErr = null; state.loginInfo = null
    render(); return
  }
  if (act === 'sign-out') { await handleSignOut(); return }
  if (act === 'go-home') {
    e.preventDefault()
    location.hash = '#/'
    return
  }
  if (act === 'go-person') return
  if (act === 'open-add') {
    e.preventDefault?.()
    Object.assign(addState, {
      description: '', brand: '', color: '', place: '',
      borrowDate: todayISO(), duration: 14, customDuration: '', unit: 'weeks',
      err: null, lenderId: null,
      borrowedFrom: target.dataset.defaultPerson || '',
    })
    state.modal = { type: 'add' }
    render(); return
  }
  if (act === 'open-friends') {
    state.modal = { type: 'friends' }
    state.friendErr = null; state.friendInfo = null
    render(); return
  }
  if (act === 'close-modal' || act === 'modal-backdrop') {
    if (act === 'modal-backdrop' && e.target !== target) return
    state.modal = null
    Object.assign(itemModalState, { extendDays: 7, showExtend: false, confirmDelete: false })
    state.friendErr = null; state.friendInfo = null
    render(); return
  }
  if (act === 'set-tab') { state.modeTab = target.dataset.tab; render(); return }
  if (act === 'set-filter') { state.filter = target.dataset.filter; render(); return }
  if (act === 'set-dashmode') { state.dashboardMode = target.dataset.mode; state.filter = 'active'; render(); return }
  if (act === 'open-item') { state.modal = { type: 'item', id: target.dataset.id }; Object.assign(itemModalState, { extendDays: 7, showExtend: false, confirmDelete: false }); render(); return }

  if (act === 'pick-color') { addState.color = target.dataset.color; render(); return }
  if (act === 'pick-duration') { addState.duration = parseInt(target.dataset.days, 10); addState.customDuration = ''; render(); return }
  if (act === 'pick-lender') {
    const id = target.dataset.id || null
    const name = target.dataset.name || ''
    addState.lenderId = id
    if (id) addState.borrowedFrom = name
    render()
    return
  }

  if (act === 'set-status') {
    const newStatus = target.dataset.status
    state.busy = true; render()
    try {
      await updateStatus(target.dataset.id, newStatus)
      state.modal = null
      if (newStatus === 'returned') celebrateFromEvent(e)
    } catch (err) { console.error(err); alert(err.message) }
    state.busy = false; render(); return
  }
  if (act === 'show-extend') { itemModalState.showExtend = true; render(); return }
  if (act === 'cancel-extend') { itemModalState.showExtend = false; render(); return }
  if (act === 'set-extend-days') { itemModalState.extendDays = parseInt(target.dataset.days, 10); render(); return }
  if (act === 'confirm-extend') { state.busy = true; render(); try { await extendItem(target.dataset.id, target.dataset.due); state.modal = null; itemModalState.showExtend = false } catch (err) { console.error(err); alert(err.message) } state.busy = false; render(); return }
  if (act === 'show-delete') { itemModalState.confirmDelete = true; render(); return }
  if (act === 'cancel-delete') { itemModalState.confirmDelete = false; render(); return }
  if (act === 'confirm-delete') { state.busy = true; render(); try { await deleteItem(target.dataset.id); state.modal = null; itemModalState.confirmDelete = false } catch (err) { console.error(err); alert(err.message) } state.busy = false; render(); return }

  if (act === 'remove-friend') {
    if (!confirm(`Remove ${target.dataset.name} from your friends?`)) return
    state.busy = true; render()
    try { await removeFriendRpc(target.dataset.id) }
    catch (err) { console.error(err); alert(err.message) }
    state.busy = false; render()
    return
  }
}

async function handleAddSubmit(e) {
  e.preventDefault()
  const f = new FormData(e.target)
  const description = (f.get('description') || '').toString().trim()
  const borrowed_from = (f.get('borrowed_from') || '').toString().trim()
  if (!description || !borrowed_from) { addState.err = 'Please add what you borrowed and who you borrowed it from.'; render(); return }

  const brand = (f.get('brand') || '').toString().trim() || null
  const place = (f.get('place') || '').toString().trim() || null
  const borrow_date = (f.get('borrow_date') || '').toString() || todayISO()
  addState.borrowDate = borrow_date
  addState.customDuration = (f.get('custom_duration') || '').toString()
  addState.unit = (f.get('unit') || 'weeks').toString()
  const due_date = calcAddDueDate()

  state.busy = true; addState.err = null; render()
  try {
    await addItem({
      borrowed_from,
      description,
      brand,
      color: addState.color || null,
      place,
      borrow_date,
      due_date,
      lender_id: addState.lenderId || null,
    })
    state.modal = null
  } catch (err) {
    console.error(err); addState.err = err.message || 'Could not save'
  } finally {
    state.busy = false; render()
  }
}

async function handleAddFriend(e) {
  e.preventDefault()
  const f = new FormData(e.target)
  const email = (f.get('email') || '').toString().trim()
  state.friendErr = null; state.friendInfo = null
  if (!email) return
  state.busy = true; render()
  try {
    const row = await addFriendByEmail(email)
    state.friendInfo = `Added ${row.name || email}!`
    e.target.reset()
    const r = e.target.getBoundingClientRect()
    spawnConfetti(r.left + r.width / 2, r.top + 40)
  } catch (err) {
    console.error(err)
    state.friendErr = err.message || 'Could not add friend'
  } finally {
    state.busy = false; render()
  }
}

// ─── routing (hash-based) ──────────────────────────────────────────
function applyHash() {
  const h = location.hash || '#/'
  const m = h.match(/^#\/person\/(.+)$/)
  if (m) state.view = { type: 'person', name: decodeURIComponent(m[1]) }
  else state.view = 'dashboard'
}

window.addEventListener('hashchange', () => { applyHash(); render() })

// ─── boot ──────────────────────────────────────────────────────────
async function boot() {
  applyHash()
  const { data } = await supabase.auth.getSession()
  state.session = data.session
  if (state.session) {
    await loadProfile()
    await Promise.all([loadItems(), loadFriends()])
  }
  state.loading = false
  render()

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session
    if (session) {
      await loadProfile()
      await Promise.all([loadItems(), loadFriends()])
    } else {
      state.profile = null; state.items = []; state.friends = []; state.profiles = {}
    }
    render()
  })

  setInterval(() => { if (state.session && !state.modal) render() }, 60_000)
}

boot()

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}
