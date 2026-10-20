# LittleGo pilot runbook

How the ops team runs the service day to day.

## Before the pilot term

1. **Schools** (Ops → Schools & staff): add each school with its gate location and safe hub. Add the gate staff who will release children; they sign in to the dashboard with an SMS code.
2. **Vehicles** (Ops → Vehicles): add each vehicle with its seat count and number of cameras.
3. **Crew** (Ops → Crew): add drivers and escorts. Record vetting evidence (police check reference, guarantor, address check, medical, training dates) and an expiry date, then **Mark vetted**. Unvetted or expired crew cannot start a trip.
4. **Families** (Ops → Families): download the CSV template, fill one row per child, import. Use **Set location** to add any missing home locations (in Google Maps, right-click the house and copy the coordinates).
5. **Plans**: parents pay in the app with Paystack. For school-sponsored or free-trial children, ops can activate a plan by hand through the API (`POST /admin/bookings`, with a note). This could become a dashboard button.
6. **Cards** (Ops → Families → Print QR cards): print on card stock, laminate, and attach to each child's school bag.
7. **Routes** (Ops → Routes): one route per vehicle per run, with children in drop-off order.
8. **Dry run**: run the full journey for two weeks without children, using test cards.

## Every school day

| Time (Lagos) | What happens | Who |
| --- | --- | --- |
| 05:00 | Trips are created automatically from routes and paid plans | System |
| Morning | Check Ops → Trips for crew problems or children left off (no paid plan) | Ops |
| Pickup | Driver or escort taps **Start trip**. This fails if crew are not vetted. | Crew |
| At the gate | Staff scan each child's card on the dashboard. A child is released only onto a booked trip. | School |
| Boarding | Escort scans the child's card in the app. The parent and approved adults get an SMS with the one-time PIN. | Crew |
| On the road | The app sends location every ~30 seconds. Ops watches **Live**. | Ops |
| Drop-off | Escort chooses the approved adult, checks their face, and enters the PIN they give. | Crew |
| Nobody home | Tap **No approved adult here**. The child stays with the escort and goes to the safe hub; the parent is told. | Crew |
| End | **End trip** works only when no child is still on board | Crew |

## Alerts and what to do

| Alert | Meaning | Action |
| --- | --- | --- |
| **SOS** (critical, SMS to ops) | Crew or parent pressed SOS | Call the escort at once, then the parent. Follow the incident playbook. |
| **Unapproved receiver** (critical) | Crew tried to hand a child to someone not on the list | Call the escort. The child stays on board. Call the parent. |
| **PIN locked** (critical) | Three wrong PINs | Confirm the adult's identity with the parent by phone before any handover |
| **Route deviation** | Vehicle more than 1.5 km off route | Call the driver; record the reason |
| **Speeding** | Above 80 km/h | Call the driver; repeat events → retraining |
| **Location stale** | No location for 5+ minutes | Call the escort; check phone battery and data |
| **Camera offline** | Fewer cameras online at trip start | Fix before the next run; log in the vehicle record |
| **SMS FAILED** (in notifications) | Provider did not accept a message | Call the parent with the update; check SMS credit |

Resolve each alert in the dashboard once handled, so the open count stays meaningful.

## Weekly pilot report (KPIs)

- Safeguarding incidents (target: zero)
- On-time pickups and drop-offs (target ≥ 95%)
- Handovers verified by PIN (target 100%)
- Camera uptime during trips (target ≥ 98%)
- Alerts by type, and time to resolve
- Parent feedback and renewals
