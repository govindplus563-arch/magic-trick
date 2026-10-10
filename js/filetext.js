/* Turns an uploaded file (CSV/TXT, Excel, Word .docx, PDF) into plain text lines with TAB between columns,
 * which the planner / timetable parsers then read. Heavy libraries load only when needed. */
(function () {
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load ' + src + '. Check your connection and try again.')); };
      document.head.append(s);
    }));
  }
  const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');

  async function fromExcel(file) {
    await loadScript('vendor/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true });
    const cellText = c => {
      if (!c) return '';
      if (c.t === 'n' && c.z && XLSX.SSF.is_date(c.z)) {
        const o = XLSX.SSF.parse_date_code(c.v);
        return c.v < 1 ? `${o.H}:${pad(o.M)}` : `${o.y}-${pad(o.m)}-${pad(o.d)}`;   // time-only vs date cell
      }
      return clean(c.w != null ? c.w : c.v);
    };
    const lines = [];
    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) return;
      const r = XLSX.utils.decode_range(ws['!ref']);
      for (let row = r.s.r; row <= r.e.r; row++) {
        const cells = [];
        for (let col = r.s.c; col <= r.e.c; col++) cells.push(cellText(ws[XLSX.utils.encode_cell({ r: row, c: col })]));
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (cells.length) lines.push(cells.join('\t'));
      }
    });
    return lines.join('\n');
  }

  async function fromDocx(file) {
    await loadScript('vendor/mammoth.browser.min.js');
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = [];
    const walk = node => {
      node.childNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'table') {
          n.querySelectorAll('tr').forEach(tr => lines.push([...tr.children].map(td => clean(td.textContent)).join('\t')));
        } else if (/^(p|h[1-6]|li)$/.test(tag)) {
          n.innerHTML.split(/<br\s*\/?>/i).forEach(part => { const t = clean(part.replace(/<[^>]+>/g, '')); if (t) lines.push(t); });
        } else walk(n);
      });
    };
    walk(doc.body);
    return lines.filter(l => l.trim()).join('\n');
  }

  /** Text of every PDF page, in reading order, with TAB between table columns. */
  async function pdfPages(file, onProgress, opts) {
    const gap = (opts && opts.tabGap) || 6;
    await loadScript('vendor/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim());
      // group text runs into visual lines by y position, then order each line left-to-right
      const rows = [];
      items.forEach(it => {
        const y = it.transform[5], h = it.height || 8;
        const row = rows.find(r => Math.abs(r.y - y) < h * 0.5);
        if (row) row.items.push(it); else rows.push({ y, items: [it] });
      });
      const out = [];
      rows.sort((a, b) => b.y - a.y).forEach(r => {
        r.items.sort((a, b) => a.transform[4] - b.transform[4]);
        let s = '', prevEnd = null;
        r.items.forEach(it => {
          const x = it.transform[4];
          if (prevEnd != null) s += (x - prevEnd > gap ? '\t' : (x - prevEnd > 0.5 ? ' ' : ''));
          s += it.str.trim(); prevEnd = x + it.width;
        });
        out.push(s);
      });
      pages.push(out.join('\n'));
      if (page.cleanup) page.cleanup();
    }
    return pages;
  }

  async function fromPdf(file) {
    const text = (await pdfPages(file)).join('\n');
    if (!text.trim()) throw new Error('This PDF has no selectable text (it may be a scan or image). Export it from the original app, or paste the text instead.');
    return text;
  }

  /** Any supported file -> array of page texts (real pages for PDF, ~3000 character blocks for other files). */
  async function readPages(file, onProgress, opts) {
    const ext = ((file.name || '').toLowerCase().split('.').pop());
    if (ext === 'pdf') return pdfPages(file, onProgress, opts);
    const text = await read(file);
    const pages = []; let cur = '';
    text.split('\n').forEach(line => { cur += line + '\n'; if (cur.length >= 3000) { pages.push(cur); cur = ''; } });
    if (cur.trim()) pages.push(cur);
    return pages;
  }

  async function read(file) {
    const name = (file.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'].includes(ext)) return fromExcel(file);
    if (ext === 'docx') return fromDocx(file);
    if (ext === 'pdf') return fromPdf(file);
    if (ext === 'doc') throw new Error('Old .doc files cannot be read. Open it in Word and use Save As → .docx (or PDF), then upload that.');
    return file.text();   // csv, tsv, txt, anything else treated as text
  }

  window.FileText = { read, readPages, ACCEPT: '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.docx,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
})();
