const THEMES = [
  { id: "all", name: "Everything", desc: "The whole catalog. Here are our two highest-scored picks right now." },
  { id: "cozy", name: "Cozy evening", desc: "Low stakes, warm colors, nothing chasing you.",
    game: ["stardew-valley", "Farming, fishing and friendships on your own schedule. Ten years on, still the gold standard for unwinding."],
    app: ["headspace", "Sleepcasts and wind-down sessions turn the last hour of the day into something calmer."] },
  { id: "friends", name: "Play with friends", desc: "Couch or online, best with two or more.",
    game: ["mario-kart-8-deluxe", "Anyone can pick up a controller and be having fun in thirty seconds, and it still rewards the regulars."],
    app: ["discord", "Where the group chat, the voice call and the stream all live. Every co-op night starts here."] },
  { id: "quick", name: "15-minute breaks", desc: "Start, finish a run, get back to work.",
    game: ["balatro", "One run fits in a coffee break and every hand teaches you something. Dangerously easy to say one more."],
    app: ["duolingo", "Five-minute lessons and a streak that actually gets you to show up every day."] },
  { id: "story", name: "Stories that stick", desc: "Writing and worlds you will think about for weeks.",
    game: ["clair-obscur-expedition-33", "A debut RPG with a bold story, gorgeous art and one of the best soundtracks in years."],
    app: ["libby", "Free e-books and audiobooks from your local library. The best stories cost nothing."] },
  { id: "hard", name: "Hard but fair", desc: "You will die a lot. Every death is a lesson.",
    game: ["elden-ring", "The toughest bosses in games, in an open world that lets you leave, level up and come back stronger."] },
  { id: "scary", name: "Lights off", desc: "Tension, dread and a few good jump scares.",
    game: ["resident-evil-4", "The best-paced horror action game around: every room is a puzzle of ammo, space and panic."] },
  { id: "compete", name: "Competitive", desc: "Ranked ladders, esports and bragging rights.",
    game: ["rocket-league", "Free, five minutes a match, and a skill ceiling nobody has reached yet."],
    app: ["steam", "The biggest PC store, and home to most competitive PC games and their communities."] },
  { id: "free", name: "Free and great", desc: "Top quality without paying a thing.",
    game: ["fortnite", "Battle royale, LEGO survival, racing and concerts, all free and on every platform."],
    app: ["blender", "A professional 3D studio used on real films, and it is completely free."] },
  { id: "kids", name: "Kids & family", desc: "Safe, joyful and easy to pick up.",
    game: ["astro-bot", "Pure joy for all ages, packed with ideas and gentle enough for young players."],
    app: ["khan-academy-kids", "Free learning for ages 2 to 8, with no ads and no subscriptions."] },
  { id: "explore", name: "Get lost exploring", desc: "Big worlds, real trails, and the urge to see what is over the hill.",
    game: ["zelda-tears-of-the-kingdom", "Sky, surface and depths, plus building tools that turn every problem into your own invention."],
    app: ["alltrails", "Trail maps, recent condition reports and offline downloads for the real-world version."] },
  { id: "create", name: "Make something", desc: "Build, draw, edit. Leave with something you made.",
    game: ["minecraft", "Still the biggest blank canvas in games. It scales with your ambition."],
    app: ["procreate", "One payment, no subscription, and a brush engine pros use daily."] },
  { id: "focus", name: "Focus & study", desc: "Tools that help you sit down and actually learn.",
    game: ["tetris-effect-connected", "The calmest, most absorbing way to reset your brain between study sessions."],
    app: ["forest", "Plant a tree, put the phone down, keep it alive. The simplest nudge that works."] },
  { id: "organized", name: "Get organized", desc: "Tasks, notes and plans that stay out of your way.",
    app: ["todoist", "Type a task the way you would say it and it lands in the right place on the right day."] },
  { id: "health", name: "Get moving", desc: "Workouts, sleep and games that make you sweat.",
    game: ["ring-fit-adventure", "A real workout disguised as an adventure. Squats have never been this fun."],
    app: ["strava", "The social feed that gets you out of the door, with routes from people nearby."] },
  { id: "money", name: "Money", desc: "Budget, save, split and send.",
    app: ["ynab", "The budgeting method that changes habits instead of just tracking them."] },
  { id: "travel", name: "Travel", desc: "Get there, get around, understand the menu.",
    app: ["google-maps", "Directions, transit, reviews and offline maps, in nearly every city on earth."] },
  { id: "watch", name: "Watch & listen", desc: "Music, shows, podcasts and films.",
    app: ["spotify", "Music, podcasts and audiobooks on every device, with the best recommendations."] },
  { id: "social", name: "Stay in touch", desc: "Chats, calls and your people.",
    app: ["signal", "Private chats and calls with no ads. The one we trust most."] },
  { id: "safe", name: "Privacy & security", desc: "Passwords, VPNs and private browsing.",
    app: ["bitwarden", "Unlimited passwords on unlimited devices for free, and fully open source."] },
];

const GAME_PLAT = { "5": ["ps5", "playstation"], "4": ["ps4", "playstation"], X: ["xsx", "xbox"], O: ["xone", "xbox"], "2": ["sw2", "nintendo"], S: ["sw", "nintendo"], P: ["pc"], A: ["mac"], M: ["mobile", "ios", "android"] };
const GAME_PLAT_LABEL = { "5": "PS5", "4": "PS4", X: "Xbox Series X|S", O: "Xbox One", "2": "Switch 2", S: "Switch", P: "PC", A: "Mac", M: "Mobile" };
const APP_PLAT = { i: ["ios", "mobile"], a: ["android", "mobile"], w: ["web"], m: ["mac"], p: ["pc", "win"] };
const APP_PLAT_LABEL = { i: "iPhone & iPad", a: "Android", w: "Web", m: "Mac", p: "Windows" };
const PLAT_CHIPS = {
  game: [["ps5", "PS5"], ["ps4", "PS4"], ["xsx", "Xbox Series X|S"], ["xone", "Xbox One"], ["sw2", "Switch 2"], ["sw", "Switch"], ["pc", "PC"], ["mac", "Mac"], ["mobile", "Mobile"]],
  app: [["ios", "iPhone & iPad"], ["android", "Android"], ["web", "Web"], ["mac", "Mac"], ["win", "Windows"]],
  all: [["playstation", "PlayStation"], ["xbox", "Xbox"], ["nintendo", "Nintendo Switch"], ["pc", "PC / Windows"], ["mac", "Mac"], ["ios", "iPhone & iPad"], ["android", "Android"], ["web", "Web"]],
};
const PLAT_NAME = Object.fromEntries([...PLAT_CHIPS.game, ...PLAT_CHIPS.app, ...PLAT_CHIPS.all]);
const STATUS = { wish: "Wishlist", backlog: "Backlog", playing: "Playing", done: "Finished", dropped: "Dropped" };
const APP_STATUS = { wish: "Want to try", playing: "Using", dropped: "Stopped using" };
const LIB_FILTERS = [["all", "Everything"], ["wish", "Wishlist"], ["backlog", "Backlog"], ["playing", "Playing / using"], ["done", "Finished"], ["dropped", "Dropped"]];
const GIFTS = [
  { id: "psn", name: "PlayStation Store", sub: "PS5 and PS4 games, add-ons, PS Plus", c: ["#2a4fd6", "#0b1f6b"], amounts: [10, 25, 50, 100] },
  { id: "xbox", name: "Xbox", sub: "Games, Game Pass and add-ons", c: ["#2f8f3a", "#12451a"], amounts: [10, 25, 50, 100] },
  { id: "eshop", name: "Nintendo eShop", sub: "Switch 2 and Switch games", c: ["#d9433c", "#7a1512"], amounts: [20, 35, 50] },
  { id: "steam", name: "Steam Wallet", sub: "PC games and in-game items", c: ["#2c4a6b", "#10202f"], amounts: [5, 10, 20, 50, 100] },
  { id: "apple", name: "Apple Gift Card", sub: "App Store apps, games, music, iCloud+", c: ["#5a6075", "#1f2230"], amounts: [10, 25, 50, 100] },
  { id: "gplay", name: "Google Play", sub: "Android apps, games and books", c: ["#1f8e6e", "#0d4436"], amounts: [10, 25, 50, 100] },
  { id: "roblox", name: "Roblox", sub: "Robux and Roblox Premium", c: ["#c7372f", "#431210"], amounts: [10, 25, 50] },
  { id: "spotify", name: "Spotify", sub: "Months of Spotify Premium", c: ["#1d9f53", "#0b3d20"], amounts: [10, 30, 60] },
  { id: "loadout", name: "Loadout Gift Card", sub: "Anything in the Loadout store", c: ["#2b44e8", "#0f1a6e"], amounts: [10, 25, 50, 100] },
];
const PATTERNS = [
  "repeating-linear-gradient(45deg, rgba(255,255,255,.14) 0 10px, transparent 10px 22px)",
  "radial-gradient(rgba(255,255,255,.22) 2px, transparent 2.6px) 0 0 / 16px 16px",
  "linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px) 0 0 / 18px 18px",
  "repeating-radial-gradient(circle at 80% 15%, rgba(255,255,255,.16) 0 6px, transparent 6px 16px)",
];
const PRO_DISCOUNT = 0.10;
const PRO_GATED = new Set(["deals", "gifts", "library"]);

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = n => "$" + n.toFixed(2);
const round2 = n => Math.round(n * 100) / 100;
function hash(s) { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; }
function loadJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

