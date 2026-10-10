/* App shell: tab routing, bottom nav, add-lecture dialog. */
(function () {
  const { el } = HomeView;

  const ico = d => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'nav-ico'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = d; return s;
  };
  const ICONS = {
    home: '<path fill="currentColor" d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/>',
    revision: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/>',
    progress: '<path fill="currentColor" d="M4 20h3v-7H4zm6 0h3V4h-3zm6 0h3v-11h-3z"/>',
    tests: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M7 4h10v16H7zM9.5 4V2.5h5V4M9.5 12l2 2 3.5-4"/>',
    backlog: '<path fill="currentColor" d="M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z"/>'
  };
  const TABS = [
    { id: 'home', label: 'Home' }, { id: 'revision', label: 'Revision' }, { id: 'progress', label: 'Progress' },
    { id: 'tests', label: 'Tests' }, { id: 'backlog', label: 'Backlog' }
  ];
  const PENDING = {};
  const VIEWS = { home: HomeView, revision: RevisionView, progress: ProgressView, tests: TestsView, backlog: BacklogView };

  let tab = 'home';

  function currentTab() {
    const h = location.hash.replace('#', '');
    return TABS.some(t => t.id === h) ? h : 'home';
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.replaceChildren(...TABS.map(t => el('a', {
      href: '#' + t.id, class: 'nav-item' + (t.id === tab ? ' active' : ''), 'aria-current': t.id === tab ? 'page' : null
    }, ico(ICONS[t.id]), el('span', {}, t.label),
      t.id === 'backlog' && Store.backlog().count ? el('b', { class: 'nav-badge' }, String(Store.backlog().count)) : null)));
  }

  function render() {
    tab = currentTab();
    const root = document.getElementById('view');
    const y = window.scrollY;
    root.replaceChildren();
    if (VIEWS[tab]) VIEWS[tab].render(root);
    else root.append(el('div', { class: 'card empty' }, el('strong', {}, TABS.find(t => t.id === tab).label),
      el('br'), `Coming in ${PENDING[tab]}.`));
    renderNav();
    window.scrollTo(0, y);
  }

  // ---- add lecture dialog ----
  const dlg = document.getElementById('lectureDialog');
  const form = document.getElementById('lectureForm');
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!Store.D.isValid(f.date)) return;
    Store.addLecture(f);
    dlg.close();
    render();
  });
  function openLectureDialog(date) {
    form.reset();
    form.elements.date.value = date;
    dlg.showModal();
  }

  // ---- reschedule dialog (used by Backlog) ----
  const rdlg = document.getElementById('rescheduleDialog');
  const rform = document.getElementById('rescheduleForm');
  let rTarget = null;
  rdlg.querySelector('[data-close]').addEventListener('click', () => rdlg.close());
  rform.addEventListener('submit', e => {
    e.preventDefault();
    if (rTarget && Store.reschedule(rTarget.type, rTarget.id, rform.elements.date.value)) { rdlg.close(); render(); }
  });
  function openReschedule(type, id, what) {
    rTarget = { type, id };
    document.getElementById('rescheduleWhat').textContent = what;
    const t = Store.D.today();
    rform.elements.date.min = t;
    rform.elements.date.value = Store.D.add(t, 1);
    rdlg.showModal();
  }

  window.App = { render, openLectureDialog, openReschedule };
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  // Re-render when the day rolls over while the app stays open.
  let lastDay = Store.D.today();
  setInterval(() => { const d = Store.D.today(); if (d !== lastDay) { lastDay = d; render(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastDay = Store.D.today(); render(); } });

  Store.init();
  render();
})();
