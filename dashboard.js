(() => {
  const root = document.querySelector('[data-page]');
  if (!root) return;
  const page = root.dataset.page;
  const moduleName = root.dataset.module || '';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const showToast = message => {
    let toast = $('#app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3000);
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  };

  const trustTone = record => record.assessment?.abstain ? 'abstain' : (record.risk > 35 ? 'review' : 'steady');
  const statusMarkup = record => {
    const tone = trustTone(record);
    const label = tone === 'abstain' ? 'Abstained' : tone === 'review' ? 'Review' : 'In good standing';
    return `<span class="status-pill ${tone}">${label}</span>`;
  };

  function renderAgentTable(agents) {
    const body = $('#agent-table-body');
    if (!body) return;
    const query = ($('#agent-search')?.value || '').trim().toLowerCase();
    const filter = $('#agent-filter')?.value || 'all';
    const items = agents.filter(agent => {
      const matches = !query || `${agent.name} ${agent.owner} ${agent.system} ${agent.kind}`.toLowerCase().includes(query);
      const tone = trustTone(agent);
      return matches && (filter === 'all' || (filter === 'review' && tone === 'review') || (filter === 'steady' && tone === 'steady') || (filter === 'abstain' && tone === 'abstain'));
    });
    $('#shown-count').textContent = String(items.length);
    body.innerHTML = items.length ? items.map(agent => `<tr>
      <td><div class="agent-name"><span class="agent-avatar">${esc(initials(agent.name))}</span><span><b>${esc(agent.name)}</b><small>${esc(agent.owner)}</small></span></div></td>
      <td class="scope-cell">${esc(agent.system)}</td>
      <td><span class="score-cell">${agent.trust}</span><span class="score-meter" aria-label="Trust ${agent.trust} out of 100"><i style="width:${agent.trust}%"></i></span></td>
      <td class="confidence-cell">${agent.confidence}%</td><td>${statusMarkup(agent)}</td>
      <td><a class="row-link" href="/modules/identity" aria-label="Inspect ${esc(agent.name)}">↗</a></td></tr>`).join('') : '<tr><td colspan="6" class="loading-row">No synthetic identities match this filter.</td></tr>';
  }

  function drawTrustChart(agents) {
    const svg = $('#trustChart');
    if (!svg || !agents.length) return;
    const width = 720, height = 215, left = 39, right = 12, top = 13, bottom = 28;
    const plotW = width - left - right, plotH = height - top - bottom;
    const values = [agents.reduce((sum, a) => sum + a.trust, 0) / agents.length];
    const valuesByAgent = agents.map(a => a.trust);
    // Signal windows derive from the sample agents rather than decorative random values.
    const points = Array.from({ length: 8 }, (_, i) => {
      const agent = agents[i % agents.length];
      const drift = [0, -4, 3, -2, 2, -1, 1, 0][i];
      return Math.max(0, Math.min(100, agent.trust + drift));
    });
    values.push(...valuesByAgent);
    const x = i => left + (i / (points.length - 1)) * plotW;
    const y = value => top + ((100 - value) / 100) * plotH;
    const grid = [0, 25, 50, 75, 100].map(value => `<line class="chart-grid" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"/><text class="chart-axis" x="3" y="${y(value) + 3}">${value}</text>`).join('');
    const path = points.map((value, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
    const fill = `${path} L ${x(points.length - 1)} ${height - bottom} L ${left} ${height - bottom} Z`;
    const dots = points.map((value, i) => `<circle class="chart-point" cx="${x(i)}" cy="${y(value)}" r="3"><title>Evidence window ${i + 1}: trust ${value}</title></circle>`).join('');
    const threshold = y(55);
    svg.innerHTML = `<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4a017" stop-opacity=".35"/><stop offset="1" stop-color="#d4a017" stop-opacity="0"/></linearGradient></defs>${grid}<line class="chart-threshold" x1="${left}" y1="${threshold}" x2="${width - right}" y2="${threshold}"/><path class="chart-area" d="${fill}"/><path class="chart-line" d="${path}"/>${dots}<text class="chart-axis" x="${left}" y="${height - 7}">EARLIER</text><text class="chart-axis" x="${width - 53}" y="${height - 7}">LATEST</text>`;
  }

  function renderTimeline(events, target) {
    if (!target) return;
    target.innerHTML = events.length ? events.slice(0, 8).map(event => `<div class="timeline-event"><time>${esc(event.time || 'Just now')}</time><span class="timeline-track"><i></i></span><div><b>${esc(event.kind)} · ${esc(event.detail)}</b><p>${esc(event.actor || 'System')}${event.agent_id ? ` · ${esc(event.agent_id)}` : ''}</p></div><span>RECORDED</span></div>`).join('') : '<p class="muted-copy">No actions have been recorded yet. Decisions and acknowledgements will appear here.</p>';
  }

  function renderAlerts(alerts, target, canAcknowledge = true) {
    if (!target) return;
    const filter = $('#alert-filter')?.value || 'open';
    const visible = alerts.filter(alert => {
      if (filter === 'open' && alert.acknowledged) return false;
      if (!['open', 'all'].includes(filter) && alert.kind !== filter) return false;
      return true;
    });
    target.innerHTML = visible.length ? visible.map(alert => `<article class="${canAcknowledge ? 'monitoring-alert' : 'compact-item'} ${alert.acknowledged ? 'alert-acknowledged' : ''}">
      ${canAcknowledge ? `<i class="alert-pin ${alert.severity === 'watch' ? 'watch' : ''}"></i>` : `<i class="compact-mark ${alert.severity === 'watch' ? 'watch' : ''}"></i>`}
      <div><b>${esc(alert.title)}</b><p>${esc(alert.detail)}</p><small>${esc(alert.agent_id)} · ${esc(alert.kind)}${alert.acknowledged ? ' · acknowledged' : ''}</small></div>
      ${canAcknowledge ? (alert.acknowledged ? '<span class="approval-status">RECORDED</span>' : `<button class="ack-button" data-ack="${esc(alert.id)}">Acknowledge</button>`) : `<time>OPEN</time>`}
    </article>`).join('') : '<p class="muted-copy">No alerts match this view.</p>';
  }

  function renderApprovals(approvals, target, canDecide = false) {
    if (!target) return;
    const entries = canDecide ? approvals : approvals.filter(item => item.status === 'Pending');
    target.innerHTML = entries.length ? entries.map(item => `<article class="approval-item"><span class="approval-symbol">!</span><div class="approval-copy"><b>${esc(item.request)} · ${esc(item.agent)}</b><small>${esc(item.created || '')} · requested by ${esc(item.reviewer || 'reviewer')}</small></div>${item.status === 'Pending' && canDecide ? `<div class="approval-actions"><button class="approve-action" data-decision="Approved" data-approval="${esc(item.id)}">Approve</button><button data-decision="Declined" data-approval="${esc(item.id)}">Decline</button></div>` : `<span class="approval-status">${esc(item.status.toUpperCase())}</span>`}</article>`).join('') : '<p class="muted-copy">No sensitive requests are pending. Recommendations never grant access by themselves.</p>';
  }

  async function loadDashboard() {
    try {
      const data = await api('/api/dashboard');
      $('#kpi-trust').textContent = `${data.average_trust}%`;
      $('#kpi-agents').textContent = String(data.counts.agents).padStart(2, '0');
      $('#kpi-reviews').textContent = String(data.counts.reviews).padStart(2, '0');
      $('#kpi-alerts').textContent = String(data.counts.open_alerts).padStart(2, '0');
      $('#chart-mean').textContent = `${data.average_trust}/100`;
      renderAgentTable(data.agents);
      drawTrustChart(data.agents);
      renderAlerts(data.alerts, $('#alert-list'), false);
      renderApprovals(data.approvals || [], $('#approval-list'), false);
      renderTimeline(data.audit, $('#audit-timeline'));
    } catch (error) { showToast(error.message); }
  }

  function renderIdentity(agents) {
    const target = $('#identity-list');
    const query = ($('#module-agent-search')?.value || '').toLowerCase();
    const matches = agents.filter(agent => !query || `${agent.name} ${agent.owner} ${agent.kind}`.toLowerCase().includes(query));
    target.innerHTML = matches.map(agent => `<article class="identity-agent" data-agent="${esc(agent.id)}"><div class="identity-head"><span class="agent-avatar">${esc(initials(agent.name))}</span><span><b>${esc(agent.name)}</b><small>${esc(agent.kind)} · owner: ${esc(agent.owner)}</small></span><span class="identity-score"><b>${agent.trust}</b><small>TRUST / ${agent.confidence}% CONF.</small></span></div><div class="permission-chips">${agent.permissions.map(permission => { const enabled = agent.permission_state?.[permission] !== false; return `<span class="permission-chip ${enabled ? '' : 'paused'}"><code>${esc(permission)}</code><button type="button" data-permission="${esc(permission)}" data-agent="${esc(agent.id)}" data-enabled="${enabled}" aria-label="${enabled ? 'Pause' : 'Enable'} ${esc(permission)}">${enabled ? 'PAUSE' : 'ENABLE'}</button></span>`; }).join('')}</div></article>`).join('') || '<p class="muted-copy">No identities match that filter.</p>';
  }

  function renderEvidence(agents, events) {
    const bars = $('#evidence-bars');
    if (bars) bars.innerHTML = agents.map(agent => `<div class="evidence-bar-row"><span>${esc(agent.name)}</span><span class="evidence-bar" aria-label="${100 - agent.staleness} percent evidence freshness"><i style="width:${100 - agent.staleness}%"></i></span><small>${100 - agent.staleness}%</small></div>`).join('');
    const timeline = $('#evidence-events');
    if (timeline) {
      const syntheticEvents = agents.map((agent, index) => ({ time: `${index + 1}h ago`, kind: agent.assessment.abstain ? 'ABSTAIN' : 'SIGNAL', detail: `${agent.name}: ${agent.evidence_count} observations, ${agent.staleness}% stale. ${agent.assessment.decision}.`, actor: 'Synthetic signal window', agent_id: agent.id }));
      renderTimeline([...events, ...syntheticEvents], timeline);
    }
  }

  function setupGraph(agents) {
    const target = $('#graph-agent-nodes');
    if (!target) return;
    target.innerHTML = agents.map(agent => `<button type="button" class="graph-node" data-graph-agent="${esc(agent.id)}"><b>${esc(agent.name)}</b><small>TRUST ${agent.trust} · ${agent.evidence_count} signals</small></button>`).join('');
    target.addEventListener('click', event => {
      const button = event.target.closest('[data-graph-agent]');
      if (!button) return;
      const agent = agents.find(item => item.id === button.dataset.graphAgent);
      if (!agent) return;
      $$('.graph-node', target).forEach(node => node.classList.toggle('selected', node === button));
      const inspector = $('#graph-inspector');
      inspector.innerHTML = `<p class="eyebrow">AGENT INSPECTOR</p><h3>${esc(agent.name)}</h3><p>${esc(agent.kind)} · ${esc(agent.owner)}<br>${esc(agent.system)}</p><div class="inspector-score"><span><b>${agent.trust}</b><small>TRUST / 100</small></span><span><b>${agent.confidence}%</b><small>CONFIDENCE</small></span></div><p>${agent.assessment.abstain ? 'Abstained: ' : 'Recommendation: '}${esc(agent.assessment.decision)}.</p>`;
    });
  }

  function renderRecommendations(agents, approvals) {
    const target = $('#recommendation-list');
    if (target) target.innerHTML = agents.map(agent => {
      const assessment = agent.assessment;
      const sensitive = agent.sensitive;
      return `<article class="recommendation-card"><div class="recommendation-head"><div><h3>${esc(agent.name)}</h3><p>${esc(agent.system)} · ${esc(agent.owner)}</p></div><div class="recommendation-metrics"><span>TRUST <b>${agent.trust}</b></span><span>CONF. <b>${agent.confidence}%</b></span></div></div><div class="recommendation-footer"><span class="decision-label">${esc(assessment.decision)}</span>${sensitive && !assessment.abstain ? `<button class="button button-outline button-small" data-create-approval="${esc(agent.id)}">Request human review <span>→</span></button>` : ''}</div><div class="reason-chips">${assessment.reasons.slice(0, 2).map(reason => `<span>${esc(reason)}</span>`).join('')}</div></article>`;
    }).join('');
    renderApprovals(approvals, $('#module-approval-list'), true);
    renderApprovals(approvals, $('#monitoring-approval-list'), true);
  }

  const auditCache = { events: [] };
  async function loadAudit() {
    const kind = $('#audit-filter')?.value || 'all';
    const data = await api(`/api/audit?kind=${encodeURIComponent(kind)}`);
    auditCache.events = data.events;
    const body = $('#audit-body');
    if (!body) return;
    body.innerHTML = data.events.length ? data.events.map(event => `<tr><td>${esc(event.time)}</td><td>${esc(event.kind)}</td><td>${esc(event.detail)}</td><td>${esc(event.actor)}</td><td>${esc(event.agent_id || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="loading-row">No matching actions yet. Sign-in, approvals, and alert reviews appear here.</td></tr>';
  }

  async function refresh() {
    const agentsData = await api('/api/agents');
    const agents = agentsData.agents;
    const [auditData, approvalData] = await Promise.all([
      api('/api/audit').catch(() => ({ events: [] })),
      api('/api/approvals').catch(() => ({ approvals: [] })),
    ]);
    if (moduleName === 'identity') renderIdentity(agents);
    if (moduleName === 'evidence') renderEvidence(agents, auditData.events);
    if (moduleName === 'graph') setupGraph(agents);
    if (moduleName === 'recommendations') renderRecommendations(agents, approvalData.approvals);
    if (moduleName === 'monitoring') {
      const dash = await api('/api/dashboard');
      renderAlerts(dash.alerts, $('#monitoring-list'), true);
      renderApprovals(approvalData.approvals, $('#monitoring-approval-list'), true);
    }
    if (moduleName === 'privacy') await loadAudit();
    if (moduleName === 'passport') setupPassport(agents);
  }

  function setupSimulator() {
    const fields = ['scope', 'anomaly', 'volatility', 'staleness'];
    const values = { scope: 42, anomaly: 23, volatility: 28, staleness: 34, evidence_count: 8 };
    const elements = Object.fromEntries(fields.map(name => [name, $(`#input-${name}`)]));
    const evidence = $('#input-evidence');
    const sensitive = $('#sensitive-request');
    const resultNodes = { risk: $('#sim-risk'), trust: $('#sim-trust'), confidence: $('#sim-confidence'), decision: $('#sim-decision'), reasons: $('#sim-reasons'), ring: $('#sim-risk-ring') };
    let timer;
    const compute = async () => {
      fields.forEach(name => { values[name] = Number(elements[name].value); $(`#value-${name}`).textContent = String(values[name]); });
      values.evidence_count = Number(evidence.value);
      $('#value-evidence').textContent = String(values.evidence_count);
      try {
        const result = await api('/api/risk/simulate', { method: 'POST', body: JSON.stringify({ ...values, sensitive_request: sensitive.checked }) });
        resultNodes.risk.textContent = String(result.risk).padStart(2, '0');
        resultNodes.trust.textContent = result.trust;
        resultNodes.confidence.textContent = `${result.confidence}%`;
        resultNodes.decision.textContent = result.decision;
        resultNodes.reasons.innerHTML = result.reasons.map(reason => `<p>${esc(reason)}</p>`).join('');
        resultNodes.ring.style.borderColor = result.risk > 55 ? '#ba705b' : result.risk > 30 ? '#d4a017' : '#82936d';
      } catch (error) { showToast(error.message); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(compute, 90); };
    fields.forEach(name => elements[name].addEventListener('input', schedule));
    evidence.addEventListener('input', schedule);
    sensitive.addEventListener('change', schedule);
    $('#reset-simulator').addEventListener('click', () => {
      Object.assign(values, { scope: 42, anomaly: 23, volatility: 28, staleness: 34, evidence_count: 8 });
      fields.forEach(name => { elements[name].value = values[name]; });
      evidence.value = '8';
      sensitive.checked = false;
      compute();
      showToast('Illustrative sample restored.');
    });
    compute();
  }

  function setupPassport(agents) {
    const select = $('#passport-agent');
    if (!select) return;
    select.innerHTML = agents.map(agent => `<option value="${esc(agent.id)}">${esc(agent.name)}</option>`).join('');
    const render = () => {
      const agent = agents.find(item => item.id === select.value);
      if (!agent) return;
      $('#passport-preview').innerHTML = `<span class="passport-overline">CREDENCE / EVIDENCE PASSPORT</span><span class="passport-emblem">C</span><p class="eyebrow">PREVIEW / SYNTHETIC RECORD</p><h2>${esc(agent.name)}</h2><div class="passport-rule"></div><p>Trust ${agent.trust} / 100 · Confidence ${agent.confidence}%<br>${agent.evidence_count} observations · ${agent.staleness}% stale<br>${esc(agent.assessment.decision)}</p><span class="passport-serial">RECORD No. ${esc(agent.id.toUpperCase())} / 2026</span>`;
    };
    select.addEventListener('change', render);
    render();
    $('#download-passport').addEventListener('click', async () => {
      try {
        const response = await fetch(`/api/passport/${encodeURIComponent(select.value)}`, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('The evidence passport could not be prepared.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `credence-${select.value}-passport.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Synthetic evidence passport downloaded.');
      } catch (error) { showToast(error.message); }
    });
  }

  document.addEventListener('click', async event => {
    const permission = event.target.closest('[data-permission]');
    const approvalRequest = event.target.closest('[data-create-approval]');
    const decision = event.target.closest('[data-approval][data-decision]');
    const ack = event.target.closest('[data-ack]');
    try {
      if (permission) {
        const enabled = permission.dataset.enabled !== 'true';
        const result = await api(`/api/agents/${encodeURIComponent(permission.dataset.agent)}/permissions`, { method: 'POST', body: JSON.stringify({ permission: permission.dataset.permission, enabled }) });
        showToast(result.pending ? result.message : `${permission.dataset.permission} ${enabled ? 'enabled' : 'paused'} in the synthetic register.`);
        await refresh();
      } else if (approvalRequest) {
        const result = await api('/api/approvals', { method: 'POST', body: JSON.stringify({ agent_id: approvalRequest.dataset.createApproval, request: 'Sensitive access review' }) });
        showToast(result.message);
        await refresh();
        if (page === 'dashboard') await loadDashboard();
      } else if (decision) {
        const result = await api(`/api/approvals/${encodeURIComponent(decision.dataset.approval)}/decision`, { method: 'POST', body: JSON.stringify({ decision: decision.dataset.decision }) });
        showToast(`Human decision recorded: ${result.approval.status}.`);
        await refresh();
        if (page === 'dashboard') await loadDashboard();
      } else if (ack) {
        await api(`/api/alerts/${encodeURIComponent(ack.dataset.ack)}/ack`, { method: 'POST', body: JSON.stringify({}) });
        showToast('Alert acknowledgement recorded in the synthetic audit log.');
        await refresh();
        if (page === 'dashboard') await loadDashboard();
      }
    } catch (error) { showToast(error.message); }
  });

  $('#agent-search')?.addEventListener('input', async () => { const data = await api('/api/agents'); renderAgentTable(data.agents); });
  $('#agent-filter')?.addEventListener('change', async () => { const data = await api('/api/agents'); renderAgentTable(data.agents); });
  $('#module-agent-search')?.addEventListener('input', async () => { const data = await api('/api/agents'); renderIdentity(data.agents); });
  $('#alert-filter')?.addEventListener('change', async () => { const data = await api('/api/dashboard'); renderAlerts(data.alerts, $('#monitoring-list'), true); });
  $('#audit-filter')?.addEventListener('change', () => loadAudit().catch(error => showToast(error.message)));
  $('#export-audit')?.addEventListener('click', async () => {
    try {
      const data = await api('/api/audit?kind=' + encodeURIComponent($('#audit-filter')?.value || 'all'));
      const columns = ['time', 'kind', 'detail', 'actor', 'agent_id'];
      const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const csv = [columns.join(','), ...data.events.map(row => columns.map(key => quote(row[key])).join(','))].join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = 'credence-synthetic-audit.csv';
      link.click(); URL.revokeObjectURL(link.href);
      showToast('Synthetic audit export downloaded.');
    } catch (error) { showToast(error.message); }
  });

  if (page === 'dashboard') loadDashboard();
  if (page === 'module' && moduleName === 'simulator') setupSimulator();
  if (page === 'module' && moduleName !== 'simulator') refresh().catch(error => showToast(error.message));
})();
