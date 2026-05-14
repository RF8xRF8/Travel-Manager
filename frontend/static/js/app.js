/* ═══════════════════════════════════════════════════════════
   Travel Manager — Frontend App
   ═══════════════════════════════════════════════════════════ */

// ── API ──────────────────────────────────────────────────────

async function api(method, path, body, isForm) {
  const opts = { method, credentials: 'include' };
  if (body) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const GET = (path) => api('GET', path);
const POST = (path, body, isForm) => api('POST', path, body, isForm);
const PUT = (path, body) => api('PUT', path, body);
const DELETE = (path) => api('DELETE', path);

// ── Toast ──────────────────────────────────────────────────

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Modal ──────────────────────────────────────────────────

function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

// ── Auth ──────────────────────────────────────────────────

async function checkAuth() {
  try {
    const data = await GET('/me');
    if (data.logged_in) showApp();
    else showLogin();
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  navigate('dashboard');
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    await POST('/login', { username, password });
    showApp();
  } catch {
    errEl.classList.remove('hidden');
  }
}

async function doLogout() {
  await POST('/logout');
  showLogin();
}

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ── Navigation ────────────────────────────────────────────

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  // Close mobile sidebar
  document.querySelector('.sidebar').classList.remove('open');
  // Load page
  const loaders = { dashboard: loadDashboard, visas: loadVisas, applications: loadApplications, travels: loadTravels, history: loadHistory };
  if (loaders[page]) loaders[page]();
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// Restore theme
const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', savedTheme);

// ── Helpers ──────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return d.slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

function statusLabel(status) {
  return { pending: '待使用', active: '生效中', expired: '已失效' }[status] || status;
}

function statusClass(status) {
  return { pending: 'status-pending', active: 'status-active', expired: 'status-expired' }[status] || '';
}

function resultDotHtml(result) {
  return `<span class="result-dot result-${result}"></span>${result}`;
}

function entriesHtml(total, used) {
  if (total < 0 || total > 10) return `<span class="tag">不限次数</span>`;
  const dots = Array.from({ length: total }, (_, i) =>
    `<span class="entry-dot${i < used ? ' used' : ''}"></span>`
  ).join('');
  return `<div class="entries-bar"><div class="entries-dots">${dots}</div><span class="entries-label">${used}/${total} 次</span></div>`;
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📄';
  return '📎';
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;
  try {
    const data = await GET('/dashboard');
    renderDashboard(el, data);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">加载失败: ${e.message}</div>`;
  }
}

function renderDashboard(el, data) {
  const { in_travel, current_country, days_in, visa_alerts, stats, recent_travels } = data;

  let bannerHtml = '';
  if (in_travel) {
    bannerHtml = `
      <div class="travel-banner">
        <div class="travel-banner-content">
          <h2>✈️ 旅行中 · ${current_country}</h2>
          <p>您目前正在 ${current_country}，已入境</p>
        </div>
        <div class="travel-days">${days_in}<small style="font-size:.4em;opacity:.7"> 天</small></div>
      </div>`;
  } else {
    bannerHtml = `
      <div class="card" style="padding:18px 24px;margin-bottom:24px;display:flex;align-items:center;gap:14px;">
        <span style="font-size:1.8rem">🏠</span>
        <div>
          <div style="font-weight:700;font-size:1rem;">您目前未在旅途中</div>
          <div style="font-size:.85rem;color:var(--text-3);margin-top:2px;">记录一次入境行程即可开始追踪</div>
        </div>
      </div>`;
  }

  let alertsHtml = '';
  if (visa_alerts.length > 0) {
    alertsHtml = visa_alerts.map(v => {
      const warn = v.expiry_warning;
      const remLabel = v.days_remaining != null
        ? (v.days_remaining < 0 ? `<span style="color:var(--danger);font-weight:600;">已过期 ${Math.abs(v.days_remaining)} 天</span>` : `剩余 <strong>${v.days_remaining}</strong> 天`)
        : '无期限限制';
      return `
        <div class="warning-card" style="${warn ? '' : 'background:var(--success-light);border-color:var(--accent-light);'}">
          <div class="icon">${warn ? '⚠️' : '🛂'}</div>
          <div>
            <strong style="${warn ? 'color:#92400e' : 'color:var(--accent)'}">${v.country} 签证${warn ? ' — 即将到期！' : ''}</strong>
            <p style="font-size:.83rem;margin-top:2px;color:var(--text-2);">
              有效期至 ${fmtDate(v.valid_to)} · ${remLabel} ·
              剩余次数：${v.remaining_entries < 0 ? '不限' : v.remaining_entries}
            </p>
          </div>
        </div>`;
    }).join('');
  }

  const recentHtml = recent_travels.length > 0
    ? recent_travels.map(t => `
        <div class="travel-item">
          <div class="travel-type-icon ${t.type}">
            ${t.type === 'entry' ? '🛬' : '🛫'}
          </div>
          <div class="travel-item-content">
            <div class="travel-item-country">${t.country}</div>
            <div class="travel-item-meta">${fmtDate(t.date)} · ${t.type === 'entry' ? '入境' : '离境'}${t.remarks ? ' · ' + t.remarks : ''}</div>
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px"><p>暂无行程记录</p></div>`;

  el.innerHTML = `
    <div class="page-title">仪表盘</div>
    <div class="page-subtitle">${new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div>
    ${bannerHtml}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">待使用签证</div><div class="stat-value">${stats.pending}</div></div>
      <div class="stat-card accent"><div class="stat-label">生效中签证</div><div class="stat-value">${stats.active}</div></div>
      <div class="stat-card"><div class="stat-label">已失效签证</div><div class="stat-value">${stats.expired}</div></div>
      <div class="stat-card"><div class="stat-label">进行中申请</div><div class="stat-value">${stats.pending_applications}</div></div>
    </div>
    ${alertsHtml ? `<div class="section-header"><div class="section-title">⚠️ 签证提醒</div></div>${alertsHtml}` : ''}
    <div class="section-header">
      <div class="section-title">最近行程</div>
      <button class="btn btn-sm btn-outline" onclick="navigate('travels')">查看全部</button>
    </div>
    <div class="card">
      ${recentHtml}
    </div>`;
}

// ══════════════════════════════════════════════════════════
// VISAS
// ══════════════════════════════════════════════════════════

let currentVisaFilter = 'all';

async function loadVisas() {
  const el = document.getElementById('page-visas');
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;
  try {
    const visas = await GET('/visas');
    renderVisas(el, visas);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">加载失败: ${e.message}</div>`;
  }
}

function renderVisas(el, visas) {
  const counts = { all: visas.length, pending: 0, active: 0, expired: 0 };
  visas.forEach(v => counts[v.status]++);

  const filtered = currentVisaFilter === 'all' ? visas : visas.filter(v => v.status === currentVisaFilter);

  const tabsHtml = ['all','pending','active','expired'].map(s =>
    `<button class="tab ${currentVisaFilter === s ? 'active' : ''}" onclick="filterVisas('${s}')" >
      ${{ all: '全部', pending: '待使用', active: '生效中', expired: '已失效' }[s]} <span style="font-size:.75rem;opacity:.6">${counts[s]}</span>
    </button>`
  ).join('');

  const cardsHtml = filtered.length > 0
    ? `<div class="visa-grid">${filtered.map(visaCardHtml).join('')}</div>`
    : `<div class="empty-state"><div class="icon">🗂️</div><p>暂无${currentVisaFilter === 'all' ? '' : { pending:'待使用', active:'生效中', expired:'已失效' }[currentVisaFilter]}签证</p></div>`;

  el.innerHTML = `
    <div class="page-title">签证管理</div>
    <div class="page-subtitle">管理您的所有签证信息</div>
    <div class="section-header">
      <div class="tabs">${tabsHtml}</div>
      <button class="btn btn-primary" onclick="showAddVisaModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        添加签证
      </button>
    </div>
    ${cardsHtml}`;
}

function filterVisas(f) {
  currentVisaFilter = f;
  loadVisas();
}

function visaCardHtml(v) {
  const remaining = v.total_entries > 0 ? v.total_entries - v.used_entries : -1;
  const daysLeft = daysUntil(v.valid_to);
  const expirySoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
  const expired = daysLeft !== null && daysLeft < 0;

  const imgHtml = v.file_path
    ? `<img class="visa-img-thumb" src="/api/files/${encodeURIComponent(v.file_path)}" alt="签证图片" onclick="previewImg(this.src)">`
    : '';

  const entriesDisplay = v.total_entries < 0
    ? `<div class="entries-bar"><span class="tag">不限次数</span></div>`
    : entriesHtml(Math.min(v.total_entries, 10), v.used_entries);

  return `
    <div class="visa-card" id="visa-${v.id}">
      ${expirySoon || expired ? `<div style="position:absolute;top:12px;right:12px;font-size:.75rem;background:${expired ? 'var(--danger)' : 'var(--warning)'};color:white;padding:2px 8px;border-radius:20px;font-weight:600;">
        ${expired ? '已过期' : `${daysLeft}天后到期`}
      </div>` : ''}
      <div class="visa-card-top">
        <div class="visa-country">🌏 ${v.country}</div>
        <span class="visa-status-badge ${statusClass(v.status)}">${statusLabel(v.status)}</span>
      </div>
      ${imgHtml}
      ${entriesDisplay}
      <div class="visa-info">
        <div class="visa-info-item">
          <label>有效期起</label>
          <span>${fmtDate(v.valid_from)}</span>
        </div>
        <div class="visa-info-item">
          <label>有效期止</label>
          <span style="${expirySoon ? 'color:var(--warning);font-weight:700' : expired ? 'color:var(--danger);font-weight:700' : ''}">${fmtDate(v.valid_to)}</span>
        </div>
        <div class="visa-info-item">
          <label>签证号码</label>
          <span style="font-family:var(--mono);font-size:.82rem">${v.visa_number || '—'}</span>
        </div>
        <div class="visa-info-item">
          <label>添加时间</label>
          <span>${fmtDate(v.created_at)}</span>
        </div>
      </div>
      ${v.remarks ? `<div style="font-size:.82rem;color:var(--text-2);margin-bottom:12px;padding:8px 10px;background:var(--surface-2);border-radius:var(--radius-xs);">💬 ${v.remarks}</div>` : ''}
      <div class="visa-card-actions">
        ${v.status !== 'expired' ? `<button class="btn btn-sm btn-danger" onclick="expireVisa(${v.id})">结束签证</button>` : ''}
        ${v.status === 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="activateVisa(${v.id})">手动激活</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="showVisaHistory(${v.id})">变更历史</button>
        <button class="btn btn-sm btn-danger" style="margin-left:auto" onclick="deleteVisa(${v.id})">删除</button>
      </div>
    </div>`;
}

function showAddVisaModal() {
  openModal('添加签证', `
    <div class="form-group"><label>签证国家 *</label><input type="text" id="v-country" placeholder="例：日本"></div>
    <div class="form-row">
      <div class="form-group"><label>有效期起</label><input type="date" id="v-from"></div>
      <div class="form-group"><label>有效期止</label><input type="date" id="v-to"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>可用次数</label>
        <select id="v-entries">
          <option value="1">单次</option>
          <option value="2">双次</option>
          <option value="3">三次</option>
          <option value="5">五次</option>
          <option value="-1">不限次数（多次）</option>
        </select>
      </div>
      <div class="form-group"><label>签证号码</label><input type="text" id="v-number" placeholder="可选"></div>
    </div>
    <div class="form-group"><label>备注</label><textarea id="v-remarks" rows="2" placeholder="可选"></textarea></div>
    <div class="form-group">
      <label>签证页图片</label>
      <input type="file" id="v-file" accept="image/*,.pdf">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitAddVisa()">保存签证</button>
    </div>`);
}

async function submitAddVisa() {
  const country = document.getElementById('v-country').value.trim();
  if (!country) { toast('请填写签证国家', 'error'); return; }
  const fd = new FormData();
  fd.append('country', country);
  fd.append('valid_from', document.getElementById('v-from').value);
  fd.append('valid_to', document.getElementById('v-to').value);
  fd.append('total_entries', document.getElementById('v-entries').value);
  fd.append('visa_number', document.getElementById('v-number').value);
  fd.append('remarks', document.getElementById('v-remarks').value);
  const fileEl = document.getElementById('v-file');
  if (fileEl.files[0]) fd.append('file', fileEl.files[0]);
  try {
    await POST('/visas', fd, true);
    toast('签证已添加');
    closeModal();
    loadVisas();
  } catch(e) { toast(e.message, 'error'); }
}

async function expireVisa(id) {
  openModal('结束签证', `
    <p style="margin-bottom:16px;color:var(--text-2);">请输入结束原因：</p>
    <div class="form-group"><textarea id="expire-reason" rows="3" placeholder="例：签证已使用完毕、主动结束..."></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmExpireVisa(${id})">确认结束</button>
    </div>`);
}

async function confirmExpireVisa(id) {
  const reason = document.getElementById('expire-reason').value.trim() || '手动结束';
  try {
    await PUT(`/visas/${id}/status`, { status: 'expired', reason });
    toast('签证已标记为已失效');
    closeModal();
    loadVisas();
  } catch(e) { toast(e.message, 'error'); }
}

async function activateVisa(id) {
  try {
    await PUT(`/visas/${id}/status`, { status: 'active', reason: '手动激活' });
    toast('签证已激活');
    loadVisas();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteVisa(id) {
  if (!confirm('确定删除该签证？此操作不可撤销。')) return;
  try {
    await DELETE(`/visas/${id}`);
    toast('已删除');
    loadVisas();
  } catch(e) { toast(e.message, 'error'); }
}

async function showVisaHistory(id) {
  try {
    const data = await GET(`/visas/${id}`);
    const histHtml = data.history.length > 0
      ? `<div class="timeline">${data.history.map(h => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-date">${fmtDate(h.changed_at)}</div>
            <div class="timeline-label">${h.old_status ? statusLabel(h.old_status) + ' → ' : ''}${statusLabel(h.new_status)}</div>
            ${h.reason ? `<div class="timeline-note">${h.reason}</div>` : ''}
          </div>`).join('')}</div>`
      : '<p style="color:var(--text-3)">暂无变更记录</p>';
    openModal(`${data.visa.country} 签证状态历史`, histHtml);
  } catch(e) { toast(e.message, 'error'); }
}

function previewImg(src) {
  const overlay = document.createElement('div');
  overlay.className = 'img-preview-overlay';
  overlay.innerHTML = `<img src="${src}" alt="预览">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════
// VISA APPLICATIONS
// ══════════════════════════════════════════════════════════

async function loadApplications() {
  const el = document.getElementById('page-applications');
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;
  try {
    const apps = await GET('/applications');
    renderApplications(el, apps);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">加载失败: ${e.message}</div>`;
  }
}

function renderApplications(el, apps) {
  const listHtml = apps.length > 0
    ? apps.map(appCardHtml).join('')
    : `<div class="empty-state"><div class="icon">📋</div><p>暂无申请记录</p></div>`;

  el.innerHTML = `
    <div class="page-title">签证申请</div>
    <div class="page-subtitle">追踪签证申请进度与结果</div>
    <div class="section-header">
      <div></div>
      <button class="btn btn-primary" onclick="showAddApplicationModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建申请
      </button>
    </div>
    <div id="app-list">${listHtml}</div>`;
}

function appCardHtml(a) {
  const lastHistory = a.status_history[a.status_history.length - 1];
  const lastDate = lastHistory ? fmtDate(lastHistory.change_date) : '—';

  return `
    <div class="app-card">
      <div class="app-card-header" onclick="toggleAppCard(${a.id})">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          <div style="font-size:1rem;font-weight:700;white-space:nowrap">🌏 ${a.country}</div>
          ${a.application_type ? `<span class="tag">${a.application_type}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:.82rem;color:var(--text-2)">${a.current_status}</div>
          <div style="font-size:.82rem;display:flex;align-items:center">${resultDotHtml(a.visa_result)}</div>
          <div style="font-size:.78rem;color:var(--text-3)">${lastDate}</div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="chevron-${a.id}"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="app-card-body" id="app-body-${a.id}">
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px">
          <div><div class="stat-label">申请日期</div><div style="font-weight:600">${fmtDate(a.apply_date)}</div></div>
          <div><div class="stat-label">申请类型</div><div style="font-weight:600">${a.application_type || '—'}</div></div>
          <div><div class="stat-label">当前状态</div><div style="font-weight:600">${a.current_status}</div></div>
          <div><div class="stat-label">签证结果</div><div style="font-weight:600;display:flex;align-items:center">${resultDotHtml(a.visa_result)}</div></div>
        </div>

        <div class="divider"></div>
        <div style="font-weight:600;font-size:.85rem;margin-bottom:12px;color:var(--text-2)">状态时间线</div>
        <div class="timeline">
          ${a.status_history.map(h => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-date">${fmtDate(h.change_date)}</div>
              <div class="timeline-label">${h.status}</div>
              ${h.note ? `<div class="timeline-note">${h.note}</div>` : ''}
            </div>`).join('')}
        </div>

        ${a.files.length > 0 ? `
          <div class="divider"></div>
          <div style="font-weight:600;font-size:.85rem;margin-bottom:10px;color:var(--text-2)">上传文件 (${a.files.length})</div>
          <div class="file-list">
            ${a.files.map(f => `
              <div class="file-item">
                <span>${fileIcon(f.file_name)}</span>
                <span class="file-item-name">${f.file_name}</span>
                <a href="/api/files/${encodeURIComponent(f.file_path)}" target="_blank" class="btn btn-xs btn-secondary">查看</a>
              </div>`).join('')}
          </div>` : ''}

        <div class="divider"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary" onclick="showUpdateStatusModal(${a.id})">更新状态</button>
          <button class="btn btn-sm btn-secondary" onclick="showUpdateResultModal(${a.id}, '${a.country}', '${a.visa_result}')">更新结果</button>
          <button class="btn btn-sm btn-secondary" onclick="showUploadFilesModal(${a.id})">上传文件</button>
          <button class="btn btn-sm btn-danger" style="margin-left:auto" onclick="deleteApplication(${a.id})">删除</button>
        </div>
      </div>
    </div>`;
}

function toggleAppCard(id) {
  const body = document.getElementById('app-body-' + id);
  body.classList.toggle('open');
}

function showAddApplicationModal() {
  openModal('新建签证申请', `
    <div class="form-row">
      <div class="form-group"><label>申请国家 *</label><input type="text" id="ap-country" placeholder="例：法国"></div>
      <div class="form-group">
        <label>申请类型</label>
        <select id="ap-type">
          <option value="">请选择...</option>
          <option value="旅游">旅游</option>
          <option value="商务">商务</option>
          <option value="探亲">探亲</option>
          <option value="学习">学习</option>
          <option value="工作">工作</option>
          <option value="其他">其他</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>申请日期</label><input type="date" id="ap-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>备注</label><textarea id="ap-remarks" rows="2" placeholder="可选"></textarea></div>
    <div class="form-group">
      <label>上传文件（支持多选）</label>
      <input type="file" id="ap-files" multiple accept="image/*,.pdf">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitAddApplication()">保存</button>
    </div>`);
}

async function submitAddApplication() {
  const country = document.getElementById('ap-country').value.trim();
  if (!country) { toast('请填写申请国家', 'error'); return; }
  const fd = new FormData();
  fd.append('country', country);
  fd.append('application_type', document.getElementById('ap-type').value);
  fd.append('apply_date', document.getElementById('ap-date').value);
  fd.append('remarks', document.getElementById('ap-remarks').value);
  const files = document.getElementById('ap-files').files;
  for (const f of files) fd.append('files', f);
  try {
    await POST('/applications', fd, true);
    toast('申请已创建');
    closeModal();
    loadApplications();
  } catch(e) { toast(e.message, 'error'); }
}

const STATUS_LIST = ['开始申请','资料准备完成','已寄送','已入馆','已出签','已领取','其他'];

function showUpdateStatusModal(id) {
  openModal('更新申请状态', `
    <div class="form-group">
      <label>新状态</label>
      <select id="new-status">
        ${STATUS_LIST.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>变更日期</label><input type="date" id="status-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>备注</label><input type="text" id="status-note" placeholder="可选"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitUpdateStatus(${id})">保存</button>
    </div>`);
}

async function submitUpdateStatus(id) {
  const status = document.getElementById('new-status').value;
  const change_date = document.getElementById('status-date').value;
  const note = document.getElementById('status-note').value;
  try {
    const res = await PUT(`/applications/${id}/status`, { status, change_date, note });
    toast('状态已更新');
    closeModal();
    loadApplications();
  } catch(e) { toast(e.message, 'error'); }
}

function showUpdateResultModal(id, country, currentResult) {
  openModal('更新签证结果', `
    <div class="form-group">
      <label>签证结果</label>
      <select id="new-result" onchange="onResultChange()">
        ${['未送签','审查中','已签发','拒签','降级签发'].map(r =>
          `<option value="${r}" ${r === currentResult ? 'selected' : ''}>${r}</option>`
        ).join('')}
      </select>
    </div>
    <div id="issued-fields" class="hidden">
      <div class="alert alert-info">签证已签发！系统将自动在"签证管理"中创建一条新签证记录。</div>
      <div class="form-row">
        <div class="form-group"><label>有效期起</label><input type="date" id="ri-from"></div>
        <div class="form-group"><label>有效期止</label><input type="date" id="ri-to"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>签证号码</label><input type="text" id="ri-number"></div>
        <div class="form-group">
          <label>次数</label>
          <select id="ri-entries">
            <option value="1">单次</option>
            <option value="2">双次</option>
            <option value="-1">不限次数（多次）</option>
          </select>
        </div>
      </div>
    </div>
    <div id="downgrade-fields" class="hidden">
      <div class="alert alert-warning">降级签发 — 请填写实际签发的签证信息。</div>
      <div class="form-group"><label>实际签发国家</label><input type="text" id="rd-country" value="${country}"></div>
      <div class="form-row">
        <div class="form-group"><label>有效期起</label><input type="date" id="rd-from"></div>
        <div class="form-group"><label>有效期止</label><input type="date" id="rd-to"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>签证号码</label><input type="text" id="rd-number"></div>
        <div class="form-group">
          <label>次数</label>
          <select id="rd-entries"><option value="1">单次</option><option value="-1">不限次数</option></select>
        </div>
      </div>
      <div class="form-group"><label>备注</label><textarea id="rd-remarks" rows="2"></textarea></div>
    </div>
    <div class="form-group"><label>结果说明</label><textarea id="result-note" rows="2" placeholder="可选"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitUpdateResult(${id})">保存</button>
    </div>`);
  onResultChange();
}

function onResultChange() {
  const val = document.getElementById('new-result')?.value;
  document.getElementById('issued-fields')?.classList.toggle('hidden', val !== '已签发');
  document.getElementById('downgrade-fields')?.classList.toggle('hidden', val !== '降级签发');
}

async function submitUpdateResult(id) {
  const result = document.getElementById('new-result').value;
  const result_note = document.getElementById('result-note').value;
  const body = { result, result_note };

  if (result === '已签发') {
    body.valid_from = document.getElementById('ri-from').value;
    body.valid_to = document.getElementById('ri-to').value;
    body.visa_number = document.getElementById('ri-number').value;
    body.total_entries = parseInt(document.getElementById('ri-entries').value);
  } else if (result === '降级签发') {
    body.visa_info = {
      country: document.getElementById('rd-country').value,
      valid_from: document.getElementById('rd-from').value,
      valid_to: document.getElementById('rd-to').value,
      visa_number: document.getElementById('rd-number').value,
      total_entries: parseInt(document.getElementById('rd-entries').value),
      remarks: document.getElementById('rd-remarks').value
    };
  }

  try {
    await PUT(`/applications/${id}/result`, body);
    toast('结果已更新');
    closeModal();
    loadApplications();
  } catch(e) { toast(e.message, 'error'); }
}

function showUploadFilesModal(id) {
  openModal('上传文件', `
    <div class="form-group">
      <label>选择文件（支持多选）</label>
      <input type="file" id="upload-files" multiple accept="image/*,.pdf">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitUploadFiles(${id})">上传</button>
    </div>`);
}

async function submitUploadFiles(id) {
  const files = document.getElementById('upload-files').files;
  if (!files.length) { toast('请选择文件', 'error'); return; }
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  try {
    await POST(`/applications/${id}/files`, fd, true);
    toast('文件已上传');
    closeModal();
    loadApplications();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteApplication(id) {
  if (!confirm('确定删除该申请记录？')) return;
  try {
    await DELETE(`/applications/${id}`);
    toast('已删除');
    loadApplications();
  } catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// TRAVELS
// ══════════════════════════════════════════════════════════

async function loadTravels() {
  const el = document.getElementById('page-travels');
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;
  try {
    const [travels, visas] = await Promise.all([GET('/travels'), GET('/visas')]);
    renderTravels(el, travels, visas);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">加载失败: ${e.message}</div>`;
  }
}

function renderTravels(el, travels, visas) {
  const recent = travels.slice(0, 15);
  const pendingVisas = visas.filter(v => v.status === 'pending' || v.status === 'active');

  const visaOptions = pendingVisas.map(v =>
    `<option value="${v.id}">[${statusLabel(v.status)}] ${v.country} ${v.valid_to ? '(至' + fmtDate(v.valid_to) + ')' : ''}</option>`
  ).join('');

  const listHtml = recent.length > 0
    ? recent.map(t => `
        <div class="travel-item">
          <div class="travel-type-icon ${t.type}">${t.type === 'entry' ? '🛬' : '🛫'}</div>
          <div class="travel-item-content">
            <div class="travel-item-country">${t.country} <span style="font-size:.8rem;color:var(--text-3);font-weight:400">${t.type === 'entry' ? '入境' : '离境'}</span></div>
            <div class="travel-item-meta">${fmtDate(t.date)}${t.remarks ? ' · ' + t.remarks : ''}${t.visa_country ? ' · 使用签证: ' + t.visa_country : ''}</div>
          </div>
          <button class="btn btn-xs btn-danger" onclick="deleteTravel(${t.id})">×</button>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px"><p>暂无行程记录</p></div>`;

  el.innerHTML = `
    <div class="page-title">行程记录</div>
    <div class="page-subtitle">记录入境与离境行程</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start" class="travel-layout">
      <div class="card">
        <div class="card-header"><div class="card-title">添加行程</div></div>
        <div class="card-body">
          <div class="form-group">
            <label>行程类型</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;padding:10px;border:1.5px solid var(--accent);border-radius:var(--radius-xs);cursor:pointer;font-weight:500;color:var(--accent);background:var(--accent-ultra)">
                <input type="radio" name="ttype" value="entry" checked style="width:auto"> 🛬 入境
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:10px;border:1.5px solid var(--border);border-radius:var(--radius-xs);cursor:pointer;font-weight:500">
                <input type="radio" name="ttype" value="exit" style="width:auto"> 🛫 离境
              </label>
            </div>
          </div>
          <div class="form-group"><label>国家/地区 *</label><input type="text" id="t-country" placeholder="例：日本"></div>
          <div class="form-group"><label>日期</label><input type="date" id="t-date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="form-group">
            <label>关联签证（可选）</label>
            <select id="t-visa">
              <option value="">不关联签证</option>
              ${visaOptions}
            </select>
            <div class="form-hint">入境时选择签证将自动更新签证状态</div>
          </div>
          <div class="form-group"><label>备注</label><textarea id="t-remarks" rows="2" placeholder="可选"></textarea></div>
          <button class="btn btn-primary btn-block" onclick="submitAddTravel()">记录行程</button>
        </div>
      </div>
      <div>
        <div class="section-header">
          <div class="section-title">最近行程</div>
          <button class="btn btn-sm btn-outline" onclick="navigate('history')">查看全部</button>
        </div>
        <div class="card">
          ${listHtml}
        </div>
      </div>
    </div>`;

  // Responsive
  const layout = el.querySelector('.travel-layout');
  if (window.innerWidth < 700) layout.style.gridTemplateColumns = '1fr';
}

async function submitAddTravel() {
  const country = document.getElementById('t-country').value.trim();
  if (!country) { toast('请填写国家', 'error'); return; }
  const type = document.querySelector('input[name="ttype"]:checked').value;
  const date = document.getElementById('t-date').value;
  const visa_id = document.getElementById('t-visa').value || null;
  const remarks = document.getElementById('t-remarks').value;
  try {
    await POST('/travels', { country, type, date, visa_id: visa_id ? parseInt(visa_id) : null, remarks });
    toast(`行程已记录 (${type === 'entry' ? '入境' : '离境'})`);
    loadTravels();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteTravel(id) {
  if (!confirm('确定删除该行程记录？')) return;
  try {
    await DELETE(`/travels/${id}`);
    toast('已删除');
    loadTravels();
  } catch(e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════

async function loadHistory() {
  const el = document.getElementById('page-history');
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;
  try {
    const travels = await GET('/travels');
    renderHistory(el, travels);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">加载失败: ${e.message}</div>`;
  }
}

function renderHistory(el, travels) {
  if (!travels.length) {
    el.innerHTML = `<div class="page-title">行程历史</div><div class="empty-state" style="margin-top:40px"><div class="icon">🗺️</div><p>暂无行程记录</p></div>`;
    return;
  }

  // Group by year-month
  const groups = {};
  travels.forEach(t => {
    const ym = t.date.slice(0, 7);
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(t);
  });

  const groupsHtml = Object.keys(groups).sort().reverse().map(ym => {
    const [year, month] = ym.split('-');
    const items = groups[ym].map(t => `
      <div class="travel-item">
        <div class="travel-type-icon ${t.type}">${t.type === 'entry' ? '🛬' : '🛫'}</div>
        <div class="travel-item-content">
          <div class="travel-item-country">${t.country} <span style="font-size:.8rem;color:var(--text-3);font-weight:400">${t.type === 'entry' ? '入境' : '离境'}</span></div>
          <div class="travel-item-meta">${fmtDate(t.date)}${t.remarks ? ' · ' + t.remarks : ''}${t.visa_country ? ' · 签证: ' + t.visa_country : ''}</div>
        </div>
      </div>`).join('');

    return `
      <div style="margin-bottom:24px">
        <div style="font-size:.82rem;font-weight:700;color:var(--text-3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          <span>${year}年${month}月</span>
          <span style="height:1px;flex:1;background:var(--border)"></span>
        </div>
        <div class="card">${items}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="page-title">行程历史</div>
    <div class="page-subtitle">共 ${travels.length} 条行程记录</div>
    ${groupsHtml}`;
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

checkAuth();
