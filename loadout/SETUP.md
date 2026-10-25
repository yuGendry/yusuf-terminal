# Putting Loadout online with real sign-in and real Pro payments

The website version of Loadout lives in `loadout/site/` and is built by `python3 loadout/tools/build.py`. It needs two accounts that only you can create:

- **Firebase** (Google): sign-in with Google or email, the database for synced libraries, hosting, and the small server functions that talk to Stripe.
- **Stripe**: takes the Pro payments and pays them out to your bank. You must be 18+ and verify your identity.

Do everything in **Stripe test mode** first. Test mode uses fake cards and moves no real money. Switch to live mode only at the end.

You'll need Node.js 22 and Python 3 on your computer, plus the Firebase command-line tool:

```sh
npm install -g firebase-tools
firebase login
```

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com>, choose **Create a project** and name it (for example `loadout`). Note the **project ID**.
2. Upgrade the project to the **Blaze (pay as you go)** plan: Project settings → Usage and billing. Cloud Functions need it. Small sites stay inside the free quotas, but set a **budget alert** (for example $5) so nothing surprises you.
3. **Add a web app**: Project settings → General → Your apps → Web (`</>`). Copy the `firebaseConfig` values into the `firebase` block of `loadout/site.config.json`.
4. Fill in the rest of `site.config.json`: `ownerName`, `contactEmail`, and `siteUrl` (`https://YOUR_PROJECT_ID.web.app` unless you add your own domain).
   Everything in this file is public by design. **Never put a Stripe secret key (`sk_...`) in it.**
5. **Sign-in methods**: Build → Authentication → Get started → Sign-in method. Turn on **Google** (choose a support email) and **Email/Password**.
6. **Authorized domains**: Authentication → Settings → Authorized domains. `YOUR_PROJECT_ID.web.app` and `localhost` are already there; add your own domain if you use one.
7. **Database**: Build → Firestore Database → Create database → production mode → pick a location near your users.

## 2. Set up Stripe

1. Create an account at <https://dashboard.stripe.com/register> and stay in **test mode** (toggle at the top).
2. **Product catalog → Add product**: name it `Loadout Pro`, recurring price **$3.99 per month** (or whatever you set as `proPrice` in `site.config.json`). Save, then copy the price's ID (`price_...`).
3. **Settings → Billing → Customer portal**: activate it and allow customers to cancel subscriptions and update payment methods. The "Manage subscription" button uses this.
4. **Developers → API keys**: copy the **secret key** (`sk_test_...`). Keep it private.

## 3. Connect and deploy the functions

From the `loadout` folder:

```sh
cd loadout
cp .firebaserc.example .firebaserc                # then put your project ID in it
cp backend/functions/.env.example backend/functions/.env
#   edit backend/functions/.env: STRIPE_PRICE_ID=price_... and SITE_URL=https://YOUR_PROJECT_ID.web.app
(cd backend/functions && npm install && npm test)  # offline checks of the payment logic
firebase functions:secrets:set STRIPE_SECRET_KEY   # paste sk_test_...
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   # paste anything for now (e.g. whsec_placeholder); you'll replace it in step 4
firebase deploy --only functions,firestore:rules
```

The deploy prints a URL for `stripeWebhook`. Copy it.

## 4. Tell Stripe where to send payment events

1. Stripe → **Developers → Webhooks → Add endpoint**. Paste the `stripeWebhook` URL.
2. Select these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`.
3. Open the new endpoint, reveal the **signing secret** (`whsec_...`), then:

```sh
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   # paste whsec_...
firebase deploy --only functions
```

The webhook is the only thing that can turn Pro on. The database rules block everyone else from writing it, so nobody can grant themselves Pro.

## 5. Build and publish the website

```sh
python3 tools/build.py              # rebuilds site/ with your site.config.json
firebase deploy --only hosting
```

Your site is now at `https://YOUR_PROJECT_ID.web.app`.

**Prefer GitHub Pages or another host?** Upload the contents of `loadout/site/` anywhere that serves static files. Then add that domain under Authentication → Authorized domains, set `SITE_URL` in `backend/functions/.env` and `siteUrl` in `site.config.json` to it, rebuild, and run `firebase deploy --only functions`. The functions and database stay on Firebase.

## 6. Test it end to end (test mode)

1. Open your site and sign in with Google, then sign out and try **Create an account** with an email.
2. Go to **Get Pro → Subscribe**. On Stripe's checkout page use the test card `4242 4242 4242 4242`, any future date, any CVC and any postcode.
3. You land back on Loadout and Pro switches on within a few seconds. Track a game, then sign in on another browser: your library is there.
4. Open the account menu → **Manage subscription** → cancel. Pro stays until the end of the period, then switches off. To see the switch-off without waiting a month, use a Stripe test clock to fast-forward time on a test subscription.
5. If something doesn't switch on, check `firebase functions:log` and the webhook's event log in Stripe.

## 7. Go live

1. Finish Stripe's account activation: business details, bank account and identity check.
2. Review and edit `src/legal/terms.md.html` and `src/legal/privacy.md.html` (refund policy, your name, where you're based). They're a starting point, not legal advice. Stripe expects your site to show terms, a refund policy and a contact email, and these pages cover that once they're accurate.
3. In Stripe **live mode**, create the Pro product and price again (live prices have new IDs), turn on the customer portal, get the live secret key (`sk_live_...`) and add a live webhook endpoint with the same events.
4. Update `STRIPE_PRICE_ID` in `.env`, set both secrets again with the live values, then `firebase deploy --only functions` and rebuild/deploy the site.
5. Make one real purchase yourself and refund it from the Stripe dashboard to confirm everything works.

## Good to know

- **Costs**: Stripe charges per successful payment (in the US, 2.9% + 30¢ for standard card payments; check Stripe's pricing page for your country). Firebase's free quotas easily cover a small site.
- **Taxes**: depending on where you and your customers are, you may need to charge sales tax or VAT. Stripe Tax can handle this, but you have to switch it on and register where required.
- **What's real and what isn't**: Google/email sign-in, the Pro subscription, cancelling and syncing are real. Games and gift cards are not sold by Loadout; their buttons open the official stores. The demo store, demo deals and price watch exist only in the Claude artifact version.
- **Common errors**: "This website's address isn't on Firebase's authorized domains list" means step 1.6. "Payments aren't fully set up yet" means `STRIPE_PRICE_ID` is missing or wrong. Webhook deliveries failing with 400 mean the signing secret doesn't match.
