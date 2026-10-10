/* Planner upload: parse text/CSV -> preview -> confirm -> save.
 * Columns: Date | Subject | Chapter | Lecture | Duration
 * Separators: comma (CSV, quotes allowed), tab, pipe, semicolon.
 */
(function () {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const ISO = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

  function splitCSV(line, sep) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && !cur.trim()) { q = true; cur = ''; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    if (q) throw new Error('unclosed quote');
    out.push(cur);
    return out.map(s => s.trim());
  }

  function splitLine(line) {
    if (line.includes('\t')) return splitCSV(line, '\t');
    if (line.includes('|')) {
      let s = line.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|')) s = s.slice(0, -1);
      return s.split('|').map(x => x.trim());
    }
    if (line.includes(',')) return splitCSV(line, ',');
    if (line.includes(';')) return splitCSV(line, ';');
    return [line.trim()];
  }

  function parseDate(s) {
    s = s.trim().replace(/\s+/g, ' ').replace(/^[A-Za-z]{3,9}day\.?,?\s+/i, '');   // drop a leading weekday
    if (!s) throw new Error('date is empty');
    let y, m, d, mt;
    if ((mt = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
    else if ((mt = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))) {
      d = +mt[1]; m = +mt[2]; y = +mt[3]; if (mt[3].length === 2) y += 2000;
      if (m > 12) throw new Error(`"${s}": month ${m} is invalid (dates are read as DD/MM/YYYY)`);
    }
    else if ((mt = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]+([A-Za-z]{3,9})\.?[\s\-\/.,]+(\d{2}|\d{4})$/))) {
      d = +mt[1]; m = MONTHS.indexOf(mt[2].slice(0, 3).toLowerCase()) + 1; y = +mt[3]; if (mt[3].length === 2) y += 2000;
      if (!m) throw new Error(`"${mt[2]}" is not a month name`);
    }
    else if ((mt = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
      m = MONTHS.indexOf(mt[1].slice(0, 3).toLowerCase()) + 1; d = +mt[2]; y = +mt[3];
      if (!m) throw new Error(`"${mt[1]}" is not a month name`);
    }
    else if (/^\d{1,2}[-\/.\s][A-Za-z0-9]+$/.test(s)) throw new Error(`"${s}": year is missing`);
    else throw new Error(`can't read date "${s}" (use DD/MM/YYYY, YYYY-MM-DD or 5 Oct 2026)`);
    const iso = ISO(y, m, d);
    if (!Store.D.isValid(iso)) throw new Error(`"${s}" is not a real calendar date`);
    return iso;
  }

  function parseDuration(s) {
    s = s.trim();
    if (!s) throw new Error('duration is empty');
    let mt, min;
    if ((mt = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)?)?$/i)))
      min = Math.round(parseFloat(mt[1]) * 60 + (mt[2] ? +mt[2] : 0));
    else if ((mt = s.match(/^(\d+)\s*:\s*(\d{2})$/))) min = +mt[1] * 60 + +mt[2];
    else if ((mt = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/i))) min = Math.round(parseFloat(mt[1]));
    else if (/^\d+$/.test(s)) min = +s;                                   // bare whole number = minutes
    else if (/^\d+\.\d+$/.test(s)) min = Math.round(parseFloat(s) * 60);   // bare decimal = hours
    else throw new Error(`can't read duration "${s}" (try 90, 90 min, 1h 30m or 1:30)`);
    if (!(min >= 1 && min <= 600)) throw new Error(`duration "${s}" must be between 1 minute and 10 hours`);
    return min;
  }

  function parseLecture(s) {
    const v = s.trim().replace(/^(?:lecture|lec|l)[\s.#:\-]*/i, '');
    if (!v) throw new Error('lecture number is empty');
    if (v.length > 10 || !/^[\w.\-\/]+$/.test(v)) throw new Error(`can't read lecture number "${s.trim()}"`);
    return v;
  }

  const key = r => [r.date, r.subject.toLowerCase(), r.chapter.toLowerCase(), r.lecture.toLowerCase()].join('|');


  /* ---- Structured "Lecture Planner - <Subject>" tables (S No | Chapter | No of Lecture | Total | Date of Lecture) ----
   * Subject comes from the section heading, the lecture number from S No, and there is no duration column
   * (opts.defaultDuration is used). Chapters that wrap over several lines in a PDF are stitched back together. */
  const DATE_CELL = /^(?:[A-Za-z]{3,9}day,?\s+)?[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$|^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$|^\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}$/;

  function parseStructured(text, existing, opts) {
    const dur = Math.max(1, Math.round((opts && opts.defaultDuration) || 90));
    const kk = r => [r.date, r.subject.toLowerCase(), r.chapter.toLowerCase()].join('|');
    const have = new Map((existing || []).map(l => [kk(l), l]));
    const seq = [], rows = [], errors = [], updates = [];
    const seen = new Set();
    let subject = null, dupes = 0;
    String(text).replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
      const cells = raw.split('\t').map(c => c.trim()).filter(Boolean);
      if (!cells.length) return;
      const line = i + 1;
      const di = cells.findIndex((c, k) => k > 0 && DATE_CELL.test(c));   // date may be followed by extra columns (e.g. faculty)
      const h = raw.match(/lecture planner\s*[-–:]\s*(.+?)\s*$/i);
      if (h) { subject = h[1].trim(); seq.push({ t: 'other' }); return; }
      const isInt = /^\d+$/.test(cells[0]);
      if (subject && isInt && di >= 2) {
        const mid = cells.slice(1, di);
        const chapter = mid.find(c => !/^\d+$/.test(c)) || '';
        seq.push({ t: 'mid', line, raw, subject, sno: cells[0], chapter, date: cells[di], tot: +(mid.filter(c => /^\d+$/.test(c))[1] || 0) });
      } else if (subject && isInt && cells.length >= 3) {
        errors.push({ line, text: raw, reason: 'no readable date found in this row' });
        seq.push({ t: 'other' });
      } else if (subject && cells.length === 1 && /^\d+$/.test(cells[0])) {
        seq.push({ t: 'tot', n: +cells[0], subject });   // the merged "Total Lectures" cell, printed between two rows
      } else if (subject && cells.length === 1 && !/\bGroup\s*\d+\s*$/i.test(raw) && !/\bPage\s+\d+/i.test(raw)) {
        seq.push({ t: 'frag', text: cells[0] });
      } else seq.push({ t: 'other' });
    });
    const kept = {}, markers = {};
    const nonTot = (i, d) => { for (i += d; seq[i] && seq[i].t === 'tot'; i += d); return seq[i]; };
    seq.forEach((e, i) => {
      if (e.t === 'tot') {
        const k = kept[e.subject] || 0;
        (markers[e.subject] = markers[e.subject] || []).push({ n: e.n, lo: k - 1, hi: k });
        return;
      }
      if (e.t !== 'mid') return;
      let chapter = e.chapter;
      if (!chapter) {   // chapter wrapped onto the line above and/or below this row
        const parts = [];
        const b = nonTot(i, -1), a = nonTot(i, 1);
        if (b && b.t === 'frag' && !b.used) { b.used = true; parts.push(b.text); }
        if (a && a.t === 'frag' && !a.used) { a.used = true; parts.push(a.text); }
        chapter = parts.join(' ');
      }
      try {
        if (!chapter) throw new Error('chapter name not found for this row');
        parseLecture(e.sno);   // validates the S No
        const r = { line: e.line, date: parseDate(e.date), subject: e.subject, chapter, duration: dur, sno: e.sno, tot: e.tot };
        if (seen.has(kk(r))) { dupes++; return; }
        seen.add(kk(r)); rows.push(r);
        const idx = kept[e.subject] = (kept[e.subject] || 0);
        kept[e.subject]++;
        if (e.tot) (markers[e.subject] = markers[e.subject] || []).push({ n: e.tot, lo: idx, hi: idx });
      } catch (err) { errors.push({ line: e.line, text: e.raw, reason: err.message }); }
    });
    // Lecture number = position inside its chapter group, e.g. 8 of 9.
    // The planner's merged "Total Lectures" cell (printed once per group) says how big each group is, so groups are
    // cut from it. If it does not add up for a subject, fall back to runs of identical chapter names.
    const bySubject = {};
    rows.forEach(r => (bySubject[r.subject] = bySubject[r.subject] || []).push(r));
    Object.values(bySubject).forEach(list => {
      const groups = [];
      let pos = 0, ok = true;
      (markers[list[0].subject] || []).forEach(m => {
        if (!ok) return;
        if (m.lo < pos || m.hi >= pos + m.n || pos + m.n > list.length) { ok = false; return; }
        groups.push([pos, pos + m.n]); pos += m.n;
      });
      if (!ok || pos !== list.length || !groups.length) {
        groups.length = 0;
        for (let i = 0; i < list.length;) {
          let j = i;
          while (j < list.length && list[j].chapter === list[i].chapter) j++;
          groups.push([i, j]); i = j;
        }
      }
      groups.forEach(([s0, e0]) => { for (let k = s0; k < e0; k++) { list[k].lecture = String(k - s0 + 1); list[k].of = e0 - s0; } });
    });
    // Lectures already saved (e.g. from an earlier upload): just fix their numbering instead of adding duplicates.
    const fresh = [];
    rows.forEach(r => {
      const old = have.get(kk(r));
      if (old) { if (old.lecture !== r.lecture || old.of !== r.of) updates.push({ id: old.id, lecture: r.lecture, of: r.of }); dupes++; }
      else fresh.push(r);
    });
    fresh.sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
    errors.sort((a, b) => a.line - b.line);
    return { rows: fresh, errors, dupes, updates, structured: true };
  }

  /** -> { rows:[{line,date,subject,chapter,lecture,duration}], errors:[{line,text,reason}], dupes:n } */
  function parse(text, existing, opts) {
    if (/lecture planner\s*[-\u2013:]/i.test(text)) return parseStructured(text, existing, opts);
    const rows = [], errors = [];
    const seen = new Set((existing || []).map(key));
    let dupes = 0;
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
      const line = i + 1;
      if (!raw.trim() || raw.trim().startsWith('#') || /^[\s|:\-+]+$/.test(raw)) return;
      let cells;
      try { cells = splitLine(raw); } catch (e) { errors.push({ line, text: raw, reason: e.message }); return; }
      while (cells.length > 5 && !cells[cells.length - 1]) cells.pop();
      if (/^date$/i.test(cells[0])) return;   // header row (also repeated headers from several sheets/pages)
      let of = 0;
      if (cells.length === 6 && /^\d*$/.test(cells[5])) { of = +cells[5] || 0; cells = cells.slice(0, 5); }   // optional 6th column: lectures in chapter
      if (cells.length !== 5) {
        errors.push({ line, text: raw, reason: `expected 5 columns (Date | Subject | Chapter | Lecture | Duration), found ${cells.length}` });
        return;
      }
      try {
        const r = { line, date: parseDate(cells[0]), subject: cells[1].trim(), chapter: cells[2].trim(),
                    lecture: parseLecture(cells[3]), duration: parseDuration(cells[4]) };
        if (of) r.of = of;
        if (!r.subject) throw new Error('subject is empty');
        if (!r.chapter) throw new Error('chapter is empty');
        if (seen.has(key(r))) { dupes++; return; }
        seen.add(key(r));
        rows.push(r);
      } catch (e) { errors.push({ line, text: raw, reason: e.message }); }
    });
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
    return { rows, errors, dupes };
  }

  if (typeof module !== 'undefined') module.exports = { parse, parseDate, parseDuration, parseLecture };
  if (typeof document === 'undefined') return;

  /* ---------- UI ---------- */
  const { el } = HomeView;
  const D = Store.D;
  const TEMPLATE = 'Date,Subject,Chapter,Lecture,Duration\n2026-10-12,Taxation,GST - Input Tax Credit,Lec 16,1h 30m\n13/10/2026,Law,Companies Act,9,75 min\n14 Oct 2026,Audit,Nature of Audit,7,1:15\n';
  let dlg, ta, results, saveBtn, clearSample, sampleRow, durIn, durRow, pastSel, pastRow, aiBtn, aiHint, aiStatus, aiAbort = null, current = null;

  function build() {
    dlg = el('dialog', { class: 'sheet wide' });
    ta = el('textarea', { rows: 6, spellcheck: 'false', placeholder: 'Date | Subject | Chapter | Lecture | Duration\n12/10/2026 | Taxation | GST - ITC | Lec 16 | 1h 30m' });
    ta.addEventListener('input', preview);
    const file = el('input', { type: 'file', accept: FileText.ACCEPT });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      results.replaceChildren(el('div', { class: 'hint' }, 'Reading file…'));
      try { ta.value = await FileText.read(f); } catch (e) { ta.value = ''; results.replaceChildren(el('div', { class: 'err' }, e.message || 'Could not read that file.')); return; }
      preview();
    });
    results = el('div', { class: 'preview' });
    clearSample = el('input', { type: 'checkbox', checked: true });
    clearSample.addEventListener('change', preview);
    sampleRow = el('label', { class: 'check-row' }, clearSample, ' Remove sample data when saving');
    durIn = el('input', { type: 'number', min: 1, max: 600, value: 90, 'aria-label': 'Default duration in minutes' });
    durIn.addEventListener('input', preview);
    durRow = el('label', { class: 'field inline-field' }, 'Duration to use when the planner has none (minutes): ', durIn);
    pastSel = el('select', { 'aria-label': 'Lectures dated before today' },
      el('option', { value: 'missed' }, 'Add as missed (they go to Backlog)'),
      el('option', { value: 'done' }, 'Add as already done'),
      el('option', { value: 'skip' }, 'Skip them'));
    pastSel.addEventListener('change', refreshSave);
    pastRow = el('label', { class: 'field inline-field' }, '', pastSel);
    saveBtn = el('button', { class: 'btn primary', type: 'button', disabled: true, onclick: save }, 'Save');
    const tpl = el('a', { href: '#', class: 'link', onclick: e => {
      e.preventDefault();
      const a = el('a', { href: URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })), download: 'planner-template.csv' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } }, 'Download CSV template');
    dlg.append(
      el('h2', {}, 'Upload planner'),
      el('p', { class: 'hint' }, 'Columns: Date | Subject | Chapter | Lecture | Duration (as table columns in Excel / Word / PDF, or separated by commas, tabs or | in text). ',
        'Dates: DD/MM/YYYY, YYYY-MM-DD or 5 Oct 2026. Duration: 90, 90 min, 1h 30m or 1:30 (a bare number means minutes). ', tpl),
      el('label', { class: 'field' }, 'Choose a file (Excel, PDF, Word .docx, CSV or text)', file),
      el('label', { class: 'field' }, 'or paste the planner here', ta),
      el('div', { class: 'ai-row' },
        aiBtn = el('button', { type: 'button', class: 'btn outline sm', onclick: runAI }, '✨ Read with Gemini AI'),
        el('button', { type: 'button', class: 'btn ghost sm', onclick: () => Gemini.openSettings().then(refreshAI) }, 'AI settings')),
      aiHint = el('div', { class: 'hint ai-hint', hidden: true }, 'Some rows could not be read. Gemini AI can often understand unusual planner layouts. It sends the planner text to Google when you press the button.'),
      aiStatus = el('div', { class: 'hint', hidden: true }),
      results, durRow, pastRow, sampleRow,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel'), saveBtn));
    document.body.append(dlg);
  }

  function preview() {
    const st = Store.get();
    results.replaceChildren();
    saveBtn.disabled = true; saveBtn.textContent = 'Save'; current = null;
    sampleRow.hidden = !st.sampleActive;
    pastRow.hidden = true; aiHint.hidden = true;
    aiBtn.disabled = !!aiAbort || !ta.value.trim();
    if (!ta.value.trim()) return;
    current = parse(ta.value, st.lectures.filter(l => !(st.sampleActive && clearSample.checked && l.sample)),
      { defaultDuration: +durIn.value || 90 });
    const { rows, errors, dupes } = current;
    aiHint.hidden = !(errors.length >= 3 || (!rows.length && errors.length));
    const nPast = rows.filter(r => r.date < D.today()).length;
    pastRow.hidden = !nPast;
    if (nPast) pastRow.firstChild.textContent = `${nPast} lecture${nPast === 1 ? ' is' : 's are'} dated before today: `;
    if (rows.length) {
      const by = {}; rows.forEach(r => by[r.subject] = (by[r.subject] || 0) + 1);
      results.append(el('div', { class: 'hint' }, Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(' · ')));
    }
    results.append(el('div', { class: 'chips' },
      el('span', { class: 'chip ok' }, `${rows.length} ready`),
      dupes ? el('span', { class: 'chip' }, `${dupes} already saved`) : null,
      current.updates && current.updates.length ? el('span', { class: 'chip ok' }, `${current.updates.length} lecture numbers will be updated`) : null,
      errors.length ? el('span', { class: 'chip bad' }, `${errors.length} unreadable`) : null));
    if (rows.length) {
      results.append(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Date', 'Subject', 'Chapter', 'Lec', 'Time'].map(h => el('th', {}, h)))),
        el('tbody', {}, rows.map(r => el('tr', {}, el('td', {}, D.fmtShort(r.date)), el('td', {}, r.subject),
          el('td', {}, r.chapter), el('td', {}, r.lecture + (r.of ? '/' + r.of : '')), el('td', {}, D.dur(r.duration))))))));
    }
    if (errors.length) {
      results.append(el('div', { class: 'errlist' }, el('strong', {}, 'These rows were not read and will be skipped:'),
        errors.map(e => el('div', { class: 'errrow' },
          el('div', { class: 'errwhy' }, `Line ${e.line}: ${e.reason}`),
          el('code', {}, e.text.length > 120 ? e.text.slice(0, 120) + '…' : e.text)))));
    }
    if (!rows.length && !errors.length && !(current.updates || []).length) results.append(el('div', { class: 'hint' }, 'Nothing new to add.'));
    refreshSave();
  }

  function refreshAI() {
    aiBtn.textContent = Gemini.hasKey() ? '✨ Read with Gemini AI' : '✨ Read with Gemini AI (needs key)';
  }

  async function runAI() {
    if (aiAbort) { aiAbort.abort(); return; }              // second click = cancel
    if (!Gemini.hasKey() && !(await Gemini.openSettings())) return;
    const text = ta.value;
    if (!text.trim()) return;
    aiAbort = new AbortController();
    aiBtn.textContent = 'Cancel'; aiBtn.disabled = false;
    aiStatus.hidden = false; aiStatus.className = 'hint'; aiStatus.textContent = 'Asking Gemini…';
    try {
      const out = await Gemini.extractPlanner(text, {
        signal: aiAbort.signal, defaultDuration: +durIn.value || 90,
        onProgress: (i, n) => { aiStatus.textContent = `Asking Gemini… part ${i + 1} of ${n}`; }
      });
      ta.value = out;                                      // the clean rows appear in the box, editable, then go through the normal preview
      aiStatus.textContent = 'Gemini finished. Check the preview below before saving.';
    } catch (e) {
      aiStatus.className = 'err';
      aiStatus.textContent = e.name === 'AbortError' ? 'Cancelled.' : e.message;
    } finally {
      aiAbort = null; refreshAI(); preview();
    }
  }

  function rowsToSave() {
    if (!current) return [];
    return pastSel.value === 'skip' && !pastRow.hidden ? current.rows.filter(r => r.date >= D.today()) : current.rows;
  }
  function refreshSave() {
    const n = rowsToSave().length, u = current && current.updates ? current.updates.length : 0;
    saveBtn.disabled = !n && !u;
    saveBtn.textContent = n ? `Save ${n} lecture${n === 1 ? '' : 's'}` : u ? 'Update numbers' : 'Save';
  }

  function save() {
    const rows = rowsToSave(), upd = (current && current.updates) || [];
    if (!rows.length && !upd.length) return;
    const st = Store.get();
    if (st.sampleActive && clearSample.checked) Store.clearSample();
    if (upd.length) Store.updateLectureNumbers(upd);
    if (rows.length) Store.addLectures(rows, { pastDone: !pastRow.hidden && pastSel.value === 'done' });
    dlg.close();
    App.render();
  }

  window.Planner = {
    util: { splitLine, parseDate },
    open() {
      if (!dlg) build();
      ta.value = ''; dlg.querySelector('input[type=file]').value = '';
      clearSample.checked = true; pastSel.value = 'missed';
      aiStatus.hidden = true; refreshAI();
      preview();
      dlg.showModal();
    }
  };
})();
