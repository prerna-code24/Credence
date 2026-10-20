# CREDENCE: Technical Documentation

Oct 20, 2026 · @NS

System architecture, core algorithms and security design for the Credence hackathon prototype. All data is synthetic. Weights, thresholds and limits below are illustrative defaults to be tuned and validated on the labelled test set; none of it is a claim about real-world banking performance.

## 1. System architecture

### 1.1 Overview

Credence has four layers that share one dataset and one risk engine. The client never computes risk itself: every score, graph flag, explanation and recommendation is returned by the Python engines, so a scenario change updates all of them together. The platform recommends controls and simulates outcomes; it does not move money, issue credit or block live payments.

### 1.2 Components

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Client | Next.js 14, TypeScript, Tailwind, shadcn/ui | Cinematic home, auth screens and dashboard. Framer Motion, GSAP and Three.js drive motion; Recharts and ECharts draw charts; react-force-graph draws the Trust Graph |
| API | FastAPI, Pydantic, JWT | Versioned REST under /api/v1, OpenAPI docs, WebSocket /ws/events, security middleware |
| Engines | Python, NumPy, networkx | Behavioural scorer, evidence and confidence, graph analytics, access engine, what-if simulator |
| Data | PostgreSQL (SQLite for local dev), SQLAlchemy, Alembic | Entities, assessments, alerts and the append-only audit log |
| Infra | docker-compose | Frontend, backend and database started with one command |

### 1.3 Data model

| Entity | Key fields | Purpose |
| --- | --- | --- |
| users, sessions, roles | email, argon2id hash, role, refresh-token hash, device | Identity and RBAC |
| businesses, agents, agent\_permissions | owner, spending ceiling, approved counterparties, restricted actions | Registry of who may do what |
| counterparties, transactions | amount, status (success, failed, reversed, disputed), first\_seen, label | Synthetic financial activity |
| evidence\_items | source, freshness, verification\_status | Provenance for every input |
| assessments | score, confidence, abstained, explanation JSON | Explainable results per run |
| access\_recommendations | action, recommended limit, approval threshold, reviewer decision | Recommended financial permissions |
| graph\_edges | source, target, amount, rule ID, FACT or INFERRED tag | Trust Graph data |
| alerts, simulations, evidence\_passports | severity, status, scenario, hash | Monitoring, what-if and reports |
| audit\_log, consents | actor, action, prev\_hash, hash; data scope, grantor | Accountability and consent |

### 1.4 Runtime flow

Every transaction event, scheduled reassessment and simulator request runs the same sequence. The confidence gate sits before the access engine, so thin or stale evidence leads to human review instead of a confident but unjustified limit change.

1. **Ingest.** A synthetic transaction event is stored and passed to the engine (seed replay in the demo).
2. **Score.** The behavioural scorer recomputes sub-scores against the agent's own baseline.
3. **Graph.** The graph slice around the agent is rebuilt and checked for cycles, repeated pairs and clusters.
4. **Gate.** Evidence quality and history length give a confidence value; below 0.45 the run abstains.
5. **Decide.** The access engine maps score, confidence, funding and policy to one of five actions.
6. **Persist and notify.** The assessment, explanation JSON and recommendation are saved, an audit entry is chained, and alerts are pushed over WebSocket.

### 1.5 API surface

| Group | Endpoints (under /api/v1) | Notes |
| --- | --- | --- |
| Auth | signup, login, refresh, logout, verify-email, reset-password, 2fa | Cookies only, rate limited |
| Agents | CRUD, permissions, detail, assessment history | Field-level minimisation by role |
| Transactions | list, filter, export | CSV export is audit-logged |
| Assessments | run, latest, explain | Returns reasons, triggered rules, inputs |
| Graph | graph, cycles, clusters, node detail | Every flag has rule ID and supporting transactions |
| Access | recommendation, approve, override | Override needs a written reason |
| Simulator | POST /simulate | Returns before and after from the same engine |
| Passport | generate, fetch, PDF export | Carries an integrity hash and QR |
| Monitoring | alerts, thresholds, WebSocket /ws/events | Status flow: new, reviewing, resolved |
| Audit and metrics | audit list and filter, evaluation results | Read-only |