/* ---------- Catalog ---------- */
const ITEMS = [];
const rows = raw => raw.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
for (const line of rows(GAMES_RAW)) {
  const [name, maker, year, genre, plat, price, score, themes, blurb, review, pros, cons] = line.split("|");
  const id = slug(name), h = hash(id), p = parseFloat(price);
  const deal = p > 0 && h % 10 < 3 ? [20, 25, 33, 40, 50, 60][(h >>> 4) % 6] : 0;
  const codes = plat.split("");
  ITEMS.push({ id, h, kind: "game", name, maker, year: +year, cat: genre, codes, pk: new Set(codes.flatMap(c => GAME_PLAT[c] || [])),
    platLabels: codes.map(c => GAME_PLAT_LABEL[c]), price: p, deal, score: +score, themes: themes.split(" "), blurb, review,
    pros: pros.split(";"), cons: cons ? cons.split(";") : [] });
}
for (const line of rows(APPS_RAW)) {
  const [name, maker, cat, plat, price, score, themes, blurb, review, pros, cons] = line.split("|");
  const id = slug(name), h = hash(id), codes = plat.split("");
  const m = price.match(/^\$(\d+(?:\.\d+)?)/);
  ITEMS.push({ id, h, kind: "app", name, maker, year: 0, cat, codes, pk: new Set(codes.flatMap(c => APP_PLAT[c] || [])),
    platLabels: codes.map(c => APP_PLAT_LABEL[c]), priceText: price, priceNum: /^free/i.test(price) ? 0 : m ? +m[1] : 5,
    score: +score, themes: themes.split(" "), blurb, review, pros: pros.split(";"), cons: cons ? cons.split(";") : [] });
}
const ADV = {};
for (const line of rows(ADV_GAMES_RAW)) {
  const f = line.split("|");
  ADV[slug(f[0])] = { scores: [["Gameplay", +f[1]], ["Story", +f[2]], ["Visuals", +f[3]], ["Audio", +f[4]], ["Performance", +f[5]], ["Value", +f[6]]],
    facts: [["Length", f[7]], ["Difficulty", f[8]], ["Multiplayer", f[9]]], bestFor: f[10], skipIf: f[11], deep: f[12] };
}
for (const line of rows(ADV_APPS_RAW)) {
  const f = line.split("|");
  ADV[slug(f[0])] = { scores: [["Features", +f[1]], ["Ease of use", +f[2]], ["Design", +f[3]], ["Value", +f[4]], ["Privacy", +f[5]]],
    facts: [], bestFor: f[6], skipIf: f[7], deep: f[8] };
}
const STORE_ITEMS = (STORE && STORE.items) || {};
const SOURCE_NAME = { steam: "Steam", appstore: "App Store", gplay: "Google Play", psn: "PlayStation Store" };
function playerSources(i) {
  const src = (STORE_ITEMS[i.id] || {}).sources || {};
  const out = [];
  for (const [k, v] of Object.entries(src)) {
    if (!v) continue;
    if (k === "steam" && v.total > 0) out.push({ k, v, value5: v.pct / 20, count: v.total });
    else if (v.rating > 0 && v.count > 0) out.push({ k, v, value5: v.rating, count: v.count });
  }
  return out.sort((a, b) => b.count - a.count);
}
const compact = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n);
for (const i of ITEMS) {
  i.players = playerSources(i);
  const tot = i.players.reduce((a, p) => a + p.count, 0);
  i.playerScore = tot ? i.players.reduce((a, p) => a + p.value5 * p.count, 0) / tot : null;
  i.hay = [i.name, i.maker, i.cat, i.kind === "game" ? "game games" : "app apps", ...i.platLabels, i.blurb,
    ...i.themes.map(t => (THEMES.find(x => x.id === t) || { name: "" }).name), i.price === 0 ? "free" : "", /^free/i.test(i.priceText || "") ? "free" : ""]
    .join(" ").toLowerCase();
}
const BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));
const salePrice = i => i.deal ? round2(i.price * (1 - i.deal / 100)) : i.price;
const proPrice = i => round2(salePrice(i) * (1 - PRO_DISCOUNT));
const sortPrice = i => i.kind === "game" ? salePrice(i) : i.priceNum;

/* ---------- State ---------- */
const prefs = loadJSON("loadout.prefs", {});
const view = {
  tab: "discover", kind: ["all", "game", "app"].includes(prefs.kind) ? prefs.kind : "all", plat: "any", cat: "all",
  theme: THEME_BY_ID[prefs.theme] ? prefs.theme : "all", sort: prefs.sort || "score", q: "", limit: 36,
  libFilter: "all", dtab: "overview", pendingTab: null, giftAmt: {}, lastOrder: null, active: -1,
};
const S = { pro: false, library: {}, ratings: {}, cart: [], orders: [] };
applyState(loadJSON("loadout.v2", {}));
if (!Object.keys(S.ratings).length) {
  const old = loadJSON("loadout.mine", {});
  for (const [id, r] of Object.entries(old)) if (BY_ID[id]) S.ratings[id] = { stars: +r.stars || 0, note: String(r.note || "") };
}

function applyState(d) {
  if (!d || typeof d !== "object") return;
  S.pro = !!d.pro;
  S.library = {};
  for (const [id, e] of Object.entries(d.library || {})) if (BY_ID[id] && e && STATUS[e.status]) S.library[id] = { status: e.status, target: +e.target || 0, owned: !!e.owned, added: e.added || new Date().toISOString() };
  S.ratings = {};
  for (const [id, r] of Object.entries(d.ratings || {})) if (BY_ID[id] && r) S.ratings[id] = { stars: Math.max(0, Math.min(5, +r.stars || 0)), note: String(r.note || "").slice(0, 2000) };
  S.cart = (Array.isArray(d.cart) ? d.cart : []).filter(c => c && ((c.type === "game" && BY_ID[c.id]) || (c.type === "gift" && GIFTS.some(g => g.id === c.brand) && +c.amount > 0)))
    .map(c => c.type === "game" ? { type: "game", id: c.id, qty: 1 } : { type: "gift", brand: c.brand, amount: +c.amount, qty: Math.max(1, Math.min(10, +c.qty || 1)) });
  S.orders = (Array.isArray(d.orders) ? d.orders : []).slice(0, 50).map(o => ({ id: String(o.id || ""), at: String(o.at || ""), total: +o.total || 0, saved: +o.saved || 0, lines: Array.isArray(o.lines) ? o.lines.map(String).slice(0, 40) : [] }));
}

