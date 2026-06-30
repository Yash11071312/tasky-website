// STATE
let CU = null, tasks = [], notes = [], curF = 'All';
let taskStats = null, recentActivity = [];
let authStep = 'email';
let pieC, barC;
let mobile = window.innerWidth <= 768;
window.addEventListener('resize', () => { mobile = window.innerWidth <= 768; });

// STORAGE
const LS = {
  notes: () => CU ? JSON.parse(localStorage.getItem(`tky_n_${CU.id}`) || '[]') : [],
  setNotes: n => localStorage.setItem(`tky_n_${CU.id}`, JSON.stringify(n)),
  settings: () => JSON.parse(localStorage.getItem('tky_cfg') || '{"theme":"dark"}'),
  setSettings: s => localStorage.setItem('tky_cfg', JSON.stringify(s)),
};

const API_URL = 'https://tasky-website.onrender.com/api';

function today() { return new Date().toISOString().split('T')[0]; }

// API
function token() { return localStorage.getItem('token'); }

function normalizeUser(user) {
  if (!user) return null;
  const name = user.name || user.u || user.email?.split('@')[0] || 'User';
  return {
    ...user,
    id: user._id || user.id,
    u: name,
    at: user.joinDate || user.at || user.createdAt,
  };
}

function normalizeTask(task) {
  if (!task) return task;
  return {
    ...task,
    id: task._id || task.id,
    text: task.text || task.title,
    cat: task.cat || task.category || '',
    date: task.date || (task.dueDate ? String(task.dueDate).split('T')[0] : ''),
    done: Boolean(task.done ?? task.completed),
    doneAt: task.doneAt || task.completedAt,
    at: task.at || task.createdAt,
  };
}

function storeAuth(auth) {
  localStorage.setItem('token', auth.token);
  localStorage.setItem('user', JSON.stringify(auth.user));
  return normalizeUser(auth.user);
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function expireSession() {
  clearAuth();
  toast('Session expired. Please login again.');
  setTimeout(() => location.reload(), 900);
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const authToken = token();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const expireOnUnauthorized = options.expireOnUnauthorized !== false;
  delete options.expireOnUnauthorized;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    toast('Network error. Please check your connection.');
    throw error;
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (expireOnUnauthorized) expireSession();
    else toast(data.message || 'Invalid OTP');
    throw new Error(data.message || 'Unauthorized');
  }
  if (!res.ok) {
    const message = data.message || 'Request failed';
    toast(message);
    throw new Error(message);
  }
  return data;
}

