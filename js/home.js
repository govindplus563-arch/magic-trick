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
    wrap.append(el('a', { class: 'gear-btn', href: '#settings', title: 'Settings', 'aria-label': 'Settings' }, '⚙️'));
    wrap.append(el('button', { class: 'theme-btn', type: 'button', title: Theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode',
      'aria-label': Theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode',
      onclick: () => { Theme.set(Theme.isDark() ? 'light' : 'dark'); App.render(); } }, Theme.isDark() ? '☀️' : '🌙'));
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
      el('button', { type: 'button', class: 'explain', title: 'Explain this topic', 'aria-label': 'Explain ' + title,
        onclick: e => { e.preventDefault(); e.stopPropagation(); Assistant.ask(`Explain "${l.chapter}" (${l.subject}) simply. I am about to study it.`); } }, '✨'),
      cb, el('span', { class: 'cbx', 'aria-hidden': 'true' }));
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

    const days = st.lastBackup ? Math.floor((Date.now() - new Date(st.lastBackup)) / 864e5) : null;
    const hasData = st.lectures.some(l => !l.sample) || st.tests.some(t => !t.sample);
    if (hasData && (days == null || days >= 7)) {
      root.append(el('a', { class: 'backup-nudge', href: '#settings' },
        days == null ? 'You have not backed up yet. Tap to open Settings.' : `Last backup was ${days} days ago. Tap to open Settings.`));
    }
  }

  window.HomeView = { render, el };
})();
