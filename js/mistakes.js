/* Mistake book: log what you got wrong while revising, see it again next time you revise that chapter,
 * and review it on a 1 / 3 / 7 / 14 / 30 day schedule until you get it right five times in a row. */
(function () {
  const { el } = HomeView;
  const { D } = Store;
  const KINDS = { question: 'Question I got wrong', concept: 'Concept I forgot', formula: 'Formula / section', silly: 'Silly mistake' };
  const KIND_ICON = { question: '❓', concept: '💡', formula: '🧮', silly: '😅' };
  let addDlg, listDlg, reviewDlg, filterSub = 'all', search = '';

  const subjects = () => {
    const st = Store.get();
    return [...new Set([...st.lectures.map(l => l.subject), ...st.mistakes.map(m => m.subject)].filter(Boolean))].sort();
  };
  const chaptersOf = sub => {
    const seen = new Set(), out = [];
    Store.get().lectures.filter(l => l.subject === sub).sort((a, b) => a.date.localeCompare(b.date)).forEach(l => { if (!seen.has(l.chapter)) { seen.add(l.chapter); out.push(l.chapter); } });
    return out;
  };
  const when = m => Store.isMastered(m) ? 'Mastered ✓' : m.due <= D.today() ? 'Review today' : 'Next review ' + D.fmtShort(m.due);
  const explainText = m => `I keep getting this wrong in ${m.subject || 'my subject'}${m.chapter ? ' (' + m.chapter + ')' : ''}:\n"${m.text}"` +
    (m.answer ? `\nMy note on the correct answer: "${m.answer}"` : '') + '\nExplain the concept simply, show why the mistake happens and give me one trick to remember it.';

  /* ---------- add / edit ---------- */
  function openAdd(pre, editing) {
    if (!addDlg) {
      const f = el('form', { method: 'dialog', autocomplete: 'off' });
      const subjDl = el('datalist', { id: 'mbSubjects' }), chapDl = el('datalist', { id: 'mbChapters' });
      const err = el('div', { class: 'err', hidden: true });
      f.append(el('h2', { 'data-role': 'title' }, 'Log a mistake'),
        el('div', { class: 'stack' },
          el('label', {}, 'Subject', el('input', { name: 'subject', type: 'text', list: 'mbSubjects', maxlength: 60, required: true })),
          el('label', {}, 'Chapter', el('input', { name: 'chapter', type: 'text', list: 'mbChapters', maxlength: 120 }))),
        subjDl, chapDl,
        el('label', {}, 'Type', el('select', { name: 'kind' }, Object.entries(KINDS).map(([v, l]) => el('option', { value: v }, l)))),
        el('label', {}, 'What went wrong? (the question or concept)', el('textarea', { name: 'text', rows: 3, maxlength: 1200, required: true, placeholder: 'e.g. Could not recall the conditions for ITC on capital goods' })),
        el('label', {}, 'Correct answer / how to remember it', el('textarea', { name: 'answer', rows: 3, maxlength: 1500, placeholder: 'e.g. ITC allowed only if used for business; blocked for personal use (Sec 17(5))' })),
        err,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => addDlg.close() }, 'Cancel'),
          el('button', { type: 'submit', class: 'btn primary' }, 'Save')));
      f.elements.subject.addEventListener('input', () => chapDl.replaceChildren(...chaptersOf(f.elements.subject.value.trim()).map(c => el('option', { value: c }))));
      f.addEventListener('submit', e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f));
        if (!v.text.trim() || !v.subject.trim()) { err.textContent = 'Subject and what went wrong are required.'; err.hidden = false; return; }
        if (addDlg._editing) Store.updateMistake(addDlg._editing, { subject: v.subject.trim(), chapter: v.chapter.trim(), kind: v.kind, text: v.text.trim(), answer: v.answer.trim() });
        else Store.addMistake(v);
        addDlg.close(); App.toast(addDlg._editing ? 'Mistake updated.' : 'Saved to your mistake book. It will come back for review tomorrow.'); App.render();
      });
      addDlg = el('dialog', { class: 'sheet' }, f);
      addDlg._f = f; addDlg._subj = subjDl; addDlg._chap = chapDl; addDlg._err = err; addDlg._title = f.querySelector('[data-role=title]');
      document.body.append(addDlg);
    }
    const f = addDlg._f; f.reset(); addDlg._err.hidden = true;
    addDlg._editing = editing || null;
    addDlg._title.textContent = editing ? 'Edit mistake' : 'Log a mistake';
    addDlg._subj.replaceChildren(...subjects().map(s => el('option', { value: s })));
    const p = pre || {};
    f.elements.subject.value = p.subject || ''; f.elements.chapter.value = p.chapter || '';
    f.elements.kind.value = p.kind || 'question'; f.elements.text.value = p.text || ''; f.elements.answer.value = p.answer || '';
    addDlg._chap.replaceChildren(...chaptersOf(f.elements.subject.value.trim()).map(c => el('option', { value: c })));
    addDlg.showModal();
    setTimeout(() => (p.subject ? f.elements.text : f.elements.subject).focus(), 50);
  }

  /* ---------- one mistake as a card (used in the book and in the chapter popup) ---------- */
  function card(m, onChange) {
    const ans = el('div', { class: 'mb-answer', hidden: true }, m.answer || 'No answer saved yet. Tap Edit to add how to remember it.');
    const toggle = el('button', { class: 'btn outline sm', type: 'button', onclick: () => { ans.hidden = !ans.hidden; toggle.textContent = ans.hidden ? 'Show answer' : 'Hide answer'; } }, 'Show answer');
    return el('div', { class: 'mb-card' + (Store.isMastered(m) ? ' mastered' : '') },
      el('div', { class: 'mb-top' }, el('span', { class: 'mb-kind' }, `${KIND_ICON[m.kind] || '❓'} ${KINDS[m.kind] || 'Mistake'}`),
        el('span', { class: 'mb-when' + (!Store.isMastered(m) && m.due <= D.today() ? ' due' : '') }, when(m))),
      el('div', { class: 'mb-where' }, [m.subject, m.chapter].filter(Boolean).join(' · ')),
      el('div', { class: 'mb-text' }, m.text), ans,
      el('div', { class: 'mb-actions' }, toggle,
        el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { document.querySelectorAll('dialog[open]').forEach(d => { if (d.classList.contains('mblist')) d.close(); }); Assistant.ask(explainText(m)); } }, '✨ Explain'),
        el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { if (listDlg && listDlg.open) listDlg.close(); openAdd(m, m.id); } }, 'Edit'),
        el('button', { class: 'x', type: 'button', 'aria-label': 'Delete this mistake', onclick: () => { if (confirm('Delete this mistake?')) { Store.deleteMistake(m.id); onChange(); } } }, '×')));
  }

  /* ---------- mistakes of one chapter (opened from revision / lecture cards) ---------- */
  function openChapter(subject, chapter) {
    if (!listDlg) { listDlg = el('dialog', { class: 'sheet mblist' }); document.body.append(listDlg); }
    const draw = () => {
      const items = Store.mistakesFor(subject, chapter);
      if (!items.length && listDlg.open) { listDlg.close(); App.render(); return; }
      listDlg.replaceChildren(
        el('h2', {}, '📕 Remember this'), el('p', { class: 'hint' }, `${subject}${chapter ? ' · ' + chapter : ''}`),
        el('div', { class: 'mb-list' }, items.map(m => card(m, () => { draw(); App.render(); }))),
        el('div', { class: 'actions' },
          el('button', { class: 'btn outline', type: 'button', onclick: () => { listDlg.close(); openAdd({ subject, chapter }); } }, '+ Log another'),
          el('button', { class: 'btn primary', type: 'button', onclick: () => listDlg.close() }, 'Done')));
    };
    draw(); if (!listDlg.open) listDlg.showModal();
  }

  /* ---------- review session: one card at a time ---------- */
  function startReview(practice) {
    const queue = (practice ? Store.get().mistakes.filter(m => !Store.isMastered(m)).sort((a, b) => a.due.localeCompare(b.due)) : Store.dueMistakes()).map(m => m.id);
    if (!queue.length) { App.toast('Nothing due for review today.'); return; }
    if (!reviewDlg) { reviewDlg = el('dialog', { class: 'sheet' }); document.body.append(reviewDlg); }
    let i = 0, right = 0, weak = 0;
    const draw = () => {
      const m = state(queue[i]);
      if (!m) { finish(); return; }
      const ans = el('div', { class: 'mb-answer big', hidden: true }, m.answer || 'No answer saved. Think it through, then check your notes.');
      const grade = el('div', { class: 'actions center', hidden: true },
        el('button', { class: 'btn danger', type: 'button', onclick: () => { Store.reviewMistake(m.id, false); weak++; next(); } }, '😕 Still weak'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => { Store.reviewMistake(m.id, true); right++; next(); } }, '✅ Got it'));
      const reveal = el('button', { class: 'btn outline', type: 'button', onclick: () => { ans.hidden = false; grade.hidden = false; reveal.hidden = true; } }, 'Show answer');
      reviewDlg.replaceChildren(
        el('div', { class: 'rv-head' }, el('strong', {}, `Review ${i + 1} of ${queue.length}`), el('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => { reviewDlg.close(); App.render(); } }, '×')),
        el('div', { class: 'bar' }, el('div', { class: 'bar-fill teal', style: `width:${i / queue.length * 100}%` })),
        el('div', { class: 'mb-where' }, [m.subject, m.chapter].filter(Boolean).join(' · ')),
        el('div', { class: 'rv-q' }, `${KIND_ICON[m.kind] || '❓'} ${m.text}`), ans,
        el('div', { class: 'actions center' }, reveal), grade);
    };
    const state = id => Store.get().mistakes.find(x => x.id === id);
    const next = () => { i++; if (i >= queue.length) finish(); else draw(); };
    const finish = () => {
      reviewDlg.replaceChildren(el('h2', {}, 'Review done 🎉'),
        el('p', {}, `${right} remembered, ${weak} still weak.`),
        el('p', { class: 'hint' }, weak ? 'The weak ones come back tomorrow. The rest come back after a longer gap.' : 'They will come back after a longer gap so they stay in memory.'),
        el('div', { class: 'actions' }, el('button', { class: 'btn primary', type: 'button', onclick: () => { reviewDlg.close(); App.render(); } }, 'Close')));
    };
    draw(); if (!reviewDlg.open) reviewDlg.showModal();
  }

  /* ---------- the Mistake book page ---------- */
  function render(root) {
    const st = Store.get(), all = st.mistakes;
    root.append(el('div', { class: 'page-head' },
      el('a', { class: 'back', href: '#home', onclick: e => { if (history.length > 1) { e.preventDefault(); history.back(); } }, 'aria-label': 'Back' }, '‹ Back'),
      el('h2', { class: 'big' }, '📕 Mistake book')));
    const due = Store.dueMistakes(), mastered = all.filter(Store.isMastered).length;
    root.append(el('section', { class: 'card settings-card' },
      el('div', { class: 'mb-stats' },
        el('div', {}, el('b', {}, String(all.length)), el('span', {}, 'saved')),
        el('div', {}, el('b', { class: due.length ? 'red' : '' }, String(due.length)), el('span', {}, 'to review today')),
        el('div', {}, el('b', {}, String(mastered)), el('span', {}, 'mastered'))),
      el('div', { class: 'backup-btns' },
        !all.length ? null : due.length ? el('button', { class: 'btn primary', type: 'button', onclick: () => startReview(false) }, `Start review (${due.length})`)
          : el('button', { class: 'btn primary', type: 'button', disabled: all.length === mastered, onclick: () => startReview(true) }, all.length === mastered ? 'All mastered' : `Practice now (${all.length - mastered})`),
        el('button', { class: 'btn outline', type: 'button', onclick: () => openAdd() }, '+ Log mistake')),
      el('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Each mistake comes back after 1, 3, 7, 14 and 30 days. Say "Still weak" and it restarts from tomorrow. New mistakes are due tomorrow, but "Practice now" lets you go through them today.')));
    if (!all.length) { root.append(el('div', { class: 'empty card', style: 'margin-top:14px' }, 'No mistakes saved yet.', el('br'), 'While revising, tap “📕 Log mistake” on any lecture or revision card to save what you got wrong.')); return; }

    const subs = [...new Set(all.map(m => m.subject).filter(Boolean))].sort();
    if (filterSub !== 'all' && !subs.includes(filterSub)) filterSub = 'all';
    const sel = el('select', { 'aria-label': 'Filter by subject', onchange: e => { filterSub = e.target.value; App.render(); } },
      el('option', { value: 'all' }, 'All subjects'), subs.map(s => el('option', { value: s, selected: s === filterSub }, s)));
    const box = el('input', { type: 'search', class: 'mb-search', placeholder: 'Search your mistakes', value: search, 'aria-label': 'Search' });
    box.addEventListener('change', () => { search = box.value; App.render(); });
    box.addEventListener('keydown', e => { if (e.key === 'Enter') { search = box.value; App.render(); } });
    root.append(el('div', { class: 'mb-filters' }, sel, box));

    const q = search.trim().toLowerCase();
    const rank = m => Store.isMastered(m) ? 2 : (m.due <= D.today() ? 0 : 1);
    const list = all.filter(m => (filterSub === 'all' || m.subject === filterSub) && (!q || (m.text + ' ' + m.answer + ' ' + m.chapter).toLowerCase().includes(q)))
      .sort((a, b) => rank(a) - rank(b) || a.due.localeCompare(b.due));
    if (!list.length) root.append(el('div', { class: 'empty card' }, 'No mistakes match.'));
    list.forEach(m => root.append(card(m, () => App.render())));
  }

  window.MistakesView = { render, openAdd, openChapter, startReview };
})();
