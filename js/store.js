/* Data model + persistence + date helpers. Everything lives in window.Store.
 *
 * state = {
 *   version: 1,
 *   examDate: 'YYYY-MM-DD' | null,
 *   examName: 'CA Inter Exam',
 *   planStart: 'YYYY-MM-DD' | null,   // start of the countdown ring
 *   sampleActive: boolean,
 *   lectures:  [{ id, date, subject, chapter, lecture, duration(min), done, doneOn, sample? }],
 *   revisions: [],   // step 3
 *   tests:     []    // step 4
 * }
 * All dates are local calendar days as 'YYYY-MM-DD' strings (no timezone drift).
 */
(function () {
  const KEY = 'studyPlanner.v1';
  const DAY = 864e5;
  const pad = n => String(n).padStart(2, '0');

  const D = {
    toISO: d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    today() { return D.toISO(new Date()); },
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    add(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.toISO(d); },
    diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / DAY); }, // b - a in days
    isValid(s) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
      return D.toISO(D.parse(s)) === s;
    },
    fmt(s) {
      return D.parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
    fmtShort(s) {
      return D.parse(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    },
    dur(min) {
      min = Math.round(+min || 0);
      const h = Math.floor(min / 60), m = min % 60;
      return (h ? h + 'h' : '') + (h && m ? ' ' : '') + (m || !h ? m + 'm' : '');
    }
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  let mem = null; // fallback when localStorage is unavailable
  let state;

  function sampleData() {
    const t = D.today();
    const plan = [
      ['Adv Accounting', 'Partnership', 12, 90],
      ['Law', 'Companies Act', 8, 70],
      ['Taxation', 'GST', 15, 105],
      ['Costing', 'Material', 9, 80],
      ['Audit', 'Nature of Audit', 6, 75],
      ['FM-SM', 'Ratio Analysis', 4, 60]
    ];
    const lectures = [];
    let n = 0;
    for (let off = -10; off <= 10; off++) {
      const count = off === 0 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const p = plan[(n + i) % plan.length];
        const lecNo = p[2] + Math.floor((off + 10) / 2) + (i > 1 ? 1 : 0);
        const date = D.add(t, off);
        let done = false;
        if (off < 0) done = (n + i) % 7 !== 3 && (n + i) % 11 !== 5;   // a few missed
        if (off === 0) done = i < 2;                                  // matches the mock-up
        lectures.push({
          id: uid(), date, subject: p[0], chapter: p[1], lecture: lecNo, duration: p[3] + (i % 2) * 10,
          done, doneOn: done ? date : null, sample: true
        });
      }
      n += count;
    }
    return lectures;
  }

  function fresh() {
    const t = D.today();
    return {
      version: 1,
      examDate: D.add(t, 47),
      examName: 'CA Inter Exam',
      planStart: D.add(t, -10),
      sampleActive: true,
      lectures: sampleData(),
      revisions: [],
      tests: []
    };
  }

  function normalize(s) {
    const f = { version: 1, examDate: null, examName: 'CA Inter Exam', planStart: null,
                sampleActive: false, lectures: [], revisions: [], tests: [] };
    s = Object.assign(f, s && typeof s === 'object' ? s : {});
    ['lectures', 'revisions', 'tests'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    if (s.examDate && !D.isValid(s.examDate)) s.examDate = null;
    return s;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = mem; }
    if (raw) {
      try { return normalize(JSON.parse(raw)); } catch (e) { /* corrupt -> reseed */ }
    }
    const s = fresh();
    return s;
  }

  function save() {
    const json = JSON.stringify(state);
    try { localStorage.setItem(KEY, json); } catch (e) { mem = json; }
  }

  const Store = {
    D, uid,
    get() { return state; },
    init() { state = load(); save(); },
    save,

    setExamDate(date) {
      if (!D.isValid(date)) return false;
      state.examDate = date;
      save();
      return true;
    },

    lecturesOn(date) {
      return state.lectures.filter(l => l.date === date)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    addLecture(l) {
      state.lectures.push({
        id: uid(), date: l.date, subject: l.subject.trim(), chapter: l.chapter.trim(),
        lecture: String(l.lecture).trim(), duration: Math.max(1, Math.round(+l.duration || 0)),
        done: false, doneOn: null
      });
      if (!state.planStart || l.date < state.planStart) state.planStart = l.date;
      save();
    },

    addLectures(rows) {
      rows.forEach(r => state.lectures.push({
        id: uid(), date: r.date, subject: r.subject, chapter: r.chapter, lecture: String(r.lecture),
        duration: r.duration, done: false, doneOn: null
      }));
      const dates = state.lectures.map(x => x.date).sort();
      if (dates.length && (!state.planStart || dates[0] < state.planStart)) state.planStart = dates[0];
      save();
    },

    toggleLecture(id) {
      const l = state.lectures.find(x => x.id === id);
      if (!l) return null;
      l.done = !l.done;
      l.doneOn = l.done ? D.today() : null;
      save();
      return l;
    },

    clearSample() {
      state.lectures = state.lectures.filter(x => !x.sample);
      state.revisions = state.revisions.filter(x => !x.sample);
      state.tests = state.tests.filter(x => !x.sample);
      state.sampleActive = false;
      state.planStart = state.lectures.length ? state.lectures.map(x => x.date).sort()[0] : D.today();
      save();
    }
  };

  window.Store = Store;
})();