### 1.6 Design decisions

- **One source of truth.** The dashboard, graph, simulator and passport read the same tables and call the same engine functions, so they cannot disagree.
- **Explainable by construction.** Weighted rules plus robust statistics; no black-box model. Every result carries its top factors, triggered rule IDs and inputs.
- **Abstention is a first-class outcome.** Low confidence produces ABSTAIN and human review, never a silent default.
- **Recommend, do not act.** Payment blocking, permission changes and credit decisions belong to authorised systems; the prototype simulates them.
- **Sandbox isolation.** Synthetic and live data live in separate stores; live mode is locked and labelled Not connected.

## 2. Core algorithm description

### 2.1 Pipeline

The engine runs five computations per assessment: (1) a behavioural score, (2) an evidence quality and confidence value, (3) graph analytics, (4) a rule check, and (5) an access decision. The simulator replays the same functions on a perturbed copy of the data.

### 2.2 Behavioural score

Each agent is compared with its own recent baseline, not with other agents. Six sub-scores sᵢ lie between 0 and 1 (higher is better) and combine as `S = 100 × Σ wᵢ·sᵢ`.

| i | Factor | Sub-score definition | Weight |
| --- | --- | --- | --- |
| 1 | Success rate | (successes + 1) / (attempts + 2), a smoothed share | 0.20 |
| 2 | Reversals and disputes | 1 − min(1, adverse rate / 0.10), where adverse rate = (reversals + disputes) / attempts | 0.15 |
| 3 | Amount deviation | Robust z = (x − median) / (1.4826 × MAD) on a 30-day baseline; s = 1 − min(1, mean of max(0, abs(z) − 2) / 4) | 0.20 |
| 4 | Frequency drift | r = last-7-day count / baseline weekly count; s = 1 − min(1, abs(ln r) / ln 4) | 0.10 |
| 5 | Policy compliance | Share of payments inside the ceiling, approved counterparties and allowed actions | 0.20 |
| 6 | New-counterparty share | 1 − min(1, spend share to payees first seen under 14 days ago / 0.50) | 0.15 |

The explanation is the points lost per factor, `Lᵢ = 100 × wᵢ × (1 − sᵢ)`. The three largest losses are shown as the answer to why this score. Hard rules run alongside the score:

| Rule | Trigger | Effect |
| --- | --- | --- |
| R-01 Ceiling breach | Payment above the registered ceiling | At least REQUIRE\_APPROVAL |
| R-02 Spike to new payee | Payment over 5× the agent's median to a payee first seen under 14 days ago | Propose RESTRICT |
| R-03 Reversal burst | 3 or more failures or reversals in 24 hours | Alert and REQUIRE\_APPROVAL |
| R-04 Permission escalation | Ceiling or counterparty list widened since last assessment | Human review before any increase |
| R-05 Circular flow | Directed cycle in the graph (section 2.4) | Alert; propose RESTRICT if strength is above threshold, else review |
| R-06 Repeated pair | 3 or more transfers each way within 14 days | Review |
| R-07 Coordinated cluster | Agents sharing payees with synchronised timing | Review |
| R-08 Stale evidence | Median evidence age over 30 days | Confidence capped; no increases |

### 2.3 Evidence quality and confidence

Evidence quality is `Q = 0.30·F + 0.25·C + 0.25·V + 0.20·K`, where F is freshness (exp of minus median evidence age in days / 30), C is coverage (share of required evidence types present: identity, permissions, funding, transactions, policy), V is verification (share of items with verified status) and K is consistency (1 minus the share of contradicting items).

Confidence combines quality with history: `confidence = Q × (0.3 + 0.7·H)`, where `H = min(1, transactions / 40, active days / 21)`. Above 0.65 is high, 0.45 to 0.65 is medium, and below 0.45 the run abstains and routes to human review. A brand-new agent has H near 0, so it abstains; its score is shown as not available rather than low. Missing history lowers confidence, never the score.

### 2.4 Agent Trust Graph analytics

The graph is a directed, weighted multigraph over agents, owners and counterparties, built with networkx from authorised data inside a 30-day window.

