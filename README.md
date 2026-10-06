# WardRide MVP

Child-only school transport: vetted driver and escort on every trip, verified release at the school gate, PIN-checked handover at home, live tracking, camera access for parents, alerts and SOS.

| Folder | What it is | Built with |
| --- | --- | --- |
| `backend/` | The API and all safety rules | Python 3.12+, FastAPI, SQLAlchemy (SQLite for dev, PostgreSQL for production) |
| `web/` | School dashboard and ops centre | React + TypeScript (Vite) |
| `mobile/` | Parent app and driver/escort app (one app; the screens change with the user's role) | React Native with Expo SDK 57 |

## Run it locally

### 1. API

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed            # creates demo data (fictional names)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs · Tests: `python -m pytest`

### 2. School dashboard

```bash
cd web
npm install
npm run dev                   # http://localhost:5173
```

Set `VITE_API_URL` in `web/.env` if the API is not on `http://localhost:8000`.

### 3. Mobile app

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000 npx expo start
```

Scan the QR code with **Expo Go** on an Android phone or iPhone on the same Wi-Fi. On a phone, `localhost` means the phone itself, so use your computer's LAN IP address.

### Demo accounts (password `wardride123`)

| Role | Phone | Use in |
| --- | --- | --- |
| School admin (Greenfield Academy) | 08030000001 | Web |
| Ops centre | 08030000002 | Web |
| Driver, bus WR-14 | 08030000010 | Mobile |
| Escort, bus WR-14 | 08030000011 | Mobile |
| Parent (Tolu and Kemi) | 08030000100 | Mobile |
| Parent (Chidera) | 08030000101 | Mobile |

Children's card IDs for boarding: `CARD-TOLU`, `CARD-KEMI`, `CARD-CHIDERA`, `CARD-AMINA`.

**Try the full journey:** driver starts the trip → school releases Tolu on the web → driver boards `CARD-TOLU` → parent sees "On board" and the PIN → driver taps Tolu, chooses an approved adult, enters the PIN.

## Safety rules enforced by the API

All in `backend/app/services/safety.py`, covered by `backend/tests/test_safety.py` (18 tests):

- A trip starts only with **two different, vetted crew members** (driver + escort). No other adult can be attached to a trip.
- The school can release a child **only onto a trip booked for that child today**; crew can board a child **only after the school has released them**.
- Boarding creates a **one-time 4-digit PIN** sent by SMS to the parent and approved adults.
- Handover needs an **approved adult + the correct PIN**. Three wrong PINs lock the handover and alert ops. Choosing an adult who is not on the family's list raises a critical alert.
- **No approved adult at home** → the child stays with the escort and goes to the school's safe hub; the parent is notified.
- A trip **cannot end while any child is still on board**.
- **Live video** is available only to a parent whose own child is on that vehicle, only during the trip, and **every view is logged**. Parents never see other families' children.
- Location pings raise **route-deviation** (> 1.5 km off route) and **speeding** (> 80 km/h) alerts, without repeating an open alert.
- **SOS** from crew or parent is critical and is sent to the ops phone numbers at once.

## Stand-ins to replace before the pilot

The code runs end to end without any accounts. These parts use stand-ins in `backend/app/services/providers.py`; switch them with an environment variable once implemented:

| Service | Now | Replace with | Setting |
| --- | --- | --- | --- |
| SMS | Printed to the server log and saved in the `notifications` table | Termii or Africa's Talking | `WARDRIDE_SMS_PROVIDER` |
| Payments | Every payment succeeds | Paystack or Flutterwave | `WARDRIDE_PAYMENT_PROVIDER` |
| Live video | Placeholder stream URL | Your mobile DVR vendor's signed stream (HLS/WebRTC) and a video player in the app | `WARDRIDE_VIDEO_PROVIDER` |
| Card scanning | Typed card ID | NFC reader (e.g. `react-native-nfc-manager`) or QR scan (`expo-camera`) | — |
| Map | Coordinates as text | `react-native-maps` / Google Maps | — |

## Before production

- [ ] Set a long random `WARDRIDE_JWT_SECRET` and restrict CORS in `app/main.py`
- [ ] Move to PostgreSQL (`docker compose up -d`, then set `WARDRIDE_DATABASE_URL`) and add Alembic migrations
- [ ] Add SMS one-time-code login and password reset
- [ ] Encrypt the handover PIN at rest and set data retention periods (NDPA)
- [ ] Add push notifications (Expo Notifications) and USSD status checks
- [ ] Offline queue in the crew app for boarding and handovers when data drops
- [ ] Admin screens for vehicles, crew vetting records, trips and route planning (currently seeded)
- [ ] Penetration test and NDPA data protection impact assessment
- [ ] Build store apps with EAS (`npx eas-cli@latest build`)