function login(email) {
  return apiRequest('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

function verifyOTP(email, otp) {
  return apiRequest('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
    expireOnUnauthorized: false,
  });
}

function getProfile() { return apiRequest('/auth/profile'); }
function getTasks() { return apiRequest('/tasks'); }
function createTask(task) {
  return apiRequest('/tasks', { method: 'POST', body: JSON.stringify(task) });
}
function updateTask(id, task) {
  return apiRequest(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
}
function deleteTask(id) {
  return apiRequest(`/tasks/${id}`, { method: 'DELETE' });
}
function getTaskStats() { return apiRequest('/tasks/stats'); }
function getRecentActivity() { return apiRequest('/tasks/activity'); }

async function refreshCloudData() {
  const [taskList, stats, activity] = await Promise.all([
    getTasks(),
    getTaskStats(),
    getRecentActivity(),
  ]);
  tasks = taskList.map(normalizeTask);
  taskStats = stats;
  recentActivity = activity;
}

// THEME
function applyTheme() {
  const cfg = LS.settings();
  document.body.classList.toggle('light', cfg.theme === 'light');
}
function toggleTheme() {
  const cfg = LS.settings();
  cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark';
  LS.setSettings(cfg);
  applyTheme();
  updateAnalytics();
}

// AUTH
function setAuthStep(step) {
  authStep = step;
  const isOtp = step === 'otp';
  document.getElementById('otpField').style.display = isOtp ? 'block' : 'none';
  document.getElementById('sendOtpBtn').style.display = isOtp ? 'none' : 'block';
  document.getElementById('verifyOtpBtn').style.display = isOtp ? 'block' : 'none';
  document.getElementById('otpActions').style.display = isOtp ? 'flex' : 'none';
  document.getElementById('authEmail').disabled = isOtp;
  document.getElementById('authHint').textContent = isOtp
    ? 'Enter the 6-digit code sent to your email.'
    : "We'll email a secure login code.";
  if (!isOtp) document.getElementById('authOtp').value = '';
}

function authEmail() {
  return document.getElementById('authEmail').value.trim().toLowerCase();
}

async function sendOtpCode() {
  const email = authEmail();
  const btn = document.getElementById('sendOtpBtn');

  if (!email) return toast('A valid email is required');
  btn.disabled = true;

  try {
    await login(email);
    console.log('OTP sent');
    setAuthStep('otp');
    document.getElementById('authOtp').focus();
    toast('OTP sent successfully');
  } catch (error) {
    console.error(error);
  } finally {
    btn.disabled = false;
  }
}

async function verifyOtpCode() {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const otp = document.getElementById('authOtp').value.trim();
  const btn = document.getElementById('verifyOtpBtn');

  if (!email) return toast('A valid email is required');
  if (!/^\d{6}$/.test(otp)) return toast('Enter a valid 6-digit OTP');
  btn.disabled = true;

  try {
    const auth = await verifyOTP(email, otp);
    console.log('OTP verified');
    const user = storeAuth(auth);
    await boot(user);
  } catch (error) {
    console.error(error);
  } finally {
    btn.disabled = false;
  }
}

function handleAuth() {
  return authStep === 'otp' ? verifyOtpCode() : sendOtpCode();
}

async function resendOtpCode() {
  const email = authEmail();
  const btn = document.querySelector('#otpActions button');

  if (!email) return toast('A valid email is required');
  btn.disabled = true;

  try {
    await login(email);
    console.log('OTP sent');
    document.getElementById('authOtp').value = '';
    document.getElementById('authOtp').focus();
    toast('OTP sent successfully');
  } catch (error) {
    console.error(error);
  } finally {
    btn.disabled = false;
  }
}

function backToEmail() {
  setAuthStep('email');
  document.getElementById('authEmail').disabled = false;
  document.getElementById('authEmail').focus();
}

async function checkSession() {
  if (!token()) return;
  try {
    const user = normalizeUser(await getProfile());
    localStorage.setItem('user', JSON.stringify(user));
    await boot(user);
  } catch (error) {
    if (token()) toast('Could not restore your session');
  }
}

async function boot(user) {
  CU = user;
  await refreshCloudData();
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').classList.add('on');
  document.getElementById('sAvatar').textContent = user.u[0].toUpperCase();
  document.getElementById('sName').textContent = user.u;
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${g}, ${user.u}`;
  notes = LS.notes();
  renderTasks();
  renderNotes();
  renderSettings();
  renderActivity();
}

function logout() {
  clearAuth();
  location.reload();
}

// NAV
function go(v) {
  const allowed = ['dashboard', 'notes', 'analytics', 'settings'];
  if (!allowed.includes(v)) v = 'dashboard';
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById(v + 'View').classList.add('active');
  document.querySelectorAll('.nl').forEach(l => l.classList.toggle('active', l.dataset.v === v));
  document.querySelectorAll('.mn').forEach(l => l.classList.toggle('active', l.dataset.v === v));
  if (v === 'analytics') updateAnalytics();
  if (v === 'settings') renderSettings();
}

// TASKS
function setF(f) {
  curF = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.f === f));
  renderTasks();
}

function renderTasks() {
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

  if (sort === 'priority') list.sort((a, b) => pri[a.priority] - pri[b.priority]);
  else if (sort === 'date') list.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);
  else list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const el = document.getElementById('taskList');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">&#128203;</div><p>${q ? 'No tasks match your search' : 'No tasks here yet'}</p></div>`;
  } else {
    el.innerHTML = list.map(t => {
      const od = !t.done && t.date && t.date < today();
      const ds = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
      return `<div class="ti ${t.done ? 'done' : ''}" id="ti-${t.id}">
        <div class="tcheck ${t.done ? 'on' : ''}" onclick="toggleTask('${t.id}')"></div>
        <div class="tbody">
          <div class="tt">${esc(t.text)}</div>
          <div class="tmeta">
            <div class="pdot d${t.priority[0]}"></div>
            <span class="badge b${t.priority}">${t.priority}</span>
            ${ds ? `<span class="tdate ${od ? 'badge bOD' : ''}">${od ? 'Overdue ' : ''}${ds}</span>` : ''}
            ${t.cat ? `<span class="tcat">- ${esc(t.cat)}</span>` : ''}
          </div>
        </div>
        <div class="tactions">
          <button class="tbtn" onclick="openTask('${t.id}')" title="Edit">Edit</button>
          <button class="tbtn" onclick="delTask('${t.id}')" title="Delete">Del</button>
        </div>
      </div>`;
    }).join('');
  }
  updateDash();
}

function updateDash() {
  const total = taskStats?.total ?? tasks.length;
  const done = taskStats?.completed ?? tasks.filter(t => t.done).length;
  const pending = taskStats?.pending ?? total - done;
  const pct = taskStats?.completionPercentage ?? (total ? Math.round(done / total * 100) : 0);
  document.getElementById('stTotal').textContent = total;
  document.getElementById('stDone').textContent = done;
  document.getElementById('stPend').textContent = pending;
  document.getElementById('pBar').style.width = pct + '%';
  document.getElementById('pPct').textContent = pct + '%';
}

function openTask(eid) {
  const t = eid ? tasks.find(x => x.id === eid) : null;
  const title = t ? 'Edit Task' : 'Add Task';
  const fill = (s, value) => { const el = document.getElementById(s); if (el) el.value = value; };

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

async function _saveTask(text, pri, date, cat, eid) {
  text = text.trim();
  if (!text) return toast('Task text is required');
  try {
    if (eid) {
      const updated = normalizeTask(await updateTask(eid, { text, priority: pri, date, cat }));
      const i = tasks.findIndex(t => t.id === eid);
      if (i > -1) tasks[i] = updated;
      toast('Task updated');
    } else {
      const created = normalizeTask(await createTask({ text, priority: pri, date, cat }));
      tasks.unshift(created);
      toast('Task added');
    }
    await refreshTaskMeta();
    closeAll();
    renderTasks();
  } catch (error) {
    console.error(error);
  }
}

async function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  try {
    const updated = normalizeTask(await updateTask(id, { done: !t.done }));
    const i = tasks.findIndex(x => x.id === id);
    if (i > -1) tasks[i] = updated;
    await refreshTaskMeta();
    renderTasks();
  } catch (error) {
    console.error(error);
  }
}

function deleteTaskBS() { _delTask(v('tEid')); }
function deleteTaskMD() { _delTask(v('tEidD')); }
function delTask(id) { if (confirm('Delete this task?')) _delTask(id); }
async function _delTask(id) {
  if (!id) return;
  try {
    await deleteTask(id);
    tasks = tasks.filter(t => t.id !== id);
    await refreshTaskMeta();
    closeAll();
    renderTasks();
    toast('Task deleted');
  } catch (error) {
    console.error(error);
  }
}

async function refreshTaskMeta() {
  const [stats, activity] = await Promise.all([getTaskStats(), getRecentActivity()]);
  taskStats = stats;
  recentActivity = activity;
  renderActivity();
  if (document.getElementById('analyticsView')?.classList.contains('active')) updateAnalytics();
}

function completionStreak() {
  const days = new Set(tasks.filter(t => t.done).map(t => (t.doneAt || t.date || t.at || '').split('T')[0]).filter(Boolean));
  let count = 0;
  const d = new Date(today() + 'T12:00:00');
  while (days.has(d.toISOString().split('T')[0])) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function renderActivity() {
  const el = document.getElementById('activityList');
  if (!el) return;
  if (!recentActivity.length) {
    el.innerHTML = '<div class="empty"><p>No recent activity yet.</p></div>';
    return;
  }
  el.innerHTML = recentActivity.map(a => `
    <div class="activity-item">
      <span>${esc(a.type || 'Task updated')}</span>
      <strong>${esc(a.text || '')}</strong>
      <span class="activity-time">${a.at ? new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span>
    </div>`).join('');
}

// NOTES
function renderNotes() {
  notes = LS.notes();
  const g = document.getElementById('notesGrid');
  if (!notes.length) {
    g.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>No notes yet.</p></div>';
    return;
  }
  g.innerHTML = notes.slice().reverse().map(n => `
    <div class="card note-card" onclick="openNote('${n.id}')">
      <h4>${esc(n.title || 'Untitled')}</h4>
      <p>${esc(n.content || '')}</p>
      <div class="nd">${new Date(n.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
    </div>`).join('');
}

function openNote(eid) {
  notes = LS.notes();
  const n = eid ? notes.find(x => x.id === eid) : null;
  document.getElementById('nTit').value = n?.title || '';
  document.getElementById('nCon').value = n?.content || '';
  document.getElementById('nEid').value = eid || '';
  document.getElementById('nTitD').value = n?.title || '';
  document.getElementById('nConD').value = n?.content || '';
  document.getElementById('nEidD').value = eid || '';
  const show = eid ? 'inline-flex' : 'none';
  document.getElementById('nDelBtn').style.display = show;
  document.getElementById('nDelBtnD').style.display = show;
  openPanel('noteBS', 'noteMD');
}

function saveNote() { _saveNote(v('nTit'), v('nCon'), v('nEid')); }
function saveNoteD() { _saveNote(v('nTitD'), v('nConD'), v('nEidD')); }

function _saveNote(title, content, eid) {
  title = title.trim();
  content = content.trim();
  if (!title && !content) return toast('Write something first');
  notes = LS.notes();
  if (eid) {
    const i = notes.findIndex(n => n.id === eid);
    if (i > -1) notes[i] = { ...notes[i], title, content };
  } else {
    notes.push({ id: Date.now().toString(), title, content, at: new Date().toISOString() });
  }
  LS.setNotes(notes);
  closeAll();
  renderNotes();
  toast('Note saved');
}

function deleteNoteBS() { _delNote(v('nEid')); }
function deleteNoteMD() { _delNote(v('nEidD')); }
function _delNote(id) {
  if (!id) return;
  LS.setNotes(LS.notes().filter(n => n.id !== id));
  closeAll();
  renderNotes();
  toast('Note deleted');
}

// ANALYTICS
function updateAnalytics() {
  if (!CU || !window.Chart) return;
  const total = taskStats?.total ?? tasks.length;
  const done = taskStats?.completed ?? tasks.filter(t => t.done).length;
  const pct = taskStats?.completionPercentage ?? (total ? Math.round(done / total * 100) : 0);

  document.getElementById('sNum').textContent = pct + '%';
  document.getElementById('sArc').style.strokeDashoffset = 402 * (1 - pct / 100);
  document.getElementById('streak').textContent = completionStreak();
  document.getElementById('totDone').textContent = done;
  document.getElementById('totTasks').textContent = total;

  const styles = getComputedStyle(document.body);
  const text2 = styles.getPropertyValue('--text2').trim();
  const border = styles.getPropertyValue('--border').trim();
  const counts = ['High', 'Medium', 'Low'].map(p => tasks.filter(t => t.priority === p).length);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = Array(7).fill(0);
  tasks.filter(t => t.done).forEach(t => {
    const sourceDate = t.doneAt || t.date || t.at;
    byDay[new Date(sourceDate).getDay()]++;
  });

  if (pieC) pieC.destroy();
  if (barC) barC.destroy();

  pieC = new Chart(document.getElementById('pieC'), {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{ data: counts, backgroundColor: ['#ef4444', '#f59e0b', '#10b981'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: text2 } } } }
  });

  barC = new Chart(document.getElementById('barC'), {
    type: 'bar',
    data: {
      labels: weekdays,
      datasets: [{ data: byDay, backgroundColor: '#6366f1', borderRadius: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: text2 }, grid: { color: border } },
        y: { beginAtZero: true, ticks: { color: text2, precision: 0 }, grid: { color: border } }
      }
    }
  });
}

// SETTINGS
function renderSettings() {
  if (!CU) return;
  document.getElementById('setAvatar').textContent = CU.u[0].toUpperCase();
  document.getElementById('setName').textContent = CU.u;
  document.getElementById('setEmail').textContent = CU.email || '';
  const created = CU.at ? new Date(CU.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tasky account';
  document.getElementById('setSince').textContent = `Member since ${created}`;
}

// UI HELPERS
function openPanel(bsId, mdId) {
  document.getElementById('ov').classList.add('on');
  if (mobile) document.getElementById(bsId).classList.add('on');
  else document.getElementById(mdId).classList.add('on');
}

function closeAll() {
  document.querySelectorAll('.bs').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('on'));
  document.getElementById('ov').classList.remove('on');
}

function toast(msg, dur = 3000) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'tout .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, dur);
}

function v(id) { return document.getElementById(id)?.value || ''; }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setAuthStep('email');
  checkSession();
  document.getElementById('authEmail').addEventListener('keydown', e => { if (e.key === 'Enter') sendOtpCode(); });
  document.getElementById('authOtp').addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtpCode(); });
});
