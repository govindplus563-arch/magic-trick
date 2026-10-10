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

  // ---- revision engine: day 1, day 3, day 7, then weekly (days + weeks only) ----
  const KINDS = [{ kind: 'd1', off: 1, label: '1-day' }, { kind: 'd3', off: 3, label: '3-day' }, { kind: 'd7', off: 7, label: '7-day' }];
  const hash = str => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  function planFor(base, examDate) {
    const out = KINDS.map(k => ({ kind: k.kind, due: D.add(base, k.off), label: k.label }));
    const last = examDate && examDate > base ? examDate : D.add(base, 56);
    for (let n = 1; n <= 12; n++) {
      const due = D.add(base, 7 + 7 * n);
      if (due > last) break;
      out.push({ kind: 'w' + n, due, label: 'Weekly' });
    }
    return out;
  }

  // Adds the revision slots a lecture is missing, counted from `base` (the day it was ticked).
  function addRevisionsFor(s, lec, base, sampleMode) {
    if (sampleMode && hash(lec.id) % 2) return;   // keep the sample light
    const have = new Set(s.revisions.filter(r => r.lectureId === lec.id).map(r => r.kind));
    const t = D.today();
    planFor(base, s.examDate).forEach(p => {
      if (have.has(p.kind)) return;
      const r = { id: uid(), lectureId: lec.id, kind: p.kind, label: p.label, due: p.due, done: false, doneOn: null };
      if (sampleMode) {
        r.sample = true;
        if (p.due < t && hash(lec.id + p.kind) % 6 !== 0) { r.done = true; r.doneOn = p.due; } // some stay missed
      }
      s.revisions.push(r);
    });
  }

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
    for (let off = -14; off <= 10; off++) {
      const count = off === 0 ? 4 : off < 0 ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const p = plan[(n + i) % plan.length];
        const lecNo = p[2] + Math.floor((off + 14) / 2) + (i > 1 ? 1 : 0);
        const date = D.add(t, off);
        let done = false;
        if (off < 0) done = (n + i) % 7 !== 3;   // a few missed
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

  function seedTests(s) {
    const t = D.today();
    [['Mock Test 1', 'Costing', 48, 100, -13], ['Mock Test 2', 'Adv Accounting', 62, 100, -9], ['Mock Test 3', 'Law', 75, 100, -6],
     ['Mock Test 4', 'Taxation', 46, 80, -3], ['Mock Test 5', 'Audit', 66, 100, -1]]
      .forEach(x => s.tests.push({ id: uid(), name: x[0], subject: x[1], obtained: x[2], total: x[3], date: D.add(t, x[4]), sample: true }));
    [['Mock Test 6', 'Costing', 3], ['Mock Test 7', 'Taxation', 8]]
      .forEach(x => s.testSchedule.push({ id: uid(), name: x[0], subject: x[1], date: D.add(t, x[2]), sample: true }));
  }

  function fresh() {
    const t = D.today();
    const s = {
      version: 3,
      examDate: D.add(t, 47),
      examName: 'CA Inter Exam',
      planStart: D.add(t, -14),
      sampleActive: true,
      lectures: sampleData(),
      revisions: [],
      tests: [],
      testSchedule: []
    };
    seedTests(s);
    s.lectures.filter(l => l.done).forEach(l => addRevisionsFor(s, l, l.doneOn, true));
    return s;
  }

  function normalize(s) {
    const f = { version: 1, examDate: null, examName: 'CA Inter Exam', planStart: null,
                sampleActive: false, lectures: [], revisions: [], tests: [], testSchedule: [] };
    s = Object.assign(f, s && typeof s === 'object' ? s : {});
    ['lectures', 'revisions', 'tests', 'testSchedule'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
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
    init() {
      state = load();
      if (state.version < 2) {   // older saves: build revisions for lectures that were already ticked
        state.lectures.filter(l => l.done && l.doneOn && !state.revisions.some(r => r.lectureId === l.id))
          .forEach(l => addRevisionsFor(state, l, l.doneOn, !!l.sample));
        state.version = 2;
      }
      if (state.version < 3) {
        if (state.sampleActive && !state.tests.length) seedTests(state);
        state.version = 3;
      }
      save();
    },
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

    /** opts.pastDone: lectures dated before today are saved as already done (no revision slots are created for them). */
    addLectures(rows, opts) {
      const t = D.today();
      rows.forEach(r => {
        const done = !!(opts && opts.pastDone && r.date < t);
        state.lectures.push({
          id: uid(), date: r.date, subject: r.subject, chapter: r.chapter, lecture: String(r.lecture),
          duration: r.duration, done, doneOn: done ? r.date : null, of: r.of || undefined
        });
      });
      const dates = state.lectures.map(x => x.date).sort();
      if (dates.length && (!state.planStart || dates[0] < state.planStart)) state.planStart = dates[0];
      save();
    },

    toggleLecture(id) {
      const l = state.lectures.find(x => x.id === id);
      if (!l) return null;
      l.done = !l.done;
      l.doneOn = l.done ? D.today() : null;
      if (l.done) addRevisionsFor(state, l, l.doneOn, false);
      else state.revisions = state.revisions.filter(r => r.lectureId !== l.id || r.done);
      save();
      return l;
    },

    addTest(t) {
      state.tests.push({ id: uid(), name: t.name.trim(), subject: t.subject.trim(), obtained: +t.obtained, total: +t.total, date: t.date });
      save();
    },
    deleteTest(id) { state.tests = state.tests.filter(x => x.id !== id); save(); },

    addTimetable(rows, replaceSample) {
      if (replaceSample) state.testSchedule = state.testSchedule.filter(x => !x.sample);
      rows.forEach(r => state.testSchedule.push({ id: uid(), name: r.name, subject: r.subject, date: r.date }));
      save();
    },
    deleteTimetable(id) { state.testSchedule = state.testSchedule.filter(x => x.id !== id); save(); },

    /** Expected = lectures planned (original date) up to today. Actual = lectures ticked. */
    progress() {
      const t = D.today(), map = {};
      state.lectures.forEach(l => {
        const k = l.subject.trim().toLowerCase();
        const o = map[k] || (map[k] = { name: l.subject.trim(), expected: 0, actual: 0, total: 0 });
        o.total++;
        if (l.done) o.actual++;
        if ((l.origDate || l.date) <= t) o.expected++;
      });
      const subjects = Object.values(map).sort((a, b) => a.name.localeCompare(b.name)).map(o => {
        o.pct = o.expected ? Math.min(100, Math.round(o.actual / o.expected * 100)) : (o.actual ? 100 : null);
        o.behind = o.actual < o.expected;
        return o;
      });
      const total = state.lectures.length, done = state.lectures.filter(l => l.done).length;
      const revs = state.revisions.filter(r => !r.cleared);
      const revDue = revs.filter(r => r.due <= t);
      return { subjects, total, done, overall: total ? Math.round(done / total * 100) : 0,
        revDone: revDue.filter(r => r.done).length, revDue: revDue.length };
    },

    /** "Lec 8/8" when the planner gives the chapter's lecture count, else "Lec 12". */
    lecLabel(l) { return 'Lec ' + l.lecture + (l.of ? '/' + l.of : ''); },

    /** Re-number existing lectures (used when a planner is uploaded again). updates: [{id, lecture, of}] */
    updateLectureNumbers(updates) {
      updates.forEach(u => { const l = Store.lectureById(u.id); if (l) { l.lecture = String(u.lecture); l.of = u.of; } });
      save();
    },

    lectureById(id) { return state.lectures.find(l => l.id === id); },

    revisionsOn(date) {
      return state.revisions.filter(r => r.due === date && !r.cleared && Store.lectureById(r.lectureId));
    },

    toggleRevision(id) {
      const r = state.revisions.find(x => x.id === id);
      if (!r) return;
      r.done = !r.done;
      r.doneOn = r.done ? D.today() : null;
      save();
    },

    /** Anything not done by the end of its day. Computed, so it is always current. */
    backlog() {
      const t = D.today();
      const lectures = state.lectures.filter(l => !l.done && !l.cleared && l.date < t)
        .sort((a, b) => a.date.localeCompare(b.date));
      const revisions = state.revisions.filter(r => !r.done && !r.cleared && r.due < t && Store.lectureById(r.lectureId))
        .sort((a, b) => a.due.localeCompare(b.due));
      return { lectures, revisions, count: lectures.length + revisions.length };
    },

    reschedule(type, id, date) {
      if (!D.isValid(date) || date < D.today()) return false;
      if (type === 'lecture') {
        const l = state.lectures.find(x => x.id === id); if (!l) return false;
        if (!l.origDate) l.origDate = l.date;   // Progress still measures against the original plan
        l.date = date; l.cleared = false;
      } else {
        const r = state.revisions.find(x => x.id === id); if (!r) return false;
        if (!r.origDue) r.origDue = r.due;
        r.due = date; r.cleared = false;
      }
      save();
      return true;
    },

    clearItem(type, id) {
      const it = (type === 'lecture' ? state.lectures : state.revisions).find(x => x.id === id);
      if (it) { it.cleared = true; save(); }
    },

    clearSample() {
      state.lectures = state.lectures.filter(x => !x.sample);
      state.revisions = state.revisions.filter(x => !x.sample);
      state.tests = state.tests.filter(x => !x.sample);
      state.testSchedule = state.testSchedule.filter(x => !x.sample);
      state.sampleActive = false;
      state.planStart = state.lectures.length ? state.lectures.map(x => x.date).sort()[0] : D.today();
      save();
    }
  };

  window.Store = Store;
})();
