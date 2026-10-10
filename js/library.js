/* Library: your textbooks and Acts, stored on this device (IndexedDB) and searched locally.
 * Nothing is uploaded anywhere when you add a book. Only the few passages that match a chat question
 * are sent to Gemini, so answers come from your books and a request costs the same as any other. */
(function () {
  const DB = 'studyPlannerLib';
  const STOP = new Set('a an and are as at be by for from has have how in is it its of on or that the this to was what when where which who why will with you your i my me do does did can could should would not no yes if then than so such these those there their they them we our us he she his her also into about'.split(' '));
  let dbp = null, index = null;

  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('This browser does not allow the Library (no IndexedDB).')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true }).createIndex('bookId', 'bookId');
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

  /** Break a page into ~900 character pieces on line boundaries. Tabs (table columns) become " | ". */
  function chunksOf(pageText) {
    const out = []; let cur = '';
    pageText.replace(/\t/g, ' | ').split('\n').forEach(line => {
      if (!line.trim()) return;
      cur += (cur ? '\n' : '') + line;
      if (cur.length >= 900) { out.push(cur); cur = ''; }
    });
    if (cur.trim()) out.push(cur);
    return out;
  }

  /** pages: array of page texts. Returns { id, pages, empty } where empty = pages with no text (scans). */
  async function add(name, subject, pages) {
    const db = await open();
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    let chars = 0, empty = 0;
    const rows = [];
    pages.forEach((t, i) => {
      if (!t || t.trim().length < 20) { empty++; return; }
      chars += t.length;
      chunksOf(t).forEach(c => rows.push({ bookId: id, page: i + 1, text: c }));
    });
    if (!rows.length) throw new Error('No readable text found. This file may be scanned images (photos of pages). Use a text-based PDF.');
    for (let i = 0; i < rows.length; i += 2000) {
      const t = db.transaction('chunks', 'readwrite'); const st = t.objectStore('chunks');
      rows.slice(i, i + 2000).forEach(r => st.add(r)); await done(t);
    }
    const t = db.transaction('books', 'readwrite');
    t.objectStore('books').put({ id, name, subject: subject || '', pages: pages.length, empty, chars, added: new Date().toISOString() });
    await done(t);
    index = null;
    return { id, pages: pages.length, empty };
  }

  async function remove(id) {
    const db = await open();
    const t = db.transaction(['books', 'chunks'], 'readwrite');
    t.objectStore('books').delete(id);
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
      const tf = new Map(); const tk = tokens(c.text);
      tk.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
      tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1));
      total += tk.length;
      return { book: books.get(c.bookId), page: c.page, text: c.text, tf, len: tk.length };
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
    if (opts.subject) {
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
      if (sc > 0) scored.push({ book: d.book, page: d.page, text: d.text, score: sc, matched: hit, terms: q.length });
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

  const stats = async () => { const b = await list(); return { books: b.length, pages: b.reduce((s, x) => s + x.pages, 0), chars: b.reduce((s, x) => s + x.chars, 0) }; };

  window.Library = { list, add, remove, search, stats, tokens, guessSubject, available: () => !!window.indexedDB };
})();
