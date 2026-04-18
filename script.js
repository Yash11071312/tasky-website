// ═══ STATE ═══
let CU = null, tasks = [], notes = [], curF = 'All';
let mode = 'login';
let pieC, barC;
let mobile = window.innerWidth <= 768;
window.addEventListener('resize', () => { mobile = window.innerWidth <= 768; });

// ═══ STORAGE ═══
const LS = {
  users: () => JSON.parse(localStorage.getItem('tky_u') || '[]'),
  setUsers: u => localStorage.setItem('tky_u', JSON.stringify(u)),
  tasks: () => CU ? JSON.parse(localStorage.getItem(`tky_t_${CU.id}`) || '[]') : [],
  setTasks: t => localStorage.setItem(`tky_t_${CU.id}`, JSON.stringify(t)),
  notes: () => CU ? JSON.parse(localStorage.getItem(`tky_n_${CU.id}`) || '[]') : [],
  setNotes: n => localStorage.setItem(`tky_n_${CU.id}`, JSON.stringify(n)),
  stats: () => CU ? JSON.parse(localStorage.getItem(`tky_s_${CU.id}`) || '{"streak":0,"last":"","done":0,"sessions":0}') : {},
  setStats: s => localStorage.setItem(`tky_s_${CU.id}`, JSON.stringify(s)),
  settings: () => JSON.parse(localStorage.getItem('tky_cfg') || '{"theme":"dark"}'),
  setSettings: s => localStorage.setItem('tky_cfg', JSON.stringify(s)),
};

function today() { return new Date().toISOString().split('T')[0]; }

// ═══ THEME ═══
function applyTheme() {
  const cfg = LS.settings();
  document.body.classList.toggle('light', cfg.theme === 'light');
}
function toggleTheme() {
  const cfg = LS.settings();
  cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark';
  LS.setSettings(cfg);
  applyTheme();
}

// ═══ AUTH ═══
function authMode(m) {
  mode = m;
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', i === (m === 'login' ? 0 : 1)));
  document.getElementById('authBtn').textContent = m === 'login' ? 'Sign In' : 'Create Account';
}

function doAuth() {
  const u = document.getElementById('au').value.trim();
  const p = document.getElementById('ap').value;
  if (!u || !p) return toast('Please fill in all fields');
  if (p.length < 3) return toast('Password must be at least 3 characters');
  const users = LS.users();
  if (mode === 'signup') {
    if (users.find(x => x.u.toLowerCase() === u.toLowerCase())) return toast('Username already taken');
    users.push({ id: Date.now().toString(), u, p, at: new Date().toISOString() });
    LS.setUsers(users);
    toast('Account created! Sign in now ✓');
    authMode('login');
  } else {
    const user = users.find(x => x.u.toLowerCase() === u.toLowerCase() && x.p === p);
    if (!user) return toast('Invalid username or password');
    localStorage.setItem('tky_session', user.id);
    boot(user);
  }
}

function checkSession() {
  const sid = localStorage.getItem('tky_session');
  if (!sid) return;
  const user = LS.users().find(x => x.id === sid);
  if (user) boot(user);
}

