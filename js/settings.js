/* Settings page (opened with the gear on Home): file uploads, appearance, backup, AI, sample data. */
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


  function libraryCard() {
    const box = el('div', { class: 'lib-list' }), status = el('div', { class: 'hint', style: 'margin:8px 0 0', hidden: true });
    const dl = el('datalist', { id: 'libSubjects' });
    const subj = el('input', { type: 'text', list: 'libSubjects', placeholder: 'Subject (e.g. Taxation)', maxlength: 60, 'aria-label': 'Subject for the books you add' });
    const names = () => [...new Set(Store.get().lectures.map(l => l.subject))].sort();
    const file = el('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.docx,.txt,application/pdf' });
    const say = (m, bad) => { status.hidden = false; status.className = bad ? 'err' : 'hint'; status.style.margin = '8px 0 0'; status.textContent = m; };
    const mb = n => (n / 1048576).toFixed(1);
    const draw = async () => {
      let books = [];
      try { books = await Library.list(); } catch (e) { box.replaceChildren(el('div', { class: 'err' }, e.message)); return; }
      dl.replaceChildren(...names().map(n => el('option', { value: n })));
      box.replaceChildren(...(books.length ? books.map(b => el('div', { class: 'lib-row' },
        el('div', { class: 'lib-main' }, el('div', { class: 'lib-name' }, b.title || b.name),
          el('div', { class: 'lib-meta' }, `${b.subject || 'No subject'} · ${b.pages} pages · ${mb(b.chars)} MB of text${b.empty ? ` · ${b.empty} pages had no text` : ''}`)),
        el('button', { class: 'x', type: 'button', 'aria-label': 'Remove ' + b.name, onclick: async () => { if (confirm(`Remove "${b.name}" from the Library?`)) { await Library.remove(b.id); draw(); } } }, '×')))
        : [el('p', { class: 'hint', style: 'margin:0' }, 'No books yet. Add text-based PDFs of your textbooks and Acts.')]));
    };
    file.addEventListener('change', async () => {
      const files = [...file.files]; file.value = '';
      if (!files.length) return;
      let busy = true;
      try {
        for (const f of files) {
          const subject = subj.value.trim() || Library.guessSubject(f.name, names());
          if (!subject && !confirm(`No subject chosen for "${f.name}". Add it without a subject? (Answers search all books when the subject is unknown.)`)) continue;
          if (f.size > 80 * 1048576 && !confirm(`"${f.name}" is ${mb(f.size)} MB. Reading it may take a few minutes. Continue?`)) continue;
          say(`Reading ${f.name}…`);
          const pages = await FileText.readPages(f, (p, n) => say(`Reading ${f.name}: page ${p} of ${n}…`), { tabGap: 14 });
          say(`Saving ${f.name}…`);
          const r = await Library.add(f.name, subject, pages);
          say(`Added ${f.name}${r.subject ? ' (' + r.subject + ')' : ''}: ${r.pages} pages${r.empty ? `, ${r.empty} had no text (scanned?)` : ''}.`);
          await draw();
        }
      } catch (e) { say(e.message || 'Could not add that file.', true); }
      busy = false;
    });
    draw();
    return el('section', { class: 'card settings-card' },
      el('h2', {}, '📚 Library (textbooks & Acts)'),
      el('p', { class: 'hint' }, 'Books stay on this phone. When you ask the chat a question, the app searches them here and sends only the few matching passages to Gemini, so answers come from your books with page numbers.'),
      box, el('div', { class: 'lib-add' }, subj, dl, el('button', { class: 'btn outline sm', type: 'button', onclick: () => file.click() }, '+ Add books'), file), status);
  }

  function render(root) {
    const st = Store.get();
    root.append(el('div', { class: 'page-head' },
      el('a', { class: 'back', href: '#home', 'aria-label': 'Back to Home' }, '‹ Back'),
      el('h2', { class: 'big' }, 'Settings')));

    root.append(el('section', { class: 'card settings-card' },
      el('h2', {}, 'Upload files'),
      el('p', { class: 'hint' }, 'Load your lecture planner or test timetable from a PDF, Word, Excel, CSV or text file. You check a preview before anything is saved.'),
      el('div', { class: 'uploads' },
        el('button', { class: 'upbtn', onclick: () => Planner.open() }, TestsView.upIcon(), 'Upload Planner'),
        el('button', { class: 'upbtn', onclick: () => TestsView.openTimetable() }, TestsView.upIcon(), 'Upload Test Timetable'))));

    root.append(libraryCard());

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
