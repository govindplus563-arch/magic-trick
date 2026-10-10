/* Book viewer: read a book from your Library page by page, jump by contents, search inside it, and ask about the page you are on. */
(function () {
  const { el } = HomeView;
  let cur = null;   // { id, pdf, url } kept while you flip pages so the file is only opened once

  async function openPdf(id) {
    if (cur && cur.id === id) return cur;
    if (cur) { try { URL.revokeObjectURL(cur.url); cur.pdf.destroy(); } catch (e) { /* ignore */ } cur = null; }
    const blob = await Library.getFile(id);
    if (!blob) return null;
    const lib = await FileText.pdfjs();
    const url = URL.createObjectURL(blob);
    const pdf = await lib.getDocument({ url }).promise;
    cur = { id, pdf, url };
    return cur;
  }

  function render(root) {
    const parts = location.hash.replace('#', '').split('/');
    const id = parts[1];
    let page = Math.max(1, parseInt(parts[2], 10) || 1);
    const here = location.hash.split('/').slice(0, 2).join('/');
    const alive = () => root.isConnected && location.hash.startsWith(here);

    root.append(el('div', { class: 'page-head' }, el('a', { class: 'back', href: '#settings' }, '‹ Library')));
    const body = el('div', {}, el('p', { class: 'hint' }, 'Opening book…'));
    root.append(body);

    (async () => {
      const book = await Library.getBook(id);
      if (!alive()) return;
      if (!book) { body.replaceChildren(el('div', { class: 'empty card' }, 'This book is not in your Library any more.')); return; }
      const hasPdf = !!book.hasFile;
      let doc = null, mode = hasPdf ? 'page' : 'text', zoom = 1, token = 0;
      try { if (hasPdf) doc = await openPdf(id); } catch (e) { doc = null; }
      if (!alive()) return;
      if (hasPdf && !doc) mode = 'text';
      const total = book.pages;
      page = Math.min(page, total);

      const title = el('h2', { class: 'big book-title' }, book.title || book.name);
      const sub = el('div', { class: 'hint', style: 'margin:0 0 10px' }, [book.subject, `${total} pages`].filter(Boolean).join(' · '));
      const input = el('input', { type: 'number', min: 1, max: total, value: page, class: 'pg-input', 'aria-label': 'PDF page number' });
      const label = el('span', { class: 'pg-label' });
      const wrap = el('div', { class: 'pdf-wrap' });
      const canvas = el('canvas', { class: 'pdf-canvas' });
      const textBox = el('div', { class: 'text-page', hidden: true });
      wrap.append(canvas, textBox);

      const toc = el('select', { 'aria-label': 'Contents' }, el('option', { value: '' }, 'Contents…'));
      Library.outline(id).then(o => { if (alive()) o.forEach(h => toc.append(el('option', { value: h.page }, `${h.label ? h.label + '  ' : ''}${h.heading}`.slice(0, 110)))); });
      toc.addEventListener('change', () => { if (toc.value) go(+toc.value); toc.value = ''; });

      async function draw() {
        const my = ++token;
        input.value = page;
        history.replaceState(null, '', `#book/${id}/${page}`);
        const lbl = await Library.labelOf(id, page);
        label.textContent = lbl ? `Page ${lbl}` : '';
        prev.disabled = page <= 1; next.disabled = page >= total;
        if (mode === 'page' && doc) {
          textBox.hidden = true; canvas.hidden = false;
          try {
            const pg = await doc.pdf.getPage(page);
            const base = pg.getViewport({ scale: 1 }), dpr = Math.min(window.devicePixelRatio || 1, 2);
            const scale = ((wrap.clientWidth || 340) - 2) * zoom / base.width, vp = pg.getViewport({ scale: scale * dpr });
            if (my !== token) return;
            canvas.width = vp.width; canvas.height = vp.height; canvas.style.width = vp.width / dpr + 'px'; canvas.style.height = vp.height / dpr + 'px';
            await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          } catch (e) { if (my === token) { mode = 'text'; draw(); } }
        } else {
          canvas.hidden = true; textBox.hidden = false;
          const t = await Library.pageText(id, page);
          if (my === token) textBox.textContent = t || 'No text on this page (it may be an image or a blank page).';
        }
      }
      const go = n => { page = Math.max(1, Math.min(total, n)); wrap.scrollTop = 0; return draw(); };
      const prev = el('button', { class: 'btn outline sm', type: 'button', 'aria-label': 'Previous page', onclick: () => go(page - 1) }, '‹');
      const next = el('button', { class: 'btn outline sm', type: 'button', 'aria-label': 'Next page', onclick: () => go(page + 1) }, '›');
      input.addEventListener('change', () => go(parseInt(input.value, 10) || 1));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') go(parseInt(input.value, 10) || 1); });
      const viewBtn = hasPdf ? el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { mode = mode === 'page' ? 'text' : 'page'; viewBtn.textContent = mode === 'page' ? '🔤 Text view' : '📄 Page view'; draw(); } }, mode === 'page' ? '🔤 Text view' : '📄 Page view') : null;
      const zoomBtn = el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { zoom = zoom === 1 ? 2 : 1; zoomBtn.textContent = zoom === 1 ? '🔍 Zoom' : '🔍 Fit'; draw(); } }, '🔍 Zoom');
      // swipe left/right to turn pages (only when not zoomed, so scrolling a zoomed page still works)
      let sx = null; wrap.addEventListener('touchstart', e => { sx = zoom === 1 && e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
      wrap.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70) go(page + (dx < 0 ? 1 : -1)); }, { passive: true });

      const actions = el('div', { class: 'lec-actions', style: 'margin:10px 0' },
        el('button', { class: 'act', type: 'button', onclick: async () => { const t = (await Library.pageText(id, page)).slice(0, 3500); Assistant.ask(`Explain this page from my book "${book.title || book.name}" (page ${label.textContent.replace('Page ', '') || page}) simply, in order. Keep tables and formulas.\n\n"""\n${t}\n"""`); } }, '✨ Explain this page'),
        el('button', { class: 'act', type: 'button', onclick: async () => { const o = await Library.outline(id); const h = o.filter(x => x.page <= page).pop(); MistakesView.openAdd({ subject: book.subject, chapter: '', text: '', answer: h ? `Book: ${book.title || book.name}, page ${label.textContent.replace('Page ', '') || page}${h ? ', ' + h.heading : ''}` : '' }); } }, '📕 Log mistake'));

      // search inside this book
      const results = el('div', { class: 'bk-results' });
      const q = el('input', { type: 'search', class: 'mb-search bk-q', placeholder: 'Search inside this book', 'aria-label': 'Search inside this book' });
      const run = async () => {
        const text = q.value.trim(); if (!text) { results.replaceChildren(); return; }
        const hits = await Library.search(text, { bookId: id, k: 8 });
        results.replaceChildren(...(hits.length ? hits.map(h => el('button', { class: 'bk-hit', type: 'button', onclick: () => { go(h.page).then(() => wrap.scrollIntoView({ block: 'start', behavior: 'smooth' })); } },
          el('b', {}, `Page ${h.label || h.page}${h.heading ? ' · ' + h.heading : ''}`), el('span', {}, h.text.replace(/\n/g, ' ').slice(0, 140) + '…'))) : [el('p', { class: 'hint' }, 'Nothing found. Try other words.')]));
      };
      q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); }); q.addEventListener('change', run);

      body.replaceChildren(title, sub,
        el('div', { class: 'bk-bar' }, prev, input, el('span', { class: 'pg-of' }, `/ ${total}`), next, label),
        el('div', { class: 'bk-bar' }, toc, viewBtn, hasPdf ? zoomBtn : null),
        wrap, actions, q, results, el('div', { style: 'height:96px' }));
      draw();
    })().catch(e => { if (root.isConnected) body.replaceChildren(el('div', { class: 'err' }, e.message || 'Could not open this book.')); });
  }

  window.BookView = { render };
})();
