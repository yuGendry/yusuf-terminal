/**
 * Loadout Pro payments: Stripe Checkout, the Stripe billing portal and the Stripe webhook.
 *
 * - createCheckoutSession (callable, signed-in users): starts a Stripe Checkout subscription for the Pro price.
 * - createPortalSession (callable, signed-in users): opens Stripe's billing portal to change card or cancel.
 * - stripeWebhook (HTTPS endpoint for Stripe): the only thing that writes customers/{uid}.pro.
 *
 * Secrets (set with `firebase functions:secrets:set NAME`): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 * Params (in .env, see .env.example): STRIPE_PRICE_ID, SITE_URL.
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");

initializeApp();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_PRICE_ID = defineString("STRIPE_PRICE_ID");
const SITE_URL = defineString("SITE_URL");

const ACTIVE = new Set(["active", "trialing"]);
const db = () => getFirestore();
const stripeClient = () => new Stripe(STRIPE_SECRET_KEY.value());
const siteUrl = () => SITE_URL.value().replace(/\/+$/, "");

/** Find or create the Stripe customer for a Firebase user, remembered in customers/{uid}. */
async function customerFor(uid, email, stripe, store = db()) {
  const ref = store.doc(`customers/${uid}`);
  const snap = await ref.get();
  if (snap.exists && snap.data().stripeCustomerId) return snap.data().stripeCustomerId;
  const customer = await stripe.customers.create({ email, metadata: { firebaseUID: uid } }, { idempotencyKey: `customer-${uid}` });
  await ref.set({ stripeCustomerId: customer.id, pro: false }, { merge: true });
  return customer.id;
}

/** Write a subscription's current state to customers/{uid}. Re-reads it from Stripe so out-of-order webhooks can't win. */
async function applySubscription(subscriptionId, stripe, store = db()) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  let uid = sub.metadata && sub.metadata.firebaseUID;
  if (!uid) {
    const q = await store.collection("customers").where("stripeCustomerId", "==", sub.customer).limit(1).get();
    uid = q.empty ? null : q.docs[0].id;
  }
  if (!uid) {
    logger.warn("Subscription without a matching Firebase user", { subscription: sub.id, customer: sub.customer });
    return null;
  }
  const item = sub.items && sub.items.data && sub.items.data[0];
  const state = {
    stripeCustomerId: sub.customer,
    subscriptionId: sub.id,
    status: sub.status,
    pro: ACTIVE.has(sub.status),
    priceId: item && item.price ? item.price.id : null,
    currentPeriodEnd: sub.current_period_end || (item && item.current_period_end) || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    updated: FieldValue.serverTimestamp(),
  };
  await store.doc(`customers/${uid}`).set(state, { merge: true });
  return { uid, ...state };
}

exports.createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  const snap = await db().doc(`customers/${uid}`).get();
  if (snap.exists && snap.data().pro) throw new HttpsError("already-exists", "You're already on Pro.");
  const priceId = STRIPE_PRICE_ID.value();
  if (!/^price_/.test(priceId)) throw new HttpsError("failed-precondition", "STRIPE_PRICE_ID isn't set.");
  const stripe = stripeClient();
  const customer = await customerFor(uid, req.auth.token.email || undefined, stripe);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: uid,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { firebaseUID: uid } },
    allow_promotion_codes: true,
    // Return addresses come from config, never from the browser, so they can't be redirected elsewhere.
    success_url: `${siteUrl()}/?checkout=success#pro`,
    cancel_url: `${siteUrl()}/?checkout=cancel#pro`,
  });
  return { url: session.url };
});

exports.createPortalSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const snap = await db().doc(`customers/${req.auth.uid}`).get();
  const customer = snap.exists && snap.data().stripeCustomerId;
  if (!customer) throw new HttpsError("failed-precondition", "There's no subscription on this account yet.");
  const session = await stripeClient().billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/#pro` });
  return { url: session.url };
});

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** Pull the subscription id out of any event we handle. */
function subscriptionIdFrom(event) {
  const o = event.data.object;
  if (event.type.startsWith("customer.subscription.")) return o.id;
  if (event.type === "checkout.session.completed") return o.mode === "subscription" ? o.subscription : null;
  if (event.type.startsWith("invoice.")) {
    return o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || null;
  }
  return null;
}

async function handleStripeEvent(event, stripe, store = db()) {
  if (!HANDLED.has(event.type)) return null;
  const id = subscriptionIdFrom(event);
  if (!id) return null;
  return applySubscription(typeof id === "string" ? id : id.id, stripe, store);
}

exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  const stripe = stripeClient();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    logger.warn("Rejected a webhook with a bad signature", { message: err.message });
    res.status(400).send("Bad signature");
    return;
  }
  try {
    const result = await handleStripeEvent(event, stripe);
    if (result) logger.info("Subscription updated", { uid: result.uid, status: result.status, pro: result.pro });
    res.json({ received: true });
  } catch (err) {
    logger.error("Webhook handling failed", { type: event.type, id: event.id, message: err.message });
    res.status(500).send("Handler error"); // Stripe retries
  }
});

// Exported for tests.
exports._test = { customerFor, applySubscription, handleStripeEvent, subscriptionIdFrom };
