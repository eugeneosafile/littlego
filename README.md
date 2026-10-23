# LittleGo (v0.3, pilot-ready)

Child-only school transport: vetted driver and escort on every trip, verified release at the school gate, PIN-checked handover at home, live tracking and maps, camera access for parents, alerts and SOS.

| Folder | What it is | Built with |
| --- | --- | --- |
| `backend/` | API, safety rules, SMS, payments, scheduled jobs | Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL |
| `web/` | School dashboard and ops centre, including set-up screens and live map | React + TypeScript (Vite), Leaflet |
| `mobile/` | Parent app and driver/escort app (one app; screens follow the user's role) | React Native, Expo SDK 57 |

- **[DEPLOY.md](DEPLOY.md)**: accounts to open, deploying on Render, Paystack webhook, building the Android app
- **[PILOT_RUNBOOK.md](PILOT_RUNBOOK.md)**: set-up checklist, daily routine, what each alert means

## What's in v0.2

- **Real SMS**: Termii or Africa's Talking. A failed SMS never blocks a safety step; it is logged as FAILED for ops to follow up.
- **SMS sign-in codes** for parents, crew and staff, with rate limits and lockouts. Only a hash of each code is stored.
- **Paystack**: checkout (card, bank, USSD, transfer), signed webhook, underpayment check, and a "check payment" fallback.
- **Ops set-up screens**: schools and staff, vehicles, crew vetting with evidence and expiry, family CSV import, printable QR cards, route builder, and daily trip creation.
- **Scheduled jobs**: trips created at 05:00 on school days from routes and paid plans; a watchdog alerts when a vehicle stops reporting its location.
- **Maps**: live map on the school and ops dashboards; vehicle, school and home map in the parent app.
- **QR boarding**: crew scan the child's card with the phone camera. School gate staff can use a USB QR scanner.
- **USSD**: parents without data dial a code to see their child's status and handover PIN.
- **Hardening**:
  - Handover PINs encrypted at rest.
  - Production start-up refuses unsafe settings.
  - Alembic migrations, CORS allow-list and security headers.
  - Website waitlist: `POST /public/waitlist` for littlego.ng, with ops view and CSV export (`/ops/waitlist`, `/ops/waitlist.csv`).
  - API docs hidden in production.
  - Deactivated accounts lose access immediately.
  - All times in Lagos time.

## Before every pilot day and after every deploy

```bash
cd backend
python -m app.readiness            # PASS/WARN/FAIL for settings, services, database and set-up data (also in Ops → Pilot readiness)
python -m app.readiness --live --sms 0803xxxxxxx   # also checks the Paystack key and sends a real test SMS
python -m app.dry_run              # plays a full pilot day on the real database and removes its test data
```

## Run it locally

```bash
# API
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed                                     # demo data (fictional)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # docs at http://localhost:8000/docs

# Dashboard (new terminal)
cd web && npm install && npm run dev                   # http://localhost:5173

# Mobile (new terminal; phone on the same Wi-Fi with Expo Go)
cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000 npx expo start
```

In development, SMS messages (including sign-in codes and PINs) are printed in the API terminal instead of being sent.

**Demo accounts** (password `littlego123`; or use an SMS code):

| Role | Phone | Use in |
| --- | --- | --- |
| School staff | 08030000001 | Web |
| Ops | 08030000002 | Web |
| Driver, LG-14 | 08030000010 | Mobile |
| Parent of Tolu and Kemi | 08030000100 | Mobile |

Card IDs for typed boarding: `CARD-TOLU`, `CARD-KEMI`, `CARD-CHIDERA`, `CARD-AMINA`.

## Tests

```bash
cd backend && python -m pytest                          # 47 tests, SQLite
LITTLEGO_TEST_DATABASE_URL=postgresql+psycopg://user@host/db python -m pytest   # same tests on PostgreSQL
```

The tests cover:
- The safety rules: the two-adult rule, release before boarding, PIN handover, lockouts, the safe hub, privacy of live video, route and speed alerts, SOS.
- SMS codes and rate limits.
- Request formats for Termii, Africa's Talking and Paystack, using mocked HTTP.
- Paystack webhook signature checks and underpayment handling.
- PIN encryption.
- CSV import, crew vetting expiry, route validation and trip generation.
- USSD and the location watchdog.
- The production settings guard.

## Still to do before scale (after the pilot)

- [ ] **Live video player**: choose a mobile DVR vendor and implement `MockVideo.live_stream()` with their signed stream URLs, plus a player in the parent app
- [ ] **Offline queue** in the crew app for boarding when data drops (location pings already fail safely)
- [ ] **Push notifications** (Expo Notifications) alongside SMS, to cut SMS costs
- [ ] **Shared rate limiting** (Redis) if you run more than one API instance
- [ ] **Admin screen** for manual plans (the API endpoint already exists)
- [ ] **Commercial map tiles** for production volume (OpenStreetMap's free tiles are for light use)
- [ ] **Security checks**: penetration test and NDPA data protection impact assessment before scaling beyond the pilot
