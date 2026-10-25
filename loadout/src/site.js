/* ---------- Real website only: accounts (Firebase Auth) and Pro payments (Stripe Checkout) ----------
   This file is added only to the website build (site/index.html), never to the artifact demo.
   Pro status comes from customers/{uid}, which only the Stripe webhook (backend/functions) can write. */
const FIREBASE_VERSION = "12.6.0";
const SITE_READY = !!(SITE_CONFIG.firebase && SITE_CONFIG.firebase.apiKey && !/^YOUR_/.test(SITE_CONFIG.firebase.apiKey));
let FB = null, account = null, customer = null, unsubCustomer = null, afterSignIn = null, authMode = "signin";

function siteInit() {
  S.pro = false; // never trust a Pro flag stored in this browser; the server decides
  document.querySelector('#nav [data-go="deals"]')?.remove();
  document.querySelector('.icon-btn[data-go="cart"]')?.remove();
  document.querySelectorAll('#nav [data-go="gifts"] .lock').forEach(l => l.remove());
  const f = $("footer");
  f.innerHTML = `<span>Press <b>/</b> to search, <b>Esc</b> to close a review. <span id="sync-note"></span></span>
    <span>Pro payments are processed by Stripe. Game and gift card buttons link to the official stores; ${esc(SITE_CONFIG.siteName || "Loadout")} isn't affiliated with them.</span>
    <span><a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a>${SITE_CONFIG.contactEmail ? ` · Contact: <span class="sel-text">${esc(SITE_CONFIG.contactEmail)}</span>` : ""}</span>`;
  setSync(false);
  renderAccount();
  const qs = new URLSearchParams(location.search);
  const ck = qs.get("checkout");
  if (ck) {
    history.replaceState(null, "", location.pathname + location.hash);
    toast(ck === "success" ? "Payment received. Pro switches on in a few seconds." : "Checkout cancelled. You haven't been charged.");
  }
  if (SITE_READY) connectFirebase().catch(() => toast("Couldn't reach the sign-in service. Check your connection and reload."));
}

async function connectFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [app, auth, fs, fn] = await Promise.all(["firebase-app", "firebase-auth", "firebase-firestore", "firebase-functions"].map(m => import(base + m + ".js")));
  const a = app.initializeApp(SITE_CONFIG.firebase);
  FB = { A: auth, F: fs, Fn: fn, auth: auth.getAuth(a), db: fs.getFirestore(a), fns: fn.getFunctions(a, SITE_CONFIG.functionsRegion || "us-central1") };
  auth.onAuthStateChanged(FB.auth, onAuthChange);
  auth.getRedirectResult(FB.auth).catch(authError);
}

function onAuthChange(user) {
  account = user;
  if (unsubCustomer) { unsubCustomer(); unsubCustomer = null; }
  customer = null; dbRef = null; S.pro = false;
  setSync(false);
  if (!user) { renderAccount(); renderAll(); return; }
  closeAuth();
  unsubCustomer = FB.F.onSnapshot(FB.F.doc(FB.db, "customers", user.uid), snap => {
    customer = snap.exists() ? snap.data() : null;
    const wasPro = S.pro;
    S.pro = !!(customer && customer.pro);
    if (S.pro && !dbRef) attachSync(user);
    if (!S.pro) { dbRef = null; setSync(false); }
    if (S.pro && !wasPro && view.tab === "pro") toast("Welcome to Loadout Pro!");
    renderAccount(); renderAll();
  }, () => {});
  renderAccount(); renderAll();
  if (afterSignIn) { const next = afterSignIn; afterSignIn = null; next(); }
}

