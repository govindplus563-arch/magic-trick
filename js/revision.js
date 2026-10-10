/* Revision tab: Today / Upcoming / Weekly + week strip. */
(function () {
  const { el } = HomeView;
  const { D } = Store;
  let sub = 'today', weekOff = 0, selDay = null;

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekStart = d => D.add(d, -((D.parse(d).getDay() + 6) % 7));   // Monday
  const isWeekly = r => r.kind[0] === 'w';
  const badgeClass = r => ({ d1: 'b-teal', d3: 'b-indigo', d7: 'b-blue' }[r.kind] || 'b-purple');

  function dayLabel(date) {
    const t = D.today(), n = D.diff(t, date);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return D.parse(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function card(r) {
    const l = Store.lectureById(r.lectureId);
    const n = isWeekly(r) ? ` · Week ${r.kind.slice(1)}` : '';
    return el('div', { class: 'rev' + (r.done ? ' done' : '') },
      el('span', { class: 'badge ' + badgeClass(r) }, r.label),
      el('div', { class: 'rev-row' },
        el('div', { class: 'rev-text' },
          el('div', { class: 'lec-title' }, `${l.subject}: ${l.chapter}`),
          el('div', { class: 'lec-meta' }, `${Store.lecLabel(l)}${n}`)),
        el('button', { class: 'explain', type: 'button', title: 'Quick revision note', 'aria-label': 'Revision note for ' + l.chapter,
          onclick: () => Assistant.ask(`Give me a quick revision note on "${l.chapter}" (${l.subject}): key points to remember and one likely exam question.`) }, '✨'),
        el('button', { class: 'btn sm ' + (r.done ? 'donebtn' : 'teal'),
          onclick: () => { Store.toggleRevision(r.id); App.render(); } }, r.done ? '✓ Done' : 'Done')));
  }

  function grouped(list) {
    const out = [];
    const byDate = {};
    list.forEach(r => (byDate[r.due] = byDate[r.due] || []).push(r));
    Object.keys(byDate).sort().forEach(d => {
      out.push(el('div', { class: 'day-head' }, dayLabel(d)));
      byDate[d].forEach(r => out.push(card(r)));
    });
    return out;
  }

  function weekStrip() {
    const t = D.today();
    const start = D.add(weekStart(t), weekOff * 7);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(D.add(start, i));
    const cells = days.map((d, i) => {
      const revs = Store.revisionsOn(d);
      const pending = revs.some(r => !r.done);
      return el('button', { class: 'wd' + (d === t ? ' today' : '') + (d === selDay ? ' sel' : ''),
        'aria-label': `${dayLabel(d)}: ${revs.length} revisions`,
        onclick: () => { selDay = selDay === d ? null : d; App.render(); } },
        el('span', { class: 'wd-l' }, DAYS[i]),
        el('span', { class: 'wd-n' }, String(D.parse(d).getDate())),
        el('span', { class: 'dot' + (revs.length ? (pending ? ' on' : ' off') : '') }));
    });
    const range = `${D.fmtShort(days[0])} – ${D.fmtShort(days[6])}`;
    return el('div', { class: 'strip card' },
      el('div', { class: 'strip-nav' },
        el('button', { class: 'arrow', 'aria-label': 'Previous week', onclick: () => { weekOff--; selDay = null; App.render(); } }, '‹'),
        el('span', {}, weekOff === 0 ? 'This week' : range),
        el('button', { class: 'arrow', 'aria-label': 'Next week', onclick: () => { weekOff++; selDay = null; App.render(); } }, '›')),
      el('div', { class: 'strip-days' }, cells));
  }

  function render(root) {
    const t = D.today();
    const all = Store.get().revisions.filter(r => !r.cleared && Store.lectureById(r.lectureId));

    root.append(el('div', { class: 'subtabs', role: 'tablist' },
      [['today', 'Today'], ['upcoming', 'Upcoming'], ['weekly', 'Weekly']].map(([id, label]) =>
        el('button', { class: 'subtab' + (sub === id && !selDay ? ' active' : ''), role: 'tab',
          'aria-selected': String(sub === id), onclick: () => { sub = id; selDay = null; App.render(); } }, label))));
    root.append(weekStrip());

    let list, empty, heading = null;
    if (selDay) {
      list = Store.revisionsOn(selDay);
      heading = el('div', { class: 'section-head' }, el('h2', {}, dayLabel(selDay)),
        el('button', { class: 'btn ghost sm', onclick: () => { selDay = null; App.render(); } }, 'Show all'));
      empty = 'No revisions on this day.';
    } else if (sub === 'today') {
      list = all.filter(r => r.due === t);
      const done = list.filter(r => r.done).length;
      heading = el('div', { class: 'section-head' }, el('h2', {}, "Today's Revision"),
        el('span', { class: 'count-chip' }, `${done}/${list.length}`));
      empty = 'Nothing to revise today. Tick lectures on Home to create revision slots.';
    } else if (sub === 'upcoming') {
      list = all.filter(r => r.due > t && !isWeekly(r));
      empty = 'No upcoming 1 / 3 / 7-day revisions.';
    } else {
      list = all.filter(r => r.due >= t && isWeekly(r));
      empty = 'No weekly revisions yet. They start 2 weeks after a lecture is ticked and run until the exam.';
    }
    if (heading) root.append(heading);
    if (!list.length) root.append(el('div', { class: 'empty card' }, empty));
    else if (sub === 'today' || selDay) list.forEach(r => root.append(card(r)));
    else grouped(list).forEach(n => root.append(n));

    if (sub === 'weekly' && !selDay)
      root.append(el('p', { class: 'hint center' }, 'Revision schedule: 1 day, 3 days, 7 days, then every week until the exam.'));
  }

  window.RevisionView = { render };
})();
