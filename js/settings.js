/* Settings page (opened with the gear on Home): appearance, backup, AI, sample data. */
(function () {
  const { el } = HomeView;
  const { D } = Store;

  function backupCard(st) {
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      let text;
      try { text = await f.text(); } catch (e) { App.toast('Could not read that file.', 'err'); return; }
      let probe; try { probe = JSON.parse(text); } catch (e) { probe = null; }
      const d = probe && probe.data ? probe.data : probe;
      const n = d && Array.isArray(d.lectures) ? d.lectures.length : null;
      if (n == null) { App.toast(probe ? 'This does not look like a Study Planner backup.' : 'This file is not valid JSON.', 'err'); return; }
      if (!confirm(`Import this backup (${n} lectures)?\n\nThis REPLACES everything currently in the app. Export first if you want to keep it.`)) return;
      const r = Store.importJSON(text);
      if (!r.ok) { App.toast(r.error, 'err'); return; }
      App.toast(`Imported ${r.counts.lectures} lectures, ${r.counts.revisions} revisions, ${r.counts.tests} tests` + (r.dropped ? ` (${r.dropped} unreadable entries skipped)` : '') + '.');
      App.render();
    });
    const days = st.lastBackup ? Math.floor((Date.now() - new Date(st.lastBackup)) / 864e5) : null;
    const hasData = st.lectures.some(l => !l.sample) || st.tests.some(t => !t.sample);
    const stale = hasData && (days == null || days >= 7);
    return el('section', { class: 'card backup' + (stale ? ' stale' : '') },
      el('h2', {}, 'Appearance & backup'),
      el('div', { class: 'theme-row', role: 'group', 'aria-label': 'Appearance' }, el('span', {}, 'Appearance'),
        [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([m, label]) =>
          el('button', { type: 'button', class: 'seg' + (Theme.get() === m ? ' on' : ''), 'aria-pressed': String(Theme.get() === m),
            onclick: () => { Theme.set(m); App.render(); } }, label))),
      el('p', { class: 'hint' }, st.lastBackup ? `Last backup: ${days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}.` : 'No backup yet.',
        stale ? ' Your data lives only in this browser, so export a copy now and then.' : ''),
      el('div', { class: 'backup-btns' },
        el('button', { class: 'btn primary sm', onclick: async () => {
          try { await Files.save(`study-planner-${D.today()}.json`, 'application/json', Store.exportJSON()); }
          catch (e) { if (e && /cancel/i.test(String(e.message || e))) return; App.toast('Could not save the backup: ' + (e.message || e), 'err'); return; }
          App.toast(Files.isNative() ? 'Choose where to save your backup.' : 'Backup downloaded.'); App.render();
        } }, 'Export backup'),
        el('button', { class: 'btn outline sm', onclick: () => fileIn.click() }, 'Import backup'),
        el('button', { class: 'btn danger sm', onclick: () => {
          if (confirm('Erase ALL lectures, revisions and tests? This cannot be undone.\n\nTip: Export a backup first.') &&
              confirm('Really erase everything?')) { Store.eraseAll(); App.toast('All data erased.'); App.render(); }
        } }, 'Erase all')),
      fileIn);
  }


  function render(root) {
    const st = Store.get();
    root.append(el('div', { class: 'page-head' },
      el('a', { class: 'back', href: '#home', 'aria-label': 'Back to Home' }, '‹ Back'),
      el('h2', { class: 'big' }, 'Settings')));

    root.append(backupCard(st));

    root.append(el('section', { class: 'card settings-card' },
      el('h2', {}, 'AI assistant (Gemini)'),
      el('p', { class: 'hint' }, Gemini.hasKey() ? 'Your API key is saved on this device.' : 'Add a free API key to read planners with AI and use the ✨ Ask AI chat.'),
      el('div', { class: 'backup-btns' },
        el('button', { class: 'btn outline sm', onclick: () => Gemini.openSettings().then(() => App.render()) }, 'AI settings & rules'))));

    if (st.sampleActive) {
      root.append(el('section', { class: 'card settings-card' },
        el('h2', {}, 'Sample data'),
        el('p', { class: 'hint' }, 'The app is showing sample lectures so every tab is populated. Lectures you add or upload yourself are kept when you clear it.'),
        el('button', { class: 'btn danger sm', onclick: () => {
          if (confirm('Remove all sample data? Lectures you added yourself are kept.')) { Store.clearSample(); App.toast('Sample data removed.'); App.render(); }
        } }, 'Clear sample data')));
    }
  }

  window.SettingsView = { render };
})();
