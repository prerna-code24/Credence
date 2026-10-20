(() => {
  const fields = ['scope', 'anomaly', 'volatility', 'staleness'];
  const weights = { scope: .30, anomaly: .35, volatility: .20, staleness: .15 };
  const inputs = Object.fromEntries(fields.map(name => [name, document.getElementById(`home-${name}`)]));
  const risk = document.getElementById('home-risk');
  const trust = document.getElementById('home-trust');
  const explanation = document.getElementById('home-explanation');
  const update = () => {
    if (!risk) return;
    const score = Math.round(fields.reduce((sum, name) => sum + Number(inputs[name].value) * weights[name], 0));
    risk.textContent = String(score).padStart(2, '0');
    trust.textContent = String(100 - score).padStart(2, '0');
    fields.forEach(name => {
      const label = document.getElementById(`home-${name}-value`);
      if (label) label.textContent = inputs[name].value;
    });
    explanation.textContent = score <= 30 ? 'Illustrative low-risk band. Keep permissions narrow; a score is not an authorization.' : score <= 55 ? 'Review the scope and continue monitoring. Confidence and evidence sufficiency remain separate.' : 'Elevated illustrative risk. Pause new access for a human review.';
  };
  fields.forEach(name => inputs[name]?.addEventListener('input', update));
  update();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.trust-map .edge-pulse').forEach(dot => dot.remove());
  }

  const graph = document.querySelector('.trust-map');
  const graphCaption = graph?.querySelector('.map-caption');
  const graphNodes = [...(graph?.querySelectorAll('.map-node') || [])];
  const graphNotes = {
    'Agent Atlas Ledger': 'Identity / Atlas Ledger · owner and system scope are explicit.',
    'Evidence signals': 'Evidence / 24 observations · freshness and sufficiency are inspected.',
    'Permission scope': 'Permission / 2 narrow scopes · each permission has a named boundary.',
    'Ledger resource': 'Resource / Ledger · access follows an evidence-backed path.',
  };
  const activateNode = node => {
    graphNodes.forEach(item => {
      const selected = item === node;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    if (graphCaption) graphCaption.textContent = graphNotes[node.getAttribute('aria-label')] || 'Inspect this evidence relationship.';
  };
  graphNodes.forEach(node => {
    node.addEventListener('click', () => activateNode(node));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateNode(node);
      }
    });
  });

  const hero = document.querySelector('.hero');
  const scene = document.querySelector('.hero-field');
  if (hero && scene && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let raf = 0;
    hero.addEventListener('pointermove', event => {
      const rect = hero.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - .5) * 5;
      const y = ((event.clientY - rect.top) / rect.height - .5) * 4;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { scene.style.transform = `translate(${x}px, ${y}px)`; });
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { scene.style.transform = ''; }, { passive: true });
  }
})();
