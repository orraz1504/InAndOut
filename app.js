/* אישורי כניסה ויציאה – SPA ללא build.
 * Firestore (compat SDK דרך CDN) עם onSnapshot לסנכרון חי; ללא הגדרת Firebase רץ במצב הדגמה מקומי. */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const COL = { students: 'student_exits', visitors: 'visitor_entries', users: 'users' };
  const U = { PENDING: 'pending', APPROVED: 'approved', BLOCKED: 'blocked' };
  const S = { PENDING: 'ממתין ליציאה', EXITED: 'יצא בפועל', CANCELLED: 'בוטל' };
  const V = { PENDING: 'טרם נכנס', INSIDE: 'נמצא בשטח', LEFT: 'יצא' };

  // ───────── עזרים ─────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dateStr(new Date());
  const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const nowClock = () => clock(new Date());
  const fmtDate = s => s.split('-').reverse().join('/');
  const fmtTs = ms => {
    if (!ms) return '';
    const d = new Date(ms);
    return dateStr(d) === todayStr() ? clock(d) : `${fmtDate(dateStr(d))} ${clock(d)}`;
  };
  const sortBy = (arr, key, dir = 1) => [...arr].sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ls = {
    get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* מצב פרטי – מתעלמים */ } },
  };

  const adminEmails = () => (CFG.adminEmails || []).map(e => String(e).trim().toLowerCase());

  // ───────── שכבת נתונים ─────────
  // ממשק משותף: subscribe(col, cb(list, fromCache), onError) → unsubscribe, add, transition(col,id,fromStatuses,patch) → bool, remove.
  // transition מבצע עדכון רק אם הסטטוס עדיין כפי שציפינו – מונע מצב שבו שני שומרים רושמים את אותה יציאה.
  function createFirebaseStore() {
    if (typeof firebase === 'undefined') throw new Error('ספריית Firebase לא נטענה – בדקו חיבור לאינטרנט');
    firebase.initializeApp(CFG.firebase);
    const db = firebase.firestore();
    const ref = (col, id) => db.collection(col).doc(id);
    const store = {
      mode: 'firebase',
      subscribe(col, cb, onError) {
        return db.collection(col).orderBy('createdAt', 'desc').limit(500).onSnapshot(
          { includeMetadataChanges: true },
          snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id })), snap.metadata.fromCache),
          onError);
      },
      add: (col, data) => db.collection(col).add(data),
      transition: (col, id, from, patch) => db.runTransaction(async tx => {
        const snap = await tx.get(ref(col, id));
        if (!snap.exists || !from.includes(snap.data().status)) return false;
        tx.update(ref(col, id), patch);
        return true;
      }),
      remove: (col, id) => ref(col, id).delete(),
      // מסמכים לפי מזהה קבוע (users/<email>)
      set: (col, id, data) => ref(col, id).set(data),
      patch: (col, id, patch) => ref(col, id).update(patch),
      async getDoc(col, id) {
        const snap = await ref(col, id).get();
        return snap.exists ? { ...snap.data(), id: snap.id } : null;
      },
      subscribeDoc: (col, id, cb, onError) =>
        ref(col, id).onSnapshot(snap => cb(snap.exists ? { ...snap.data(), id: snap.id } : null), onError),
    };
    const auth = firebase.auth();
    store.auth = {
      onChange: cb => auth.onAuthStateChanged(cb),
      signIn: (email, pass) => auth.signInWithEmailAndPassword(email, pass),
      signInGoogle: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
      signOut: () => auth.signOut(),
    };
    return store;
  }

  function createLocalStore() {
    const key = col => 'inout:' + col;
    const read = col => { try { return JSON.parse(localStorage.getItem(key(col))) || []; } catch { return []; } };
    const subs = [];
    const emit = col => subs.filter(s => s.col === col).forEach(s => s.cb(read(col), false));
    const write = (col, list) => { localStorage.setItem(key(col), JSON.stringify(list)); emit(col); };
    window.addEventListener('storage', e => {   // סנכרון בין לשוניות באותו דפדפן
      const col = Object.values(COL).find(c => key(c) === e.key);
      if (col) emit(col);
    });
    // "התחברות" מדומה להדגמה בלבד – מאפשרת לנסות את תצוגת המנהל בלי Firebase (לא מאובטח!).
    const listeners = [];
    let user = null;
    try { user = JSON.parse(sessionStorage.getItem('inout:user')); } catch { /* ignore */ }
    const setUser = u => {
      user = u;
      try { u ? sessionStorage.setItem('inout:user', JSON.stringify(u)) : sessionStorage.removeItem('inout:user'); } catch { /* ignore */ }
      listeners.forEach(cb => cb(user));
    };
    const auth = {
      onChange(cb) { listeners.push(cb); cb(user); },
      async signIn(email, pass) {
        if (email.toLowerCase() !== adminEmails()[0] || pass !== (CFG.demoAdminPassword || 'admin')) throw new Error('bad credentials');
        setUser({ email });
      },
      async signOut() { setUser(null); },
    };
    return {
      mode: 'local',
      auth,
      subscribe(col, cb) {
        const s = { col, cb };
        subs.push(s);
        queueMicrotask(() => cb(read(col), false));
        return () => subs.splice(subs.indexOf(s), 1);
      },
      async add(col, data) { write(col, [{ ...data, id: uid() }, ...read(col)]); },
      async transition(col, id, from, patch) {
        const list = read(col);
        const i = list.findIndex(x => x.id === id);
        if (i < 0 || !from.includes(list[i].status)) return false;
        list[i] = { ...list[i], ...patch };
        write(col, list);
        return true;
      },
      async remove(col, id) { write(col, read(col).filter(x => x.id !== id)); },
      async set(col, id, data) { write(col, [{ ...data, id }, ...read(col).filter(x => x.id !== id)]); },
      async patch(col, id, patch) { write(col, read(col).map(x => x.id === id ? { ...x, ...patch } : x)); },
    };
  }

  // ───────── מצב ─────────
  const state = {
    view: 'staff', staffTab: 'students', guardTab: 'students', guardRange: 'today',
    students: [], visitors: [], users: [], query: '',
    guardName: ls.get('guardName'),
    user: null, myRole: null,
    recStudents: { query: '', sort: 'date-desc' },
    recVisitors: { query: '', sort: 'date-desc' },
  };
  // אדמין = ברשימת adminEmails הקבועה (bootstrap), או שהמנהל הנוכחי הגדיר לו role: 'admin' במסך ניהול
  const isAdmin = () => !!state.user && (
    adminEmails().includes(String(state.user.email || '').toLowerCase()) || state.myRole === 'admin');
  const myRole = () => isAdmin() ? 'admin' : state.myRole;
  const myDisplayName = () => (state.user && (state.user.displayName || state.user.email)) || '';
  const ROLE_LABEL = { staff: '📝 צוות', guard: '🛡️ שומר', admin: '⭐ מנהל' };
  const ROLE_OPTIONS = ['staff', 'guard', 'admin'];
  function allowedViews() {
    const role = myRole();
    if (!state.user) return [];
    if (role === 'admin') return ['staff', 'guard', 'records', 'admin'];
    if (role === 'guard') return ['guard'];
    return ['staff'];   // 'staff', וגם ברירת מחדל למשתמשים ישנים בלי role
  }
  let store;
  let unsubs = [];
  let unsubAccess = null;                 // האזנה למסמך users/<email> של המשתמש המחובר
  let subErrorShown = false;

  // ───────── UI כללי ─────────
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'pointer-events-auto max-w-md rounded-xl px-5 py-3 text-base font-bold text-white shadow-lg '
      + (type === 'err' ? 'bg-red-600' : 'bg-slate-800');
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 4000);
  }

  const errMsg = err => err && err.code === 'permission-denied'
    ? 'אין הרשאה לפעולה – בדקו את כללי האבטחה ב-Firestore / התחברות'
    : 'שגיאה: ' + ((err && err.message) || err);

  // מריץ פעולה אסינכרונית; בכשל מציג הודעה ומחזיר undefined.
  async function run(fn) {
    try { return await fn(); } catch (err) { console.error(err); toast(errMsg(err), 'err'); }
  }
  const report = (r, okMsg) => {
    if (r === true) toast(okMsg);
    else if (r === false) toast('הסטטוס כבר עודכן על ידי גורם אחר – הרשימה רועננה', 'err');
  };

  // במובייל מוצגת רק נקודת צבע (חוסך מקום בסרגל); הטקסט המלא בדסקטופ וב-title.
  const CONN = {
    connecting: ['מתחבר…', 'bg-slate-200 text-slate-600'],
    live: ['מחובר – סנכרון חי', 'bg-emerald-100 text-emerald-800'],
    offline: ['אין חיבור לשרת', 'bg-amber-100 text-amber-800'],
    error: ['שגיאת חיבור', 'bg-red-100 text-red-700'],
    demo: ['מצב הדגמה (מקומי)', 'bg-amber-100 text-amber-800'],
  };
  function setConn(kind) {
    const el = $('#conn');
    el.innerHTML = `●<span class="hidden sm:inline">${CONN[kind][0]}</span>`;
    el.title = CONN[kind][0];
    el.className = 'badge ' + CONN[kind][1];
  }

  const pill = (text, cls) => `<span class="badge ${cls}">${text}</span>`;
  const empty = msg => `<p class="rounded-2xl bg-white p-8 text-center text-lg text-slate-500 ring-1 ring-slate-200">${msg}</p>`;

  // ───────── מסך צוות: טבלאות אישורים (מנהל בלבד) ─────────
  // דסקטופ: טבלה. מובייל: כרטיסים (טבלה רחבה לא נוחה למסך צר).
  function listView(headers, rows, cards, emptyMsg) {
    if (!rows.length) return `<p class="py-8 text-center text-slate-500">${emptyMsg}</p>`;
    return `<div class="hidden overflow-x-auto md:block"><table class="w-full text-sm">
        <thead><tr class="border-b text-slate-500">${headers.map(h => `<th class="px-3 py-2 text-start font-semibold">${h}</th>`).join('')}</tr></thead>
        <tbody class="divide-y divide-slate-100">${rows.join('')}</tbody></table></div>
      <div class="space-y-3 md:hidden">${cards.join('')}</div>`;
  }
  const td = (html, cls = '') => `<td class="px-3 py-3 align-top ${cls}">${html}</td>`;
  const miniCard = (top, meta, extra, action) => `<article class="rounded-xl border border-slate-200 p-3">
      <div class="flex items-start justify-between gap-2">${top}</div>
      <div class="mt-1 text-sm text-slate-600">${meta}</div>${extra}
      ${action ? `<div class="mt-3">${action}</div>` : ''}</article>`;
  const locked = () => `<div class="rounded-xl bg-slate-50 p-6 text-center">
      <div class="text-4xl">🔒</div>
      <p class="mt-2 text-lg font-bold">הרשימה זמינה למנהל בלבד</p>
      <button class="btn btn-primary mt-4" data-action="open-login">🔑 כניסת מנהל</button></div>`;

  // רשימה מקיפה (כל הרשומות, לא רק היום) עם חיפוש ומיון: לפי חודש (ברירת מחדל), לפי שם, או לפי סטטוס.
  const norm = s => String(s ?? '').toLowerCase();
  const matchesQuery = (fields, q) => !q || fields.some(f => norm(f).includes(q));
  const monthLabel = ym => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };
  function groupByMonth(list, dateKey, dir) {
    const groups = {};
    list.forEach(item => (groups[item[dateKey].slice(0, 7)] ||= []).push(item));
    const keys = Object.keys(groups).sort();
    if (dir === -1) keys.reverse();
    return keys.map(ym => ({ label: monthLabel(ym), items: groups[ym] }));
  }
  const monthSection = (label, count, body) => `<section class="mb-6 last:mb-0">
      <h3 class="mb-2 text-base font-extrabold text-brand-700">${label} <span class="text-sm font-semibold text-slate-500">(${count})</span></h3>
      ${body}</section>`;
  // מרנדר לפי מצב המיון: תאריך → מקובץ לפי חודש; שם/סטטוס → רשימה שטוחה ממוינת.
  function renderRecList(box, list, cfg, headers, rowHtml, cardHtml, dateKey, dateSortKey, emptyMsg) {
    if (!list.length) { box.innerHTML = empty(emptyMsg); return; }
    if (cfg.sort === 'name' || cfg.sort === 'status') {
      const sorted = cfg.sort === 'status' ? sortBy(list, x => x.status) : sortBy(list, dateSortKey.name);
      box.innerHTML = listView(headers, sorted.map(rowHtml), sorted.map(cardHtml), '');
      return;
    }
    const dir = cfg.sort === 'date-asc' ? 1 : -1;
    const sorted = sortBy(list, dateSortKey.date, dir);
    const groups = groupByMonth(sorted, dateKey, dir);
    box.innerHTML = groups.map(g => monthSection(g.label, g.items.length,
      listView(headers, g.items.map(rowHtml), g.items.map(cardHtml), ''))).join('');
  }

  function renderStaffStudents() {
    const box = $('#rec-students-table');
    if (!isAdmin()) { box.innerHTML = locked(); return; }
    const cfg = state.recStudents;
    const q = norm(cfg.query.trim());
    const filtered = state.students.filter(s => matchesQuery([s.studentName, s.grade, s.approvedBy], q));
    const tone = { [S.PENDING]: 'bg-amber-100 text-amber-800', [S.EXITED]: 'bg-emerald-100 text-emerald-800', [S.CANCELLED]: 'bg-slate-200 text-slate-600' };
    const detail = s => s.status === S.EXITED
      ? `<div class="mt-1 text-sm text-slate-500">ב-${fmtTs(s.actualExitAt)} · שומר: ${esc(s.guardName)}</div>` : '';
    const cancelBtn = (s, cls = '') => s.status === S.PENDING
      ? `<button class="btn btn-danger btn-sm ${cls}" data-action="student-cancel" data-id="${esc(s.id)}">ביטול אישור</button>` : '';
    const editBtn = (s, cls = '') => `<button class="btn btn-ghost btn-sm ${cls}" data-action="student-edit" data-id="${esc(s.id)}">✏️ עריכה</button>`;
    const rowHtml = s => `<tr>
        ${td(esc(s.studentName), 'font-bold')}
        ${td(esc(s.grade))}
        ${td(`${fmtDate(s.exitDate)} · ${esc(s.exitTime)}`)}
        ${td(esc(s.approvedBy))}
        ${td(pill(s.status, tone[s.status] || '') + detail(s))}
        ${td(`<div class="flex flex-wrap gap-2">${editBtn(s)}${cancelBtn(s)}</div>`)}</tr>`;
    const cardHtml = s => miniCard(
      `<div class="text-base font-bold">${esc(s.studentName)}</div>${pill(s.status, tone[s.status] || '')}`,
      `כיתה ${esc(s.grade)} · ${fmtDate(s.exitDate)} ${esc(s.exitTime)} · אישר/ה: ${esc(s.approvedBy)}`,
      detail(s), `<div class="flex gap-2">${editBtn(s, 'flex-1 py-3')}${cancelBtn(s, 'flex-1 py-3')}</div>`);
    renderRecList(box, filtered, cfg, ['תלמיד/ה', 'כיתה', 'יציאה מאושרת', 'מאשר/ת', 'סטטוס', ''], rowHtml, cardHtml,
      'exitDate', { name: s => s.studentName, date: s => s.exitDate + s.exitTime },
      q ? 'לא נמצאו תוצאות' : 'אין אישורי יציאה');
  }

  function renderStaffVisitors() {
    const box = $('#rec-visitors-table');
    if (!isAdmin()) { box.innerHTML = locked(); return; }
    const cfg = state.recVisitors;
    const q = norm(cfg.query.trim());
    const filtered = state.visitors.filter(v =>
      matchesQuery([v.firstName, v.lastName, v.idNumber, v.purpose, v.approvedBy, v.notes], q));
    const tone = { [V.PENDING]: 'bg-amber-100 text-amber-800', [V.INSIDE]: 'bg-emerald-100 text-emerald-800', [V.LEFT]: 'bg-slate-200 text-slate-600' };
    const detail = v => v.entryAt
      ? `<div class="mt-1 text-sm text-slate-500">נכנס ${fmtTs(v.entryAt)}${v.exitAt ? ` · יצא ${fmtTs(v.exitAt)}` : ''} · שומר: ${esc(v.guardName)}</div>` : '';
    const escort = v => v.escortRequired ? pill('נדרש ליווי', 'bg-red-100 text-red-700') : pill('ללא ליווי', 'bg-emerald-100 text-emerald-800');
    const armed = v => v.armedAllowed ? pill('רשאי נשק', 'bg-emerald-100 text-emerald-800') : pill('אסור נשק', 'bg-red-100 text-red-700');
    const notes = v => v.notes ? esc(v.notes) : '—';
    const deleteBtn = (v, cls = '') => v.status === V.PENDING
      ? `<button class="btn btn-danger btn-sm ${cls}" data-action="visitor-delete" data-id="${esc(v.id)}">מחיקה</button>` : '';
    const editBtn = (v, cls = '') => `<button class="btn btn-ghost btn-sm ${cls}" data-action="visitor-edit" data-id="${esc(v.id)}">✏️ עריכה</button>`;
    const rowHtml = v => `<tr>
        ${td(`${esc(v.firstName)} ${esc(v.lastName)}`, 'font-bold')}
        ${td(esc(v.idNumber))}
        ${td(esc(v.purpose))}
        ${td(escort(v))}
        ${td(armed(v))}
        ${td(esc(v.approvedBy))}
        ${td(fmtDate(v.visitDate))}
        ${td(notes(v), 'max-w-[14rem] whitespace-pre-wrap text-slate-600')}
        ${td(pill(v.status, tone[v.status] || '') + detail(v))}
        ${td(`<div class="flex flex-wrap gap-2">${editBtn(v)}${deleteBtn(v)}</div>`)}</tr>`;
    const cardHtml = v => miniCard(
      `<div class="text-base font-bold">${esc(v.firstName)} ${esc(v.lastName)}</div>${pill(v.status, tone[v.status] || '')}`,
      `ת"ז ${esc(v.idNumber)} · ${esc(v.purpose)}<br>${fmtDate(v.visitDate)} · אישר/ה: ${esc(v.approvedBy)}`,
      `<div class="mt-2 flex flex-wrap gap-2">${escort(v)}${armed(v)}</div>${detail(v)}`
      + (v.notes ? `<div class="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-sm text-amber-900">📝 ${esc(v.notes)}</div>` : ''),
      `<div class="flex gap-2">${editBtn(v, 'flex-1 py-3')}${deleteBtn(v, 'flex-1 py-3')}</div>`);
    renderRecList(box, filtered, cfg, ['מבקר/ת', 'ת"ז', 'מטרה', 'ליווי', 'נשק', 'מאשר/ת', 'תאריך', 'הערות', 'סטטוס', ''], rowHtml, cardHtml,
      'visitDate', { name: v => `${v.firstName} ${v.lastName}`, date: v => v.visitDate + String(v.createdAt).padStart(15, '0') },
      q ? 'לא נמצאו תוצאות' : 'אין אישורי כניסה');
  }

  // ───────── עריכת רשומה (מנהל בלבד) ─────────
  const EDIT_FIELDS = {
    student: [
      ['studentName', 'שם התלמיד/ה', 'text'],
      ['grade', 'כיתה', 'text'],
      ['exitDate', 'תאריך יציאה', 'date'],
      ['exitTime', 'שעת יציאה', 'time'],
      ['approvedBy', 'שם הגורם המאשר', 'text'],
    ],
    visitor: [
      ['firstName', 'שם פרטי', 'text'],
      ['lastName', 'שם משפחה', 'text'],
      ['idNumber', 'ת"ז / דרכון', 'text'],
      ['purpose', 'מטרת הכניסה', 'text'],
      ['visitDate', 'תאריך הביקור', 'date'],
      ['approvedBy', 'שם המאשר/ת', 'text'],
      ['escortRequired', 'נדרש ליווי?', 'bool'],
      ['armedAllowed', 'רשאי להיכנס עם נשק?', 'bool'],
      ['notes', 'הערות לשומר', 'textarea', true],
    ],
  };
  let editCtx = null;   // { kind: 'student'|'visitor', id }

  function editFieldHtml([name, label, type, optional], value) {
    if (type === 'bool') return `<div><label class="label">${label}</label>
      <select class="field" name="${name}">
        <option value="yes" ${value ? 'selected' : ''}>כן</option>
        <option value="no" ${!value ? 'selected' : ''}>לא</option>
      </select></div>`;
    if (type === 'textarea') return `<div><label class="label">${label}</label>
      <textarea class="field" name="${name}" rows="2">${esc(value ?? '')}</textarea></div>`;
    return `<div><label class="label">${label}</label>
      <input class="field" name="${name}" type="${type}" ${type !== 'text' ? 'dir="ltr"' : ''} value="${esc(value ?? '')}" ${optional ? '' : 'required'}></div>`;
  }

  function openEdit(kind, record) {
    editCtx = { kind, id: record.id };
    $('#edit-title').textContent = kind === 'student' ? 'עריכת אישור יציאה' : 'עריכת אישור כניסה';
    $('#edit-fields').innerHTML = EDIT_FIELDS[kind].map(f => editFieldHtml(f, record[f[0]])).join('');
    $('#edit-modal').classList.remove('hidden');
    $('#edit-modal').classList.add('flex');
  }

  function closeEdit() {
    editCtx = null;
    $('#edit-modal').classList.add('hidden');
    $('#edit-modal').classList.remove('flex');
  }

  $('#edit-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!editCtx) return;
    const { kind, id } = editCtx;
    const form = e.target;
    const patch = {};
    let missing = false;
    for (const [name, , type, optional] of EDIT_FIELDS[kind]) {
      const raw = type === 'bool' ? form.elements[name].value === 'yes' : form.elements[name].value.trim();
      if (!optional && raw === '') missing = true;
      patch[name] = raw;
    }
    if (missing) return toast('יש למלא את כל השדות', 'err');
    const col = kind === 'student' ? COL.students : COL.visitors;
    once('edit:' + id, async () => {
      if (await run(() => store.patch(col, id, patch).then(() => true))) {
        toast('הרשומה עודכנה');
        closeEdit();
      }
    });
  });

  // ───────── עמדת שומר ─────────
  function studentCard(s, now) {
    const early = `${s.exitDate} ${s.exitTime}` > `${todayStr()} ${now}`;
    const tone = early ? 'text-amber-600' : 'text-emerald-600';
    return `<article class="card flex flex-col gap-3 border-s-8 p-4 sm:p-4 ${early ? 'border-amber-400' : 'border-emerald-500'}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="break-words text-xl font-extrabold">${esc(s.studentName)}</div>
          <div class="text-base text-slate-600">כיתה ${esc(s.grade)} · אישר/ה: ${esc(s.approvedBy)}</div>
        </div>
        <div class="shrink-0 text-center">
          <div dir="ltr" class="text-2xl font-extrabold tabular-nums ${tone}">${esc(s.exitTime)}</div>
          <div class="text-xs font-bold ${tone}">${early ? '⏳ טרם הגיעה השעה' : '✔ ניתן לצאת'}</div>
        </div>
      </div>
      <button class="btn btn-green btn-xl" data-action="student-exit" data-id="${esc(s.id)}">✔ אישור יציאה</button>
    </article>`;
  }

  function dayLabel(ds) {
    const [y, m, d] = ds.split('-').map(Number);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const name = ds === dateStr(tomorrow) ? 'מחר' : new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'long' });
    return `${name} · ${fmtDate(ds)}`;
  }

  // יציאות עתידיות – לצפייה בלבד (אי אפשר לרשום יציאה לפני התאריך שאושר)
  function renderGuardFuture() {
    const future = sortBy(state.students.filter(s => s.status === S.PENDING && s.exitDate > todayStr()),
      s => s.exitDate + s.exitTime);
    const byDate = {};
    future.forEach(s => (byDate[s.exitDate] ||= []).push(s));
    $('#guard-students-future').innerHTML = future.length
      ? `<p class="text-sm text-slate-500">לצפייה בלבד – רישום יציאה אפשרי רק ביום שאושר.</p>` +
        Object.entries(byDate).map(([ds, items]) => `<section>
          <h3 class="mb-2 text-lg font-extrabold text-brand-700">${dayLabel(ds)} <span class="text-base font-semibold text-slate-500">(${items.length})</span></h3>
          <div class="grid gap-2 lg:grid-cols-2">${items.map(s => `<div class="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div class="min-w-0"><div class="break-words text-lg font-bold">${esc(s.studentName)}</div>
              <div class="text-sm text-slate-600">כיתה ${esc(s.grade)} · אישר/ה: ${esc(s.approvedBy)}</div></div>
            <div dir="ltr" class="shrink-0 text-xl font-extrabold tabular-nums text-brand-700">${esc(s.exitTime)}</div>
          </div>`).join('')}</div></section>`).join('')
      : empty('אין יציאות עתידיות');
    return future.length;
  }

  function renderGuardStudents() {
    const today = todayStr(), now = nowClock();
    const todays = state.students.filter(s => s.exitDate === today);
    const pending = sortBy(todays.filter(s => s.status === S.PENDING), s => s.exitTime);
    const done = sortBy(todays.filter(s => s.status === S.EXITED), s => s.actualExitAt || 0, -1);
    $('#guard-students').innerHTML = pending.length
      ? pending.map(s => studentCard(s, now)).join('')
      : `<div class="lg:col-span-2">${empty('אין תלמידים הממתינים ליציאה')}</div>`;
    $('#guard-students-done-count').textContent = done.length;
    $('#guard-students-done').innerHTML = done.map(s => `<div class="flex flex-wrap items-center justify-between gap-2 py-3">
      <div><span class="text-lg font-bold">${esc(s.studentName)}</span>
        <span class="text-slate-600"> · כיתה ${esc(s.grade)} · יצא ב-${fmtTs(s.actualExitAt)} · שומר: ${esc(s.guardName)}</span></div>
      <button class="btn btn-ghost btn-sm" data-action="student-undo" data-id="${esc(s.id)}">בטל רישום יציאה</button>
    </div>`).join('') || '<p class="py-2 text-slate-500">עדיין לא נרשמו יציאות היום</p>';
    $('#cnt-range-today').textContent = pending.length;
    $('#cnt-range-future').textContent = renderGuardFuture();
  }

  function visitorCard(v) {
    const today = todayStr();
    const armed = v.armedAllowed
      ? pill('✔ רשאי להיכנס עם נשק', 'badge-lg bg-emerald-600 text-white')
      : pill('✖ אסור להיכנס עם נשק', 'badge-lg bg-red-600 text-white');
    const escort = v.escortRequired
      ? pill('✖ נדרש ליווי', 'badge-lg bg-red-600 text-white')
      : pill('✔ ללא ליווי', 'badge-lg bg-emerald-600 text-white');
    const border = { [V.PENDING]: 'border-brand-400', [V.INSIDE]: 'border-emerald-500', [V.LEFT]: 'border-slate-300' }[v.status];
    let info = '', action = '';
    if (v.status === V.PENDING) {
      if (v.visitDate !== today) info = pill(`📅 מאושר לתאריך ${fmtDate(v.visitDate)}`, 'bg-amber-100 text-amber-800');
      action = `<button class="btn btn-green btn-xl" data-action="visitor-enter" data-id="${esc(v.id)}">✔ כניסה</button>`;
    } else if (v.status === V.INSIDE) {
      info = `<span class="font-semibold text-emerald-700">נמצא בשטח מאז ${fmtTs(v.entryAt)}</span> · שומר: ${esc(v.guardName)}`;
      action = `<button class="btn btn-amber btn-xl" data-action="visitor-leave" data-id="${esc(v.id)}">⮌ יציאה</button>`;
    } else {
      info = `נכנס ${fmtTs(v.entryAt)} · יצא ${fmtTs(v.exitAt)}`;
    }
    return `<article class="card flex flex-col gap-3 border-s-8 ${border}">
      <div>
        <div class="break-words text-xl font-extrabold sm:text-2xl">${esc(v.firstName)} ${esc(v.lastName)}</div>
        <div class="text-lg text-slate-600">ת"ז / דרכון: <span class="font-bold text-slate-800">${esc(v.idNumber)}</span></div>
        <div class="text-slate-600">מטרה: ${esc(v.purpose)} · אישר/ה: ${esc(v.approvedBy)}</div>
      </div>
      <div class="flex flex-wrap gap-2">${armed}${escort}</div>
      ${v.notes ? `<div class="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-base font-semibold text-amber-900">📝 ${esc(v.notes)}</div>` : ''}
      ${info ? `<div class="text-slate-600">${info}</div>` : ''}
      ${action}
    </article>`;
  }

  function renderGuardVisitors() {
    const today = todayStr();
    const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const searching = tokens.length > 0;
    const match = v => {
      const hay = `${v.firstName} ${v.lastName} ${v.idNumber}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    };
    // בלי חיפוש: מוזמני היום + מי שעדיין בשטח. עם חיפוש: כל הרשומות (גם של תאריך אחר) – עם תווית תאריך.
    const visible = state.visitors.filter(v => searching
      ? match(v) : (v.status === V.INSIDE || (v.visitDate === today && v.status !== V.LEFT)));
    const inside = sortBy(visible.filter(v => v.status === V.INSIDE), v => v.entryAt || 0, -1);
    const pending = sortBy(visible.filter(v => v.status === V.PENDING), v => v.visitDate + v.lastName);
    const left = sortBy(state.visitors.filter(v => v.status === V.LEFT
      && (searching ? match(v) : dateStr(new Date(v.exitAt || 0)) === today)), v => v.exitAt || 0, -1);

    const section = (title, cls, items) => items.length
      ? `<div><h3 class="mb-3 text-xl font-extrabold ${cls}">${title} (${items.length})</h3>
          <div class="grid gap-4 lg:grid-cols-2">${items.map(visitorCard).join('')}</div></div>` : '';
    $('#guard-visitors').innerHTML =
      section('🟢 נמצאים בשטח', 'text-emerald-700', inside) +
      section('🕓 ממתינים לכניסה', 'text-brand-700', pending) ||
      empty(searching ? 'לא נמצאו מבקרים התואמים לחיפוש' : 'אין מבקרים מוזמנים להיום');
    $('#guard-visitors-left-count').textContent = left.length;
    $('#guard-visitors-left').innerHTML = left.map(visitorCard).join('')
      || '<p class="py-2 text-slate-500">אין מבקרים שיצאו</p>';
  }

  // ───────── רינדור כללי ─────────
  function syncTabs() {
    const allowed = allowedViews();
    const view = allowed.includes(state.view) ? state.view : (allowed[0] || state.view);   // בלי לדרוס את state (המנהל עוד עלול להתחבר)
    $('#nav-staff').classList.toggle('hidden', !allowed.includes('staff'));
    $('#nav-guard').classList.toggle('hidden', !allowed.includes('guard'));
    $('#nav-records').classList.toggle('hidden', !allowed.includes('records'));
    $('#nav-admin').classList.toggle('hidden', !allowed.includes('admin'));
    $$('[data-action="view"]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    $('#view-staff').classList.toggle('hidden', view !== 'staff');
    $('#view-guard').classList.toggle('hidden', view !== 'guard');
    $('#view-records').classList.toggle('hidden', view !== 'records');
    $('#view-admin').classList.toggle('hidden', view !== 'admin');
    $$('[data-action="staff-tab"]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.staffTab));
    $('#staff-students').classList.toggle('hidden', state.staffTab !== 'students');
    $('#staff-visitors').classList.toggle('hidden', state.staffTab !== 'visitors');
    $$('[data-action="guard-tab"]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.guardTab));
    $('#guard-students-panel').classList.toggle('hidden', state.guardTab !== 'students');
    $('#guard-visitors-panel').classList.toggle('hidden', state.guardTab !== 'visitors');
    $$('[data-action="guard-range"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.range === state.guardRange));
    $('#guard-students-today').classList.toggle('hidden', state.guardRange !== 'today');
    $('#guard-students-future').classList.toggle('hidden', state.guardRange !== 'future');
  }

  function renderCounts() {
    const today = todayStr();
    const sPending = state.students.filter(s => s.exitDate === today && s.status === S.PENDING).length;
    const vActive = state.visitors.filter(v => v.status === V.INSIDE || (v.visitDate === today && v.status === V.PENDING)).length;
    ['staff', 'guard'].forEach(who => {
      $(`#cnt-${who}-students`).textContent = sPending;
      $(`#cnt-${who}-visitors`).textContent = vActive;
    });
    $('#guard-name-warn').classList.toggle('hidden', !!state.guardName.trim());
  }

  // ───────── מסך ניהול (מנהל בלבד): מי מורשה להשתמש במערכת ─────────
  const emailId = e => String(e).trim().toLowerCase();

  function renderUsers() {
    const box = $('#users-list');
    const badge = $('#cnt-admin-pending');
    if (!isAdmin()) { box.innerHTML = ''; badge.classList.add('hidden'); return; }
    const by = st => sortBy(state.users.filter(u => u.status === st), u => u.createdAt || 0, -1);
    const pending = by(U.PENDING), approved = by(U.APPROVED), blocked = by(U.BLOCKED);
    badge.textContent = pending.length;
    badge.classList.toggle('hidden', !pending.length);

    const btn = (act, id, label, cls) => `<button class="btn ${cls} btn-sm" data-action="${act}" data-id="${esc(id)}">${label}</button>`;
    const roleField = (u, editable) => editable
      ? `<select class="field !w-auto !py-1.5 !text-sm" data-role-input="${esc(u.id)}" aria-label="תפקיד">
          ${ROLE_OPTIONS.map(r => `<option value="${r}" ${(u.role || 'staff') === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select>`
      : `<span class="badge bg-slate-100 text-slate-600">${ROLE_LABEL[u.role] || ROLE_LABEL.staff}</span>`;
    const row = (u, actions, editableRole) => `<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div class="min-w-0"><bdi class="break-all font-bold">${esc(u.email)}</bdi>
          <div class="text-sm text-slate-500">${u.name ? esc(u.name) + ' · ' : ''}נרשם/ה ${fmtTs(u.createdAt)}</div></div>
        <div class="flex flex-wrap items-center gap-2">${roleField(u, editableRole)}${actions}</div></div>`;
    const section = (title, cls, items, actionsFor, editableRole) => items.length
      ? `<section><h3 class="mb-2 text-lg font-extrabold ${cls}">${title} (${items.length})</h3>
          <div class="space-y-2">${items.map(u => row(u, actionsFor(u), editableRole)).join('')}</div></section>` : '';
    box.innerHTML =
      section('⏳ ממתינים לאישור', 'text-amber-700', pending,
        u => btn('user-approve', u.id, '✔ אשר', 'btn-green') + btn('user-block', u.id, 'חסום', 'btn-danger'), true) +
      section('✅ מורשים', 'text-emerald-700', approved,
        u => btn('user-block', u.id, 'חסום', 'btn-danger') + btn('user-remove', u.id, 'הסר', 'btn-ghost'), true) +
      section('🚫 חסומים', 'text-red-700', blocked,
        u => btn('user-approve', u.id, 'אשר', 'btn-green') + btn('user-remove', u.id, 'הסר', 'btn-ghost'), false) ||
      empty('עדיין אין משתמשים. הוסיפו אימייל, או המתינו שמישהו יתחבר עם Google.');
  }

  function renderAll() {
    renderChrome();
    renderUsers();
    renderCounts();
    renderStaffStudents();
    renderStaffVisitors();
    renderGuardStudents();
    renderGuardVisitors();
  }

  function setView(view) {
    state.view = view;
    history.replaceState(null, '', '#' + view);
    syncTabs();
    window.scrollTo({ top: 0 });
  }

  // ───────── פעולות שומר / צוות ─────────
  const busy = new Set();
  async function once(id, fn) {
    if (busy.has(id)) return;
    busy.add(id);
    try { await fn(); } finally { busy.delete(id); }
  }

  function requireGuard() {
    const name = state.guardName.trim();
    if (!name) {
      toast('יש להזין את שם השומר לפני ביצוע הפעולה', 'err');
      $('#guard-name').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return name;
  }

  function studentExit(id) {
    const s = state.students.find(x => x.id === id);
    const guard = s && requireGuard();
    if (!guard) return;
    if (`${s.exitDate} ${s.exitTime}` > `${todayStr()} ${nowClock()}`
      && !confirm(`השעה המאושרת ליציאה של ${s.studentName} היא ${s.exitTime}.\nלאשר יציאה עכשיו?`)) return;
    once(id, async () => report(
      await run(() => store.transition(COL.students, id, [S.PENDING], { status: S.EXITED, actualExitAt: Date.now(), guardName: guard })),
      `נרשמה יציאה: ${s.studentName}`));
  }

  function studentUndo(id) {
    const s = state.students.find(x => x.id === id);
    if (!s || !confirm(`לבטל את רישום היציאה של ${s.studentName} ולהחזירו לרשימת הממתינים?`)) return;
    once(id, async () => report(
      await run(() => store.transition(COL.students, id, [S.EXITED], { status: S.PENDING, actualExitAt: null, guardName: '' })),
      'רישום היציאה בוטל'));
  }

  function studentCancel(id) {
    const s = state.students.find(x => x.id === id);
    if (!s || !confirm(`לבטל את אישור היציאה של ${s.studentName}?`)) return;
    once(id, async () => report(
      await run(() => store.transition(COL.students, id, [S.PENDING], { status: S.CANCELLED })),
      'האישור בוטל'));
  }

  function visitorEnter(id) {
    const v = state.visitors.find(x => x.id === id);
    const guard = v && requireGuard();
    if (!guard) return;
    if (v.visitDate !== todayStr()
      && !confirm(`${v.firstName} ${v.lastName} מאושר/ת לתאריך ${fmtDate(v.visitDate)} ולא להיום.\nלאשר כניסה בכל זאת?`)) return;
    once(id, async () => report(
      await run(() => store.transition(COL.visitors, id, [V.PENDING], { status: V.INSIDE, entryAt: Date.now(), guardName: guard })),
      `נרשמה כניסה: ${v.firstName} ${v.lastName}`));
  }

  function visitorLeave(id) {
    const v = state.visitors.find(x => x.id === id);
    const guard = v && requireGuard();
    if (!guard) return;
    once(id, async () => report(
      await run(() => store.transition(COL.visitors, id, [V.INSIDE], { status: V.LEFT, exitAt: Date.now(), exitGuardName: guard })),
      `נרשמה יציאה: ${v.firstName} ${v.lastName}`));
  }

  function visitorDelete(id) {
    const v = state.visitors.find(x => x.id === id);
    if (!v || !confirm(`למחוק את אישור הכניסה של ${v.firstName} ${v.lastName}?`)) return;
    once(id, async () => {
      const ok = await run(() => store.remove(COL.visitors, id).then(() => true));
      if (ok) toast('האישור נמחק');
    });
  }

  // פעולות מנהל על משתמשים (users/<email>)
  const userAction = (id, fn, okMsg) => once('u:' + id, async () => {
    if (await run(() => fn().then(() => true))) toast(okMsg);
  });
  const setUserStatus = (id, status, okMsg) => userAction(id, () => store.patch(COL.users, id, { status }), okMsg);

  function removeUser(id) {
    if (!confirm(`להסיר את ${id} מהרשימה? (אם יתחבר שוב, תיפתח בקשה חדשה. כדי לחסום סופית – השתמשו ב"חסום")`)) return;
    userAction(id, () => store.remove(COL.users, id), 'המשתמש הוסר');
  }

  $('#form-user').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const email = emailId(form.elements.email.value);
    const role = form.elements.role.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('כתובת אימייל לא תקינה', 'err');
    const exists = state.users.some(u => u.id === email);
    form.reset();
    userAction(email, () => exists
      ? store.patch(COL.users, email, { status: U.APPROVED, role })
      : store.set(COL.users, email, { email, name: '', status: U.APPROVED, role, createdAt: Date.now(), addedBy: state.user.email }),
    `ניתנה הרשאה: ${email} (${ROLE_LABEL[role] || role})`);
  });

  // ───────── אירועים ─────────
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    switch (action) {
      case 'view': setView(el.dataset.view); break;
      case 'staff-tab': state.staffTab = el.dataset.tab; syncTabs(); break;
      case 'guard-tab': state.guardTab = el.dataset.tab; syncTabs(); break;
      case 'guard-range': state.guardRange = el.dataset.range; syncTabs(); break;
      case 'open-login': showLogin(true); break;
      case 'close-login': if (!gated) showLogin(false); break;
      case 'google-login': googleLogin(); break;
      case 'student-exit': studentExit(id); break;
      case 'student-undo': studentUndo(id); break;
      case 'student-cancel': studentCancel(id); break;
      case 'visitor-enter': visitorEnter(id); break;
      case 'visitor-leave': visitorLeave(id); break;
      case 'visitor-delete': visitorDelete(id); break;
      case 'student-edit': { const s = state.students.find(x => x.id === id); if (s) openEdit('student', s); break; }
      case 'visitor-edit': { const v = state.visitors.find(x => x.id === id); if (v) openEdit('visitor', v); break; }
      case 'close-edit': closeEdit(); break;
      case 'user-approve': {
        const roleEl = document.querySelector(`[data-role-input="${CSS.escape(id)}"]`);
        const patch = roleEl ? { status: U.APPROVED, role: roleEl.value } : { status: U.APPROVED };
        userAction(id, () => store.patch(COL.users, id, patch), 'המשתמש אושר');
        break;
      }
      case 'user-block': setUserStatus(id, U.BLOCKED, 'המשתמש נחסם'); break;
      case 'user-remove': removeUser(id); break;
      case 'logout': store.auth && store.auth.signOut(); break;
    }
  });

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-role-input]');
    if (!el) return;
    userAction(el.dataset.roleInput, () => store.patch(COL.users, el.dataset.roleInput, { role: el.value }), 'התפקיד עודכן');
  });

  $('#guard-name').value = state.guardName;
  $('#guard-name').addEventListener('input', e => {
    state.guardName = e.target.value;
    ls.set('guardName', state.guardName.trim());
    renderCounts();
  });
  $('#visitor-search').addEventListener('input', e => { state.query = e.target.value; renderGuardVisitors(); });

  $('#rec-students-search').addEventListener('input', e => { state.recStudents.query = e.target.value; renderStaffStudents(); });
  $('#rec-students-sort').addEventListener('change', e => { state.recStudents.sort = e.target.value; renderStaffStudents(); });
  $('#rec-visitors-search').addEventListener('input', e => { state.recVisitors.query = e.target.value; renderStaffVisitors(); });
  $('#rec-visitors-sort').addEventListener('change', e => { state.recVisitors.sort = e.target.value; renderStaffVisitors(); });

  // ───────── טפסי צוות ─────────
  const formStudent = $('#form-student');
  const formVisitor = $('#form-visitor');

  function initForms() {
    const by = myDisplayName() || ls.get('staffName');
    formStudent.elements.exitDate.value = todayStr();
    formStudent.elements.exitTime.value = nowClock();
    formStudent.elements.approvedBy.value = by;
    formVisitor.elements.visitDate.value = todayStr();
    formVisitor.elements.approvedBy.value = by;
  }

  const clean = (form, names) => Object.fromEntries(names.map(n => [n, form.elements[n].value.trim()]));

  formStudent.addEventListener('submit', e => {
    e.preventDefault();
    const d = clean(formStudent, ['studentName', 'grade', 'exitDate', 'exitTime', 'approvedBy']);
    if (Object.values(d).some(v => !v)) return toast('יש למלא את כל השדות', 'err');
    ls.set('staffName', d.approvedBy);
    const doc = { ...d, status: S.PENDING, actualExitAt: null, guardName: '', createdAt: Date.now() };
    formStudent.reset();
    initForms();
    run(() => store.add(COL.students, doc).then(() => true)).then(ok => ok && toast(`נוסף אישור יציאה: ${doc.studentName}`));
  });

  formVisitor.addEventListener('submit', e => {
    e.preventDefault();
    const d = clean(formVisitor, ['firstName', 'lastName', 'idNumber', 'purpose', 'visitDate', 'approvedBy']);
    if (Object.values(d).some(v => !v)) return toast('יש למלא את כל השדות', 'err');
    const radio = name => new FormData(formVisitor).get(name);
    if (!radio('escortRequired') || !radio('armedAllowed')) return toast('יש לבחור ליווי ונשק', 'err');
    ls.set('staffName', d.approvedBy);
    const doc = {
      ...d,
      notes: formVisitor.elements.notes.value.trim(),
      escortRequired: radio('escortRequired') === 'yes',
      armedAllowed: radio('armedAllowed') === 'yes',
      status: V.PENDING, entryAt: null, exitAt: null, guardName: '', exitGuardName: '',
      createdAt: Date.now(),
    };
    formVisitor.reset();
    initForms();
    run(() => store.add(COL.visitors, doc).then(() => true)).then(ok => ok && toast(`נוסף אישור כניסה: ${doc.firstName} ${doc.lastName}`));
  });

  // ───────── התחברות ─────────
  // gated (מצב Firebase): התחברות עם Google חובה לכולם, והגישה לנתונים לפי אישור המנהל.
  // מצב הדגמה: חלון "כניסת מנהל" מדומה שאפשר לסגור.
  let gated = false;

  function showLogin(show) {
    $('#login').classList.toggle('hidden', !show);
    $('#login').classList.toggle('flex', show);
    $('#login-close').classList.toggle('hidden', gated);
    $('#login-title').textContent = gated ? '🔒 התחברות למערכת' : '🔑 כניסת מנהל';
    if (show) { $('#login-err').textContent = ''; $('#l-email').focus(); }
  }

  function renderChrome() {
    const admin = isAdmin();
    const role = myRole();
    $('#role-badge').classList.toggle('hidden', !role);
    if (role) $('#role-badge').textContent = ROLE_LABEL[role] || '';
    $('#user-name').classList.toggle('hidden', !state.user);
    $('#user-name').textContent = myDisplayName();
    $('#btn-admin-login').classList.toggle('hidden', admin || gated);
    $('#logout').classList.toggle('hidden', !state.user);
    syncTabs();
  }

  // מסך "ממתין לאישור / נחסם" למשתמש מחובר שאינו מורשה
  const GATE = {
    pending: ['⏳', 'ממתין לאישור המנהל', 'הבקשה נשלחה. ברגע שהמנהל יאשר את החשבון, המסך יתעדכן מעצמו.'],
    blocked: ['🚫', 'הגישה נחסמה', 'המנהל לא אישר גישה לחשבון הזה. לפרטים פנו למנהל.'],
    error: ['⚠️', 'לא ניתן לבדוק הרשאות', 'ודאו שכללי Firestore פורסמו ושהחיבור תקין, ואז נסו שוב.'],
  };
  function showGate(kind) {
    const el = $('#gate');
    el.classList.toggle('hidden', !kind);
    el.classList.toggle('flex', !!kind);
    if (!kind) return;
    [$('#gate-icon').textContent, $('#gate-title').textContent, $('#gate-text').textContent] = GATE[kind];
    $('#gate-email').textContent = state.user ? state.user.email : '';
  }

  // kind: admin | approved → מפעיל את המערכת; pending | blocked | error → מסך המתנה
  function setAccess(kind) {
    const ok = kind === 'admin' || kind === U.APPROVED;
    showGate(ok ? null : kind);
    if (!ok) stop();
    else if (!unsubs.length) start();
  }

  function stopAccessWatch() {
    if (unsubAccess) { unsubAccess(); unsubAccess = null; }
  }

  // משתמש חדש נרשם אוטומטית כ-pending; מאזינים למסמך שלו כדי להגיב מיד לאישור / חסימה מצד המנהל
  async function watchAccess(user) {
    const id = emailId(user.email);
    try {
      if (!(await store.getDoc(COL.users, id))) {
        await store.set(COL.users, id, { email: id, name: user.displayName || '', status: U.PENDING, createdAt: Date.now() });
      }
      if (state.user !== user) return;                      // התנתק בינתיים
      unsubAccess = store.subscribeDoc(COL.users, id,
        doc => {
          state.myRole = (doc && doc.role) || null;
          renderChrome();
          setAccess(doc && Object.values(U).includes(doc.status) ? doc.status : U.PENDING);
        },
        err => { console.error(err); setAccess('error'); });
    } catch (err) {
      console.error(err);
      if (state.user === user) setAccess('error');
    }
  }

  const GOOGLE_ERRORS = {
    'auth/unauthorized-domain': 'הדומיין של האתר לא מורשה ב-Firebase (Authentication → Settings → Authorized domains)',
    'auth/operation-not-allowed': 'התחברות Google לא מופעלת בפרויקט (Authentication → Sign-in method → Google → Enable)',
    'auth/popup-blocked': 'הדפדפן חסם את חלון ההתחברות – אפשרו חלונות קופצים לאתר ונסו שוב',
    'auth/operation-not-supported-in-this-environment': 'ההתחברות לא עובדת כשהקובץ נפתח ישירות מהמחשב (file://). פתחו דרך שרת, למשל http://localhost, או מהאתר המפורסם',
    'auth/network-request-failed': 'בעיית רשת – בדקו חיבור לאינטרנט',
    'auth/web-storage-unsupported': 'הדפדפן חוסם אחסון (עוגיות). בטלו חסימת עוגיות / מצב פרטי ונסו שוב',
  };

  async function googleLogin() {
    const out = $('#login-err');
    out.textContent = '';
    if (location.protocol === 'file:') { out.textContent = GOOGLE_ERRORS['auth/operation-not-supported-in-this-environment']; return; }
    try {
      await store.auth.signInGoogle();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error(err);
      out.textContent = `${GOOGLE_ERRORS[err.code] || 'ההתחברות עם Google נכשלה'} [${err.code || err.message}]`;
    }
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('#login-err').textContent = '';
    try {
      await store.auth.signIn(f.elements.email.value.trim(), f.elements.password.value);
      f.reset();
    } catch (err) {
      console.error(err);
      $('#login-err').textContent = 'ההתחברות נכשלה – בדקו אימייל וסיסמה';
    }
  });

  // ───────── הפעלה ─────────
  function stop() {
    unsubs.forEach(u => u());
    unsubs = [];
    state.students = [];
    state.visitors = [];
    state.users = [];
    if (!state.user) state.myRole = null;
    $('#app').classList.add('hidden');
    renderAll();
  }

  // ממלא ברירת מחדל לשם המאשר/השומר מתוך חשבון ה-Google המחובר (אם עוד לא הוזן שם ידנית)
  function applyIdentityDefaults() {
    const name = myDisplayName();
    if (name && !ls.get('guardName')) {
      state.guardName = name;
      ls.set('guardName', name);
      $('#guard-name').value = name;
    }
    initForms();
  }

  function start() {
    stop();
    $('#app').classList.remove('hidden');
    applyIdentityDefaults();
    subErrorShown = false;
    setConn(store.mode === 'local' ? 'demo' : 'connecting');
    const onData = (key) => (list, fromCache) => {
      state[key] = list;
      if (store.mode === 'firebase') setConn(fromCache ? 'offline' : 'live');
      renderAll();
    };
    const onError = err => {
      console.error(err);
      setConn('error');
      if (!subErrorShown) { subErrorShown = true; toast(errMsg(err), 'err'); }
    };
    unsubs = [
      store.subscribe(COL.students, onData('students'), onError),
      store.subscribe(COL.visitors, onData('visitors'), onError),
    ];
    if (isAdmin()) unsubs.push(store.subscribe(COL.users, onData('users'), onError));
  }

  function boot() {
    const key = (CFG.firebase && CFG.firebase.apiKey) || '';
    const demo = !key || key.startsWith('YOUR_');
    try {
      store = demo ? createLocalStore() : createFirebaseStore();
    } catch (err) {
      console.error(err);
      const el = $('#fatal');
      el.textContent = errMsg(err);
      el.classList.remove('hidden');
      return;
    }
    $('#demo-banner').classList.toggle('hidden', !demo);
    initForms();
    const hash = location.hash.slice(1);
    state.view = ['guard', 'records', 'admin'].includes(hash) ? hash : 'staff';
    syncTabs();
    renderAll();

    gated = store.mode === 'firebase';
    $('#btn-google').classList.toggle('hidden', !gated);                  // Google – רק מול Firebase
    $('#login-password-part').classList.toggle('hidden', gated);          // אימייל+סיסמה – רק בהדגמה
    $('#login-note').classList.toggle('hidden', !gated);
    $('#demo-admin-hint').textContent = demo
      ? `כניסת מנהל להדגמה: ${adminEmails()[0] || '(הגדירו adminEmails)'} / ${CFG.demoAdminPassword || 'admin'}` : '';
    store.auth.onChange(user => {
      state.user = user;
      if (!gated) { showLogin(false); start(); return; }
      stopAccessWatch();
      stop();
      if (!user) { showGate(null); showLogin(true); return; }
      showLogin(false);
      if (isAdmin()) setAccess('admin'); else watchAccess(user);
    });
    setInterval(renderAll, 30000);                       // מעדכן "הגיע הזמן ליציאה" ומעבר יום
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
  }

  boot();
})();
