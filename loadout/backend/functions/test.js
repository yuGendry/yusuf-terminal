// Offline checks for the payment logic: webhook signatures and subscription → Pro status.
// Uses a fake Firestore and a fake Stripe API, so no keys or network are needed. Run: npm test
const assert = require("assert");
const Stripe = require("stripe");

process.env.STRIPE_PRICE_ID = "price_test";
process.env.SITE_URL = "https://example.web.app";
const { _test } = require("./index.js");

function fakeStore() {
  const docs = new Map();
  const docRef = (path) => ({
    id: path.split("/").pop(),
    async get() { const d = docs.get(path); return { exists: !!d, data: () => d, id: path.split("/").pop() }; },
    async set(data, opts) { const prev = (opts && opts.merge && docs.get(path)) || {}; docs.set(path, { ...prev, ...data }); },
  });
  return {
    docs,
    doc: docRef,
    collection: (name) => ({
      where: (field, op, value) => ({
        limit: () => ({
          async get() {
            const hits = [...docs.entries()].filter(([p, d]) => p.startsWith(name + "/") && d[field] === value);
            return { empty: !hits.length, docs: hits.map(([p]) => ({ id: p.split("/").pop() })) };
          },
        }),
      }),
    }),
  };
}

function fakeStripe(subs) {
  return {
    customers: { async create({ email }) { return { id: "cus_" + (email || "x").replace(/\W/g, "") }; } },
    subscriptions: { async retrieve(id) { if (!subs[id]) throw new Error("no such subscription"); return subs[id]; } },
  };
}

(async () => {
  // 1. Webhook signatures: a correctly signed payload is accepted, a tampered one is rejected.
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.strictEqual(stripe.webhooks.constructEvent(payload, header, secret).id, "evt_1");
  assert.throws(() => stripe.webhooks.constructEvent(payload.replace("sub_1", "sub_2"), header, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, "whsec_wrong"));

  // 2. Subscription id is found for every event type we handle.
  const { subscriptionIdFrom, handleStripeEvent, customerFor } = _test;
  assert.strictEqual(subscriptionIdFrom({ type: "customer.subscription.deleted", data: { object: { id: "sub_9" } } }), "sub_9");
  assert.strictEqual(subscriptionIdFrom({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_8" } } }), "sub_8");
  assert.strictEqual(subscriptionIdFrom({ type: "checkout.session.completed", data: { object: { mode: "payment" } } }), null);
  assert.strictEqual(subscriptionIdFrom({ type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: "sub_7" } } } } }), "sub_7");

  // 3. Pro turns on for an active subscription and off when it's cancelled or unpaid.
  const store = fakeStore();
  const cus = await customerFor("user1", "a@b.co", fakeStripe({}), store);
  assert.strictEqual(store.docs.get("customers/user1").pro, false);
  const subs = {
    sub_a: { id: "sub_a", customer: cus, status: "active", metadata: { firebaseUID: "user1" }, cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_test" }, current_period_end: 1800000000 }] } },
  };
  const s = fakeStripe(subs);
  await handleStripeEvent({ type: "customer.subscription.created", data: { object: { id: "sub_a" } } }, s, store);
  let doc = store.docs.get("customers/user1");
  assert.strictEqual(doc.pro, true);
  assert.strictEqual(doc.currentPeriodEnd, 1800000000);
  subs.sub_a.status = "past_due";
  await handleStripeEvent({ type: "invoice.payment_failed", data: { object: { subscription: "sub_a" } } }, s, store);
  assert.strictEqual(store.docs.get("customers/user1").pro, false);
  subs.sub_a.status = "active"; subs.sub_a.cancel_at_period_end = true;
  await handleStripeEvent({ type: "customer.subscription.updated", data: { object: { id: "sub_a" } } }, s, store);
  doc = store.docs.get("customers/user1");
  assert.strictEqual(doc.pro, true);
  assert.strictEqual(doc.cancelAtPeriodEnd, true);
  subs.sub_a.status = "canceled";
  await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_a" } } }, s, store);
  assert.strictEqual(store.docs.get("customers/user1").pro, false);

  // 4. A subscription without metadata is matched through the stored Stripe customer id.
  subs.sub_b = { id: "sub_b", customer: cus, status: "active", metadata: {}, items: { data: [] } };
  const r = await handleStripeEvent({ type: "customer.subscription.created", data: { object: { id: "sub_b" } } }, s, store);
  assert.strictEqual(r.uid, "user1");
  assert.strictEqual(store.docs.get("customers/user1").pro, true);

  // 5. Events we don't handle change nothing.
  assert.strictEqual(await handleStripeEvent({ type: "charge.refunded", data: { object: {} } }, s, store), null);

  console.log("All payment checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
