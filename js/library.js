/* Library: your textbooks and Acts, stored on this device (IndexedDB) and searched locally.
 * Nothing is uploaded anywhere when you add a book. Only the few passages that match a chat question
 * are sent to Gemini, so answers come from your books and a request costs the same as any other. */
(function () {
  const DB = 'studyPlannerLib';
  const STOP = new Set('a an and are as at be by for from has have how in is it its of on or that the this to was what when where which who why will with you your i my me do does did can could should would not no yes if then than so such these those there their they them we our us he she his her also into about'.split(' '));
  let dbp = null, index = null;

  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('This browser does not allow the Library (no IndexedDB).')); return; }
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true }).createIndex('bookId', 'bookId');
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');      // the original PDFs, so you can read them in the app
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

  async function list() {
    const db = await open();
    return (await wrap(db.transaction('books').objectStore('books').getAll())).sort((a, b) => a.name.localeCompare(b.name));
  }

  const HEAD_A = /^\s*(\d{1,2}\.\d{1,3})\s+[A-Z][A-Z0-9 &,'-]{4,}\s*$/;            // "2.6   ADVANCED ACCOUNTING"
  const HEAD_B = /^\s*[A-Z][A-Z0-9 &,'-]{4,}?\s+(\d{1,2}\.\d{1,3})\s*$/;            // "ADVANCED ACCOUNTING   2.7"
  const SECTION = /^\s*(\d{1,2}(?:\.\d{1,2})*\.?)\s+([A-Z][A-Z0-9 ,&'()\/–-]{7,})\s*$/;  // "4.  STATUS OF ACCOUNTING STANDARDS"
  const norm = l => l.replace(/\s+/g, ' ').trim();

  const SMALL = new Set(['of', 'to', 'and', 'for', 'the', 'in', 'on', 'a', 'an', 'as', 'at', 'by']);
  const titleCase = t => t.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  /** "CHAPTER 2 / FRAMEWORK FOR PREPARATION ..." on the cover page -> "Chapter 2 - Framework For Preparation ..." ('' if it cannot tell). */
  function titleFromCover(text) {
    const lines = String(text || '').split('\n').map(l => norm(l.replace(/\t/g, ' '))).filter(Boolean).slice(0, 16);
    const stop = lines.findIndex(l => /LEARNING OUTCOMES|CHAPTER OVERVIEW|^After studying|^CONTENTS?$/i.test(l));
    const head = lines.slice(0, stop > 0 ? stop : 6);
    let n = '', kind = 'Chapter'; const out = [];
    head.forEach(l => {
      let m;
      if ((m = l.match(/^(CHAPTER|MODULE|UNIT)\s*(\d+)?\s*[:\-–]?\s*(.*)$/i)) && (m[2] || !m[3])) { kind = titleCase(m[1]); if (m[2]) n = m[2]; if (m[3]) out.push(m[3]); return; }
      if (/^\d{1,2}$/.test(l) && !n) { n = l; return; }
      if (/^[A-Z0-9 ,&'()\/:–-]{4,}$/.test(l) || out.length) out.push(l);
    });
    const t = out.join(' ').replace(/\s+/g, ' ').trim();
    if (t.length < 6 || t.length > 150) return '';
    return (n ? `${kind} ${n} - ` : '') + titleCase(t);
  }

  /** Strips running headers/footers, reads the printed page label (e.g. "2.6") and the subject from the header. */
  function prepare(rawPages) {
    const lines = rawPages.map(t => String(t || '').split('\n'));
    const seen = new Map();
    lines.forEach(ls => { new Set(ls.map(l => norm(l).replace(/\d+/g, '#')).filter(Boolean)).forEach(k => seen.set(k, (seen.get(k) || 0) + 1)); });
    const repeat = rawPages.length >= 8 ? Math.max(4, Math.ceil(rawPages.length * 0.4)) : Infinity;
    const subjects = new Map();
    const pages = lines.map(ls => {
      let label = '';
      const kept = ls.filter((l, i) => {
        const edge = i < 3 || i >= ls.length - 3;
        const m = edge && (l.replace(/\t/g, ' ').match(HEAD_A) || l.replace(/\t/g, ' ').match(HEAD_B));
        if (m) {
          label = m[1];
          const nm = norm(l.replace(/\t/g, ' ').replace(m[1], '')); if (nm) subjects.set(nm, (subjects.get(nm) || 0) + 1);
          return false;
        }
        if (edge && /©|Institute of Chartered Accountants/i.test(l)) return false;
        if (edge && seen.get(norm(l).replace(/\d+/g, '#')) >= repeat) return false;
        return true;
      });
      return { text: kept.join('\n'), label };
    });
    const top = [...subjects.entries()].sort((a, b) => b[1] - a[1])[0];
    const title = s => s.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/^\s*\d+\s*[-_.]?\s*/, '').replace(/^[a-z]{2,5}-[a-z]{2,6}\d{3,5}-/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
    return { pages, subject: top && top[1] >= 2 ? top[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '', title };
  }

  /** Break a page into ~900 character pieces on line boundaries and remember the current section heading. */
  function chunksOf(pageText, state, pageNo) {
    if (state.heading && pageNo - (state.headingPage || pageNo) > 12) state.heading = '';   // answers / exercise pages after a long gap belong to no section
    const out = []; let cur = '';
    const flush = () => { if (cur.trim()) out.push({ text: cur, heading: state.heading }); cur = ''; };
    pageText.split('\n').forEach(raw => {
      const cells = raw.split('\t').map(c => c.trim()).filter(Boolean);
      const isTable = cells.length >= 3 && cells.filter(c => c.length >= 12).length >= 2;
      const line = isTable ? cells.join(' | ') : cells.join(' ');
      if (!line.trim()) return;
      if (/^(ANSWERS?(\s*\/\s*HINTS)?|HINTS|ANSWERS? TO .{3,60}|TEST YOUR KNOWLEDGE|THEORETICAL QUESTIONS|PRACTICAL QUESTIONS|MULTIPLE CHOICE QUESTIONS|SELF[- ]?EXAMINATION|EXERCISES?)$/i.test(line)) { flush(); state.heading = titleCase(line); state.headingPage = pageNo; state.justSet = false; }
      const h = line.match(SECTION);
      if (h && line.length < 120) { flush(); state.heading = (h[1] + ' ' + h[2]).replace(/\s+/g, ' ').trim(); state.headingPage = pageNo; state.justSet = true; }
      else if (state.justSet && /^[A-Z][A-Z0-9 ,&'()\/–-]{2,60}$/.test(line)) state.heading += ' ' + line;   // long headings wrap onto a second line
      else state.justSet = false;
      cur += (cur ? '\n' : '') + line;
      if (cur.length >= 900) flush();
    });
    flush();
    return out;
  }

  /** rawPages: array of page texts. Returns { id, pages, empty, subject } where empty = pages with no text (scans). */
  async function add(name, subject, rawPages, file) {
    const db = await open();
    const prep = prepare(rawPages);
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    let chars = 0, empty = 0;
    const rows = [], state = { heading: '' };
    prep.pages.forEach((pg, i) => {
      if (!pg.text || pg.text.trim().length < 20) { empty++; return; }
      chars += pg.text.length;
      chunksOf(pg.text, state, i + 1).forEach(c => rows.push({ bookId: id, page: i + 1, label: pg.label, heading: c.heading, text: c.text }));
    });
    if (!rows.length) throw new Error('No readable text found. This file may be scanned images (photos of pages). Use a text-based PDF.');
    const dup = (await list()).find(b => b.pages === rawPages.length && b.chars === chars);
    if (dup) return { duplicate: true, of: dup.title || dup.name, pages: rawPages.length, empty };   // same text already in the Library
    for (let i = 0; i < rows.length; i += 2000) {
      const t = db.transaction('chunks', 'readwrite'); const st = t.objectStore('chunks');
      rows.slice(i, i + 2000).forEach(r => st.add(r)); await done(t);
    }
    const finalSubject = subject || prep.subject;
    const keepFile = !!(file && /\.pdf$/i.test(name));
    const t = db.transaction(keepFile ? ['books', 'files'] : ['books'], 'readwrite');
    t.objectStore('books').put({ id, name, title: titleFromCover((prep.pages.find(pg => pg.text && pg.text.length > 40) || {}).text) || prep.title(name), titled: true, subject: finalSubject, pages: rawPages.length, empty, chars, size: file ? file.size : 0, hasFile: keepFile, added: new Date().toISOString() });
    if (keepFile) t.objectStore('files').put(file, id);
    await done(t);
    index = null;
    return { id, pages: rawPages.length, empty, subject: finalSubject };
  }

  /** One-off: give books added earlier a proper title taken from their cover page. */
  async function fixTitles() {
    const db = await open(); let changed = 0;
    for (const b of await list()) {
      if (b.titled) continue;
      const first = (await chunksOfBook(b.id)).sort((x, y) => x.page - y.page);
      const p0 = first.length ? first[0].page : 0;
      const t = titleFromCover(first.filter(c => c.page === p0).map(c => c.text).join('\n'));
      const tx = db.transaction('books', 'readwrite');
      tx.objectStore('books').put(Object.assign({}, b, { title: t || b.title, titled: true })); await done(tx); changed++;
    }
    return changed;
  }

  async function remove(id) {
    const db = await open();
    const t = db.transaction(['books', 'chunks', 'files'], 'readwrite');
    t.objectStore('books').delete(id); t.objectStore('files').delete(id);
    const cur = t.objectStore('chunks').index('bookId').openKeyCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => { const c = cur.result; if (c) { t.objectStore('chunks').delete(c.primaryKey); c.continue(); } };
    await done(t); index = null;
  }

  /* ---- search: BM25 over the chunks ---- */
  const tokens = text => {
    const out = [];
    (String(text).toLowerCase().match(/[a-z0-9]+(?:\([a-z0-9]+\))*/g) || []).forEach(w => {
      if (STOP.has(w)) return;
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
      out.push(w);
      const base = w.replace(/\(.*$/, '');          // "17(5)" also matches "17"
      if (base !== w && base) out.push(base);
    });
    return out;
  };

  async function load() {
    if (index) return index;
    const db = await open();
    const books = new Map((await list()).map(b => [b.id, b]));
    const all = await wrap(db.transaction('chunks').objectStore('chunks').getAll());
    const df = new Map(); let total = 0;
    const docs = all.filter(c => books.has(c.bookId)).map(c => {
      const tf = new Map(); const tk = tokens((c.heading ? c.heading + ' ' + c.heading + ' ' : '') + c.text);   // the section heading counts double
      tk.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
      tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1));
      total += tk.length;
      return { book: books.get(c.bookId), page: c.page, label: c.label || '', heading: c.heading || '', text: c.text, tf, len: tk.length };
    });
    index = { docs, df, avg: docs.length ? total / docs.length : 1, books };
    return index;
  }

  /** -> [{ book, page, text, score }] best matches first. subject (optional) limits to books of that subject when there are any. */
  async function search(query, opts) {
    opts = opts || {};
    const ix = await load();
    if (!ix.docs.length) return [];
    let pool = ix.docs;
    if (opts.bookId) pool = pool.filter(d => d.book.id === opts.bookId);
    else if (opts.subject) {
      const s = String(opts.subject).toLowerCase();
      const sub = pool.filter(d => d.book.subject && (d.book.subject.toLowerCase() === s || s.includes(d.book.subject.toLowerCase()) || d.book.subject.toLowerCase().includes(s)));
      if (sub.length) pool = sub;
    }
    const q = [...new Set(tokens(query))];
    if (!q.length) return [];
    const N = ix.docs.length, k1 = 1.4, b = 0.75;
    const scored = [];
    pool.forEach(d => {
      let sc = 0, hit = 0;
      q.forEach(w => {
        const f = d.tf.get(w); if (!f) return;
        hit++;
        const n = ix.df.get(w) || 0, idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        sc += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / ix.avg));
      });
      if (!d.heading) sc *= 0.8;
      if (sc > 0) scored.push({ book: d.book, page: d.page, label: d.label, heading: d.heading, text: d.text, score: sc, matched: hit, terms: q.length });
    });
    scored.sort((x, y) => y.score - x.score);
    const out = [], perPage = new Map();
    for (const r of scored) {              // at most 2 passages from the same page
      const key = r.book.id + ':' + r.page, n = perPage.get(key) || 0;
      if (n >= 2) continue;
      perPage.set(key, n + 1); out.push(r);
      if (out.length >= (opts.k || 5)) break;
    }
    return out;
  }

  /** Which of the given subject names does this text talk about? (file name or question) */
  function guessSubject(text, names) {
    const t = String(text).toLowerCase().replace(/[_\-.]+/g, ' ');
    let best = '', score = 0;
    names.forEach(n => {
      const words = n.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));
      if (!words.length) return;
      const hit = words.filter(w => t.includes(w)).length, s = hit / words.length + (t.includes(n.toLowerCase()) ? 1 : 0);
      if (hit && s > score) { score = s; best = n; }
    });
    return best;
  }

  async function getBook(id) { const db = await open(); return wrap(db.transaction('books').objectStore('books').get(id)); }
  async function getFile(id) { const db = await open(); return wrap(db.transaction('files').objectStore('files').get(id)); }
  async function chunksOfBook(id) { const db = await open(); return wrap(db.transaction('chunks').objectStore('chunks').index('bookId').getAll(IDBKeyRange.only(id))); }
  /** Text of one PDF page (as stored: header/footer removed). */
  async function pageText(id, page) { return (await chunksOfBook(id)).filter(c => c.page === page).map(c => c.text).join('\n'); }
  /** Section headings of a book with the page each starts on, for a contents list. */
  async function outline(id) {
    const seen = new Set(), out = [];
    (await chunksOfBook(id)).sort((a, b) => a.page - b.page).forEach(c => { if (c.heading && !seen.has(c.heading)) { seen.add(c.heading); out.push({ heading: c.heading, page: c.page, label: c.label }); } });
    return out;
  }
  /** Printed label of a PDF page (e.g. "2.6"), if the book has one. */
  async function labelOf(id, page) { const c = (await chunksOfBook(id)).find(x => x.page === page && x.label); return c ? c.label : ''; }

  /** "Chapter 2 - Framework ..., page 2.6, section 4. STATUS OF ..." */
  const cite = h => `${h.book.title || h.book.name}, page ${h.label || h.page}` + (h.label ? ` (PDF page ${h.page})` : '') + (h.heading ? `, section "${h.heading}"` : '');

  const stats = async () => { const b = await list(); return { books: b.length, pages: b.reduce((s, x) => s + x.pages, 0), chars: b.reduce((s, x) => s + x.chars, 0) }; };

  window.Library = { fixTitles, cite, getBook, getFile, pageText, outline, labelOf, list, add, remove, search, stats, tokens, guessSubject, available: () => !!window.indexedDB };
})();
