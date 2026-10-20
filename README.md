# CREDENCE — Trust, Before Access.

A runnable Flask prototype for agent identity, behavioural trust, evidence, and human-governed access review. The mustard/charcoal interface includes a landing page, an identity entry flow, an overview dashboard, and eight interactive trust modules.

## Run locally

Python 3.10+ is recommended.

```bash
python -m venv .venv
. .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
PORT=3000 python app.py       # Windows PowerShell: $env:PORT=3000; python app.py
```

Open `http://127.0.0.1:3000`. The app also listens on `0.0.0.0:$PORT`, defaulting to 3000, for a managed Preview/container. The application has no database requirement; the compact sample records and audit events live in memory and reset when the server restarts.

## Authentication modes

The sign-in page offers a clearly labeled **synthetic demo workspace**. Demo identity creation is temporary and fictional; the optional demo sign-up asks only for a display name, validates it, and does not create or retain a real account. Set `CREDENCE_DEMO_AUTH_ENABLED=0` to disable demo entry.

When running inside a configured Manus Webdev deployment, the app supports Manus OAuth using the platform-provided `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, and `MANUS_JWT_SECRET`. Configure the exact public HTTPS origin as `CREDENCE_PUBLIC_ORIGIN` so the OAuth callback URI is formed from the browser-facing Preview/deployment origin rather than the internal listener hostname. Managed Preview defaults to `Secure; SameSite=None` because the public browser origin is HTTPS even if the internal app listener uses HTTP. For plain-HTTP local work in an environment that also injects `MANUS_PROJECT_ID`, explicitly use `CREDENCE_COOKIE_SECURE=0` (Lax); do not use that override for HTTPS Preview. For a local HTTPS test, set `CREDENCE_COOKIE_SECURE=1`. Never put production credentials in source files. OAuth unavailable or failed states are shown honestly; use the synthetic mode only as a demo, not as production identity.

## Prototype boundaries

All agent names, owners, resources, risk factors, events, alerts, and approvals are synthetic. The illustrative score is:

`Risk = 30% scope breadth + 35% anomaly rate + 20% volatility + 15% evidence staleness`

`Trust = 100 − Risk`

Confidence is displayed separately. Fewer than three evidence observations or low confidence causes abstention with an explanation. Enabling a sensitive permission creates a pending human-approval record, and the synthetic scope remains paused until a reviewer explicitly approves it; a decline leaves it paused. Recommendations alone never grant access. This prototype is not an authorization service, an audit-compliance store, or a production risk model. Its in-memory state is not durable.

## Useful routes

- `/` — product story, animated trust map, and a client-side synthetic risk study.
- `/signin` and `/signup` — OAuth entry where configured and clearly labeled synthetic demo sign-in/sign-up.
- `/dashboard` — trust desk, compact metrics, charts, alert summaries, approvals, and action timeline.
- `/modules/identity`, `/modules/evidence`, `/modules/graph`, `/modules/recommendations`, `/modules/simulator`, `/modules/passport`, `/modules/monitoring`, `/modules/privacy` — the eight interactive modules.
- `/health` — simple unauthenticated liveness response.
- `/manus-routes.json` — page-route manifest.

The JSON APIs under `/api/` require an application session. Risk simulation, permission toggles, approval decisions, alert acknowledgement, evidence passport downloads, and audit export are implemented for the synthetic dataset.

## Theme and readability

The interface follows the operating system’s light/dark preference until you choose a theme with the navigation toggle. Your choice is remembered in the browser across pages and future visits. Body copy and dashboard labels use a larger, more readable scale while retaining the editorial display type.


## Managed container deployment

The root `Dockerfile` installs the pinned Flask/Gunicorn requirements, checks Python syntax during image build, and starts Gunicorn as a non-root user. The entrypoint binds to `0.0.0.0:$PORT` (default 3000), uses a single worker because sample state and audit events are in process memory, and sets secure HTTPS session cookies. Webdev's deploy contract uses `Dockerfile` and the unauthenticated `/health` endpoint for readiness.

All agent records, alert/approval changes, and audit events are synthetic and held in memory. They can reset when an instance restarts or is replaced. This demo is not a persistence, compliance, or production authorization service. No secret values are included in the image; configure protected OAuth values only through the platform's runtime secret handling if real Manus sign-in is required.