/* ---------- Saving: account (db) when available, this device otherwise ---------- */
let dbRef = null, dbWriting = false, dbPending = false, dbTimer = null;
function persist() {
  saveJSON("loadout.v2", S);
  if (dbRef) { clearTimeout(dbTimer); dbTimer = setTimeout(flushDb, 600); }
}
async function flushDb() {
  if (!dbRef) return;
  if (dbWriting) { dbPending = true; return; }
  dbWriting = true;
  try { await dbRef.set(JSON.parse(JSON.stringify(S))); }
  catch (e) {
    const code = e && e.code;
    if (code === "unavailable") setTimeout(flushDb, 1500 + Math.random() * 1500);
    else if (code !== "resource_exhausted") { dbRef = null; setSync(false); }
  }
  dbWriting = false;
  if (dbPending) { dbPending = false; flushDb(); }
}
function setSync(on) {
  $("#sync-note").textContent = on ? "Your library, cart and ratings are saved to your account." : "Your library, cart and ratings are saved on this device.";
}
async function connectDb() {
  const c = window.claude;
  if (!c || typeof c.use !== "function") return;
  try {
    const [db, user] = await Promise.all([c.use("db"), c.use("user")]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    const ref = db.doc("data/users/" + uid + "/state");
    const snap = await ref.get();
    dbRef = ref;
    setSync(true);
    if (snap.exists) { applyState(JSON.parse(JSON.stringify(snap.data()))); saveJSON("loadout.v2", S); renderAll(); }
    else if (S.pro || Object.keys(S.library).length || Object.keys(S.ratings).length || S.cart.length || S.orders.length) flushDb();
  } catch {}
}

/* ---------- Pieces ---------- */
function monogram(name) {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !/^(the|of|a|and)$/i.test(w));
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
function artHTML(i) {
  const a = (STORE_ITEMS[i.id] || {}).art, sp = a && STORE.sprites && STORE.sprites[a.sheet];
  if (!sp) return "";
  const col = a.idx % sp.cols, row = Math.floor(a.idx / sp.cols);
  const pos = `${sp.cols > 1 ? (col / (sp.cols - 1)) * 100 : 0}% ${sp.rows > 1 ? (row / (sp.rows - 1)) * 100 : 0}%`;
  const style = `background-image:url(${sp.file});background-size:${sp.cols * 100}% ${sp.rows * 100}%;background-position:${pos}`;
  return `<span class="${sp.shape === "square" ? "icon" : "art"}" style="${style}"></span>`;
}
function cover(i, cls = "") {
  const h1 = i.h % 360, h2 = (h1 + 40 + ((i.h >>> 9) % 90)) % 360;
  const art = artHTML(i);
  const bg = art ? `linear-gradient(140deg, hsl(${h1} 45% 42%), hsl(${h2} 50% 22%))` : `${PATTERNS[(i.h >>> 3) % 4]}, linear-gradient(140deg, hsl(${h1} 66% 50%), hsl(${h2} 60% 30%))`;
  const deal = i.kind === "game" && i.deal ? `<span class="deal">−${i.deal}%</span>` : "";
  return `<div class="cover ${cls}" style="background:${bg}" aria-hidden="true">${art || `<span class="mono">${esc(monogram(i.name))}</span>`}<span class="kind">${i.kind}</span>${deal}</div>`;
}
const scoreChip = i => `<span class="score ${i.score >= 9 ? "top" : ""}" title="Loadout score out of 10">${i.score.toFixed(1)}</span>`;
function starsChip(i) {
  const p = i.players[0];
  if (!p) return "";
  const val = p.k === "steam" ? `${p.v.pct}%` : p.v.rating.toFixed(1);
  return `<span class="stars" title="Real player rating from ${SOURCE_NAME[p.k]}: ${compact(p.count)} ratings"><b>★</b> ${val} <small>${SOURCE_NAME[p.k]}</small></span>`;
}
function priceHTML(i) {
  if (i.kind === "app") return `<span class="meta">${esc(i.priceText)}</span>`;
  if (i.price === 0) return `<span class="price"><span class="free">Free to play</span></span>`;
  if (i.deal) return `<span class="price"><s>${money(i.price)}</s><span class="sale">${money(salePrice(i))}</span></span>`;
  return `<span class="price">${money(i.price)}</span>`;
}
function platTags(i, max = 4) {
  const shown = i.platLabels.slice(0, max).map(p => `<span class="ptag">${esc(p)}</span>`).join("");
  return `<div class="ptags">${shown}${i.platLabels.length > max ? `<span class="ptag">+${i.platLabels.length - max}</span>` : ""}</div>`;
}
const statusLabel = (i, s) => (i.kind === "app" ? APP_STATUS[s] : STATUS[s]) || STATUS[s];
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Discover ---------- */
function inPool(i) {
  return (view.kind === "all" || i.kind === view.kind) && (view.plat === "any" || i.pk.has(view.plat)) && (view.cat === "all" || i.cat === view.cat);
}
function relevance(i, q) {
  const n = i.name.toLowerCase(), words = q.split(/\s+/).filter(Boolean);
  if (!words.every(w => i.hay.includes(w))) return -1;
  let r = i.score;
  if (n === q) r += 200; else if (n.startsWith(q)) r += 120; else if (n.includes(q)) r += 70;
  for (const w of words) if (n.split(/[^a-z0-9]+/).some(x => x.startsWith(w))) r += 20;
  return r;
}
function searchList(q, pool) {
  q = q.toLowerCase().trim();
  return pool.map(i => [i, relevance(i, q)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function sorted(list) {
  const by = {
    score: (a, b) => b.score - a.score || (b.playerScore || 0) - (a.playerScore || 0),
    rating: (a, b) => (b.playerScore ?? -1) - (a.playerScore ?? -1) || b.score - a.score,
    new: (a, b) => b.year - a.year || b.score - a.score,
    price: (a, b) => sortPrice(a) - sortPrice(b) || b.score - a.score,
    az: (a, b) => a.name.localeCompare(b.name),
  }[view.sort] || ((a, b) => b.score - a.score);
  return [...list].sort(by);
}

function renderFilters() {
  document.querySelectorAll(".seg [data-kind]").forEach(b => b.setAttribute("aria-pressed", b.dataset.kind === view.kind));
  const chips = PLAT_CHIPS[view.kind];
  if (view.plat !== "any" && !chips.some(c => c[0] === view.plat)) view.plat = "any";
  $("#plats").innerHTML = [["any", "Any platform"], ...chips].map(([k, l]) => `<button type="button" class="plat" data-plat="${k}" aria-pressed="${view.plat === k}">${esc(l)}</button>`).join("");
  const base = ITEMS.filter(i => (view.kind === "all" || i.kind === view.kind) && (view.plat === "any" || i.pk.has(view.plat)));
  const count = kind => {
    const m = new Map();
    base.filter(i => i.kind === kind).forEach(i => m.set(i.cat, (m.get(i.cat) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  if (view.cat !== "all" && !base.some(i => i.cat === view.cat)) view.cat = "all";
  const opts = list => list.map(([c, n]) => `<option value="${esc(c)}"${c === view.cat ? " selected" : ""}>${esc(c)} (${n})</option>`).join("");
  let html = `<option value="all">All categories</option>`;
  if (view.kind !== "app") html += (view.kind === "all" ? `<optgroup label="Games">` : "") + opts(count("game")) + (view.kind === "all" ? "</optgroup>" : "");
  if (view.kind !== "game") html += (view.kind === "all" ? `<optgroup label="Apps">` : "") + opts(count("app")) + (view.kind === "all" ? "</optgroup>" : "");
  $("#cat").innerHTML = html;
  $("#cat").value = view.cat;
  $("#sort").value = view.sort;
}
function renderRail() {
  const pool = ITEMS.filter(inPool);
  $("#rail").innerHTML = THEMES.map(t => {
    const n = t.id === "all" ? pool.length + visibleGroups().length : pool.filter(i => i.themes.includes(t.id)).length;
    return `<button type="button" class="chip" data-theme-id="${t.id}" aria-pressed="${!view.q && view.theme === t.id}">${esc(t.name)}<span class="n">${n.toLocaleString()}</span></button>`;
  }).join("");
}
function picksFor(t) {
  const pool = ITEMS.filter(inPool).filter(i => t.id === "all" || i.themes.includes(t.id));
  const on = view.plat !== "any" ? " on " + PLAT_NAME[view.plat] : "";
  const out = [];
  for (const kind of ["game", "app"]) {
    if (view.kind !== "all" && view.kind !== kind) continue;
    const label = kind === "game" ? "Best game" : "Best app";
    const cur = t[kind] && BY_ID[t[kind][0]];
    if (cur && pool.includes(cur)) { out.push({ label: label + on, item: cur, why: t[kind][1] }); continue; }
    const best = pool.filter(i => i.kind === kind).sort((a, b) => b.score - a.score || (b.playerScore || 0) - (a.playerScore || 0))[0];
    if (best) out.push({ label: label + on, item: best, why: t.id === "all" ? "Our highest-scored " + kind + (on || " in the catalog") + ". " + best.blurb : best.blurb });
  }
  return out;
}
function renderBand() {
  const band = $("#band");
  if (view.q) { band.hidden = true; return; }
  band.hidden = false;
  const t = THEME_BY_ID[view.theme];
  const picks = picksFor(t);
  const head = t.id === "all" ? `<h2>Our best <em>overall</em></h2>` : `<h2>Our best for <em>${esc(t.name)}</em></h2>`;
  band.innerHTML = `<div>${head}<p class="band-sub">${esc(t.desc)}</p></div>` + (picks.length
    ? `<div class="picks">${picks.map(p => `
        <article class="pick">
          ${cover(p.item)}
          <div class="pick-body">
            <span class="ribbon">${esc(p.label)}</span>
            <h3>${esc(p.item.name)}</h3>
            <div class="meta">${esc(p.item.maker)} · ${esc(p.item.cat)}</div>
            <div class="scores">${scoreChip(p.item)}${starsChip(p.item)}${priceHTML(p.item)}</div>
            <p class="why">${esc(p.why)}</p>
            <button type="button" class="linkbtn" data-open="${p.item.id}">Read our review →</button>
          </div>
        </article>`).join("")}</div>`
    : `<div class="empty"><strong>Nothing matches these filters in this theme</strong>Try another platform or category.</div>`);
}
function card(i) {
  const r = S.ratings[i.id], lib = S.library[i.id];
  return `<button type="button" class="card" data-open="${i.id}">
    ${cover(i)}
    <div class="card-body">
      <h3>${esc(i.name)}</h3>
      <div class="meta">${esc(i.maker)} · ${esc(i.cat)}${i.year ? " · " + i.year : ""}</div>
      ${platTags(i)}
      <div class="scores">${scoreChip(i)}${starsChip(i)}${r && r.stars ? `<span class="mine-tag">You: ${r.stars}★</span>` : ""}${lib ? `<span class="status-tag">${esc(statusLabel(i, lib.status))}</span>` : ""}</div>
      <p class="blurb">${esc(i.blurb)}</p>
      <div class="card-foot">${priceHTML(i)}</div>
    </div>
  </button>`;
}
function renderGrid() {
  const pool = ITEMS.filter(inPool);
  let list;
  if (view.q) {
    list = searchList(view.q, pool);
    $("#list-title").textContent = `Results for “${view.q}”`;
  } else {
    list = sorted(view.theme === "all" ? pool : pool.filter(i => i.themes.includes(view.theme)));
    const t = THEME_BY_ID[view.theme];
    const what = view.kind === "game" ? "games" : view.kind === "app" ? "apps" : "games & apps";
    const on = view.plat !== "any" ? " on " + PLAT_NAME[view.plat] : "";
    $("#list-title").textContent = (view.theme === "all" ? `All ${what}` : `${t.name}: ${what}`) + on;
  }
  const groups = !view.q && view.theme === "all" ? sortedGroups(visibleGroups()) : [];
  const total = list.length + groups.length;
  $("#list-count").textContent = groups.length
    ? `${total.toLocaleString()} titles · ${list.length} reviewed by Loadout`
    : `${list.length} ${list.length === 1 ? "match" : "matches"}`;
  $("#grid").innerHTML = list.length ? list.slice(0, view.limit).map(card).join("")
    : groups.length ? `<div class="empty" style="grid-column:1/-1"><strong>No Loadout reviews match these filters</strong>See every matching title below.</div>`
    : `<div class="empty" style="grid-column:1/-1"><strong>Nothing matches${view.q ? ` “${esc(view.q)}”` : " these filters"}</strong>Try a name, a platform like “PS5”, a genre like “roguelike”, or a category like “budgeting”.</div>`;
  renderAllOther(groups);
  $("#more").hidden = list.length <= view.limit;
  catSearchSection();
  $("#more").textContent = `Show more (${list.length - Math.min(list.length, view.limit)} left)`;
}
function renderDiscover() {
  allOtherLimit = 48;
  renderFilters(); renderRail(); renderBand(); renderGrid();
  saveJSON("loadout.prefs", { kind: view.kind, theme: view.theme, sort: view.sort });
}

/* ---------- Search suggestions ---------- */
function renderSuggest() {
  const box = $("#suggest"), q = view.q;
  if (!q) { box.hidden = true; $("#search-box").setAttribute("aria-expanded", "false"); return; }
  const all = searchList(q, ITEMS);
  const top = all.slice(0, 6);
  if (view.active >= top.length) view.active = top.length - 1;
  box.innerHTML = top.map((i, n) => `<li role="option" id="sg-${n}" data-open="${i.id}" aria-selected="${n === view.active}">
      ${cover(i)}<div><b>${esc(i.name)}</b><small>${i.kind === "game" ? "Game" : "App"} · ${esc(i.cat)} · ${esc(i.platLabels.slice(0, 3).join(", "))}</small></div>${scoreChip(i)}
    </li>`).join("") + (all.length ? `<li class="all" role="option" data-close-suggest="1">See all ${all.length} results below</li>` : `<li class="all" role="option" data-close-suggest="1">No matches. Try a platform, genre or category.</li>`);
  box.hidden = false;
  $("#search-box").setAttribute("aria-expanded", "true");
  $("#q").setAttribute("aria-activedescendant", view.active >= 0 ? "sg-" + view.active : "");
}
function hideSuggest() { $("#suggest").hidden = true; $("#search-box").setAttribute("aria-expanded", "false"); view.active = -1; }

/* ---------- Drawer ---------- */
let lastFocus = null;
const dr_id_changed = id => $("#drawer").dataset.id !== id || !document.body.classList.contains("drawer-open");
const fmtDate = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const asOf = () => STORE && STORE.fetchedAt ? `as of ${fmtDate(STORE.fetchedAt)}` : "";
function playerSummary(i) {
  if (!i.players.length) return `<p class="tiny" style="margin:0">Real player ratings for this ${i.kind} haven't been imported yet.</p>`;
  return `<div class="psum">${i.players.map(p => `<div class="psrc"><b>${p.k === "steam" ? p.v.pct + "%" : "★ " + p.v.rating.toFixed(1)}</b><span>${SOURCE_NAME[p.k]}${p.k === "steam" && p.v.desc ? " · " + esc(p.v.desc) : ""}</span><small>${compact(p.count)} ${p.k === "steam" && p.v.scope === "english" ? "English reviews" : "ratings"}</small></div>`).join("")}</div><p class="tiny" style="margin:6px 0 0">Real ratings ${asOf()}.</p>`;
}
function advancedTab(i) {
  const a = ADV[i.id];
  if (!a) return `<p class="tiny">No advanced review yet.</p>`;
  return `
    <div class="d-section"><h3>Score breakdown</h3><div class="subs">${a.scores.map(([l, v]) => `<div class="sub"><span>${l}</span><div class="bar"><i style="width:${v * 10}%"></i></div><b>${v ? v : "n/a"}</b></div>`).join("")}</div></div>
    ${a.facts.length ? `<div class="d-section"><h3>At a glance</h3><dl class="kv">${a.facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
    <div class="d-section two"><div><h3>Best for</h3><p class="plain">${esc(a.bestFor)}</p></div><div><h3>Skip it if</h3><p class="plain">${esc(a.skipIf)}</p></div></div>
    <div class="d-section"><h3>In depth</h3><p class="verdict">${esc(a.deep)}</p></div>
    <p class="tiny">Loadout's own review. Scores are out of 10${i.kind === "game" ? "; hours are approximate" : ""}.</p>`;
}
function playersTab(i) {
  const links = linkRow(reviewLinks(i));
  if (!i.players.length) return `<div class="empty" style="padding:28px 16px"><strong>No store reviews imported yet</strong>Real ratings and reviews from Steam, the App Store, Google Play and the PlayStation Store appear here once they've been imported.</div><div class="d-section"><h3>Read reviews at the source</h3>${links}</div>`;
  return i.players.map(p => {
    const v = p.v;
    const head = p.k === "steam"
      ? `<div class="pbig"><b>${v.pct}%</b><span>positive · ${esc(v.desc || "")}<br>${compact(v.total)} ${v.scope === "english" ? "English-language " : ""}Steam reviews</span></div>`
      : `<div class="pbig"><b>★ ${v.rating.toFixed(1)}</b><span>out of 5<br>${compact(v.count)} ratings on ${SOURCE_NAME[p.k]}</span></div>`;
    const revs = (v.reviews || []).slice(0, 4).map(r => `<blockquote class="prev"><div class="prev-h">${p.k === "steam" ? (r.up ? `<span class="up">Recommended</span>` : `<span class="down">Not recommended</span>`) : `<span class="st">${"★".repeat(Math.max(0, Math.min(5, r.stars || 0)))}</span>`}${r.title ? ` <b>${esc(r.title)}</b>` : ""}<small>${fmtDate(r.date)}${r.hours ? ` · ${r.hours} h played` : ""}</small></div><p>${esc(r.text)}</p></blockquote>`).join("");
    return `<div class="d-section psec"><h3>${SOURCE_NAME[p.k]}${v.title && slug(v.title) !== i.id ? ` <small style="text-transform:none;letter-spacing:0;font-weight:500">(listed as “${esc(v.title)}”)</small>` : ""}</h3>${head}${revs}${v.url ? `<a class="srclink" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">See all on ${SOURCE_NAME[p.k]} ↗</a>` : ""}</div>`;
  }).join("") + `<p class="tiny">Ratings and review excerpts are imported from each store ${asOf()} and belong to their authors. Excerpts may be shortened.</p><div class="d-section"><h3>More reviews</h3>${links}</div>`;
}
function storeLinks(i) {
  const q = encodeURIComponent(i.name);
  const links = [];
  if (i.kind === "game") {
    if (i.pk.has("playstation")) links.push(["PlayStation Store", `https://store.playstation.com/en-us/search/${q}`]);
    if (i.pk.has("xbox")) links.push(["Xbox Store", `https://www.xbox.com/en-US/search?q=${q}`]);
    if (i.pk.has("nintendo")) links.push(["Nintendo eShop", `https://www.nintendo.com/us/search/#q=${q}`]);
    if (i.pk.has("pc") || i.pk.has("mac")) links.push(["Steam", `https://store.steampowered.com/search/?term=${q}`]);
    if (i.pk.has("android")) links.push(["Google Play", `https://play.google.com/store/search?q=${q}&c=apps`]);
    if (i.pk.has("ios")) links.push(["App Store", `https://apps.apple.com/us/search?term=${q}`]);
  } else {
    if (i.pk.has("ios") || i.pk.has("mac")) links.push(["App Store", `https://apps.apple.com/us/search?term=${q}`]);
    if (i.pk.has("android")) links.push(["Google Play", `https://play.google.com/store/search?q=${q}&c=apps`]);
    if (i.pk.has("web") || i.pk.has("win")) links.push(["Official site", `https://duckduckgo.com/?q=${encodeURIComponent(i.name + " " + i.maker)}`]);
  }
  return links;
}
function reviewLinks(i) {
  const q = encodeURIComponent(i.name);
  const out = [];
  if (i.kind === "game") {
    out.push(["Metacritic", `https://www.metacritic.com/search/${q}/`]);
    if (i.pk.has("pc")) out.push(["Steam user reviews", `https://store.steampowered.com/search/?term=${q}`]);
  } else if (i.pk.has("android")) out.push(["Google Play reviews", `https://play.google.com/store/search?q=${q}&c=apps`]);
  out.push(["Video reviews", `https://www.youtube.com/results?search_query=${q}+review`]);
  return out;
}
const linkRow = links => `<div class="storelinks">${links.map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join("")}</div>`;

function buyBox(i) {
  const lib = S.library[i.id];
  let html = "";
  if (i.kind === "game") {
    const inCart = S.cart.some(c => c.type === "game" && c.id === i.id);
    const priceLine = i.price === 0 ? `<span class="bigprice" style="color:var(--good)">Free to play</span>`
      : `<span class="bigprice">${i.deal ? `<s>${money(i.price)}</s>` : ""}${money(salePrice(i))}</span>${i.deal ? ` <span class="off">−${i.deal}% demo deal</span>` : ""}`;
    let action = "";
    if (i.price > 0) {
      if (lib && lib.owned) action = `<span class="status-tag">In your library</span>`;
      else if (S.pro) action = inCart ? `<button type="button" class="btn ghost small" data-go="cart">In cart · View cart</button>` : `<button type="button" class="btn" data-add="${i.id}">Add to cart · ${money(proPrice(i))}</button>`;
      else action = `<button type="button" class="btn gold small" data-go="pro">Buy with Pro · ${money(proPrice(i))}</button>`;
    }
    html += `<div class="buyrow"><div>${priceLine}</div>${action}</div>`;
    if (i.price > 0) html += `<p class="tiny">${S.pro ? "Your Pro price includes an extra 10% off." : "Pro members buy in Loadout with an extra 10% off."} Demo store: no real purchase is made.</p>`;
  } else {
    html += `<div class="buyrow"><div><span class="bigprice" style="font-size:17px;font-family:var(--body);font-weight:700">${esc(i.priceText)}</span></div></div>`;
  }
  html += `<div><p class="tiny" style="margin-bottom:6px">${i.kind === "game" ? "Buy for real from the official stores" : "Get it from"}</p>${linkRow(storeLinks(i))}</div>`;
  return `<div class="buybox">${html}</div>`;
}
function trackBox(i) {
  if (!S.pro) return `<div class="d-section"><h3>Track it</h3><div class="locked"><span>Add it to your library, track progress and get price alerts with <b>Loadout Pro</b>.</span><button type="button" class="btn gold small" data-go="pro">See Pro</button></div></div>`;
  const lib = S.library[i.id];
  const keys = i.kind === "app" ? Object.keys(APP_STATUS) : Object.keys(STATUS);
  let html = `<div class="track" role="group" aria-label="Library status">${keys.map(k => `<button type="button" data-status="${k}" aria-pressed="${!!lib && lib.status === k}">${esc(statusLabel(i, k))}</button>`).join("")}${lib ? `<button type="button" data-status="" aria-label="Remove from library">Remove</button>` : ""}</div>`;
  if (i.kind === "game" && i.price > 0 && !(lib && lib.owned)) {
    const hit = lib && lib.target && salePrice(i) <= lib.target;
    html += `<div class="watch" style="margin-top:12px"><label for="watch-in">Alert me when it's</label><input id="watch-in" type="number" min="1" step="1" inputmode="decimal" placeholder="$ price" value="${lib && lib.target ? lib.target : ""}"><span>or less</span><button type="button" class="btn small ghost" id="watch-save">Set price watch</button>${hit ? `<span class="hit">Price hit: now ${money(salePrice(i))}</span>` : ""}</div>`;
  }
  return `<div class="d-section"><h3>Track it</h3>${html}</div>`;
}
function openItem(id, keepScroll) {
  const i = BY_ID[id]; if (!i) return;
  if (!document.body.classList.contains("drawer-open")) lastFocus = document.activeElement;
  hideSuggest();
  const m = S.ratings[i.id] || { stars: 0, note: "" };
  if (dr_id_changed(id)) view.dtab = "overview";
  const dr = $("#drawer");
  const top = dr.scrollTop;
  dr.innerHTML = `
    <div style="position:relative">
      ${cover(i, "d-cover")}
      <button type="button" class="d-close" id="d-close" aria-label="Close review">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
    </div>
    <div class="d-body">
      <div class="d-title">
        <h2 id="d-name">${esc(i.name)}</h2>
        <p>${esc(i.maker)}${i.year ? " · " + i.year : ""} · ${esc(i.cat)}</p>
        <div class="facts">${i.platLabels.map(p => `<span class="fact">${esc(p)}</span>`).join("")}</div>
      </div>
      <div class="dtabs" role="tablist" aria-label="Review sections">${[["overview", "Overview"], ["advanced", "Advanced review"], ["players", "Player reviews" + (i.players.length ? "" : "")]].map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${view.dtab === k}">${l}</button>`).join("")}</div>
      ${view.dtab === "advanced" ? advancedTab(i) : view.dtab === "players" ? playersTab(i) : `
      ${buyBox(i)}
      ${trackBox(i)}
      <div class="scoreboard">
        <div class="big-score"><b style="color:${i.score >= 9 ? "var(--good)" : "var(--ink)"}">${i.score.toFixed(1)}</b><span>Loadout score</span></div>
        <div><div class="tiny" style="margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Players say</div>${playerSummary(i)}</div>
      </div>
      <div class="d-section"><h3>Our review</h3><p class="verdict">${esc(i.review)}</p><button type="button" class="linkbtn" data-dtab="advanced" style="margin-top:8px">Read the advanced review →</button></div>
      <div class="d-section pc">
        <div><h3>Good</h3><ul>${i.pros.map(p => `<li class="plus"><span>${esc(p)}</span></li>`).join("")}</ul></div>
        <div><h3>Not so good</h3><ul>${i.cons.map(p => `<li class="minus"><span>${esc(p)}</span></li>`).join("")}</ul></div>
      </div>
      <div class="d-section"><h3>Fits these themes</h3><div class="tags">${i.themes.filter(t => THEME_BY_ID[t]).map(t => `<button type="button" class="tag" data-goto="${t}">${esc(THEME_BY_ID[t].name)}</button>`).join("")}</div></div>
      <div class="d-section mine">
        <h3>Your rating</h3>
        <div class="star-input" role="group" aria-label="Your stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= m.stars ? "on" : ""}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n === m.stars}">★</button>`).join("")}</div>
        <textarea class="box" id="mine-note" placeholder="What did you think? Only you can see this.">${esc(m.note || "")}</textarea>
        <div class="row-actions">
          <button type="button" class="btn" id="mine-save">Save my rating</button>
          ${m.stars || m.note ? `<button type="button" class="btn ghost" id="mine-clear">Remove</button>` : ""}
          <span class="status" id="mine-status" role="status"></span>
        </div>
      </div>`}
    </div>`;
  dr.dataset.id = i.id;
  dr.dataset.stars = m.stars;
  dr.scrollTop = keepScroll ? top : 0;
  if (!document.body.classList.contains("drawer-open")) { document.body.classList.add("drawer-open"); $("#d-close").focus(); }
}
function closeDrawer() {
  if (!document.body.classList.contains("drawer-open")) return;
  document.body.classList.remove("drawer-open");
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

/* ---------- Actions ---------- */
function setStatus(id, status) {
  const i = BY_ID[id];
  if (!status) { delete S.library[id]; toast(`Removed ${i.name} from your library`); }
  else {
    const e = S.library[id] || { target: 0, owned: false, added: new Date().toISOString() };
    e.status = status; S.library[id] = e;
    toast(`${i.name}: ${statusLabel(i, status)}`);
  }
  persist(); renderBadges();
}
function addToCart(id) {
  const i = BY_ID[id];
  if (!S.pro) return go("pro", "deals");
  if (!i || i.kind !== "game" || i.price <= 0) return;
  if (S.library[id] && S.library[id].owned) return toast("You already own this");
  if (!S.cart.some(c => c.type === "game" && c.id === id)) S.cart.push({ type: "game", id, qty: 1 });
  persist(); renderBadges(); toast(`Added ${i.name} to your cart`);
}
function addGift(brand, amount) {
  if (!S.pro) return go("pro", "gifts");
  const ex = S.cart.find(c => c.type === "gift" && c.brand === brand && c.amount === amount);
  if (ex) ex.qty = Math.min(10, ex.qty + 1); else S.cart.push({ type: "gift", brand, amount, qty: 1 });
  const g = GIFTS.find(x => x.id === brand);
  persist(); renderBadges(); toast(`Added a ${money(amount).replace(".00", "")} ${g.name} card`);
}
function cartTotals() {
  let list = 0, deals = 0, pro = 0, gifts = 0;
  for (const c of S.cart) {
    if (c.type === "game") { const i = BY_ID[c.id]; list += i.price; deals += i.price - salePrice(i); pro += salePrice(i) - proPrice(i); }
    else gifts += c.amount * c.qty;
  }
  return { list: round2(list + gifts), deals: round2(deals), pro: round2(pro), total: round2(list - deals - pro + gifts) };
}
function placeOrder() {
  if (!S.pro || !S.cart.length) return;
  const t = cartTotals();
  const lines = S.cart.map(c => c.type === "game" ? BY_ID[c.id].name : `${GIFTS.find(g => g.id === c.brand).name} ${money(c.amount).replace(".00", "")}${c.qty > 1 ? " ×" + c.qty : ""}`);
  const order = { id: "LD-" + Date.now().toString(36).toUpperCase().slice(-6), at: new Date().toISOString(), total: t.total, saved: round2(t.deals + t.pro), lines };
  for (const c of S.cart) if (c.type === "game") {
    const e = S.library[c.id] || { target: 0, added: new Date().toISOString(), status: "backlog" };
    e.owned = true; if (e.status === "wish") e.status = "backlog"; S.library[c.id] = e;
  }
  S.orders.unshift(order); S.orders = S.orders.slice(0, 50);
  S.cart = [];
  view.lastOrder = order;
  persist(); renderBadges(); renderCart();
}

/* ---------- Pro, store, gifts, library, cart views ---------- */
const ICONS = {
  track: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"></path><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"></path></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path></svg>',
  cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"></path></svg>',
  gift: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"></path></svg>',
  tag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle></svg>',
};
const TAB_NAME = { deals: "Store & deals", gifts: "Gift cards", library: "My library" };
function renderPro() {
  const why = view.pendingTab && !S.pro ? `<p class="note" style="font-size:14px;color:var(--gold);font-weight:700;margin:0">${esc(TAB_NAME[view.pendingTab] || "That")} is part of Loadout Pro.</p>` : "";
  $("#view-pro").innerHTML = `
    ${why}
    <div class="pro-hero">
      <div>
        <h1>Loadout <span>Pro</span>: track it, watch it, buy it.</h1>
        <p>Keep your whole game and app library in one place, get told when a game drops to your price, and buy games and gift cards right here.</p>
        <div class="plan"><b>$3.99</b><span>per month, cancel anytime</span></div>
        ${S.pro
          ? `<div class="row-actions"><button type="button" class="btn gold" data-go="library">Open my library</button><button type="button" class="btn ghost" id="pro-off">Turn off Pro</button></div><p class="demo-note">You're on Pro (demo). Nothing is being charged.</p>`
          : `<div class="row-actions"><button type="button" class="btn gold" id="pro-on">Start Pro, free demo</button><button type="button" class="btn ghost" data-go="discover">Not now</button></div><p class="demo-note">This is a demo: starting Pro unlocks every feature right away and never asks for payment details.</p>`}
      </div>
      <ul class="perks">
        <li><span class="ic">${ICONS.track}</span><div><b>Track your library</b><small>Wishlist, backlog, playing, finished and dropped, for games and apps.</small></div></li>
        <li><span class="ic">${ICONS.bell}</span><div><b>Price watch</b><small>Pick a price and see the moment a game hits it.</small></div></li>
        <li><span class="ic">${ICONS.cart}</span><div><b>Buy games in the app</b><small>An extra 10% off every game, on top of deals.</small></div></li>
        <li><span class="ic">${ICONS.gift}</span><div><b>Gift cards</b><small>PlayStation, Xbox, Nintendo, Steam, Apple, Google Play, Roblox and more.</small></div></li>
        <li><span class="ic">${ICONS.tag}</span><div><b>Deals first</b><small>A store page with every deal and your price-watch hits.</small></div></li>
      </ul>
    </div>`;
}
function storeCard(i) {
  const owned = S.library[i.id] && S.library[i.id].owned;
  const inCart = S.cart.some(c => c.type === "game" && c.id === i.id);
  return `<article class="card" style="cursor:default">
    ${cover(i)}
    <div class="card-body">
      <h3><button type="button" class="linkbtn" style="color:var(--ink);text-align:left" data-open="${i.id}">${esc(i.name)}</button></h3>
      ${platTags(i, 3)}
      <div class="scores">${scoreChip(i)}${starsChip(i)}</div>
      <div class="card-foot">${priceHTML(i)}<span class="meta">Pro ${money(proPrice(i))}</span></div>
      ${owned ? `<span class="status-tag" style="justify-self:start">Owned</span>` : inCart ? `<button type="button" class="btn ghost small" data-go="cart">In cart</button>` : `<button type="button" class="btn small" data-add="${i.id}">Add to cart</button>`}
    </div>
  </article>`;
}
function renderDeals() {
  const games = ITEMS.filter(i => i.kind === "game" && i.price > 0);
  const hits = games.filter(i => { const e = S.library[i.id]; return e && e.target && !e.owned && salePrice(i) <= e.target; });
  const deals = games.filter(i => i.deal).sort((a, b) => b.deal - a.deal || b.score - a.score);
  const newest = games.filter(i => !i.deal).sort((a, b) => b.year - a.year || b.score - a.score).slice(0, 12);
  const top = games.filter(i => !i.deal).sort((a, b) => b.score - a.score).slice(0, 12);
  const sec = (title, sub, list) => `<section style="display:grid;gap:14px"><div><h2 class="sec-title">${title}</h2>${sub ? `<p class="band-sub">${sub}</p>` : ""}</div><div class="grid">${list.map(storeCard).join("")}</div></section>`;
  $("#view-deals").innerHTML = `
    <div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">Store &amp; deals</h1><p class="band-sub">Every price below already has your Pro 10% applied at checkout. Deals are demo prices.</p></div>
    ${hits.length ? sec("Your price watches hit", "These dropped to the price you asked for.", hits) : ""}
    ${sec(`On sale now <span class="off" style="vertical-align:middle">${deals.length} deals</span>`, "", deals)}
    ${sec("New releases", "", newest)}
    ${sec("Top rated", "", top)}`;
}
function renderGifts() {
  $("#view-gifts").innerHTML = `
    <div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">Gift cards</h1><p class="band-sub">Top up a console wallet or send one as a present. Demo store: no codes are issued.</p></div>
    <div class="gift-grid">${GIFTS.map(g => {
      const amt = view.giftAmt[g.id] || g.amounts[1] || g.amounts[0];
      return `<article class="gift">
        <div class="gcard" style="background:${PATTERNS[1]}, linear-gradient(135deg, ${g.c[0]}, ${g.c[1]})"><b>${esc(g.name)}</b><div style="display:flex;justify-content:space-between;align-items:end"><span>GIFT CARD</span><span class="amt">$${amt}</span></div></div>
        <div class="meta">${esc(g.sub)}</div>
        <div class="amounts" role="group" aria-label="${esc(g.name)} amount">${g.amounts.map(a => `<button type="button" data-gift-amt="${g.id}:${a}" aria-pressed="${a === amt}">$${a}</button>`).join("")}</div>
        <button type="button" class="btn" data-gift-add="${g.id}:${amt}">Add $${amt} card to cart</button>
      </article>`;
    }).join("")}</div>`;
}
function renderLibrary() {
  const entries = Object.entries(S.library).map(([id, e]) => ({ i: BY_ID[id], e })).filter(x => x.i)
    .sort((a, b) => String(b.e.added).localeCompare(String(a.e.added)));
  const count = k => k === "all" ? entries.length : entries.filter(x => x.e.status === k).length;
  const list = view.libFilter === "all" ? entries : entries.filter(x => x.e.status === view.libFilter);
  const owned = entries.filter(x => x.e.owned).length;
  const watches = entries.filter(x => x.e.target && !x.e.owned).length;
  const statusOpts = (i, cur) => (i.kind === "app" ? Object.keys(APP_STATUS) : Object.keys(STATUS)).map(k => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(statusLabel(i, k))}</option>`).join("");
  $("#view-library").innerHTML = `
    <div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">My library</h1><p class="band-sub">${entries.length} tracked · ${owned} bought in Loadout · ${watches} price ${watches === 1 ? "watch" : "watches"}</p></div>
    <div class="stats" role="group" aria-label="Filter library">${LIB_FILTERS.map(([k, l]) => `<button type="button" class="stat" data-lib="${k}" aria-pressed="${view.libFilter === k}"><b>${count(k)}</b><span>${l}</span></button>`).join("")}</div>
    ${list.length ? `<div class="lib">${list.map(({ i, e }) => {
      const hit = i.kind === "game" && e.target && !e.owned && salePrice(i) <= e.target;
      return `<div class="lib-row">
        ${cover(i)}
        <div style="min-width:0">
          <h3><button type="button" data-open="${i.id}">${esc(i.name)}</button></h3>
          <div class="lib-meta"><span>${i.kind === "game" ? "Game" : "App"} · ${esc(i.platLabels.slice(0, 3).join(", "))}</span>${e.owned ? `<span class="status-tag">Owned</span>` : ""}${i.kind === "game" && !e.owned && i.price > 0 ? priceHTML(i) : ""}${e.target && !e.owned ? `<span>Watching ≤ ${money(e.target)}</span>` : ""}${hit ? `<span class="hit">Price hit</span>` : ""}</div>
        </div>
        <div class="lib-ctl">
          <select aria-label="Status for ${esc(i.name)}" data-lib-status="${i.id}">${statusOpts(i, e.status)}</select>
          ${hit ? `<button type="button" class="btn small" data-add="${i.id}">Buy</button>` : ""}
          <button type="button" class="btn ghost small" data-lib-remove="${i.id}" aria-label="Remove ${esc(i.name)}">Remove</button>
        </div>
      </div>`;
    }).join("")}</div>`
    : `<div class="empty"><strong>${entries.length ? "Nothing in this list yet" : "Your library is empty"}</strong>Open any game or app and choose a status under “Track it”.<div style="margin-top:14px"><button type="button" class="btn" data-go="discover">Browse games and apps</button></div></div>`}
    <section style="display:grid;gap:10px">
      <h2 class="sec-title" style="font-size:19px">Orders</h2>
      ${S.orders.length ? `<div class="orders">${S.orders.map(o => `<div class="order"><div><b>${esc(o.id)}</b> · ${esc(new Date(o.at).toLocaleDateString())}<div class="meta">${esc(o.lines.join(", "))}</div></div><div style="text-align:right"><span class="price">${money(o.total)}</span><div class="meta">Saved ${money(o.saved)} · demo order</div></div></div>`).join("")}</div>` : `<p class="note" style="font-size:14px">No orders yet.</p>`}
    </section>`;
}
function renderCart() {
  const t = cartTotals();
  const confirm = view.lastOrder ? `<div class="confirm"><b>Order ${esc(view.lastOrder.id)} placed (demo).</b> Nothing was charged and no keys or codes were issued. Games you bought are now in your library as owned.${S.pro ? ` <button type="button" class="linkbtn" data-go="library">Open my library</button>` : ""}</div>` : "";
  if (!S.cart.length) {
    $("#view-cart").innerHTML = `<div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">Cart</h1></div>${confirm}
      <div class="empty"><strong>Your cart is empty</strong>${S.pro ? "Add games from the store or pick a gift card." : "Buying games and gift cards in Loadout is part of Pro."}<div class="row-actions" style="justify-content:center;margin-top:14px">${S.pro ? `<button type="button" class="btn" data-go="deals">Go to the store</button><button type="button" class="btn ghost" data-go="gifts">Gift cards</button>` : `<button type="button" class="btn gold" data-go="pro">See Pro</button>`}</div></div>`;
    return;
  }
  $("#view-cart").innerHTML = `<div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">Cart</h1></div>${confirm}
    <div class="cart">
      <div class="cart-list">${S.cart.map((c, n) => {
        if (c.type === "game") {
          const i = BY_ID[c.id];
          return `<div class="lib-row">${cover(i)}<div style="min-width:0"><h3><button type="button" data-open="${i.id}">${esc(i.name)}</button></h3><div class="lib-meta">${priceHTML(i)}<span>Pro price ${money(proPrice(i))}</span></div></div><div class="lib-ctl"><button type="button" class="btn ghost small" data-cart-remove="${n}">Remove</button></div></div>`;
        }
        const g = GIFTS.find(x => x.id === c.brand);
        return `<div class="lib-row"><div class="cover" style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg, ${g.c[0]}, ${g.c[1]})"><span class="mono" style="font-size:16px">$${c.amount}</span></div><div style="min-width:0"><h3>${esc(g.name)} gift card</h3><div class="lib-meta"><span class="price">${money(c.amount)}</span><span>each</span></div></div><div class="lib-ctl"><span class="qty"><button type="button" data-qty="${n}:-1" aria-label="One fewer">−</button><span>${c.qty}</span><button type="button" data-qty="${n}:1" aria-label="One more">+</button></span><button type="button" class="btn ghost small" data-cart-remove="${n}">Remove</button></div></div>`;
      }).join("")}</div>
      <aside class="summary">
        <div class="sumrow"><span>List price</span><span>${money(t.list)}</span></div>
        ${t.deals ? `<div class="sumrow" style="color:var(--bad)"><span>Deals</span><span>−${money(t.deals)}</span></div>` : ""}
        ${t.pro ? `<div class="sumrow" style="color:var(--gold)"><span>Pro 10% off games</span><span>−${money(t.pro)}</span></div>` : ""}
        <div class="sumrow total"><span>Total</span><span>${money(t.total)}</span></div>
        <button type="button" class="btn" id="checkout" ${S.pro ? "" : "disabled"}>Place demo order</button>
        <p class="tiny">Demo checkout. No payment details are asked for, nothing is charged, and no game keys or gift card codes are issued. To buy for real, use the official store links in each review.</p>
      </aside>
    </div>`;
}


/* ---------- All platforms (big catalog) ---------- */
const CAT = (typeof CATALOG !== "undefined" && CATALOG && CATALOG.platforms) || {};
const CAT_KEYS = Object.keys(CAT);
const CURATED_BY_STORE = {};
for (const [id, v] of Object.entries(STORE_ITEMS)) {
  const src = v.sources || {};
  if (src.appstore) CURATED_BY_STORE["a:" + src.appstore.id] = id;
  if (src.gplay) CURATED_BY_STORE["g:" + src.gplay.id] = id;
  if (src.steam) CURATED_BY_STORE["s:" + src.steam.appid] = id;
}
function curatedFor(k, r) {
  const pre = { iphone: "a:", ipad: "a:", mac: "a:", android: "g:", steam: "s:" }[k];
  if (pre && CURATED_BY_STORE[pre + r[6]]) return CURATED_BY_STORE[pre + r[6]];
  const full = slug(r[0]), short = slug(r[0].split(/\s+[-–—|:]\s+|:\s+/)[0]);
  return BY_ID[full] ? full : (short.length > 2 && BY_ID[short]) ? short : null;
}
const CAT_ITEMS = [];
for (const k of CAT_KEYS) CAT[k].items.forEach((r, i) => CAT_ITEMS.push({ p: k, r, i, hay: (r[0] + " " + r[1] + " " + r[2] + " " + CAT[k].label + " " + (r[10] || "")).toLowerCase(), curated: curatedFor(k, r) }));
const CAT_TOTAL = CAT_ITEMS.length;
const catKind = e => ["steam", "playstation", "xbox", "switch"].includes(e.p) || /^game/i.test(e.r[2] || "") ? "game" : "app";
const PLAT_TO_CAT = { playstation: ["playstation"], ps5: ["playstation", "PS5"], ps4: ["playstation", "PS4"], xbox: ["xbox"], xsx: ["xbox"],
  xone: ["xbox"], nintendo: ["switch"], sw: ["switch", "Nintendo Switch"], sw2: ["switch", "Nintendo Switch 2"], pc: ["steam"], mac: ["mac"],
  ios: ["iphone", "ipad"], mobile: ["iphone", "ipad", "android"], android: ["android"], web: [], win: [] };
// One entry per title: the same app on iPhone and iPad, or a game listed twice, counts once.
const CAT_GROUPS = [];
{
  const byKey = new Map();
  for (const e of CAT_ITEMS) {
    if (e.curated) continue;
    const key = catKind(e) + "|" + slug(e.r[0]).replace(/-(ps4-and-ps5|ps4-ps5|ps5-version|for-ps5|ps5|ps4|standard-edition)$/, "");
    let g = byKey.get(key);
    if (!g) { g = { kind: catKind(e), name: e.r[0], items: [], count: 0, year: 0 }; byKey.set(key, g); CAT_GROUPS.push(g); }
    g.items.push(e);
    g.count = Math.max(g.count, e.r[5] || 0);
    g.year = Math.max(g.year, e.r[7] || 0);
  }
}
function catInView(e) {
  if (view.plat === "any") return true;
  const m = PLAT_TO_CAT[view.plat] || [], keys = m.filter(x => CAT[x]), sub = m.find(x => !CAT[x]);
  return keys.includes(e.p) && (!sub || (e.r[10] || "").split("/").includes(sub));
}
function visibleGroups() {
  if (view.cat !== "all") return [];
  return CAT_GROUPS.filter(g => (view.kind === "all" || g.kind === view.kind) && g.items.some(catInView));
}
function sortedGroups(gs) {
  const by = view.sort === "az" ? (a, b) => a.name.localeCompare(b.name) : view.sort === "new" ? (a, b) => b.year - a.year || b.count - a.count : (a, b) => b.count - a.count;
  return gs.sort(by);
}
let allOtherLimit = 48;
function renderAllOther(groups) {
  const box = $("#catall");
  if (!box) return;
  if (!groups.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="list-head"><h2>Every other title</h2><span>${groups.length.toLocaleString()} more from ${CAT_KEYS.map(k => CAT[k].label).join(", ")}, with real store ratings</span></div>
    <div class="cgrid">${groups.slice(0, allOtherLimit).map(g => catCard(g.items.find(catInView) || g.items[0], [...new Set(g.items.map(e => CAT[e.p].label))])).join("")}</div>
    ${groups.length > allOtherLimit ? `<button type="button" class="more" id="allother-more">Show more (${(groups.length - allOtherLimit).toLocaleString()} left)</button>` : ""}`;
}
const catView = { p: CAT_KEYS[0] || "", q: "", g: "all", s: "rank", limit: 60 };
function catThumb(e) {
  const sp = CAT[e.p].sprite, idx = e.r[8];
  const shape = sp ? sp.shape : (["iphone", "ipad", "mac", "android"].includes(e.p) ? "square" : "wide");
  if (!sp || idx < 0) {
    const h = hash(e.r[0]) % 360;
    return `<span class="cthumb ${shape}" style="background:linear-gradient(140deg, hsl(${h} 55% 45%), hsl(${(h + 60) % 360} 50% 28%))" aria-hidden="true"><span>${esc(monogram(e.r[0]))}</span></span>`;
  }
  const col = idx % sp.cols, row = Math.floor(idx / sp.cols);
  return `<span class="cthumb ${shape}" aria-hidden="true" style="background-image:url(${sp.file});background-size:${sp.cols * 100}% ${sp.rows * 100}%;background-position:${sp.cols > 1 ? (col / (sp.cols - 1)) * 100 : 0}% ${sp.rows > 1 ? (row / (sp.rows - 1)) * 100 : 0}%"></span>`;
}
function catRating(e, long) {
  const pl = CAT[e.p], r = e.r;
  if (pl.ratingType === "none") return long ? `<span class="meta">Nintendo doesn't publish player ratings</span>` : "";
  if (r[4] == null) return long ? `<span class="meta">No player ratings yet</span>` : "";
  const val = pl.ratingType === "pct" ? `${r[4]}%` : (+r[4]).toFixed(1);
  return `<span class="stars" title="Real player rating from ${esc(pl.source)}"><b>★</b> ${val}${r[5] ? ` <small>${compact(r[5])}</small>` : ""}</span>`;
}
function catCard(e, labels) {
  const r = e.r;
  return `<button type="button" class="ccard" data-cat="${e.p}:${e.i}">
    ${catThumb(e)}
    <span class="cbody">
      <b>${esc(r[0])}</b>
      <span class="meta">${esc(r[1] || CAT[e.p].label)}${r[2] ? " · " + esc(r[2]) : ""}${r[7] ? " · " + r[7] : ""}</span>
      <span class="crow">${catRating(e)}${r[3] ? `<span class="cprice">${esc(r[3])}</span>` : ""}${e.curated ? `<span class="status-tag">Loadout review</span>` : ""}</span>
      ${labels ? `<span class="ptags">${labels.map(l => `<span class="ptag">${esc(l)}</span>`).join("")}</span>` : ""}
    </span>
  </button>`;
}
function catMatches(list, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(e => words.every(w => e.hay.includes(w)))
    .map(e => { const n = e.r[0].toLowerCase(), ql = q.toLowerCase(); return [e, (n === ql ? 3 : n.startsWith(ql) ? 2 : n.includes(ql) ? 1 : 0) * 1e9 + (e.r[5] || 0)]; })
    .sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function catList() {
  let list = CAT_ITEMS.filter(e => e.p === catView.p && (catView.g === "all" || e.r[2] === catView.g));
  if (catView.q) return catMatches(list, catView.q);
  const by = {
    rank: (a, b) => a.i - b.i,
    count: (a, b) => (b.r[5] || 0) - (a.r[5] || 0),
    rating: (a, b) => ((b.r[5] || 0) >= 100 ? b.r[4] : -1) - ((a.r[5] || 0) >= 100 ? a.r[4] : -1) || (b.r[5] || 0) - (a.r[5] || 0),
    new: (a, b) => (b.r[7] || 0) - (a.r[7] || 0) || a.i - b.i,
    az: (a, b) => a.r[0].localeCompare(b.r[0]),
  }[catView.s];
  return list.sort(by);
}
function renderPlatforms() {
  const el = $("#view-platforms");
  if (!CAT_KEYS.length) {
    el.innerHTML = `<div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">All platforms</h1></div><div class="empty"><strong>The full catalog hasn't been imported yet</strong>Run loadout/tools/fetch_app_catalog.py, then rebuild the page.</div>`;
    return;
  }
  const pl = CAT[catView.p];
  const genres = [...new Set(CAT_ITEMS.filter(e => e.p === catView.p && e.r[2]).map(e => e.r[2]))].sort();
  if (catView.g !== "all" && !genres.includes(catView.g)) catView.g = "all";
  const list = catList();
  const rated = pl.items.filter(r => r[4] != null).length;
  const sameQ = document.activeElement && document.activeElement.id === "cat-q";
  el.innerHTML = `
    <div><h1 class="sec-title" style="font-size:clamp(22px,3.6vw,32px)">All platforms</h1>
      <p class="band-sub">${CAT_TOTAL.toLocaleString()} top games and apps across ${CAT_KEYS.length} platforms, with real player ratings from each store, imported ${fmtDate(CATALOG.fetchedAt)}.</p></div>
    <div class="rail" role="tablist" aria-label="Platform">${CAT_KEYS.map(k => `<button type="button" class="chip" role="tab" data-catp="${k}" aria-pressed="${k === catView.p}">${esc(CAT[k].label)}<span class="n">${CAT[k].items.length.toLocaleString()}</span></button>`).join("")}</div>
    <div class="filters">
      <label class="search" for="cat-q" style="flex:1 1 260px;margin:0"><svg class="mag" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input id="cat-q" type="search" placeholder="Search ${esc(pl.label)}…" value="${esc(catView.q)}" autocomplete="off"></label>
      ${genres.length ? `<label class="sel" for="cat-g">Genre <select id="cat-g"><option value="all">All genres</option>${genres.map(g => `<option${g === catView.g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>` : ""}
      <label class="sel" for="cat-s">Sort <select id="cat-s">${[["rank", pl.source === "Wikipedia" ? "Notable first" : "Store ranking"], ["count", "Most ratings"], ["rating", "Highest rated"], ["new", "Newest"], ["az", "A to Z"]].map(([k, l]) => `<option value="${k}"${k === catView.s ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <div class="list-head"><h2>${esc(pl.label)}${catView.q ? ` · “${esc(catView.q)}”` : ""}</h2><span>${list.length.toLocaleString()} titles · ${rated.toLocaleString()} with real ratings from ${esc(pl.source)}</span></div>
    <div class="cgrid">${list.slice(0, catView.limit).map(catCard).join("") || `<div class="empty" style="grid-column:1/-1"><strong>No matches</strong>Try another name or genre.</div>`}</div>
    ${list.length > catView.limit ? `<button type="button" class="more" id="cat-more">Show more (${(list.length - catView.limit).toLocaleString()} left)</button>` : ""}`;
  if (sameQ) { const q = $("#cat-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
function openCat(key) {
  const [p, i] = key.split(":"), pl = CAT[p], r = pl && pl.items[+i];
  if (!r) return;
  const e = CAT_ITEMS.find(x => x.p === p && x.i === +i);
  if (!document.body.classList.contains("drawer-open")) lastFocus = document.activeElement;
  hideSuggest();
  const dr = $("#drawer");
  dr.dataset.id = "";
  const ratingBox = pl.ratingType === "none" ? `<p class="tiny" style="margin:0">Nintendo doesn't publish player ratings.</p>`
    : r[4] == null ? `<p class="tiny" style="margin:0">No player ratings on ${esc(pl.source)} yet.</p>`
    : `<div class="pbig" style="margin:0"><b>${pl.ratingType === "pct" ? r[4] + "%" : "★ " + (+r[4]).toFixed(1)}</b><span>${pl.ratingType === "pct" ? "positive" : "out of 5"}<br>${r[5] ? compact(r[5]) + " " + (pl.ratingType === "pct" ? "English-language reviews" : "ratings") + " on " + esc(pl.source) : esc(pl.source)}</span></div>`;
  dr.innerHTML = `
    <div class="ctop">${catThumb(e)}<button type="button" class="d-close" id="d-close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>
    <div class="d-body">
      <div class="d-title"><h2 id="d-name">${esc(r[0])}</h2><p>${esc(r[1] || "")}${r[7] ? (r[1] ? " · " : "") + r[7] : ""}${r[2] ? " · " + esc(r[2]) : ""}</p>
        <div class="facts"><span class="fact">${esc(pl.label)}</span>${(r[10] || "").split("/").filter(Boolean).filter(x => x !== pl.label).map(x => `<span class="fact">${esc(x)}</span>`).join("")}${r[3] ? `<span class="fact">${esc(r[3])}</span>` : ""}</div></div>
      <div class="scoreboard" style="grid-template-columns:1fr"><div><div class="tiny" style="margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Players say</div>${ratingBox}</div></div>
      ${e.curated ? `<div class="locked" style="background:var(--accent-soft)"><span>Loadout has a full review of this one, with an advanced review and player quotes.</span><button type="button" class="btn small" data-open="${e.curated}">Read our review</button></div>` : `<p class="tiny">Not reviewed by Loadout yet. Rating and details come straight from ${esc(pl.source)}.</p>`}
      ${r[9] ? `<div class="d-section"><h3>Get it</h3><div class="storelinks"><a href="${esc(r[9])}" target="_blank" rel="noopener noreferrer">Open on ${esc(pl.source)} ↗</a><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(r[0] + " review")}" target="_blank" rel="noopener noreferrer">Video reviews ↗</a></div></div>` : ""}
      <p class="tiny">Imported from ${esc(pl.source)} ${fmtDate(pl.fetchedAt || CATALOG.fetchedAt)}. Prices may have changed.</p>
    </div>`;
  dr.scrollTop = 0;
  if (!document.body.classList.contains("drawer-open")) { document.body.classList.add("drawer-open"); $("#d-close").focus(); }
}
function catSearchSection() {
  const box = $("#catsearch");
  if (!box) return;
  if (!view.q || !CAT_TOTAL) { box.hidden = true; return; }
  const m = catMatches(CAT_ITEMS.filter(e => !e.curated), view.q);
  if (!m.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="list-head"><h2>More in the full catalog</h2><span>${m.length.toLocaleString()} matches across ${CAT_KEYS.length} platforms</span></div>
    <div class="cgrid">${m.slice(0, 12).map(catCard).join("")}</div>
    ${m.length > 12 ? `<button type="button" class="more" data-catsearch="1">See all matches in All platforms</button>` : ""}`;
}

/* ---------- Navigation ---------- */
function renderBadges() {
  const n = S.cart.reduce((a, c) => a + c.qty, 0);
  const b = $("#cart-count"); b.hidden = !n; b.textContent = n;
  const pb = $("#pro-btn"); pb.textContent = S.pro ? "Pro ✓" : "Get Pro"; pb.classList.toggle("on", S.pro);
  document.querySelectorAll("#nav .lock").forEach(l => { l.hidden = S.pro; });
}
function renderTab() {
  ({ discover: renderDiscover, platforms: renderPlatforms, pro: renderPro, deals: renderDeals, gifts: renderGifts, library: renderLibrary, cart: renderCart })[view.tab]();
}
function renderAll() { renderBadges(); renderTab(); if (document.body.classList.contains("drawer-open") && $("#drawer").dataset.id) openItem($("#drawer").dataset.id, true); }
function go(tab, pending) {
  if (PRO_GATED.has(tab) && !S.pro) { view.pendingTab = tab; tab = "pro"; }
  else view.pendingTab = tab === "pro" ? (pending || null) : null;
  if (tab !== "cart") view.lastOrder = null;
  view.tab = tab;
  closeDrawer(); hideSuggest();
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== "view-" + tab; });
  document.querySelectorAll("#nav [data-go]").forEach(b => { if (b.dataset.go === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  renderBadges(); renderTab();
  try { history.replaceState(null, "", tab === "discover" ? location.pathname + location.search : "#" + tab); } catch {}
  window.scrollTo({ top: 0 });
}

/* ---------- Events ---------- */
$("#q").addEventListener("input", e => { view.q = e.target.value.trim(); view.limit = 36; view.active = -1; renderSuggest(); renderRail(); renderBand(); renderGrid(); });
$("#q").addEventListener("focus", () => { if (view.q) renderSuggest(); });
$("#q").addEventListener("blur", () => setTimeout(hideSuggest, 120));
$("#q").addEventListener("keydown", e => {
  const box = $("#suggest");
  if (box.hidden) return;
  const n = box.querySelectorAll("li[data-open]").length;
  if (e.key === "ArrowDown") { e.preventDefault(); view.active = Math.min(n - 1, view.active + 1); renderSuggest(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); view.active = Math.max(-1, view.active - 1); renderSuggest(); }
  else if (e.key === "Enter") { e.preventDefault(); const li = box.querySelector(`#sg-${view.active}`); if (li) openItem(li.dataset.open); else { hideSuggest(); $("#grid").scrollIntoView({ behavior: "smooth", block: "start" }); } }
  else if (e.key === "Escape") { e.stopPropagation(); hideSuggest(); }
});
$("#suggest").addEventListener("mousedown", e => e.preventDefault());
$("#cat").addEventListener("change", e => { view.cat = e.target.value; view.limit = 36; renderDiscover(); });
$("#sort").addEventListener("change", e => { view.sort = e.target.value; renderDiscover(); });
$("#more").addEventListener("click", () => { view.limit += 36; renderGrid(); });
$("#view-platforms").addEventListener("input", e => { if (e.target.id === "cat-q") { catView.q = e.target.value.trim(); catView.limit = 60; renderPlatforms(); } });
$("#view-platforms").addEventListener("change", e => {
  if (e.target.id === "cat-g") { catView.g = e.target.value; catView.limit = 60; renderPlatforms(); }
  if (e.target.id === "cat-s") { catView.s = e.target.value; renderPlatforms(); }
});

document.addEventListener("click", e => {
  const t = e.target;
  const k = t.closest("[data-kind]"); if (k) { view.kind = k.dataset.kind; view.limit = 36; renderDiscover(); return; }
  const p = t.closest("[data-plat]"); if (p) { view.plat = p.dataset.plat; view.limit = 36; renderDiscover(); return; }
  const th = t.closest("[data-theme-id]"); if (th) { view.theme = th.dataset.themeId; view.q = ""; $("#q").value = ""; view.limit = 36; renderDiscover(); return; }
  if (t.closest("[data-close-suggest]")) { hideSuggest(); $("#grid").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const o = t.closest("[data-open]"); if (o) { openItem(o.dataset.open); return; }
  const cc = t.closest("[data-cat]"); if (cc) { openCat(cc.dataset.cat); return; }
  const cp = t.closest("[data-catp]"); if (cp) { catView.p = cp.dataset.catp; catView.limit = 60; catView.g = "all"; renderPlatforms(); return; }
  if (t.closest("#cat-more")) { catView.limit += 60; renderPlatforms(); return; }
  if (t.closest("#allother-more")) { allOtherLimit += 48; renderGrid(); return; }
  if (t.closest("[data-catsearch]")) {
    const m = catMatches(CAT_ITEMS.filter(e => !e.curated), view.q);
    const counts = {}; m.forEach(e => counts[e.p] = (counts[e.p] || 0) + 1);
    catView.p = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || catView.p; catView.q = view.q; catView.g = "all"; catView.limit = 60;
    go("platforms"); return;
  }
  const g = t.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
  const a = t.closest("[data-add]"); if (a) { addToCart(a.dataset.add); renderAll(); return; }
  const ga = t.closest("[data-gift-amt]"); if (ga) { const [id, amt] = ga.dataset.giftAmt.split(":"); view.giftAmt[id] = +amt; renderGifts(); return; }
  const gadd = t.closest("[data-gift-add]"); if (gadd) { const [id, amt] = gadd.dataset.giftAdd.split(":"); addGift(id, +amt); return; }
  const lf = t.closest("[data-lib]"); if (lf) { view.libFilter = lf.dataset.lib; renderLibrary(); return; }
  const lr = t.closest("[data-lib-remove]"); if (lr) { setStatus(lr.dataset.libRemove, ""); renderLibrary(); return; }
  const cr = t.closest("[data-cart-remove]"); if (cr) { S.cart.splice(+cr.dataset.cartRemove, 1); persist(); renderBadges(); renderCart(); return; }
  const q = t.closest("[data-qty]"); if (q) { const [n, d] = q.dataset.qty.split(":").map(Number); const c = S.cart[n]; if (c) { c.qty = Math.max(1, Math.min(10, c.qty + d)); persist(); renderBadges(); renderCart(); } return; }
  if (t.closest("#checkout")) { placeOrder(); return; }
  if (t.closest("#pro-on")) { S.pro = true; persist(); toast("Pro is on (demo)"); const next = view.pendingTab; view.pendingTab = null; go(next || "library"); return; }
  if (t.closest("#pro-off")) { S.pro = false; persist(); toast("Pro is off"); renderBadges(); renderPro(); return; }
});
$("#scrim").addEventListener("click", closeDrawer);
$("#view-library").addEventListener("change", e => { const s = e.target.closest("[data-lib-status]"); if (s) { setStatus(s.dataset.libStatus, s.value); renderLibrary(); } });
$("#drawer").addEventListener("click", e => {
  const dr = $("#drawer"), id = dr.dataset.id;
  if (e.target.closest("#d-close")) return closeDrawer();
  if (!id) return;
  const dt = e.target.closest("[data-dtab]");
  if (dt) { view.dtab = dt.dataset.dtab; openItem(id, false); dr.querySelector(`[data-dtab="${view.dtab}"]`)?.focus(); return; }
  const g = e.target.closest("[data-goto]");
  if (g) { view.theme = g.dataset.goto; view.q = ""; $("#q").value = ""; view.limit = 36; go("discover"); return; }
  const st = e.target.closest("[data-status]");
  if (st) { e.stopPropagation(); setStatus(id, st.dataset.status); openItem(id, true); renderTab(); return; }
  if (e.target.closest("#watch-save")) {
    e.stopPropagation();
    const v = parseFloat($("#watch-in").value);
    if (!(v > 0)) { toast("Enter a price, like 20"); return; }
    const i = BY_ID[id];
    const en = S.library[id] || { status: "wish", owned: false, added: new Date().toISOString() };
    en.target = round2(v); S.library[id] = en; persist();
    toast(salePrice(i) <= en.target ? `Good news: it's ${money(salePrice(i))} right now` : `Watching for ${money(en.target)} or less`);
    openItem(id, true); renderTab(); return;
  }
  const s = e.target.closest("[data-star]");
  if (s) {
    const n = +s.dataset.star; dr.dataset.stars = n;
    dr.querySelectorAll("[data-star]").forEach(b => { b.classList.toggle("on", +b.dataset.star <= n); b.setAttribute("aria-pressed", +b.dataset.star === n); });
    $("#mine-status").textContent = ""; return;
  }
  if (e.target.closest("#mine-save")) {
    const stars = +dr.dataset.stars || 0, note = $("#mine-note").value.trim();
    if (!stars && !note) { $("#mine-status").style.color = "var(--bad)"; $("#mine-status").textContent = "Pick some stars or write a note first."; return; }
    S.ratings[id] = { stars, note: note.slice(0, 2000) }; persist();
    $("#mine-status").style.color = ""; $("#mine-status").textContent = dbRef ? "Saved to your account" : "Saved on this device";
    if (view.tab === "discover") renderGrid();
    return;
  }
  if (e.target.closest("#mine-clear")) { delete S.ratings[id]; persist(); if (view.tab === "discover") renderGrid(); openItem(id, true); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeDrawer(); return; }
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); if (view.tab !== "discover") go("discover"); $("#q").focus(); }
  if (e.key === "Tab" && document.body.classList.contains("drawer-open")) {
    const f = [...$("#drawer").querySelectorAll("button, textarea, input, a[href]")];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});

/* ---------- Start ---------- */
{
  const n = ITEMS.filter(i => i.players.length).length, pics = ITEMS.filter(i => (STORE_ITEMS[i.id] || {}).art).length;
  $("#data-note").textContent = n
    ? `Our scores and reviews are Loadout's own. Player ratings are real, imported from Steam, the App Store, Google Play and the PlayStation Store ${asOf()} for ${n} of ${ITEMS.length} titles. Prices and deals are sample figures.`
    : "Our scores and reviews are Loadout's own. Real player ratings haven't been imported yet. Prices and deals are sample figures.";
}
const startTab = (location.hash || "").slice(1);
go(["discover", "platforms", "pro", "deals", "gifts", "library", "cart"].includes(startTab) ? startTab : "discover");
connectDb();