- **Cycles (R-05).** Enumerate simple cycles up to length 6. Cycle strength is the smallest edge amount on the cycle, which is the money that can actually have circulated. Flag when strength exceeds a configurable floor.
- **Repeated pairs (R-06).** Count transfers in each direction per node pair; flag 3 or more each way within 14 days.
- **Coordination (R-07).** Run Louvain community detection, then flag communities whose agents share payees (Jaccard similarity of 0.6 or more) and place at least half their payments inside the same 24-hour windows.
- **Fact versus inference.** Edges built from transactions are tagged FACT. Links such as shared owner or shared address are tagged INFERRED, drawn dashed and never used alone to restrict an agent.

The graph holds roughly 80 nodes in the sandbox, so bounded cycle search is cheap. A flag is an indicator for investigation, not proof of fraud.

### 2.5 Adaptive access engine

Rules are evaluated top to bottom; the first match decides the action.

| Order | Condition | Action | Effect on limit |
| --- | --- | --- | --- |
| 1 | Confidence below 0.45 | ABSTAIN | Unchanged; human review |
| 2 | S below 40, or R-02, R-04 or R-05 open | RESTRICT | Limit × m; high-risk actions blocked in simulation |
| 3 | S from 40 to 69, or R-01, R-03, R-06 or R-07 open | REQUIRE\_APPROVAL | Limit × m; lower approval threshold |
| 4 | S from 70 to 84, or S of 85 or more without the conditions for row 5 | MAINTAIN | Limit × m (slight tightening under medium confidence) |
| 5 | S of 85 or more, confidence 0.65 or more, no open flags, 30 or more days of history | INCREASE\_CAUTIOUSLY | Limit × m, at most +20% per review cycle |

The recommended limit is `L_rec = min(L_policy, L_funding, L_current × m(S, confidence))`. The multiplier m comes from the curve below. Available funding enters only through the minimum, so owner finances can cap a limit but never change the agent's reliability score.

### 2.6 What-if simulator

The simulator deep-copies the current snapshot, applies a perturbation, reruns the same engine functions and returns a before and after pair: score, confidence, triggered rules, graph and recommendation.

| Control | Perturbation | Expected response |
| --- | --- | --- |
| Sudden spend spike | Scale recent payment amounts by a factor k | Amount deviation falls; R-01 or R-02 may fire |
| Suspicious new counterparty | Add a payee first seen today and route payments to it | New-counterparty share rises; R-02 |
| Repeated failures and reversals | Flip a share of recent payments to failed or reversed | Success and reversal sub-scores fall; R-03 |
| Compromised permissions | Raise the ceiling and widen the counterparty list | R-04 fires; no increase allowed |
| Coordinated pattern | Insert cycle edges among chosen agents | R-05, R-06 or R-07; graph updates |
| Stale evidence | Age evidence items by 45 days | Freshness and confidence fall; may ABSTAIN |

### 2.7 Evaluation

A labelled synthetic test set of normal and suspicious scenarios is scored by an evaluation script. Targets are design goals; the script reports the actual numbers.

| Metric | Definition | Design target |
| --- | --- | --- |
| Detection rate | Suspicious scenarios flagged / suspicious scenarios | 90% or more |
| False-positive rate | Normal scenarios flagged / normal scenarios | 10% or less |
| Explainability | Flagged scenarios with at least one rule ID and supporting transaction | 100% |
| Consistency | Equivalent scenarios (different seeds) landing in the same action | 95% or more |
| Abstention safety | Runs with confidence below 0.65 that raised a limit | 0 |

Limitations: weights and thresholds are hand-set, synthetic scenarios are authored by the team, and results on synthetic data do not predict real-world banking performance.

## 3. Security design

### 3.1 Threat model and controls

| Threat | Example | Primary controls |
| --- | --- | --- |
| Credential attacks | Credential stuffing, brute force | Rate limiting, progressive lockout, generic errors, optional TOTP, breached-password check stub |
| Token theft and replay | Stolen refresh token | httpOnly Secure SameSite=Strict cookies, 15-minute access tokens, rotation with reuse detection |
| Browser attacks | CSRF, XSS, clickjacking | CSRF token, CSP, X-Frame-Options, output encoding, strict CORS allowlist |
| Injection | SQL injection via filters | Pydantic validation on every endpoint, parameterised queries through SQLAlchemy |
| Over-reach | An analyst reading data without consent | RBAC, field-level minimisation, consent checks, deny by default |
| Tampering | Edited assessments or audit rows | Append-only hash-chained audit log, passport integrity hash |
| Leakage | Secrets or tokens in logs | Secrets from environment variables only, log redaction |
| Sandbox confusion | Synthetic data mistaken for live | Persistent sandbox badge, locked live environment |

