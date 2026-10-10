/* Light / dark / automatic theme. Loaded in <head> so the page never flashes the wrong colours. */
(function () {
  const KEY = 'studyPlanner.theme';   // a per-device preference, deliberately not part of the backup
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const get = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } };
  const isDark = (m = get()) => m === 'dark' || (m !== 'light' && !!(mq && mq.matches));
  function apply(m = get()) {
    const r = document.documentElement;
    if (m === 'dark' || m === 'light') r.setAttribute('data-theme', m); else r.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark(m) ? '#12132a' : '#3b3a86');
  }
  function set(m) { try { localStorage.setItem(KEY, m); } catch (e) { /* not saved */ } apply(m); document.dispatchEvent(new Event('themechange')); }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (get() === 'auto') { apply('auto'); document.dispatchEvent(new Event('themechange')); } });
  apply();
  window.Theme = { get, set, apply, isDark };
})();
