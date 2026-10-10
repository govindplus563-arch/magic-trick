/* Backlog tab: missed lectures + missed revisions, with Reschedule / Clear. */
(function () {
  const { el } = HomeView;
  const { D } = Store;

  function card(type, item, title, meta, date) {
    const what = `${title} (${meta})`;
    return el('div', { class: 'bl-card' },
      el('div', { class: 'lec-title' }, title),
      el('div', { class: 'lec-meta' }, meta),
      el('div', { class: 'bl-foot' },
        el('span', { class: 'bl-date' }, D.fmtShort(date)),
        el('div', { class: 'bl-actions' },
          el('button', { class: 'btn primary sm', onclick: () => { if (type === 'lecture') Store.toggleLecture(item.id); else Store.toggleRevision(item.id); App.toast(type === 'lecture' ? 'Marked as watched. Revision slots were added from today.' : 'Marked as revised.'); App.render(); } }, '✓ Done'),
          el('button', { class: 'btn outline sm', onclick: () => App.openReschedule(type, item.id, what) }, 'Reschedule'),
          el('button', { class: 'btn outline sm', onclick: () => { Store.clearItem(type, item.id); App.render(); } }, 'Clear'))));
  }

  function render(root) {
    const b = Store.backlog();
    root.append(el('div', { class: 'section-head bl-head' }, el('h2', { class: 'big' }, 'Backlog'),
      el('span', { class: 'pend' + (b.count ? '' : ' zero') }, `${b.count} pending`)));

    if (!b.count) {
      root.append(el('div', { class: 'empty card' }, 'You are all caught up. Anything not done by the end of its day shows up here.'));
      return;
    }
    root.append(el('h3', { class: 'sub-h' }, 'Missed Lectures'));
    if (!b.lectures.length) root.append(el('div', { class: 'empty card slim' }, 'No missed lectures.'));
    b.lectures.forEach(l => root.append(card('lecture', l, `${l.subject} - ${l.chapter}`, `${Store.lecLabel(l)} · ${D.dur(l.duration)}`, l.date)));

    root.append(el('h3', { class: 'sub-h' }, 'Missed Revisions'));
    if (!b.revisions.length) root.append(el('div', { class: 'empty card slim' }, 'No missed revisions.'));
    b.revisions.forEach(r => {
      const l = Store.lectureById(r.lectureId);
      root.append(card('revision', r, `${l.subject} - ${l.chapter} Revision`, `${r.label} revision · ${Store.lecLabel(l)}`, r.due));
    });
  }

  window.BacklogView = { render };
})();
