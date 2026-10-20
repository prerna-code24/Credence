(() => {
  const root = document.documentElement;
  const key = 'credence-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const storedTheme = () => {
    try {
      const value = localStorage.getItem(key);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };

  const syncControls = theme => {
    const isDark = theme === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
      button.title = `Switch to ${isDark ? 'light' : 'dark'} theme`;
      const icon = button.querySelector('.theme-toggle-icon');
      const label = button.querySelector('.theme-toggle-label');
      if (icon) icon.textContent = isDark ? '☼' : '◐';
      if (label) label.textContent = isDark ? 'Light' : 'Dark';
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#20211F' : '#2B2B2B';
  };

  const applyTheme = theme => {
    const chosen = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = chosen;
    root.style.colorScheme = chosen;
    syncControls(chosen);
  };

  const saved = storedTheme();
  applyTheme(saved || (media.matches ? 'dark' : 'light'));

  document.addEventListener('click', event => {
    const button = event.target.closest('.theme-toggle');
    if (!button) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, next); } catch { /* Theme still changes for this page. */ }
    applyTheme(next);
  });

  const followSystem = () => {
    if (!storedTheme()) applyTheme(media.matches ? 'dark' : 'light');
  };
  if (media.addEventListener) media.addEventListener('change', followSystem);
  else if (media.addListener) media.addListener(followSystem);

  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    applyTheme(event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : (media.matches ? 'dark' : 'light'));
  });
})();