function boot(user) {
  CU = user;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').classList.add('on');
  document.getElementById('sAvatar').textContent = user.u[0].toUpperCase();
  document.getElementById('sName').textContent = user.u;
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${g}, ${user.u} 👋`;
  tasks = LS.tasks();
  notes = LS.notes();
  renderTasks();
  renderNotes();
  updateStreak();
  const sesKey = `tky_ses_${user.id}_${today()}`;
  timerSessions = parseInt(localStorage.getItem(sesKey) || '0');
  document.getElementById('sCnt').textContent = timerSessions;
  if (Notification.permission !== 'granted') Notification.requestPermission();
}

function logout() {
  localStorage.removeItem('tky_session');
  location.reload();
}

// ═══ NAV ═══
function go(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById(v + 'View').classList.add('active');
  document.querySelectorAll('.nl').forEach(l => l.classList.toggle('active', l.dataset.v === v));
  document.querySelectorAll('.mn').forEach(l => l.classList.toggle('active', l.dataset.v === v));
  if (v === 'analytics') updateAnalytics();
}

// ═══ TASKS ═══
function setF(f) {
  curF = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.f === f));
  renderTasks();
}

function renderTasks() {
  tasks = LS.tasks();
  const q = (document.getElementById('srch')?.value || '').toLowerCase();
  const sort = document.getElementById('sortSel')?.value || 'date';
  const pri = { High: 0, Medium: 1, Low: 2 };

  let list = tasks.filter(t => {
    if (q && !t.text.toLowerCase().includes(q)) return false;
    if (curF === 'All') return true;
    if (curF === 'Done') return t.done;
    if (curF === 'Pending') return !t.done;
    if (curF === 'Today') return t.date === today();
    return t.priority === curF;
  });

  if (sort === 'priority') list.sort((a,b) => pri[a.priority] - pri[b.priority]);
  else if (sort === 'date') list.sort((a,b) => (a.date||'9999') < (b.date||'9999') ? -1 : 1);
  else list.sort((a,b) => b.id - a.id);

  const el = document.getElementById('taskList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📋</div><p>${q ? 'No tasks match your search' : 'No tasks here yet'}</p></div>`;
  } else {
    el.innerHTML = list.map(t => {
      const od = !t.done && t.date && t.date < today();
      const ds = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : '';
      return `<div class="ti ${t.done?'done':''}" id="ti-${t.id}">
        <div class="tcheck ${t.done?'on':''}" onclick="toggleTask('${t.id}')"></div>
        <div class="tbody">
          <div class="tt">${esc(t.text)}</div>
          <div class="tmeta">
            <div class="pdot d${t.priority[0]}"></div>
            <span class="badge b${t.priority}">${t.priority}</span>
            ${ds ? `<span class="tdate ${od?'badge bOD':''}">${od?'⚠ ':'📅 '}${ds}</span>` : ''}
            ${t.cat ? `<span class="tcat">· ${esc(t.cat)}</span>` : ''}
          </div>
        </div>
        <div class="tactions">
          <button class="tbtn" onclick="openTask('${t.id}')" title="Edit">✏️</button>
          <button class="tbtn" onclick="delTask('${t.id}')" title="Delete">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }
  updateDash();
}

function updateDash() {
  tasks = LS.tasks();
  const total = tasks.length, done = tasks.filter(t => t.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('stTotal').textContent = total;
  document.getElementById('stDone').textContent = done;
  document.getElementById('stPend').textContent = total - done;
  document.getElementById('pBar').style.width = pct + '%';
  document.getElementById('pPct').textContent = pct + '%';
}

function openTask(eid) {
  tasks = LS.tasks();
  const t = eid ? tasks.find(x => x.id === eid) : null;
  const title = t ? 'Edit Task' : 'Add Task';
  const fill = (s, v) => { const el = document.getElementById(s); if (el) el.value = v; };

  fill('tTxt', t?.text || ''); fill('tPri', t?.priority || 'Medium');
  fill('tDate', t?.date || today()); fill('tCat', t?.cat || ''); fill('tEid', eid || '');
  fill('tTxtD', t?.text || ''); fill('tPriD', t?.priority || 'Medium');
  fill('tDateD', t?.date || today()); fill('tCatD', t?.cat || ''); fill('tEidD', eid || '');

  document.getElementById('tBSTitle').textContent = title;
  document.getElementById('tMDTitle').textContent = title;
  const show = eid ? 'inline-flex' : 'none';
  document.getElementById('tDelBtn').style.display = show;
  document.getElementById('tDelBtnD').style.display = show;

  openPanel('taskBS', 'taskMD');
}

function saveTask() { _saveTask(v('tTxt'), v('tPri'), v('tDate'), v('tCat'), v('tEid')); }
function saveTaskD() { _saveTask(v('tTxtD'), v('tPriD'), v('tDateD'), v('tCatD'), v('tEidD')); }

function _saveTask(text, pri, date, somecat, eid) {
  text = text.trim();
  if (!text) return toast('Task text is required');
  tasks = LS.tasks();
  if (eid) {
    const i = tasks.findIndex(t => t.id === eid);
    if (i > -1) tasks[i] = { ...tasks[i], text, priority: pri, date, cat: somecat };
    toast('Task updated ✓');
  } else {
    tasks.push({ id: Date.now().toString(), text, priority: pri, date, cat: somecat, done: false, at: new Date().toISOString() });
    toast('Task added ✓');
  }
  LS.setTasks(tasks);
  closeAll(); renderTasks();
}

function toggleTask(id) {
  tasks = LS.tasks();
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) { const s = LS.stats(); s.done = (s.done||0)+1; LS.setStats(s); }
  LS.setTasks(tasks);
  renderTasks(); updateStreak();
}

function deleteTaskBS() { _delTask(v('tEid')); }
function deleteTaskMD() { _delTask(v('tEidD')); }
function delTask(id) { if (confirm('Delete this task?')) _delTask(id); }
function _delTask(id) {
  if (!id) return;
  LS.setTasks(LS.tasks().filter(t => t.id !== id));
  tasks = LS.tasks();
  closeAll(); renderTasks(); toast('Task deleted');
}

function updateStreak() {
  const s = LS.stats(), td = today();
  if (s.last !== td) {
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const ys = yd.toISOString().split('T')[0];
    s.streak = s.last === ys ? (s.streak||0)+1 : 1;
    s.last = td;
    LS.setStats(s);
  }
}

let tInterval = null, tTotal = 25*60, tLeft = 25*60, tRunning = false;
let tMode = 'focus', timerSessions = 0, tActiveMin = 25;
const CIRC = 2 * Math.PI * 96;

function updateTimerUI() {
  const m = Math.floor(tLeft/60), s = tLeft%60;
  document.getElementById('tDisp').textContent = `${m}:${s.toString().padStart(2,'0')}`;
  const pct = tLeft / tTotal;
  document.getElementById('tArc').style.strokeDashoffset = CIRC * (1 - pct);
}

function toggleTimer() { tRunning ? pauseTimer() : startTimer(); }
function startTimer() {
  tRunning = true; document.getElementById('tBtn').textContent = '⏸ Pause';
  tInterval = setInterval(() => { tLeft--; updateTimerUI(); if (tLeft <= 0) timerDone(); }, 1000);
}
function pauseTimer() { tRunning = false; clearInterval(tInterval); document.getElementById('tBtn').textContent = '▶ Resume'; }
function resetTimer() { clearInterval(tInterval); tRunning = false; tLeft = tTotal; document.getElementById('tBtn').textContent = '▶ Start'; updateTimerUI(); }
function skipTimer() { if (tRunning || tLeft < tTotal) timerDone(); }

function timerDone() {
  clearInterval(tInterval); tRunning = false; document.getElementById('tBtn').textContent = '▶ Start';
  if (tMode === 'focus') {
    timerSessions++; document.getElementById('sCnt').textContent = timerSessions;
    localStorage.setItem(`tky_ses_${CU.id}_${today()}`, timerSessions);
    const s = LS.stats(); s.sessions = (s.sessions||0)+1; LS.setStats(s);
    const dots = document.querySelectorAll('.sdot'); dots.forEach((d,i) => d.classList.toggle('on', i < (timerSessions%4 || 4)));
    toast('🎉 Focus session complete!');
    if (Notification.permission === 'granted') new Notification('Tasky', { body: 'Session done!' });
    tMode = 'break'; setPreset(5, 'Break', false);
  } else { toast('Break over!'); tMode = 'focus'; setPreset(tActiveMin, 'Focus', false); }
  document.getElementById('tLbl').textContent = tMode === 'focus' ? 'Focus' : 'Break';
  tLeft = tTotal; updateTimerUI();
}

function setPreset(min, lbl, updateActive=true) {
  if (updateActive) tActiveMin = min; tTotal = min * 60; tLeft = tTotal;
  clearInterval(tInterval); tRunning = false; document.getElementById('tBtn').textContent = '▶ Start';
  document.getElementById('tLbl').textContent = lbl;
  document.querySelectorAll('.preset').forEach(p => p.classList.toggle('active', parseInt(p.dataset.m) === min));
  updateTimerUI();
}

function renderNotes() {
  notes = LS.notes(); const g = document.getElementById('notesGrid');
  if (!notes.length) { g.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>No notes yet.</p></div>'; return; }
  g.innerHTML = notes.slice().reverse().map(n => `
    <div class="card note-card" onclick="openNote('${n.id}')">
      <h4>${esc(n.title || 'Untitled')}</h4>
      <p>${esc(n.content || '')}</p>
      <div class="nd">${new Date(n.at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
    </div>`).join('');
}

function openNote(eid) {
  notes = LS.notes(); const n = eid ? notes.find(x => x.id === eid) : null;
  document.getElementById('nTit').value = n?.title || ''; document.getElementById('nCon').value = n?.content || '';
  document.getElementById('nEid').value = eid || ''; document.getElementById('nTitD').value = n?.title || '';
  document.getElementById('nConD').value = n?.content || ''; document.getElementById('nEidD').value = eid || '';
  const show = eid ? 'inline-flex' : 'none';
  document.getElementById('nDelBtn').style.display = show; document.getElementById('nDelBtnD').style.display = show;
  openPanel('noteBS', 'noteMD');
}

function saveNote() { _saveNote(v('nTit'), v('nCon'), v('nEid')); }
function saveNoteD() { _saveNote(v('nTitD'), v('nConD'), v('nEidD')); }

function _saveNote(title, content, eid) {
  title = title.trim(); content = content.trim(); if (!title && !content) return toast('Write something first');
  notes = LS.notes();
  if (eid) { const i = notes.findIndex(n => n.id === eid); if (i > -1) notes[i] = { ...notes[i], title, content }; }
  else { notes.push({ id: Date.now().toString(), title, content, at: new Date().toISOString() }); }
  LS.setNotes(notes); closeAll(); renderNotes(); toast('Note saved ✓');
}

function deleteNoteBS() { _delNote(v('nEid')); }
function deleteNoteMD() { _delNote(v('nEidD')); }
function _delNote(id) { if (!id) return; LS.setNotes(LS.notes().filter(n => n.id !== id)); closeAll(); renderNotes(); toast('Note deleted'); }

function openPanel(bsId, mdId) {
  document.getElementById('ov').classList.add('on');
  if (mobile) { document.getElementById(bsId).classList.add('on'); }
  else { document.getElementById(mdId).classList.add('on'); }
}

function closeAll() {
  document.querySelectorAll('.bs').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('on'));
  document.getElementById('ov').classList.remove('on');
}

function toast(msg, dur=3000) {
  const wrap = document.getElementById('toasts'); const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; wrap.appendChild(el);
  setTimeout(() => { el.style.animation = 'tout .3s ease forwards'; setTimeout(() => el.remove(), 300); }, dur);
}

function v(id) { return document.getElementById(id)?.value || ''; }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(); checkSession(); updateTimerUI();
  document.getElementById('tArc').style.strokeDasharray = CIRC;
  document.getElementById('tArc').style.strokeDashoffset = 0;
  document.getElementById('ap').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  document.getElementById('au').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('ap').focus(); });
});