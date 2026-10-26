# Deploying LittleGo for the pilot

This takes about half a day the first time. You need accounts with GitHub, Render, Termii (or Africa's Talking), Paystack and Expo.

## 1. Accounts and keys to get first

| Service | What to get | Notes |
| --- | --- | --- |
| **Termii** (SMS) | API key, the **base URL shown on your dashboard**, an approved **sender ID** (e.g. `LittleGo`) | Ask Termii support to enable the **DND channel**. Without it, codes and PINs will not reach numbers on Do-Not-Disturb, which is many Nigerian lines. Sender ID approval can take several days, so apply first. |
| or **Africa's Talking** | Username, API key, sender ID | Use username `sandbox` to test for free. Also offers the USSD code for parents without data. |
| **Paystack** | Test secret key (`sk_test_…`), later the live key | Live keys need business verification (CAC documents). Start with test keys. |
| **Render** | Account linked to GitHub | Region: Frankfurt (closest to Lagos). |
| **Google Cloud** | Maps SDK for Android key | Needed for the map in the Android store build only. Restrict it to the app's package `com.littlego.app`. |
| **Expo** | Account for EAS builds | Free tier is enough for the pilot. |

## 2. Put the code on GitHub

```bash
cd littlego
git remote add origin https://github.com/<you>/littlego.git
git push -u origin main
```

## 3. Deploy on Render (Blueprint)

1. Render dashboard → **New → Blueprint** → connect GitHub → choose `littlego`. Render reads `render.yaml` and creates:
   - `littlego-db`: PostgreSQL 16
   - `littlego-api`: the API (runs database migrations on every start)
   - `littlego-dashboard`: the school and ops dashboard
   - `littlego-generate-trips` and `littlego-watchdog`: the scheduled jobs
2. The database address, sign-in secret and Paystack return page are linked automatically. Render asks for:
   - `LITTLEGO_CORS_ORIGINS` (API) and `VITE_API_URL` (dashboard): the dashboard's and the API's **public** addresses, copied from the top of each service page. If you don't know them yet, enter a placeholder, deploy, then set the real values and redeploy.
   - `LITTLEGO_PIN_ENCRYPTION_KEY`: on a Mac, run `python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"`. Keep a copy in a password manager; losing it makes in-flight handover PINs unreadable.
   - `LITTLEGO_OPS_ALERT_PHONES`: phones that must receive every SOS, comma separated
   - `LITTLEGO_TERMII_API_KEY`: a newly generated Termii key
   - `LITTLEGO_PAYSTACK_SECRET_KEY`: the `sk_test_...` key
3. The API **refuses to start** if a production setting is unsafe, and the deploy log says exactly what is missing.

## 4. First login

Open a shell on `littlego-api` in Render and create the first ops account (there is no demo data in production):

```bash
python -m app.bootstrap --name "Your Name" --phone 0803xxxxxxx --password "at-least-12-characters"
```

Sign in to the dashboard, then add schools and staff, vehicles, crew (with vetting), families (CSV import) and routes.

## 4b. Check the deployment

In the Render shell for `littlego-api`:

```bash
python -m app.readiness --live --sms <your phone>   # every FAIL line says what to fix
python -m app.dry_run                               # must end with "DRY RUN PASSED"
```

Deploy a **staging** copy first (a second Blueprint with names ending `-staging` and Paystack test keys). Use it for the test plan before you touch production.

## 5. Paystack

- Dashboard → Settings → API Keys & Webhooks → Webhook URL: `https://<your-api>/payments/paystack/webhook`
- Set `LITTLEGO_PAYSTACK_CALLBACK_URL` to `https://<your-api>/payments/return`. It confirms the payment, activates the plan and shows a "Return to the LittleGo app" button.
- Test with Paystack's test cards and test bank before switching to `sk_live_…`.

## 5b. Website waitlist (littlego.ng)

The website lives in its own repository, `littlegoSite`. Its waitlist form posts to this API.

1. On `littlego-api` → Environment, add the website to the allowed origins and redeploy:
   `LITTLEGO_CORS_ORIGINS` = `https://littlego-dashboard.onrender.com,https://littlego.ng,https://www.littlego.ng`
2. In `littlegoSite/config.js`, set `waitlistEndpoint` to `https://littlego-api.onrender.com/public/waitlist`.
3. Optional: set `LITTLEGO_WAITLIST_IP_SALT` to any long random string (otherwise the JWT secret is used).

Sign-ups are visible to ops at `GET /ops/waitlist` (with counts by area and journey) and download as a spreadsheet from `GET /ops/waitlist.csv`. The table is created automatically by the migration on the next deploy.

## 6. Mobile apps

```bash
cd mobile
# set your API URL in eas.json (preview and production profiles)
# the Google Maps Android key is an EAS environment variable, read by app.config.js (see below)
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # an APK you can share with pilot parents and crew
```

**Google Maps key (Android map).** The key is not in git. Store it once as an EAS environment variable and every build reads it:

```bash
npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_KEY --value <key> --environment preview --environment production --visibility sensitive
```

In Google Cloud the key is restricted to Android apps (package `com.littlego.app` plus the SHA-1 from `npx eas-cli@latest credentials`) and to the Maps SDK for Android only. When the app goes on the Play Store, add the Play App Signing SHA-1 to the same key.

For the pilot, an Android APK shared directly is the fastest route. Publish to the Play Store and App Store once the pilot is stable (store review takes days, and Apple needs a paid developer account).

## 7. USSD (optional)

With Africa's Talking, request a USSD service code and set its callback URL to `https://<your-api>/ussd`. Parents dial the code to see where their child is and get the handover PIN, with no data needed.

## Costs to expect for the pilot (approximate)

Render starter API + basic Postgres + jobs: roughly US$20–40 per month. SMS: each trip sends about 3–5 messages per child (boarding, PIN, handover), so budget for roughly 2,000–3,000 SMS per month for 100 children. Check current Termii pricing for DND messages.
