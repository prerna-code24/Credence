"""CREDENCE — a synthetic-data trust-before-access prototype."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import (
    Flask, abort, g, jsonify, make_response, redirect, render_template,
    request, send_from_directory, url_for,
)

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = os.environ.get("CREDENCE_APP_SECRET") or secrets.token_urlsafe(32)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

SESSION_COOKIE = "webdev_app_session"
COOKIE_NAME = SESSION_COOKIE
PROJECT_ID = os.environ.get("MANUS_PROJECT_ID", "credence-synthetic-demo")
JWT_SECRET = os.environ.get("MANUS_JWT_SECRET") or app.config["SECRET_KEY"]
COOKIE_SECURE = os.environ.get("CREDENCE_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
if not os.environ.get("CREDENCE_COOKIE_SECURE"):
    # Managed Preview is public HTTPS even though its app listener is HTTP.
    COOKIE_SECURE = bool(os.environ.get("MANUS_PROJECT_ID"))
COOKIE_SAMESITE = "None" if COOKIE_SECURE else "Lax"
DEMO_AUTH_ENABLED = os.environ.get("CREDENCE_DEMO_AUTH_ENABLED", "1").lower() not in {"0", "false", "no"}

MODULES = [
    {"slug": "identity", "number": "01", "title": "Agent Identity & Permissions", "short": "Identity & permissions", "eyebrow": "ACCESS REGISTER", "summary": "Know each agent, its owner, and the exact reach of its credentials."},
    {"slug": "evidence", "number": "02", "title": "Behavioural Trust & Evidence", "short": "Behaviour & evidence", "eyebrow": "EVIDENCE LEDGER", "summary": "Read behaviour as a trail of evidence, not a single opaque score."},
    {"slug": "graph", "number": "03", "title": "Agent Trust Graph", "short": "Trust graph", "eyebrow": "RELATIONSHIP MAP", "summary": "See agents, systems, and delegated permissions in one connected view."},
    {"slug": "recommendations", "number": "04", "title": "Adaptive Access Recommendations", "short": "Access recommendations", "eyebrow": "DECISION DESK", "summary": "Turn current evidence into a narrow, explainable access recommendation."},
    {"slug": "simulator", "number": "05", "title": "What-If Simulator", "short": "What-if simulator", "eyebrow": "SCENARIO LAB", "summary": "Explore how scope, anomalies, volatility, and stale evidence change risk."},
    {"slug": "passport", "number": "06", "title": "Evidence Passport", "short": "Evidence passport", "eyebrow": "PORTABLE RECORD", "summary": "Export a compact, dated record of an agent’s trust evidence."},
    {"slug": "monitoring", "number": "07", "title": "Monitoring & Alerts", "short": "Monitoring & alerts", "eyebrow": "WATCH DESK", "summary": "Surface meaningful changes that need a person’s attention."},
    {"slug": "privacy", "number": "08", "title": "Privacy & Audit", "short": "Privacy & audit", "eyebrow": "AUDIT REGISTER", "summary": "Inspect data use, approvals, and decisions in a readable audit trail."},
]
MODULE_BY_SLUG = {item["slug"]: item for item in MODULES}

# Small, fictional records only. Metrics are normalized to 0–100.
AGENTS: list[dict[str, Any]] = [
    {"id": "atlas-ledger", "name": "Atlas Ledger", "kind": "Finance operations", "owner": "Finance Systems", "system": "Ledger / read-write", "scope": 24, "anomaly": 8, "volatility": 16, "staleness": 12, "evidence_count": 24, "permissions": ["ledger.read", "reconcile.propose"], "sensitive": False},
    {"id": "meridian-pay", "name": "Meridian Pay", "kind": "Settlement agent", "owner": "Payments Platform", "system": "Settlement / scoped write", "scope": 52, "anomaly": 39, "volatility": 41, "staleness": 56, "evidence_count": 9, "permissions": ["settlement.read", "settlement.write"], "permission_state": {"settlement.read": False, "settlement.write": False}, "sensitive": True},
    {"id": "orchard-care", "name": "Orchard Care", "kind": "Customer support", "owner": "Customer Experience", "system": "Support / read-only", "scope": 31, "anomaly": 12, "volatility": 19, "staleness": 22, "evidence_count": 17, "permissions": ["cases.read", "knowledge.search"], "sensitive": False},
    {"id": "vector-research", "name": "Vector Research", "kind": "Research assistant", "owner": "Research Office", "system": "Vault / metadata-only", "scope": 76, "anomaly": 19, "volatility": 54, "staleness": 81, "evidence_count": 2, "permissions": ["vault.metadata.read"], "permission_state": {"vault.metadata.read": False}, "sensitive": True},
    {"id": "lumen-buy", "name": "Lumen Buy", "kind": "Procurement agent", "owner": "Procurement Ops", "system": "Vendor workspace / scoped write", "scope": 42, "anomaly": 33, "volatility": 26, "staleness": 38, "evidence_count": 12, "permissions": ["vendors.read", "purchase.propose"], "sensitive": False},
]

AUDIT: list[dict[str, Any]] = [
    {"id": "evt-seed-03", "time": "2026-10-20 08:40 UTC", "kind": "Evidence", "detail": "Vector Research abstained: two observations do not support a confident decision.", "actor": "Evidence monitor", "agent_id": "vector-research"},
    {"id": "evt-seed-02", "time": "2026-10-20 08:15 UTC", "kind": "Permission", "detail": "Atlas Ledger scope reviewed; only ledger.read and reconcile.propose remain in sample.", "actor": "Access review", "agent_id": "atlas-ledger"},
    {"id": "evt-seed-01", "time": "2026-10-20 07:50 UTC", "kind": "Evidence", "detail": "Synthetic observation window refreshed for the trust desk.", "actor": "Evidence monitor", "agent_id": None},
]
APPROVALS: list[dict[str, Any]] = []
ALERTS: list[dict[str, Any]] = [
    {"id": "alert-201", "agent_id": "meridian-pay", "title": "Anomaly rate above baseline", "detail": "Unusual settlement retries observed in the latest sample window.", "severity": "review", "acknowledged": False, "kind": "Behaviour"},
    {"id": "alert-202", "agent_id": "vector-research", "title": "Evidence is too stale to decide", "detail": "Only two observations are available; access recommendation abstained.", "severity": "watch", "acknowledged": False, "kind": "Evidence"},
    {"id": "alert-203", "agent_id": "lumen-buy", "title": "Permission review due", "detail": "Vendor write access is ready for a human scope review.", "severity": "watch", "acknowledged": False, "kind": "Permission"},
]


def now_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def record_audit(kind: str, detail: str, actor: str | None = None, agent_id: str | None = None) -> None:
    AUDIT.insert(0, {
        "id": f"evt-{secrets.token_hex(4)}", "time": now_label(), "kind": kind,
        "detail": detail, "actor": actor or current_actor(), "agent_id": agent_id,
    })
    del AUDIT[200:]


def current_actor() -> str:
    user = getattr(g, "user", None)
    if not user:
        return "System"
    return "Demo reviewer" if user.get("demo") else (user.get("name") or user.get("email") or "Verified reviewer")


def risk_for(record: dict[str, Any]) -> int:
    return round(
        0.30 * float(record.get("scope", 0))
        + 0.35 * float(record.get("anomaly", 0))
        + 0.20 * float(record.get("volatility", 0))
        + 0.15 * float(record.get("staleness", 0))
    )


def assess(record: dict[str, Any], sensitive_request: bool = False) -> dict[str, Any]:
    evidence_count = max(0, int(record.get("evidence_count", 0)))
    risk = risk_for(record)
    trust = 100 - risk
    confidence = max(8, min(98, round(55 + min(evidence_count, 12) * 3.3 - float(record.get("staleness", 0)) * 0.20)))
    reasons = [
        f"Scope breadth contributes {round(float(record.get('scope', 0)) * .30)} risk points (30% weight).",
        f"Observed anomaly rate contributes {round(float(record.get('anomaly', 0)) * .35)} risk points (35% weight).",
        f"Behavioural volatility contributes {round(float(record.get('volatility', 0)) * .20)} risk points (20% weight).",
        f"Evidence staleness contributes {round(float(record.get('staleness', 0)) * .15)} risk points (15% weight).",
    ]
    abstain = evidence_count < 3 or confidence < 48
    if abstain:
        decision = "Abstain — more evidence needed"
        reasons.append("The evidence set is too small or confidence is too low for an access recommendation.")
    elif sensitive_request:
        decision = "Human approval required"
        reasons.append("This is a sensitive-access request; a person must explicitly approve it.")
    elif risk <= 30:
        decision = "Maintain narrow access"
        reasons.append("Risk is within the illustrative low-risk band; retain only the listed scopes.")
    elif risk <= 55:
        decision = "Narrow scope and monitor"
        reasons.append("Reduce unnecessary permissions and review the next evidence window.")
    else:
        decision = "Step-up review required"
        reasons.append("Hold new access until a human has reviewed the evidence and scope.")
    return {
        "risk": risk, "trust": trust, "confidence": confidence,
        "decision": decision, "abstain": abstain, "reasons": reasons,
        "sensitive_request": sensitive_request,
    }


def enrich_agent(agent: dict[str, Any]) -> dict[str, Any]:
    result = dict(agent)
    result["assessment"] = assess(agent, sensitive_request=bool(agent.get("sensitive")))
    result["risk"] = result["assessment"]["risk"]
    result["trust"] = result["assessment"]["trust"]
    result["confidence"] = result["assessment"]["confidence"]
    result["status"] = "Needs evidence" if result["assessment"]["abstain"] else ("Review" if result["risk"] > 35 else "In good standing")
    return result


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jwt_encode(payload: dict[str, Any]) -> str:
    head = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing = f"{head}.{body}".encode()
    signature = hmac.new(JWT_SECRET.encode(), signing, hashlib.sha256).digest()
    return f"{head}.{body}.{b64url(signature)}"


def jwt_decode(token: str) -> dict[str, Any] | None:
    try:
        head, body, signature = token.split(".")
        header = json.loads(base64.urlsafe_b64decode(head + "=" * (-len(head) % 4)))
        if header.get("alg") != "HS256":
            return None
        signing = f"{head}.{body}".encode()
        expected = hmac.new(JWT_SECRET.encode(), signing, hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, supplied):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        if payload.get("appId") != PROJECT_ID or not payload.get("openId"):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def issue_session(user: dict[str, Any], demo: bool = False) -> str:
    payload = {
        "appId": PROJECT_ID,
        "openId": str(user.get("openId") or f"demo-{secrets.token_hex(6)}"),
        "name": user.get("name") or ("Synthetic Demo Reviewer" if demo else "Verified reviewer"),
        "email": user.get("email") or ("demo@example.invalid" if demo else ""),
        "demo": demo,
        "exp": int(datetime.now(timezone.utc).timestamp()) + 60 * 60 * 12,
    }
    return jwt_encode(payload)


def cookie_response(response, token: str | None, max_age: int | None = None):
    response.set_cookie(
        COOKIE_NAME, token or "", max_age=max_age if token else 0,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        path="/", expires=None if token else 0,
    )
    return response


@app.before_request
def load_identity():
    token = request.cookies.get(COOKIE_NAME, "")
    g.user = jwt_decode(token) if token else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not g.user:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required."}), 401
            return redirect(url_for("signin", next="/dashboard"))
        return view(*args, **kwargs)
    return wrapped


def oauth_settings() -> dict[str, str]:
    portal = os.environ.get("MANUS_OAUTH_PORTAL_URL", "").rstrip("/")
    api = os.environ.get("MANUS_OAUTH_API_URL", "").rstrip("/")
    app_id = os.environ.get("MANUS_PROJECT_ID", "")
    origin = os.environ.get("CREDENCE_PUBLIC_ORIGIN", "").rstrip("/")
    return {"portal": portal, "api": api, "app_id": app_id, "origin": origin}


def oauth_ready() -> bool:
    settings = oauth_settings()
    return all([settings["portal"], settings["api"], settings["app_id"], settings["origin"], os.environ.get("MANUS_JWT_SECRET")])


@app.get("/")
def home():
    return render_template("home.html", agents=[enrich_agent(agent) for agent in AGENTS], modules=MODULES)


@app.get("/signin")
def signin():
    return render_template("signin.html", mode="signin", error=request.args.get("error"), oauth_ready=oauth_ready(), demo_enabled=DEMO_AUTH_ENABLED)


@app.get("/signup")
def signup():
    return render_template("signin.html", mode="signup", error=request.args.get("error"), oauth_ready=oauth_ready(), demo_enabled=DEMO_AUTH_ENABLED)


@app.post("/auth/demo-signup")
def demo_signup():
    if not DEMO_AUTH_ENABLED:
        return jsonify({"error": "Synthetic demo identity creation is disabled."}), 403
    payload = request.get_json(silent=True) or {}
    name = " ".join(str(payload.get("name", "")).split())
    if len(name) < 2 or len(name) > 40 or not any(character.isalpha() for character in name):
        return jsonify({"error": "Enter a display name of 2–40 letters; no real account will be created."}), 400
    open_id = f"credence-demo-{secrets.token_hex(6)}"
    token = issue_session({"openId": open_id, "name": name}, demo=True)
    record_audit("Session", f"Temporary synthetic demo identity created for {name}.", name)
    response = make_response(jsonify({"ok": True, "redirect": url_for("dashboard")}))
    cookie_response(response, token, max_age=60 * 60 * 12)
    return response


@app.post("/auth/demo")
def demo_login():
    if not DEMO_AUTH_ENABLED:
        return jsonify({"error": "Synthetic demo entry is disabled."}), 403
    token = issue_session({"openId": "credence-demo-reviewer", "name": "Synthetic Demo Reviewer", "email": "demo@example.invalid"}, demo=True)
    record_audit("Session", "Synthetic demo reviewer entered the workspace.", "Synthetic Demo Reviewer")
    response = make_response(jsonify({"ok": True, "redirect": url_for("dashboard")}))
    cookie_response(response, token, max_age=60 * 60 * 12)
    return response


@app.get("/auth/start")
def auth_start():
    if not oauth_ready():
        return redirect(url_for("signin", error="Manus sign-in is not configured for this deployment. Use the clearly labeled synthetic demo, or configure the OAuth environment and CREDENCE_PUBLIC_ORIGIN."))
    cfg = oauth_settings()
    callback = cfg["origin"] + url_for("auth_callback")
    nonce = secrets.token_urlsafe(24)
    state = b64url(json.dumps({"redirectUri": callback, "nonce": nonce}, separators=(",", ":")).encode())
    portal_url = cfg["portal"] + "/app-auth?" + urllib.parse.urlencode({
        "appId": cfg["app_id"], "redirectUri": callback, "state": state, "responseType": "code",
    })
    response = make_response(redirect(portal_url))
    response.set_cookie("credence_oauth_nonce", nonce, max_age=600, httponly=True, secure=COOKIE_SECURE, samesite="Lax", path="/")
    return response


@app.get("/auth/callback")
def auth_callback():
    def failed_sign_in(message: str):
        response = make_response(redirect(url_for("signin", error=message)))
        response.delete_cookie("credence_oauth_nonce", path="/", samesite="Lax")
        return response

    state = request.args.get("state", "")
    try:
        decoded = json.loads(base64.urlsafe_b64decode(state + "=" * (-len(state) % 4)))
    except (ValueError, TypeError, json.JSONDecodeError):
        return failed_sign_in("The sign-in response could not be verified. Please try again.")
    if not isinstance(decoded, dict):
        return failed_sign_in("The sign-in response could not be verified. Please try again.")
    cfg = oauth_settings()
    expected_callback = cfg["origin"] + url_for("auth_callback") if cfg["origin"] else ""
    nonce_cookie = request.cookies.get("credence_oauth_nonce", "")
    if (not nonce_cookie or not hmac.compare_digest(str(decoded.get("nonce", "")), nonce_cookie)
            or not expected_callback or decoded.get("redirectUri") != expected_callback):
        return failed_sign_in("The sign-in request expired or did not match this browser. Please try again.")
    code = request.args.get("code", "")
    if not code:
        return failed_sign_in("The identity provider did not return an authorization code.")
    try:
        exchange_url = cfg["api"] + "/webdev.v1.WebDevAuthPublicService/ExchangeToken"
        body = json.dumps({"clientId": cfg["app_id"], "grantType": "authorization_code", "code": code, "redirectUri": expected_callback}).encode()
        req = urllib.request.Request(exchange_url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=12) as res:
            token_data = json.loads(res.read().decode())
        user_req = urllib.request.Request(
            cfg["api"] + "/webdev.v1.WebDevAuthPublicService/GetUserInfo",
            data=json.dumps({"accessToken": token_data["accessToken"]}).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(user_req, timeout=12) as res:
            identity = json.loads(res.read().decode())
        if not identity.get("openId"):
            raise ValueError("The identity provider returned no account identifier.")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, ValueError, json.JSONDecodeError) as exc:
        app.logger.warning("OAuth exchange failed: %s", type(exc).__name__)
        return failed_sign_in("Account verification could not be completed. Please try again.")
    identity["demo"] = False
    session_token = issue_session(identity, demo=False)
    record_audit("Session", "Verified Manus account opened the workspace.", identity.get("name") or identity.get("email"))
    response = make_response(redirect(url_for("dashboard")))
    cookie_response(response, session_token, max_age=60 * 60 * 12)
    response.delete_cookie("credence_oauth_nonce", path="/", samesite="Lax")
    return response


@app.post("/auth/logout")
def logout():
    if g.user:
        record_audit("Session", "Reviewer signed out.")
    response = make_response(redirect(url_for("home")))
    cookie_response(response, None)
    response.delete_cookie("credence_oauth_nonce", path="/", samesite="Lax")
    return response


@app.get("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", active_module=None, modules=MODULES, user=g.user, agents=[enrich_agent(a) for a in AGENTS])


@app.get("/modules/<slug>")
@login_required
def module_page(slug: str):
    module = MODULE_BY_SLUG.get(slug)
    if not module:
        abort(404)
    return render_template("module.html", active_module=module, modules=MODULES, user=g.user, agents=[enrich_agent(a) for a in AGENTS])


@app.get("/api/dashboard")
@login_required
def api_dashboard():
    agents = [enrich_agent(agent) for agent in AGENTS]
    open_alerts = [a for a in ALERTS if not a["acknowledged"]]
    return jsonify({
        "synthetic": True,
        "updated": now_label(),
        "agents": agents,
        "counts": {"agents": len(agents), "reviews": sum(a["risk"] > 35 or a["assessment"]["abstain"] for a in agents), "open_alerts": len(open_alerts), "pending_approvals": sum(x["status"] == "Pending" for x in APPROVALS)},
        "average_trust": round(sum(a["trust"] for a in agents) / len(agents)),
        "audit": AUDIT[:8], "alerts": open_alerts, "approvals": APPROVALS,
    })


@app.get("/api/agents")
@login_required
def api_agents():
    return jsonify({"agents": [enrich_agent(agent) for agent in AGENTS], "synthetic": True})


@app.post("/api/risk/simulate")
@login_required
def api_simulate():
    payload = request.get_json(silent=True) or {}
    fields = ("scope", "anomaly", "volatility", "staleness")
    values = {}
    try:
        for field in fields:
            values[field] = max(0, min(100, float(payload.get(field, 0))))
        values["evidence_count"] = max(0, min(10000, int(payload.get("evidence_count", 0))))
    except (TypeError, ValueError):
        return jsonify({"error": "Risk inputs must be numeric values between 0 and 100."}), 400
    sensitive = bool(payload.get("sensitive_request", False))
    result = assess(values, sensitive_request=sensitive)
    result["inputs"] = values
    return jsonify(result)


@app.get("/api/recommendations")
@login_required
def api_recommendations():
    return jsonify({"recommendations": [{"agent": enrich_agent(a), "assessment": assess(a, sensitive_request=a["sensitive"])} for a in AGENTS], "synthetic": True})


@app.post("/api/agents/<agent_id>/permissions")
@login_required
def api_permissions(agent_id: str):
    agent = next((item for item in AGENTS if item["id"] == agent_id), None)
    if not agent:
        return jsonify({"error": "Agent not found."}), 404
    payload = request.get_json(silent=True) or {}
    permission = str(payload.get("permission", ""))
    enabled = bool(payload.get("enabled"))
    if permission not in agent["permissions"]:
        return jsonify({"error": "That permission is not in this agent's synthetic scope."}), 400
    action = "enabled" if enabled else "paused"
    if agent.get("sensitive") and enabled:
        item = next((candidate for candidate in APPROVALS if candidate.get("agent_id") == agent_id and candidate.get("permission") == permission and candidate["status"] == "Pending"), None)
        if not item:
            item = {"id": f"apr-{secrets.token_hex(3)}", "agent_id": agent_id, "agent": agent["name"], "permission": permission, "request": f"Enable sensitive permission: {permission}", "status": "Pending", "created": now_label(), "reviewer": current_actor()}
            APPROVALS.insert(0, item)
            record_audit("Approval", f"Sensitive permission request queued for human review: {permission}.", agent_id=agent_id)
        return jsonify({"ok": True, "pending": True, "approval": item, "message": f"{permission} is pending human approval. No access was enabled."}), 202
    agent.setdefault("permission_state", {})[permission] = enabled
    record_audit("Permission", f"{permission} was {action} for {agent['name']}.", agent_id=agent_id)
    return jsonify({"ok": True, "permission": permission, "enabled": enabled, "agent": enrich_agent(agent)})


@app.post("/api/approvals")
@login_required
def api_create_approval():
    payload = request.get_json(silent=True) or {}
    agent_id = str(payload.get("agent_id", ""))
    agent = next((item for item in AGENTS if item["id"] == agent_id), None)
    if not agent:
        return jsonify({"error": "Select an agent from the synthetic register."}), 400
    item = {"id": f"apr-{secrets.token_hex(3)}", "agent_id": agent_id, "agent": agent["name"], "request": str(payload.get("request", "Sensitive access review"))[:120], "status": "Pending", "created": now_label(), "reviewer": current_actor()}
    APPROVALS.insert(0, item)
    record_audit("Approval", f"Sensitive access request queued for human review: {item['request']}.", agent_id=agent_id)
    return jsonify({"ok": True, "approval": item, "message": "Request recorded as pending. No access was granted."}), 201


@app.post("/api/approvals/<approval_id>/decision")
@login_required
def api_decide_approval(approval_id: str):
    payload = request.get_json(silent=True) or {}
    decision = payload.get("decision")
    if decision not in {"Approved", "Declined"}:
        return jsonify({"error": "Choose Approved or Declined."}), 400
    approval = next((item for item in APPROVALS if item["id"] == approval_id), None)
    if not approval:
        return jsonify({"error": "Approval request not found."}), 404
    if approval["status"] != "Pending":
        return jsonify({"error": "This request already has a decision."}), 409
    permission_agent = next((item for item in AGENTS if item["id"] == approval.get("agent_id")), None)
    permission = approval.get("permission")
    if decision == "Approved" and permission:
        if not permission_agent or not permission_agent.get("sensitive") or permission not in permission_agent["permissions"]:
            return jsonify({"error": "The sensitive permission no longer matches an approvable synthetic scope."}), 409
        permission_agent.setdefault("permission_state", {})[permission] = True
        approval["permission_applied"] = True
        record_audit("Permission", f"Human approval enabled sensitive permission {permission} for {permission_agent['name']}.", agent_id=permission_agent["id"])
    approval["status"] = decision
    approval["reviewer"] = current_actor()
    approval["decided"] = now_label()
    record_audit("Approval", f"Human reviewer {decision.lower()} sensitive access for {approval['agent']}.", agent_id=approval["agent_id"])
    return jsonify({"ok": True, "approval": approval})


@app.get("/api/approvals")
@login_required
def api_approvals():
    return jsonify({"approvals": APPROVALS, "synthetic": True})


@app.post("/api/alerts/<alert_id>/ack")
@login_required
def api_ack_alert(alert_id: str):
    alert = next((item for item in ALERTS if item["id"] == alert_id), None)
    if not alert:
        return jsonify({"error": "Alert not found."}), 404
    alert["acknowledged"] = True
    record_audit("Alert", f"Acknowledged alert: {alert['title']}.", agent_id=alert["agent_id"])
    return jsonify({"ok": True, "alert": alert})


@app.get("/api/audit")
@login_required
def api_audit():
    kind = request.args.get("kind", "all")
    events = AUDIT if kind == "all" else [event for event in AUDIT if event["kind"].lower() == kind.lower()]
    return jsonify({"events": events[:100], "kinds": sorted({event["kind"] for event in AUDIT}), "synthetic": True})


@app.get("/api/passport/<agent_id>")
@login_required
def api_passport(agent_id: str):
    agent = next((item for item in AGENTS if item["id"] == agent_id), None)
    if not agent:
        abort(404)
    passport = {
        "document": "CREDENCE Evidence Passport", "prototype": True,
        "notice": "Synthetic-data prototype. This passport is illustrative, not a real authorization.",
        "issued_at": now_label(), "agent": enrich_agent(agent),
        "risk_formula": "30% scope breadth + 35% anomaly rate + 20% volatility + 15% evidence staleness",
        "human_approval_required_for_sensitive_access": True,
    }
    return jsonify(passport), {"Content-Disposition": f"attachment; filename=credence-{agent_id}-passport.json"}


@app.get("/manus-routes.json")
def route_manifest():
    return send_from_directory(ROOT / "public", "manus-routes.json", mimetype="application/json")


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "credence", "synthetic_data": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    app.run(host="0.0.0.0", port=port, debug=False)
