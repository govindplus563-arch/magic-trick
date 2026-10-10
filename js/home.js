/* Home tab: exam countdown ring, today's lectures, daily progress. */
(function () {
  const { D } = Store;
  let editingExam = false;

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }

  function svg(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function ring(daysLeft, fraction) {
    const R = 54, C = 2 * Math.PI * R, arc = C * 0.75;
    const s = svg('svg', { viewBox: '0 0 140 140', class: 'ring-svg', 'aria-hidden': 'true' });
    const common = { cx: 70, cy: 70, r: R, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round',
                     transform: 'rotate(135 70 70)' };
    s.append(svg('circle', Object.assign({}, common, { stroke: 'var(--track)', 'stroke-dasharray': `${arc} ${C}` })));
    const f = Math.max(0, Math.min(1, fraction)) * arc;
    if (f > 0) s.append(svg('circle', Object.assign({}, common, { stroke: 'var(--indigo)', 'stroke-dasharray': `${f} ${C}` })));
    return s;
  }

  function countdown(st) {
    const t = D.today();
    const wrap = el('section', { class: 'countdown card' });
    const hasDate = !!st.examDate;
    const left = hasDate ? D.diff(t, st.examDate) : 0;
    const start = st.planStart && st.planStart < t ? st.planStart : t;
    const span = hasDate ? Math.max(D.diff(start, st.examDate), left, 1) : 1;
    const frac = hasDate ? Math.max(0, left) / span : 0;

    const center = el('div', { class: 'ring-center' });
    if (!hasDate) {
      center.append(el('div', { class: 'ring-days small' }, '—'), el('div', { class: 'ring-sub' }, 'Set your exam date'));
    } else if (left < 0) {
      center.append(el('div', { class: 'ring-days small' }, 'Over'), el('div', { class: 'ring-sub' }, st.examName + ' date has passed'));
    } else if (left === 0) {
      center.append(el('div', { class: 'ring-days small' }, 'Today'), el('div', { class: 'ring-sub' }, st.examName));
    } else {
      center.append(el('div', { class: 'ring-days' }, String(left)),
        el('div', { class: 'ring-unit' }, left === 1 ? 'day' : 'days'),
        el('div', { class: 'ring-sub' }, 'to ' + st.examName));
    }
    wrap.append(el('div', { class: 'ring' }, ring(left, frac), center));

    if (editingExam) {
      const input = el('input', { type: 'date', value: st.examDate || '', 'aria-label': 'Exam date', class: 'exam-input' });
      const err = el('div', { class: 'err', hidden: true }, 'Pick a valid date.');
      const save = () => {
        if (!Store.setExamDate(input.value)) { err.hidden = false; return; }
        editingExam = false; App.render();
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      wrap.append(el('div', { class: 'exam-edit' }, input,
        el('button', { class: 'btn primary sm', onclick: save }, 'Save'),
        el('button', { class: 'btn ghost sm', onclick: () => { editingExam = false; App.render(); } }, 'Cancel')), err);
      setTimeout(() => input.focus(), 0);
    } else {
      wrap.append(el('button', { class: 'exam-date', onclick: () => { editingExam = true; App.render(); } },
        hasDate ? 'Exam: ' + D.fmt(st.examDate) : 'Set exam date', el('span', { class: 'pencil', 'aria-hidden': 'true' }, ' ✎')));
    }
    return wrap;
  }

  function lectureCard(l) {
    const cb = el('input', { type: 'checkbox', checked: l.done, class: 'cb',
      onchange: () => { Store.toggleLecture(l.id); App.render(); } });
    const title = `${l.subject} - ${l.chapter}`;
    return el('label', { class: 'lecture' + (l.done ? ' done' : '') },
      el('div', { class: 'lec-text' },
        el('div', { class: 'lec-title' }, title),
        el('div', { class: 'lec-meta' }, `${Store.lecLabel(l)}  ·  ${D.dur(l.duration)}`)),
      cb, el('span', { class: 'cbx', 'aria-hidden': 'true' }));
  }

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
      el('h2', {}, 'Backup & data'),
      el('p', { class: 'hint' }, st.lastBackup ? `Last backup: ${days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}.` : 'No backup yet.',
        stale ? ' Your data lives only in this browser, so export a copy now and then.' : ''),
      el('div', { class: 'backup-btns' },
        el('button', { class: 'btn primary sm', onclick: () => {
          const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: `study-planner-${D.today()}.json` });
          document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          App.toast('Backup downloaded.'); App.render();
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
    const t = D.today();
    const list = Store.lecturesOn(t);
    const done = list.filter(l => l.done).length;
    const pct = list.length ? Math.round(done / list.length * 100) : 0;

    root.append(countdown(st));

    root.append(el('div', { class: 'section-head' },
      el('h2', {}, "Today's Lectures"),
      el('span', { class: 'count-chip' }, `${done}/${list.length}`)));
    root.append(el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100,
      'aria-label': 'Daily progress' }, el('div', { class: 'bar-fill teal', style: `width:${pct}%` })));

    if (!list.length) {
      root.append(el('div', { class: 'empty card' }, 'No lectures planned for today.',
        el('br'), 'Add one below or upload your planner.'));
    } else {
      list.forEach(l => root.append(lectureCard(l)));
    }

    root.append(el('div', { class: 'home-actions' },
      el('button', { class: 'btn outline', onclick: () => App.openLectureDialog(t) }, '+ Add lecture'),
      el('button', { class: 'btn outline', onclick: () => Planner.open() }, 'Upload planner')));

    root.append(backupCard(st));

    if (st.sampleActive) {
      root.append(el('div', { class: 'sample-note card' },
        el('span', {}, 'Showing sample data so every tab is populated.'),
        el('button', { class: 'btn danger sm', onclick: () => {
          if (confirm('Remove all sample data? Lectures you added yourself are kept.')) { Store.clearSample(); App.render(); }
        } }, 'Clear sample data')));
    }
  }

  window.HomeView = { render, el };
})();
