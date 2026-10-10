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
    s = s.trim().replace(/\s+/g, ' ');
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

  /** -> { rows:[{line,date,subject,chapter,lecture,duration}], errors:[{line,text,reason}], dupes:n } */
  function parse(text, existing) {
    const rows = [], errors = [];
    const seen = new Set((existing || []).map(key));
    let dupes = 0, headerDone = false;
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
      const line = i + 1;
      if (!raw.trim() || raw.trim().startsWith('#') || /^[\s|:\-+]+$/.test(raw)) return;
      let cells;
      try { cells = splitLine(raw); } catch (e) { errors.push({ line, text: raw, reason: e.message }); return; }
      while (cells.length > 5 && !cells[cells.length - 1]) cells.pop();
      if (!headerDone) {
        headerDone = true;
        if (/^date$/i.test(cells[0])) return;
      }
      if (cells.length !== 5) {
        errors.push({ line, text: raw, reason: `expected 5 columns (Date | Subject | Chapter | Lecture | Duration), found ${cells.length}` });
        return;
      }
      try {
        const r = { line, date: parseDate(cells[0]), subject: cells[1].trim(), chapter: cells[2].trim(),
                    lecture: parseLecture(cells[3]), duration: parseDuration(cells[4]) };
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
  let dlg, ta, results, saveBtn, clearSample, sampleRow, current = null;

  function build() {
    dlg = el('dialog', { class: 'sheet wide' });
    ta = el('textarea', { rows: 6, spellcheck: 'false', placeholder: 'Date | Subject | Chapter | Lecture | Duration\n12/10/2026 | Taxation | GST - ITC | Lec 16 | 1h 30m' });
    ta.addEventListener('input', preview);
    const file = el('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { ta.value = await f.text(); } catch (e) { ta.value = ''; results.replaceChildren(el('div', { class: 'err' }, 'Could not read that file.')); return; }
      preview();
    });
    results = el('div', { class: 'preview' });
    clearSample = el('input', { type: 'checkbox', checked: true });
    sampleRow = el('label', { class: 'check-row' }, clearSample, ' Remove sample data when saving');
    saveBtn = el('button', { class: 'btn primary', type: 'button', disabled: true, onclick: save }, 'Save');
    const tpl = el('a', { href: '#', class: 'link', onclick: e => {
      e.preventDefault();
      const a = el('a', { href: URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })), download: 'planner-template.csv' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } }, 'Download CSV template');
    dlg.append(
      el('h2', {}, 'Upload planner'),
      el('p', { class: 'hint' }, 'Columns: Date | Subject | Chapter | Lecture | Duration. Separate with commas, tabs or | . ',
        'Dates: DD/MM/YYYY, YYYY-MM-DD or 5 Oct 2026. Duration: 90, 90 min, 1h 30m or 1:30 (a bare number means minutes). ', tpl),
      el('label', { class: 'field' }, 'Choose a CSV / text file', file),
      el('label', { class: 'field' }, 'or paste the planner here', ta),
      results, sampleRow,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel'), saveBtn));
    document.body.append(dlg);
  }

  function preview() {
    const st = Store.get();
    results.replaceChildren();
    saveBtn.disabled = true; saveBtn.textContent = 'Save'; current = null;
    sampleRow.hidden = !st.sampleActive;
    if (!ta.value.trim()) return;
    current = parse(ta.value, st.lectures.filter(l => !(st.sampleActive && clearSample.checked && l.sample)));
    const { rows, errors, dupes } = current;
    results.append(el('div', { class: 'chips' },
      el('span', { class: 'chip ok' }, `${rows.length} ready`),
      dupes ? el('span', { class: 'chip' }, `${dupes} already saved`) : null,
      errors.length ? el('span', { class: 'chip bad' }, `${errors.length} unreadable`) : null));
    if (rows.length) {
      results.append(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Date', 'Subject', 'Chapter', 'Lec', 'Time'].map(h => el('th', {}, h)))),
        el('tbody', {}, rows.map(r => el('tr', {}, el('td', {}, D.fmtShort(r.date)), el('td', {}, r.subject),
          el('td', {}, r.chapter), el('td', {}, r.lecture), el('td', {}, D.dur(r.duration))))))));
    }
    if (errors.length) {
      results.append(el('div', { class: 'errlist' }, el('strong', {}, 'These rows were not read and will be skipped:'),
        errors.map(e => el('div', { class: 'errrow' },
          el('div', { class: 'errwhy' }, `Line ${e.line}: ${e.reason}`),
          el('code', {}, e.text.length > 120 ? e.text.slice(0, 120) + '…' : e.text)))));
    }
    if (!rows.length && !errors.length) results.append(el('div', { class: 'hint' }, 'Nothing new to add.'));
    saveBtn.disabled = !rows.length;
    saveBtn.textContent = rows.length ? `Save ${rows.length} lecture${rows.length === 1 ? '' : 's'}` : 'Save';
  }

  function save() {
    if (!current || !current.rows.length) return;
    const st = Store.get();
    if (st.sampleActive && clearSample.checked) Store.clearSample();
    Store.addLectures(current.rows);
    dlg.close();
    App.render();
  }

  window.Planner = {
    open() {
      if (!dlg) build();
      ta.value = ''; dlg.querySelector('input[type=file]').value = '';
      clearSample.checked = true;
      preview();
      dlg.showModal();
    }
  };
})();
