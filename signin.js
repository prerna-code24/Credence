(() => {
  const button = document.getElementById('demo-entry');
  const form = document.getElementById('demo-signup-form');
  const error = document.getElementById('signin-error');

  const report = message => {
    error.textContent = message;
    error.hidden = false;
    error.focus?.();
  };
  const disable = (control, message) => {
    control.disabled = true;
    control.setAttribute('aria-busy', 'true');
    control.dataset.original = control.innerHTML;
    control.innerHTML = message;
  };
  const restore = control => {
    control.disabled = false;
    control.removeAttribute('aria-busy');
    control.innerHTML = control.dataset.original || control.innerHTML;
  };

  if (button) button.addEventListener('click', async () => {
    disable(button, 'Opening synthetic workspace…');
    error.hidden = true;
    try {
      const response = await fetch('/auth/demo', { method: 'POST', headers: { 'Accept': 'application/json' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The demo workspace could not be opened.');
      window.location.assign(result.redirect || '/dashboard');
    } catch (e) {
      report(e.message || 'Unable to open the demo workspace.');
      restore(button);
    }
  });

  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const input = document.getElementById('demo-name');
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40 || !/[\p{L}]/u.test(name)) {
      report('Enter a display name of 2–40 letters. No real account will be created.');
      input.focus();
      return;
    }
    const submit = document.getElementById('demo-signup-submit');
    disable(submit, 'Creating temporary identity…');
    try {
      const response = await fetch('/auth/demo-signup', {
        method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The synthetic identity could not be created.');
      window.location.assign(result.redirect || '/dashboard');
    } catch (e) {
      report(e.message || 'Unable to create the synthetic identity.');
      restore(submit);
    }
  });
})();
