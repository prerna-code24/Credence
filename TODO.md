# CREDENCE Prototype — Delivery Outcomes

## [x] 1. Premium landing page and visual system
- Use the Mustard palette consistently: Charcoal `#2B2B2B`, Mustard `#D4A017`, Yellow `#F0C94C`, Cream `#F7E7B5`, Ivory `#FFFDF5`.
- Create a premium, handcrafted fintech aesthetic with distinctive typography, precise spacing, subtle textures, clean borders, and excellent readability. Avoid generic AI templates, gradient blobs, excessive glowing circles, repetitive glass cards, and clutter.
- Centre **CREDENCE** perfectly in a full-screen hero. Add purposeful, lightweight animations: floating document fragments, labelled data nodes, moving transaction trails, connected agent symbols, orbital paths, and subtle cursor-reactive motion.
- Include “Trust, Before Access.”, a concise explanation, and functional **Explore Platform** and **Get Started** buttons.
- Add smooth-scrolling sections explaining the problem, trust assessment, and permissions, with an interactive trust graph, synthetic risk demo, feature highlights, all eight modules, and a final CTA.

## [x] 2. Authentication and session experience
- Create a dedicated, polished sign-in/sign-up page with validation and clear errors.
- Preserve Flask authentication or provide clearly labelled demo authentication if needed. Because no original source was present, the fresh app must distinguish any synthetic demo entry from actual OAuth identity and clearly label demo/synthetic state.

## [x] 3. Dashboard and eight functional modules
- Redesign the entire dashboard to match the homepage: charcoal sidebar, warm cream workspace, mustard accents, spacious layouts, meaningful charts, compact KPIs, polished tables, evidence timelines, and clear risk indicators. Avoid generic admin templates, unnecessary cards, and decorative charts.
- Keep all eight modules functional: (1) Agent Identity & Permissions; (2) Behavioural Trust & Evidence; (3) Agent Trust Graph; (4) Adaptive Access Recommendations; (5) What-If Simulator; (6) Evidence Passport; (7) Monitoring & Alerts; (8) Privacy & Audit.
- Ensure navigation, buttons, charts, filters, and simulator updates work correctly.

## [x] 4. Risk, evidence, and human governance
- Preserve existing Flask APIs and audit functionality where provided; no original API/source files were present in the available project, so implement coherent Flask JSON endpoints and audit events in the fresh app.
- Use a small synthetic dataset and this illustrative formula: **Risk = 30% scope breadth + 35% anomaly rate + 20% volatility + 15% evidence staleness. Trust = 100 − Risk.**
- Show confidence separately; abstain when evidence is insufficient and explain recommendations.
- Sensitive access requires human approval.
- Display a synthetic-data prototype disclaimer.

## [x] 5. Runnable, responsive delivery
- Modify existing files where present; fix broken interactions; ensure responsive layouts; respect reduced-motion settings; and retain simple README setup instructions.
- Avoid unnecessary infrastructure or features.
- Deliver the complete runnable prototype, not a mockup. Make both homepage and dashboard visually distinctive, cohesive, functional, and presentation-ready. Prioritise handcrafted design, smooth interactions, and reliable hackathon demos over complexity.

## [x] 6. Readability and theme choices
- Increase the too-small typography across the public pages, sign-in/sign-up, dashboard, and all eight modules. Use body copy of at least 16px, primary buttons and visible theme labels of at least 13px, compact secondary filters/actions of at least 11–12px, and supporting/metadata text of at least 10–11px while preserving responsive layouts and clear hierarchy.
- Provide both light and dark themes throughout the site. Include an accessible theme control on the homepage, authentication pages, dashboard, and modules; default to the system theme until the user selects one, persist the user’s choice, and maintain readable contrast in both palettes.


## [x] 7. Production container and publish recovery
- The existing Webdev server capability remains enabled. Package the Flask app in a committed root `Dockerfile` that installs the pinned runtime dependencies, compiles the Python application, and starts a production WSGI server that listens on `0.0.0.0:$PORT` (default 3000); keep the published container port consistent and use one worker because synthetic records and audit events are in process memory.
- Add a complete `deploy` configuration using the root Dockerfile and the existing unauthenticated `/health` endpoint as the successful readiness path. Do not provision a database or add unnecessary services.
- Keep protected production credentials out of build steps and image/browser output; do not copy development credentials into production. Preserve the explicitly synthetic, non-durable prototype boundary and HTTPS session-cookie behavior.
- The prior publish attempt was blocked before deployment because `deploy` was missing. Fix that cause, checkpoint the changes, and use the requested `webdev.config POST publish` retry; report a live URL only if the publish job confirms success, and do not search for a deployment that was never started.
