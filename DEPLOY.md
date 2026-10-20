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

1. Render dashboard → **New → Blueprint** → choose the repo. It reads `render.yaml` and creates:
   - `littlego-db`: PostgreSQL 16
   - `littlego-api`: the API (Docker; runs database migrations on every start)
   - `littlego-dashboard`: the school and ops web dashboard
   - two scheduled jobs: create each day's trips at 05:00, and check for vehicles that stop reporting their location every 5 minutes
2. Fill in the secrets Render asks for:
   - `LITTLEGO_PIN_ENCRYPTION_KEY`: run `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and **store the value safely**. Losing it makes in-flight handover PINs unreadable.
   - `LITTLEGO_CORS_ORIGINS`: the dashboard URL, e.g. `https://littlego-dashboard.onrender.com`
   - `LITTLEGO_OPS_ALERT_PHONES`: the ops phones that get every SOS and critical alert by SMS
   - Termii and Paystack keys
   - For the dashboard: `VITE_API_URL` = the API URL
   - For the `littlego-shared` group used by the jobs: the same database URL, JWT secret and PIN key as the API
3. The API **refuses to start** if a production setting is unsafe (default secret, SQLite, `*` CORS, console SMS, mock payments). The deploy log lists exactly what is missing.

Railway works too: create a PostgreSQL service and a service from `backend/` (it detects the Dockerfile), and copy the same variables.

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
- Set `LITTLEGO_PAYSTACK_CALLBACK_URL` to a simple "Payment complete, return to the LittleGo app" page (or `littlego://` once the store app exists).
- Test with Paystack's test cards and test bank before switching to `sk_live_…`.

## 6. Mobile apps

```bash
cd mobile
# set your API URL in eas.json (preview and production profiles)
# put the Google Maps Android key in app.json → android.config.googleMaps.apiKey
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # an APK you can share with pilot parents and crew
```

For the pilot, an Android APK shared directly is the fastest route. Publish to the Play Store and App Store once the pilot is stable (store review takes days, and Apple needs a paid developer account).

## 7. USSD (optional)

With Africa's Talking, request a USSD service code and set its callback URL to `https://<your-api>/ussd`. Parents dial the code to see where their child is and get the handover PIN, with no data needed.

## Costs to expect for the pilot (approximate)

Render starter API + basic Postgres + jobs: roughly US$20–40 per month. SMS: each trip sends about 3–5 messages per child (boarding, PIN, handover), so budget for roughly 2,000–3,000 SMS per month for 100 children. Check current Termii pricing for DND messages.