// Pro members' library, ratings and notes sync to users/{uid}. The security rules only accept these writes from Pro members.
async function attachSync(user) {
  const ref = FB.F.doc(FB.db, "users", user.uid);
  try {
    const snap = await FB.F.getDoc(ref);
    if (snap.exists()) { applyState(snap.data()); S.pro = true; saveJSON("loadout.v2", S); }
    dbRef = { set: obj => FB.F.setDoc(ref, { library: obj.library, ratings: obj.ratings, updated: new Date().toISOString() }) };
    setSync(true);
    if (!snap.exists() && (Object.keys(S.library).length || Object.keys(S.ratings).length)) flushDb();
    renderAll();
  } catch { setSync(false); }
}

/* ---------- Account button and menu ---------- */
function renderAccount() {
  const btn = $("#auth-btn");
  if (!btn) return;
  if (!account) {
    btn.className = "btn ghost small auth-btn";
    btn.textContent = "Sign in";
    btn.setAttribute("aria-label", "Sign in");
  } else {
    const name = account.displayName || account.email || "Account";
    btn.className = "auth-avatar";
    btn.setAttribute("aria-label", "Account: " + name);
    btn.innerHTML = account.photoURL ? `<img src="${esc(account.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(name.trim()[0].toUpperCase());
  }
  const menu = $("#acct-menu");
  if (menu && !menu.hidden) renderAccountMenu();
}
function renderAccountMenu() {
  const menu = $("#acct-menu");
  const status = customer && customer.pro
    ? (customer.cancelAtPeriodEnd && customer.currentPeriodEnd ? `Pro until ${fmtDate(customer.currentPeriodEnd * 1000)}` : "Pro member")
    : customer && customer.status === "past_due" ? "Payment problem" : "Free account";
  menu.innerHTML = `<div class="acct-head"><b>${esc(account.displayName || "Signed in")}</b><span>${esc(account.email || "")}</span><span class="status-tag">${status}</span></div>
    ${customer && customer.stripeCustomerId ? `<button type="button" id="acct-manage">Manage subscription</button>` : `<button type="button" data-go="pro">Get Pro</button>`}
    <button type="button" data-go="library">My library</button>
    <button type="button" id="acct-signout">Sign out</button>`;
}
function toggleAccountMenu(force) {
  const menu = $("#acct-menu");
  const open = force === undefined ? menu.hidden : force;
  if (open) { renderAccountMenu(); menu.hidden = false; } else menu.hidden = true;
  $("#auth-btn").setAttribute("aria-expanded", String(open));
}

/* ---------- Sign-in dialog ---------- */
let authReturnFocus = null;
function openAuth(reason) {
  if (!SITE_READY) { toast("Sign-in isn't switched on yet. The site owner needs to finish setup."); return; }
  authReturnFocus = document.activeElement;
  setAuthMode("signin");
  $("#auth-sub").textContent = reason || "Sign in to sync your library and manage Loadout Pro.";
  $("#auth-err").textContent = "";
  $("#auth-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#auth-google").focus();
}
function closeAuth() {
  if ($("#auth-modal").hidden) return;
  $("#auth-modal").hidden = true;
  document.body.classList.remove("modal-open");
  if (authReturnFocus && document.contains(authReturnFocus)) authReturnFocus.focus();
}
function setAuthMode(mode) {
  authMode = mode;
  $("#auth-title").textContent = mode === "signup" ? "Create your Loadout account" : "Sign in to Loadout";
  $("#auth-submit").textContent = mode === "signup" ? "Create account" : "Sign in";
  $("#auth-pass").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("#auth-toggle").textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
  $("#auth-forgot").hidden = mode === "signup";
}
const AUTH_ERRORS = {
  "auth/invalid-credential": "That email and password don't match. Try again or reset your password.",
  "auth/wrong-password": "That email and password don't match. Try again or reset your password.",
  "auth/user-not-found": "There's no account with that email. Create one instead?",
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "You seem to be offline. Check your connection and try again.",
  "auth/unauthorized-domain": "This website's address isn't on Firebase's authorized domains list yet (see SETUP.md).",
  "auth/account-exists-with-different-credential": "That email is already used with another sign-in method. Sign in with that method instead.",
};
function authError(e) {
  if (!e || e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
  $("#auth-err").textContent = AUTH_ERRORS[e.code] || "Sign-in didn't work. Please try again.";
}
async function googleSignIn() {
  const provider = new FB.A.GoogleAuthProvider();
  try { await FB.A.signInWithPopup(FB.auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return FB.A.signInWithRedirect(FB.auth, provider);
    authError(e);
  }
}
async function emailSubmit() {
  const email = $("#auth-email").value.trim(), pass = $("#auth-pass").value;
  if (!email || !pass) { $("#auth-err").textContent = "Enter your email and a password."; return; }
  const btn = $("#auth-submit");
  btn.disabled = true;
  try {
    if (authMode === "signup") {
      const cred = await FB.A.createUserWithEmailAndPassword(FB.auth, email, pass);
      FB.A.sendEmailVerification(cred.user).catch(() => {});
      toast("Account created. We sent you an email to confirm your address.");
    } else await FB.A.signInWithEmailAndPassword(FB.auth, email, pass);
  } catch (e) { authError(e); }
  btn.disabled = false;
}
async function forgotPassword() {
  const email = $("#auth-email").value.trim();
  if (!email) { $("#auth-err").textContent = "Enter your email first, then choose Forgot password."; return; }
  try { await FB.A.sendPasswordResetEmail(FB.auth, email); } catch (e) { if (e.code !== "auth/user-not-found") return authError(e); }
  $("#auth-err").textContent = "";
  toast("If there's an account for that email, a reset link is on its way.");
}

/* ---------- Pro: Stripe Checkout and the billing portal ---------- */
const FN_ERRORS = {
  "functions/unauthenticated": "Sign in first.",
  "functions/already-exists": "You're already on Pro.",
  "functions/failed-precondition": "Payments aren't fully set up yet. The site owner needs to finish the Stripe setup.",
};
function busy(btn, label) {
  if (!btn) return;
  if (label) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
async function callAndGo(name, btn, label) {
  busy(btn, label);
  try {
    const { data } = await FB.Fn.httpsCallable(FB.fns, name)({});
    if (data && data.url && /^https:\/\/(checkout|billing)\.stripe\.com\//.test(data.url)) { location.assign(data.url); return; }
    throw { code: "unknown" };
  } catch (e) {
    busy(btn, null);
    toast(FN_ERRORS[e && e.code] || "That didn't work. Please try again in a minute.");
  }
}
function startCheckout(btn) {
  if (!SITE_READY || !FB) { toast("Payments aren't switched on yet."); return; }
  if (!account) { afterSignIn = () => { go("pro"); startCheckout($("#pro-subscribe")); }; openAuth("Sign in or create an account to subscribe to Pro."); return; }
  callAndGo("createCheckoutSession", btn, "Opening secure checkout…");
}
function openPortal(btn) { callAndGo("createPortalSession", btn, "Opening billing…"); }

function renderProSite() {
  const price = esc(SITE_CONFIG.proPrice || "$3.99"), per = esc(SITE_CONFIG.proInterval || "month");
  const why = view.pendingTab && !S.pro ? `<p class="note" style="font-size:14px;color:var(--gold);font-weight:700;margin:0">${esc(TAB_NAME[view.pendingTab] || "That")} is part of Loadout Pro.</p>` : "";
  let action;
  if (!SITE_READY) action = `<button type="button" class="btn gold" disabled>Subscribe for ${price}/${per}</button><p class="demo-note">Payments aren't switched on yet: the site owner still needs to connect Firebase and Stripe (see SETUP.md).</p>`;
  else if (!account) action = `<div class="row-actions"><button type="button" class="btn gold" id="pro-subscribe">Subscribe for ${price}/${per}</button><button type="button" class="btn ghost" id="pro-signin">Sign in</button></div><p class="demo-note">You'll sign in or create an account first, then pay on Stripe's secure checkout page.</p>`;
  else if (S.pro) {
    const end = customer && customer.currentPeriodEnd ? fmtDate(customer.currentPeriodEnd * 1000) : "";
    action = `<div class="row-actions"><button type="button" class="btn gold" data-go="library">Open my library</button><button type="button" class="btn ghost" id="pro-manage">Manage subscription</button></div>
      <p class="demo-note">${customer.cancelAtPeriodEnd ? `Your Pro membership is cancelled and ends on ${end}. You can restart it from Manage subscription.` : `You're on Pro${end ? `. It renews on ${end}` : ""}. Change your card or cancel anytime from Manage subscription.`}</p>`;
  } else if (customer && customer.status === "past_due") {
    action = `<div class="row-actions"><button type="button" class="btn gold" id="pro-manage">Update payment method</button></div><p class="demo-note">Your last Pro payment didn't go through. Update your card to keep Pro.</p>`;
  } else action = `<div class="row-actions"><button type="button" class="btn gold" id="pro-subscribe">Subscribe for ${price}/${per}</button><button type="button" class="btn ghost" data-go="discover">Not now</button></div><p class="demo-note">Payment is handled by Stripe. Loadout never sees your card number. Cancel anytime; you keep Pro until the end of the period you've paid for.</p>`;
  $("#view-pro").innerHTML = `
    ${why}
    <div class="pro-hero">
      <div>
        <h1>Loadout <span>Pro</span>: your library, everywhere.</h1>
        <p>Track every game and app you play, keep your ratings and notes, and have them on every device you sign in on.</p>
        <div class="plan"><b>${price}</b><span>per ${per}, cancel anytime</span></div>
        ${action}
      </div>
      <ul class="perks">
        <li><span class="ic">${ICONS.track}</span><div><b>Track your library</b><small>Wishlist, backlog, playing, finished and dropped, for games and apps.</small></div></li>
        <li><span class="ic">${ICONS.bell}</span><div><b>Synced to your account</b><small>Your library, ratings and notes follow you to every device.</small></div></li>
        <li><span class="ic">${ICONS.tag}</span><div><b>Support independent reviews</b><small>Pro keeps Loadout's reviews free for everyone and ad-free.</small></div></li>
      </ul>
    </div>`;
}

/* ---------- Events ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#auth-btn")) { e.stopPropagation(); account ? toggleAccountMenu() : openAuth(); return; }
  if (t.closest("#acct-menu [data-go]") || (!t.closest("#acct-menu") && $("#acct-menu") && !$("#acct-menu").hidden)) toggleAccountMenu(false);
  if (t.closest("#acct-signout")) { toggleAccountMenu(false); FB.A.signOut(FB.auth).then(() => toast("Signed out")); return; }
  if (t.closest("#acct-manage")) { toggleAccountMenu(false); openPortal(t.closest("#acct-manage")); return; }
  if (t.closest("#auth-close") || t === $("#auth-modal")) { closeAuth(); return; }
  if (t.closest("#auth-google")) { $("#auth-err").textContent = ""; googleSignIn(); return; }
  if (t.closest("#auth-toggle")) { setAuthMode(authMode === "signup" ? "signin" : "signup"); $("#auth-err").textContent = ""; return; }
  if (t.closest("#auth-forgot")) { forgotPassword(); return; }
  if (t.closest("#pro-subscribe")) { startCheckout(t.closest("#pro-subscribe")); return; }
  if (t.closest("#pro-signin")) { openAuth(); return; }
  if (t.closest("#pro-manage")) { openPortal(t.closest("#pro-manage")); return; }
}, true);
$("#auth-form").addEventListener("submit", e => { e.preventDefault(); emailSubmit(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("#auth-modal").hidden) { e.stopImmediatePropagation(); closeAuth(); } else if (!$("#acct-menu").hidden) toggleAccountMenu(false); }
  if (e.key === "Tab" && !$("#auth-modal").hidden) {
    const f = [...$("#auth-modal").querySelectorAll("button:not([hidden]), input, a[href]")].filter(x => !x.disabled);
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}, true);

startApp();
