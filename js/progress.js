/* Progress tab: overall donut + per-subject Expected / Actual / %. */
(function () {
  const { el } = HomeView;
  const NS = 'http://www.w3.org/2000/svg';

  function donut(pct) {
    const R = 54, C = 2 * Math.PI * R;
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 140 140'); s.setAttribute('class', 'ring-svg'); s.setAttribute('aria-hidden', 'true');
    const mk = (stroke, dash) => {
      const c = document.createElementNS(NS, 'circle');
      [['cx', 70], ['cy', 70], ['r', R], ['fill', 'none'], ['stroke', stroke], ['stroke-width', 18],
       ['stroke-dasharray', dash], ['transform', 'rotate(-90 70 70)']].forEach(([k, v]) => c.setAttribute(k, v));
      return c;
    };
    s.append(mk('var(--track)', `${C} ${C}`));
    if (pct > 0) s.append(mk('var(--teal)', `${C * pct / 100} ${C}`));
    return s;
  }

  function render(root) {
    const p = Store.progress();
    root.append(el('section', { class: 'card donut-card' },
      el('h2', {}, 'Overall Completion'),
      el('div', { class: 'ring small-ring' }, donut(p.overall), el('div', { class: 'ring-center' }, el('div', { class: 'ring-days' }, p.overall + '%'))),
      el('div', { class: 'stats' },
        el('div', {}, el('b', {}, `${p.done}/${p.total}`), el('span', {}, 'lectures done')),
        el('div', {}, el('b', {}, `${p.revDone}/${p.revDue}`), el('span', {}, 'revisions done (due so far)')))));

    if (!p.subjects.length) {
      root.append(el('div', { class: 'empty card', style: 'margin-top:14px' }, 'No lectures yet. Upload a planner or add a lecture on Home.'));
      return;
    }
    const rows = p.subjects.map(s => el('tr', {},
      el('td', { class: 'subj' }, s.name),
      el('td', { class: 'num' }, String(s.expected)),
      el('td', { class: 'num' + (s.behind ? ' red' : '') }, String(s.actual)),
      el('td', { class: 'pct' },
        el('div', { class: 'pct-txt' + (s.behind ? ' red' : '') }, s.pct == null ? '—' : s.pct + '%'),
        el('div', { class: 'mini' }, el('div', { class: 'mini-fill', style: `width:${s.pct || 0}%` })))));
    root.append(el('div', { class: 'card ptable' },
      el('table', {},
        el('thead', {}, el('tr', {}, ['Subject', 'Expected', 'Actual', '%'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', {}, rows))));
    root.append(el('p', { class: 'hint center' }, 'Expected = lectures planned up to today. Actual = lectures you ticked. Red means behind plan.'));
  }

  window.ProgressView = { render };
})();
