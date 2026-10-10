/* Library page: add books (many files or a folder), browse them in collapsible subject folders, open or remove them. */
(function () {
  const { el } = HomeView;
  const OPEN_KEY = 'studyPlanner.libOpen';
  const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch (e) { return new Set(); } };
  const saveOpen = set => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } };
  const mb = n => (n / 1048576).toFixed(1);
  const names = () => [...new Set(Store.get().lectures.map(l => l.subject))].sort();

  function render(root) {
    root.append(el('div', { class: 'page-head' }, el('a', { class: 'back', href: '#settings' }, '‹ Settings'), el('h2', { class: 'big' }, '📚 Library')));
    const status = el('div', { class: 'hint', hidden: true, style: 'white-space:pre-wrap' });
    const folders = el('div', { class: 'lib-folders' });
    const dl = el('datalist', { id: 'libSubjects' });
    const subj = el('input', { type: 'text', list: 'libSubjects', placeholder: 'Subject for the books you add (optional)', maxlength: 60, 'aria-label': 'Subject for the books you add' });
    const file = el('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.docx,.txt,application/pdf' });
    const folder = el('input', { type: 'file', hidden: true, webkitdirectory: true, multiple: true });
    const touch = (navigator.maxTouchPoints || 0) > 0 && /Android|iPhone|iPad/i.test(navigator.userAgent);   // phones cannot pick folders: pick many files at once instead
    const search = el('input', { type: 'search', class: 'mb-search bk-q', placeholder: 'Search your books by name', 'aria-label': 'Search books by name' });
    const say = (m, bad) => { status.hidden = false; status.className = bad ? 'err' : 'hint'; status.textContent = m; };
    let books = [];

    const draw = async () => {
      try { await Library.fixTitles(); books = await Library.list(); } catch (e) { folders.replaceChildren(el('div', { class: 'err' }, e.message)); return; }
      dl.replaceChildren(...names().map(n => el('option', { value: n })));
      const q = search.value.trim().toLowerCase(), open = openSet();
      const shown = books.filter(b => !q || (b.title + ' ' + b.name + ' ' + b.subject).toLowerCase().includes(q));
      if (!books.length) { folders.replaceChildren(el('div', { class: 'empty card' }, 'No books yet.', el('br'), 'Add text-based PDFs of your textbooks and Acts. They stay on this phone.')); return; }
      const bySub = new Map();
      shown.forEach(b => { const k = b.subject || 'No subject'; (bySub.get(k) || bySub.set(k, []).get(k)).push(b); });
      const keys = [...bySub.keys()].sort((a, b) => a === 'No subject' ? 1 : b === 'No subject' ? -1 : a.localeCompare(b));
      const bar = el('div', { class: 'lib-bar' }, el('span', { class: 'hint', style: 'margin:0' }, `${shown.length} of ${books.length} books · ${keys.length} folders`),
        el('button', { class: 'linkbtn', type: 'button', style: 'color:var(--indigo)', onclick: () => { saveOpen(new Set(keys)); draw(); } }, 'Open all'),
        el('button', { class: 'linkbtn', type: 'button', style: 'color:var(--indigo)', onclick: () => { saveOpen(new Set()); draw(); } }, 'Close all'));
      folders.replaceChildren(bar, ...(keys.length ? keys.map(k => {
        const list = bySub.get(k).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
        const d = el('details', { class: 'lib-folder' }, el('summary', {}, el('span', { class: 'lf-name' }, '📁 ' + k), el('span', { class: 'lf-count' }, `${list.length} · ${list.reduce((s, b) => s + b.pages, 0).toLocaleString()} pp`)),
          list.map(b => el('div', { class: 'lib-row' },
            el('div', { class: 'lib-main' }, el('div', { class: 'lib-name' }, b.title || b.name),
              el('div', { class: 'lib-meta' }, `${b.pages} pages · ${mb(b.chars)} MB text${b.empty ? ` · ${b.empty} pages had no text` : ''}`),
              el('div', { class: 'lib-links' },
                el('button', { class: 'linkbtn blue', type: 'button', onclick: async () => { const s = prompt('Move "' + (b.title || b.name) + '" to which subject folder?', b.subject || ''); if (s != null) { await Library.setSubject(b.id, s); draw(); } } }, 'Move'),
                el('button', { class: 'linkbtn', type: 'button', 'aria-label': 'Remove ' + (b.title || b.name), onclick: async () => { if (confirm(`Remove "${b.title || b.name}" from the Library? You can add it again later.`)) { await Library.remove(b.id); draw(); } } }, 'Remove'))),
            el('a', { class: 'btn outline sm', href: `#book/${b.id}/1` }, '📖 Open'))));
        d.open = open.has(k) || !!q;                       // folders stay closed unless you open them (or are searching)
        d.querySelector('summary').addEventListener('click', () => setTimeout(() => { const s = openSet(); d.open ? s.add(k) : s.delete(k); saveOpen(s); }, 0));   // only real taps change what is remembered
        return d;
      }) : [el('div', { class: 'empty card' }, 'No book matches.')]));
    };
    search.addEventListener('input', draw);

    // Reads every chosen file in turn: one file, many files or a whole folder.
    const addFiles = async files => {
      files = files.filter(f => /\.(pdf|docx|txt)$/i.test(f.name)).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
      if (!files.length) { say('No PDF, Word or text files found there.', true); return; }
      const existing = await Library.list();
      let added = 0, skipped = 0; const failed = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i], tag = `File ${i + 1} of ${files.length}: ${f.name}`;
        if (existing.some(b => b.name === f.name && b.size === f.size)) { skipped++; continue; }
        try {
          const dir = (f.webkitRelativePath || '').split('/').slice(-2, -1)[0] || '';
          const subject = subj.value.trim() || Library.guessSubject(dir, names()) || Library.guessSubject(f.name, names());
          say(`${tag} - reading…`);
          const pages = await FileText.readPages(f, (p, n) => say(`${tag} - page ${p} of ${n}`), { tabGap: 14 });
          say(`${tag} - saving…`);
          const r = await Library.add(f.name, subject, pages, f);
          if (r.duplicate) { skipped++; continue; }
          added++;
          if (added === 1 && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        } catch (e) { failed.push(`${f.name}: ${e.message || 'could not be read'}`); }
        await draw();
      }
      say(`Done. ${added} added${skipped ? `, ${skipped} already in the Library` : ''}${failed.length ? `, ${failed.length} failed` : ''}.` + (failed.length ? '\n' + failed.join('\n') : ''), failed.length > 0 && !added);
    };
    file.addEventListener('change', () => { const fs = [...file.files]; file.value = ''; addFiles(fs); });
    folder.addEventListener('change', () => { const fs = [...folder.files]; folder.value = ''; addFiles(fs); });

    root.append(el('section', { class: 'card settings-card' },
      el('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Books stay on this phone. When you ask the chat a question, only the few matching passages are sent to Gemini.'),
      el('div', { class: 'lib-add' }, subj, dl,
        el('button', { class: 'btn outline sm', type: 'button', onclick: () => file.click() }, '+ Add books'),
        touch ? null : el('button', { class: 'btn outline sm', type: 'button', onclick: () => folder.click() }, '📁 Add folder'), file, folder),
      el('p', { class: 'hint', style: 'margin:8px 0 0' }, touch ? 'Tip: in the file picker, press and hold one file, then tap the others to add many books in one go.' : 'Tip: "Add folder" reads every PDF inside it. Name sub-folders after the subject (e.g. Taxation) to set the subject automatically.'),
      status));
    root.append(search, folders);
    draw();
  }

  window.LibraryView = { render };
})();
