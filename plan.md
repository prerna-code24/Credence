# CREDENCE — Implementation Plan

## Scope and implementation approach

The available CREDENCE project directory was empty, so this is a fresh Flask reconstruction rather than an edit to existing source. Build a small, self-contained Flask application using Python, Jinja templates, vanilla JavaScript, CSS, and inline SVG—no unnecessary database, frontend framework, external API, or asset dependency. Preserve the user's requested full prototype scope. Use a compact deterministic synthetic dataset and server-backed JSON APIs for dashboard data, risk simulation, approvals, and audit events.

Provide the actual Manus OAuth path using the platform's `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, and `MANUS_JWT_SECRET` contracts when configured. Also expose an unmistakably labeled synthetic demo entry as the user explicitly allowed; it must never present synthetic demo identity/data as production authentication or real customer information. Protect application session state, distinguish demo from OAuth identity, and provide a useful logged-out/error state. Sensitive recommendations are proposals only until an explicit human approval action is recorded.

## Design direction

- **Design Movement:** Contemporary editorial-finance design with archival field-note details and crafted print ephemera.
- **Core Principles:** Quiet confidence; legible evidence before decoration; warm, tactile surfaces against a precise dark shell; motion communicates relationships and state.
- **Color Philosophy:** Charcoal anchors authority, mustard/yellow signal measured trust and attention, cream/ivory keep dense evidence readable and human. Offer coordinated light and dark palettes that preserve contrast and mustard/yellow decision cues; default to the system preference until the user chooses, then remember that choice.
- **Palette:** Charcoal `#2B2B2B`, Mustard `#D4A017`, Yellow `#F0C94C`, Cream `#F7E7B5`, Ivory `#FFFDF5`, with restrained ink/line neutrals derived from these colors.
- **Layout Paradigm:** Asymmetric editorial landing sections, generous left-aligned copy, a centered wordmark in a full-screen hero, and a persistent charcoal dashboard rail beside a spacious workspace; place a clear, accessible theme control within each page's existing navigation.
- **Signature Elements:** A fine-line trust orbit with named evidence nodes; small stamped labels and ruled evidence rows; mustard transaction paths connecting agent identities to resources.
- **Interaction Philosophy:** Every control produces visible, understandable state. Risk inputs immediately recompute a transparent score; charts disclose their meaning; consequential access is gated behind a review action.
- **Animation:** CSS/SVG trajectories and small document fragments move slowly and purposefully; cursor response is subtle and bounded; respect `prefers-reduced-motion` and keep the interface complete without animation.
- **Typography System:** Distinctive serif display headings paired with a neutral sans-serif UI/body face; monospaced overlines and metric labels remain secondary without dropping into tiny text; raise body copy to at least 16px, primary buttons and visible theme labels to at least 13px, compact secondary filters/actions to at least 11–12px, and dense supporting labels to at least 10–11px with generous line-height.
- **Brand Essence:** A human-governed trust layer for AI agents that makes evidence visible before granting access. Personality: considered, candid, dependable.
- **Brand Voice:** Direct, evidence-led, and calm. Examples: “Trust, Before Access.” “A recommendation is not a permission.”
- **Wordmark & Logo:** Custom typeset CREDENCE lockup with a small orbit/record-dot insignia, not an off-the-shelf dashboard glyph.
- **Signature Brand Color:** Mustard `#D4A017` used as a deliberate decision accent, not a page-wide wash.

## Routes, modules, and data flow

- `/` — cinematic marketing page, problem/trust/permissions story, graph, live synthetic demo, feature overview, module index, CTA and disclaimer.
- `/signin` and `/signup` — OAuth and clearly labeled demo entry, synthetic sign-up validation, accessible error states.
- `/dashboard` — dashboard shell, KPIs, meaningful trust distribution/chart, agent/evidence table, timelines, module navigation.
- `/modules/<slug>` — dedicated functional views for each of the eight modules, sharing a cohesive layout.
- `/api/dashboard`, `/api/agents`, `/api/risk/simulate`, `/api/recommendations`, `/api/approvals`, `/api/alerts`, `/api/audit`, `/api/passport`, and permission/decision routes — JSON endpoints backed by the synthetic data model and in-memory audit events.
- OAuth begin/callback/logout endpoints — nonce/state-bound platform OAuth with fixed internal redirects and a separate application session cookie.

Risk dimensions are normalized to 0–100. Risk equals 30% scope breadth + 35% anomaly rate + 20% volatility + 15% evidence staleness; Trust equals 100 minus Risk. Confidence is computed and displayed separately. Missing/insufficient evidence yields an abstention with a clear reason, never a fabricated confident recommendation. A sensitive-access request creates a pending human-approval record and changes to approved only after an explicit review action.

## Project structure

- `app.py` — Flask app, OAuth/application-session handling, synthetic models, risk/recommendation logic, API and page routes, audit events.
- `templates/` — shared layout, landing page, sign-in page, dashboard shell and module partials/pages.
- `static/css/` — palette, typography, layout, responsive behavior, reduced-motion treatment, animation.
- `static/js/` — landing interactions, dashboard charts/graph, simulator, module controls, fetch/API wiring.
- `public/manus-routes.json` — page-route manifest for landing, sign-in/sign-up, dashboard, and module routes.
- `README.md` — local setup, environment configuration, demo/OAuth distinction, prototype disclaimer.
- `TODO.md` — complete acceptance clauses grouped by deliverable outcomes.

## Serving and delivery

Run Flask on `0.0.0.0:$PORT` (default 3000) to satisfy the managed Preview. Keep all browser links root-relative for proxy compatibility. Use the configured server capability; do not provision a database or third-party service. Package the app in a root `Dockerfile` using pinned Flask/Gunicorn dependencies, syntax compilation, and Gunicorn as the production entrypoint; honor `PORT`, expose 3000, set secure HTTPS session cookies in the container, and run one worker with threads because the prototype's synthetic state is in process memory. Keep its transient synthetic-data boundary explicit; no production credentials or dev secrets may be baked into the image. Declare deploy using the root Dockerfile and the existing unauthenticated `/health` route. Verify the health path and source checks, checkpoint to canonical `main`, then use the requested publish operation and report a public URL only after confirmed success.
