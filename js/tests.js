/* Tests tab: uploads, add-test form, score list, % trend chart (inline SVG). */
(function () {
  const { el } = HomeView;
  const { D } = Store;
  const NS = 'http://www.w3.org/2000/svg';
  let chartSubject = 'all', addDlg, ttDlg;

  const pct = t => Math.round(t.obtained / t.total * 1000) / 10;
  const fmtPct = n => (Number.isInteger(n) ? n : n.toFixed(1)) + '%';
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const upIcon = () => { const s = sv('svg', { viewBox: '0 0 24 24', class: 'up-ico' });
    s.append(sv('path', { d: 'M12 16V5m0 0-4 4m4-4 4 4M5 15v4h14v-4', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); return s; };

  function chart(list) {
    const pts = list.slice().sort((a, b) => a.date.localeCompare(b.date));
    const W = 320, H = 180, L = 32, R = 14, T = 16, B = 28;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
      'aria-label': 'Test percentage trend: ' + pts.map(t => `${t.name} ${fmtPct(pct(t))}`).join(', ') });
    const defs = sv('defs', {}), g = sv('linearGradient', { id: 'areaGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(sv('stop', { offset: '0%', 'stop-color': '#3b3a86', 'stop-opacity': .28 }), sv('stop', { offset: '100%', 'stop-color': '#3b3a86', 'stop-opacity': 0 }));
    defs.append(g); svg.append(defs);
    const y = v => T + (1 - v / 100) * (H - T - B);
    [0, 25, 50, 75, 100].forEach(v => {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      const tx = sv('text', { x: L - 6, y: y(v) + 3, class: 'axis', 'text-anchor': 'end' }); tx.textContent = v; svg.append(tx);
    });
    if (!pts.length) { const m = sv('text', { x: W / 2, y: H / 2, class: 'axis', 'text-anchor': 'middle' }); m.textContent = 'No tests yet'; svg.append(m); return svg; }
    const x = i => pts.length === 1 ? (L + W - R) / 2 : L + i / (pts.length - 1) * (W - L - R);
    const line = pts.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(pct(t)).toFixed(1)}`).join(' ');
    if (pts.length > 1) {
      svg.append(sv('path', { d: `${line} L${x(pts.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`, fill: 'url(#areaGrad)' }));
      svg.append(sv('path', { d: line, class: 'tline' }));
    }
    const step = Math.ceil(pts.length / 5);
    pts.forEach((t, i) => {
      const c = sv('circle', { cx: x(i), cy: y(pct(t)), r: 4, class: 'tdot' });
      const tt = sv('title', {}); tt.textContent = `${t.name} (${t.subject}) ${D.fmtShort(t.date)}: ${fmtPct(pct(t))}`; c.append(tt);
      svg.append(c);
      if (pts.length <= 8) { const v = sv('text', { x: x(i), y: y(pct(t)) - 8, class: 'val', 'text-anchor': 'middle' }); v.textContent = fmtPct(pct(t)); svg.append(v); }
      if (i % step === 0 || i === pts.length - 1) { const d = sv('text', { x: x(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }); d.textContent = D.fmtShort(t.date); svg.append(d); }
    });
    return svg;
  }

  function scoreCard(t) {
    const p = pct(t);
    return el('div', { class: 'score' },
      el('div', { class: 'score-main' },
        el('div', { class: 'lec-title' }, t.name),
        el('div', { class: 'lec-meta' }, `${t.subject} · ${D.fmtShort(t.date)}`)),
      el('div', { class: 'score-right' },
        el('div', { class: 'score-m' }, `${t.obtained}/${t.total}`),
        el('div', { class: 'score-p ' + (p < 40 ? 'red' : p >= 60 ? 'grn' : '') }, fmtPct(p))),
      el('button', { class: 'x', 'aria-label': 'Delete ' + t.name, onclick: () => {
        if (confirm(`Delete "${t.name}"?`)) { Store.deleteTest(t.id); App.render(); } } }, '×'));
  }

  function subjectsList() {
    const st = Store.get();
    return [...new Set([...st.lectures.map(l => l.subject), ...st.tests.map(t => t.subject), ...st.testSchedule.map(t => t.subject)].filter(Boolean))].sort();
  }

  function render(root) {
    const st = Store.get(), t = D.today();
    root.append(el('div', { class: 'uploads' },
      el('button', { class: 'upbtn', onclick: () => Planner.open() }, upIcon(), 'Upload Planner'),
      el('button', { class: 'upbtn', onclick: openTimetable }, upIcon(), 'Upload Test Timetable')));

    const upcoming = st.testSchedule.filter(x => x.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length) {
      root.append(el('div', { class: 'section-head' }, el('h2', {}, 'Upcoming Tests')));
      upcoming.forEach(u => root.append(el('div', { class: 'score' },
        el('div', { class: 'score-main' }, el('div', { class: 'lec-title' }, u.name),
          el('div', { class: 'lec-meta' }, `${u.subject || 'Test'} · ${D.fmtShort(u.date)}${D.diff(t, u.date) === 0 ? ' (today)' : ' · in ' + D.diff(t, u.date) + 'd'}`)),
        el('button', { class: 'btn outline sm', onclick: () => openAdd({ name: u.name, subject: u.subject }) }, 'Log score'),
        el('button', { class: 'x', 'aria-label': 'Remove ' + u.name, onclick: () => { Store.deleteTimetable(u.id); App.render(); } }, '×'))));
    }

    root.append(el('div', { class: 'section-head' }, el('h2', {}, 'Test Scores'),
      el('button', { class: 'btn primary sm', onclick: () => openAdd() }, '+ Add Test')));
    const tests = st.tests.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!tests.length) root.append(el('div', { class: 'empty card' }, 'No tests logged yet. Tap "+ Add Test".'));
    tests.forEach(x => root.append(scoreCard(x)));

    const subs = [...new Set(st.tests.map(x => x.subject))].sort();
    if (chartSubject !== 'all' && !subs.includes(chartSubject)) chartSubject = 'all';
    const sel = el('select', { 'aria-label': 'Chart subject', onchange: e => { chartSubject = e.target.value; App.render(); } },
      el('option', { value: 'all' }, 'All subjects'), subs.map(s => el('option', { value: s, selected: s === chartSubject }, s)));
    root.append(el('div', { class: 'card chart-card' },
      el('div', { class: 'chart-head' }, el('h2', {}, '% Trend'), sel),
      chart(chartSubject === 'all' ? st.tests : st.tests.filter(x => x.subject === chartSubject))));
  }

  /* ---- Add test dialog ---- */
  function openAdd(pre) {
    if (!addDlg) {
      const f = el('form', { method: 'dialog', autocomplete: 'off' });
      const dl = el('datalist', { id: 'subjList' });
      const live = el('div', { class: 'live-pct' }, '—');
      const inp = (name, label, attrs) => el('label', {}, label, el('input', Object.assign({ name }, attrs)));
      const err = el('div', { class: 'err', hidden: true });
      f.append(el('h2', {}, 'Add test'),
        inp('name', 'Test name', { type: 'text', required: true, maxlength: 80, placeholder: 'Mock Test 3' }),
        el('label', {}, 'Subject', el('input', { name: 'subject', type: 'text', required: true, maxlength: 60, list: 'subjList' })), dl,
        inp('date', 'Date', { type: 'date', required: true }),
        el('div', { class: 'row2' },
          inp('obtained', 'Marks obtained', { type: 'number', required: true, min: 0, step: 'any', inputmode: 'decimal' }),
          inp('total', 'Total marks', { type: 'number', required: true, min: 1, step: 'any', inputmode: 'decimal' })),
        el('div', { class: 'live' }, 'Percentage: ', live), err,
        el('div', { class: 'actions' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => addDlg.close() }, 'Cancel'),
          el('button', { type: 'submit', class: 'btn primary' }, 'Add')));
      const upd = () => {
        const o = parseFloat(f.elements.obtained.value), t = parseFloat(f.elements.total.value);
        live.textContent = t > 0 && o >= 0 ? fmtPct(Math.round(o / t * 1000) / 10) : '—';
      };
      f.addEventListener('input', upd);
      f.addEventListener('submit', e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f)), o = +v.obtained, t = +v.total;
        err.hidden = true;
        if (!(t > 0)) { err.textContent = 'Total marks must be more than 0.'; err.hidden = false; return; }
        if (!(o >= 0 && o <= t)) { err.textContent = 'Marks obtained must be between 0 and the total.'; err.hidden = false; return; }
        if (!D.isValid(v.date)) { err.textContent = 'Pick a valid date.'; err.hidden = false; return; }
        Store.addTest(v); addDlg.close(); App.render();
      });
      addDlg = el('dialog', { class: 'sheet' }, f);
      addDlg._f = f; addDlg._dl = dl; addDlg._upd = upd; addDlg._err = err;
      document.body.append(addDlg);
    }
    const f = addDlg._f;
    f.reset(); addDlg._err.hidden = true;
    addDlg._dl.replaceChildren(...subjectsList().map(s => el('option', { value: s })));
    f.elements.date.value = D.today();
    if (pre) { f.elements.name.value = pre.name || ''; f.elements.subject.value = pre.subject || ''; }
    addDlg._upd();
    addDlg.showModal();
  }

  /* ---- Test timetable upload: Date | Test | Subject ---- */
  function parseTimetable(text, existing) {
    const { splitLine, parseDate } = Planner.util;
    const rows = [], errors = [], seen = new Set(existing.map(x => x.date + '|' + x.name.toLowerCase()));
    let first = true, dupes = 0;
    String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
      if (!raw.trim() || raw.trim().startsWith('#') || /^[\s|:\-+]+$/.test(raw)) return;
      const line = i + 1;
      let c; try { c = splitLine(raw); } catch (e) { errors.push({ line, text: raw, reason: e.message }); return; }
      while (c.length > 3 && !c[c.length - 1]) c.pop();
      if (first) { first = false; if (/^date$/i.test(c[0])) return; }
      if (c.length < 2 || c.length > 3) { errors.push({ line, text: raw, reason: `expected Date | Test name | Subject, found ${c.length} column${c.length === 1 ? '' : 's'}` }); return; }
      try {
        const date = parseDate(c[0]), name = c[1].trim(), subject = (c[2] || '').trim();
        if (!name) throw new Error('test name is empty');
        const k = date + '|' + name.toLowerCase();
        if (seen.has(k)) { dupes++; return; }
        seen.add(k); rows.push({ line, date, name, subject });
      } catch (e) { errors.push({ line, text: raw, reason: e.message }); }
    });
    return { rows, errors, dupes };
  }

  function openTimetable() {
    if (!ttDlg) {
      const ta = el('textarea', { rows: 5, spellcheck: 'false', placeholder: 'Date | Test | Subject\n20/10/2026 | Mock Test 3 | Costing' });
      const file = el('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain' });
      const out = el('div', { class: 'preview' });
      const rep = el('input', { type: 'checkbox', checked: true });
      const repRow = el('label', { class: 'check-row' }, rep, ' Replace sample timetable');
      const save = el('button', { class: 'btn primary', type: 'button', disabled: true }, 'Save');
      let cur = null;
      const preview = () => {
        out.replaceChildren(); save.disabled = true; save.textContent = 'Save'; cur = null;
        const st = Store.get(); repRow.hidden = !st.testSchedule.some(x => x.sample);
        if (!ta.value.trim()) return;
        cur = parseTimetable(ta.value, st.testSchedule.filter(x => !(rep.checked && x.sample)));
        out.append(el('div', { class: 'chips' }, el('span', { class: 'chip ok' }, `${cur.rows.length} ready`),
          cur.dupes ? el('span', { class: 'chip' }, `${cur.dupes} already saved`) : null,
          cur.errors.length ? el('span', { class: 'chip bad' }, `${cur.errors.length} unreadable`) : null));
        if (cur.rows.length) out.append(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, ['Date', 'Test', 'Subject'].map(h => el('th', {}, h)))),
          el('tbody', {}, cur.rows.map(r => el('tr', {}, el('td', {}, D.fmtShort(r.date)), el('td', {}, r.name), el('td', {}, r.subject || '—')))))));
        if (cur.errors.length) out.append(el('div', { class: 'errlist' }, el('strong', {}, 'These rows were not read and will be skipped:'),
          cur.errors.map(e => el('div', { class: 'errrow' }, el('div', { class: 'errwhy' }, `Line ${e.line}: ${e.reason}`), el('code', {}, e.text.slice(0, 120))))));
        save.disabled = !cur.rows.length;
        if (cur.rows.length) save.textContent = `Save ${cur.rows.length} test${cur.rows.length === 1 ? '' : 's'}`;
      };
      ta.addEventListener('input', preview); rep.addEventListener('change', preview);
      file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { ta.value = await f.text(); } catch (e) { ta.value = ''; } preview(); });
      save.addEventListener('click', () => { if (!cur || !cur.rows.length) return; Store.addTimetable(cur.rows, rep.checked); ttDlg.close(); App.render(); });
      ttDlg = el('dialog', { class: 'sheet wide' },
        el('h2', {}, 'Upload test timetable'),
        el('p', { class: 'hint' }, 'Columns: Date | Test name | Subject (subject optional). Commas, tabs or | separators; dates as DD/MM/YYYY, YYYY-MM-DD or 5 Oct 2026.'),
        el('label', { class: 'field' }, 'Choose a CSV / text file', file),
        el('label', { class: 'field' }, 'or paste it here', ta), out, repRow,
        el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => ttDlg.close() }, 'Cancel'), save));
      ttDlg._reset = () => { ta.value = ''; file.value = ''; rep.checked = true; preview(); };
      document.body.append(ttDlg);
    }
    ttDlg._reset(); ttDlg.showModal();
  }

  window.TestsView = { render };
})();