### 3.2 Defence in depth

Six layers sit between a request and the data, and each stops a different class of attack.

### 3.3 Authentication and sessions

| Control | Setting |
| --- | --- |
| Password hashing | argon2id with per-user salt; 64 MiB memory, 3 iterations, 2 lanes (tunable) |
| Password policy | At least 12 characters, live strength meter, breached-password check stub |
| Access token | JWT, 15 minutes, held in an httpOnly cookie |
| Refresh token | 7 days, random and opaque, stored only as a hash, rotated on every use; reuse revokes the session family |
| Cookies | httpOnly, Secure, SameSite=Strict; nothing in localStorage |
| CSRF | Double-submit token on state-changing requests |
| Two-factor | TOTP (RFC 6238) with QR enrolment and hashed single-use backup codes |
| Lockout | 3 free attempts, then 30 seconds, 2 minutes, 10 minutes, 1 hour per account and IP |
| Email verification and reset | Single-use tokens; reset expires in 15 minutes; mail is mocked in development |
| Sessions | Device list with sign out other devices |

### 3.4 Authorisation and data minimisation

Access is deny by default. Each endpoint declares the roles it allows, and the serializer removes fields a role does not need before the response leaves the API.

| Capability | Owner | Finance Manager | Risk Analyst | Bank Reviewer | Admin |
| --- | --- | --- | --- | --- | --- |
| View agents and scores | Own business | Own business | Yes | Consented businesses | Metadata only |
| Transaction detail | Own business | Own business | Yes | Aggregated | No |
| Run what-if | Yes | Yes | Yes | Yes | No |
| Approve or override access | Yes | Up to a set threshold | Proposes only | No (read-only) | No |
| View audit log | Own business | No | Yes | Yes | Yes |
| Manage users and roles | Own business | No | No | No | Yes |
| Export Evidence Passport | Yes | Yes | Yes | Yes | No |

### 3.5 Integrity, audit and privacy

- **Hash-chained audit log.** Each row stores `hash = SHA-256(prev_hash + canonical row JSON)`. The application role has INSERT only, and a verify routine recomputes the chain to expose edits or deletions. It records logins, permission changes, data access, overrides and exports.
- **Evidence Passport integrity.** The report body is hashed with SHA-256, and the hash is printed with a QR code. An optional HMAC with a server key makes it tamper-evident.
- **Consent and minimisation.** Each assessment lists the data used and who authorised it; only the fields needed for that assessment are loaded.
- **Fairness.** No personal attributes enter the score, and absence of history is treated as missing evidence, not as untrustworthiness.
- **Human oversight.** Sensitive recommendations (RESTRICT, INCREASE\_CAUTIOUSLY, overrides) require a reviewer action with a written reason.

### 3.6 Residual risks and scope limits

This is a research prototype on synthetic data. Email delivery and the breached-password check are stubs; secrets live in environment variables rather than a managed key store; there has been no external penetration test; and no regulatory compliance is claimed. The design follows OWASP ASVS and Top 10 practices, but it has not been certified against them.

## Appendix: default parameters

| Parameter | Default | Used in |
| --- | --- | --- |
| Baseline window | 30 days | Amount deviation, frequency drift |
| New-payee window | 14 days | R-02, new-counterparty share |
| Confidence thresholds | 0.45 abstain, 0.65 high | Gate, access engine |
| History saturation | 40 transactions, 21 active days | Confidence |
| Cycle search | Length up to 6, 30-day window | R-05 |
| Coordination | Jaccard 0.6, 24-hour windows | R-07 |
| Increase cap | +20% per review cycle | INCREASE\_CAUTIOUSLY |
| Access token, refresh token | 15 minutes, 7 days | Sessions |
