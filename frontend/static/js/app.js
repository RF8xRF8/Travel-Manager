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
  const normalized = parseDateInput(d);
  if (!normalized) return '—';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function localTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return '';

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const normalized = `${year}-${month}-${day}`;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) return '';
  return normalized;
}

function formatDateInput(value) {
  const normalized = parseDateInput(value);
  if (!normalized) return String(value ?? '').replace(/\D/g, '').slice(0, 8);
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateField(input) {
  if (!input) return;
  const cursor = typeof input.selectionStart === 'number' ? input.selectionStart : String(input.value ?? '').length;
  const digitsBeforeCursor = String(input.value ?? '').slice(0, cursor).replace(/\D/g, '').length;
  const digits = String(input.value ?? '').replace(/\D/g, '').slice(0, 8);
  let formatted = digits;
  if (digits.length > 2) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}${digits.length > 4 ? `/${digits.slice(4, 8)}` : ''}`;
  }
  input.value = formatted;

  let nextCursor = formatted.length;
  if (digitsBeforeCursor <= 2) nextCursor = digitsBeforeCursor;
  else if (digitsBeforeCursor <= 4) nextCursor = digitsBeforeCursor + 1;
  else nextCursor = digitsBeforeCursor + 2;
  nextCursor = Math.min(nextCursor, formatted.length);
  try {
    input.setSelectionRange(nextCursor, nextCursor);
  } catch {
    // Some browsers or input states do not support setting the caret.
  }
}

function readDateField(id, label, { required = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return '';
  const raw = el.value.trim();
  if (!raw) {
    if (required) {
      toast(`${label}不能为空`, 'error');
      return null;
    }
    return '';
  }
  const normalized = parseDateInput(raw);
  if (!normalized) {
    toast(`${label}请填写为 DD/MM/YYYY`, 'error');
    return null;
  }
  return normalized;
}

function dateInputValue(value) {
  const normalized = parseDateInput(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const expiryDate = new Date(dateStr);
  expiryDate.setHours(0, 0, 0, 0);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const diff = expiryDate - todayDate;
  return Math.floor(diff / 86400000);
}

function statusLabel(status) {
  const labels = { pending: '待使用', active: '生效中', invalid: '已失效' };
  if (!Object.prototype.hasOwnProperty.call(labels, status)) {
    throw new Error(`未知签证状态: ${status}`);
  }
  return labels[status];
}

function statusClass(status) {
  const classes = { pending: 'status-pending', active: 'status-active', invalid: 'status-expired' };
  if (!Object.prototype.hasOwnProperty.call(classes, status)) {
    throw new Error(`未知签证状态: ${status}`);
  }
  return classes[status];
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['zh-CN'], { type: 'region' })
  : null;

function countryCodeFromInput(value) {
  const text = (value || '').trim();
  return /^[a-zA-Z]{2}$/.test(text) ? text.toUpperCase() : '';
}

function countryNameFromCode(code) {
  const normalized = countryCodeFromInput(code);
  if (!normalized) return '';
  return REGION_NAMES ? (REGION_NAMES.of(normalized) || normalized) : normalized;
}

function countryFlagFromCode(code) {
  const normalized = countryCodeFromInput(code);
  if (!normalized) return '🌏';
  // Convert to flag emoji: A=0x1F1E6, B=0x1F1E7, ... Z=0x1F1FF
  const codePoints = [];
  for (let i = 0; i < normalized.length; i++) {
    codePoints.push(0x1F1E6 + (normalized.charCodeAt(i) - 'A'.charCodeAt(0)));
  }
  return String.fromCodePoint(...codePoints);
}

function countryLabel(country, countryCode) {
  const code = countryCodeFromInput(countryCode) || countryCodeFromInput(country);
  if (code) {
    return `${countryFlagFromCode(code)} ${countryNameFromCode(code)}`;
  }
  return `🌏 ${escapeHtml(country || '—')}`;
}

function fileUrl(filePath) {
  if (!filePath) return '';
  return `/api/files/${encodeURIComponent(String(filePath).replace(/\\/g, '/'))}`;
}

function countryPreviewHtml(inputValue) {
  const code = countryCodeFromInput(inputValue);
  return code ? `<div class="form-hint">识别为 ${escapeHtml(code)}，对应 ${escapeHtml(countryFlagFromCode(code))} ${escapeHtml(countryNameFromCode(code))}</div>` : '';
}

function updateCountryPreview(inputValue) {
  const previewEl = document.getElementById('t-country-preview');
  if (previewEl) {
    previewEl.innerHTML = countryPreviewHtml(inputValue);
  }
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
  if (!stats || !Number.isFinite(stats.pending) || !Number.isFinite(stats.active) || !Number.isFinite(stats.invalid)) {
    throw new Error('仪表盘返回的签证统计字段不完整');
  }
  if (!Array.isArray(visa_alerts) || !Array.isArray(recent_travels)) {
    throw new Error('仪表盘返回的数据结构无效');
  }

  let bannerHtml = '';
  if (in_travel) {
    bannerHtml = `
      <div class="travel-banner">
        <div class="travel-banner-content">
          <h2>✈️ 旅行中 · ${countryLabel(current_country)}</h2>
          <p>您目前正在 ${countryLabel(current_country)}，已入境</p>
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
        ? (v.days_remaining < 0 ? `<span style="color:var(--danger);font-weight:600;white-space:nowrap;">已过期 ${Math.abs(v.days_remaining)} 天</span>` : `<span style="white-space:nowrap;">剩余 <strong>${v.days_remaining}</strong> 天</span>`)
        : '无期限限制';
      return `
        <div class="warning-card" style="${warn ? '' : 'background:var(--success-light);border-color:var(--accent-light);'}">
          <div class="icon">${warn ? '⚠️' : '🛂'}</div>
          <div>
            <strong style="${warn ? 'color:#92400e' : 'color:var(--accent)'}">${countryLabel(v.country, v.country_code)} 签证${warn ? ' — 即将到期！' : ''}</strong>
            <p style="font-size:.83rem;margin-top:2px;color:var(--text-2);white-space:nowrap;">
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
            <div class="travel-item-country">${countryLabel(t.country, t.country_code)}</div>
            <div class="travel-item-meta">${fmtDate(t.date)} · ${t.type === 'entry' ? '入境' : '离境'}${t.remarks ? ' · ' + t.remarks : ''}</div>
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px"><p>暂无行程记录</p></div>`;

  el.innerHTML = `
    <div class="page-title">仪表盘</div>
    <div class="page-subtitle">${new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div>
    ${bannerHtml}
    <div class="stats-grid">
      <div class="stat-card info"><div class="stat-label">待使用签证</div><div class="stat-value">${stats.pending}</div></div>
      <div class="stat-card accent"><div class="stat-label">生效中签证</div><div class="stat-value">${stats.active}</div></div>
      <div class="stat-card muted"><div class="stat-label">已失效签证</div><div class="stat-value">${stats.invalid}</div></div>
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

let currentVisaFilter = 'valid';

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
  if (!Array.isArray(visas)) {
    throw new Error('签证列表返回格式错误');
  }
  const counts = { valid: 0, pending: 0, active: 0, invalid: 0 };
  visas.forEach(v => {
    if (!Object.prototype.hasOwnProperty.call(counts, v.status) || v.status === 'valid') {
      throw new Error(`签证状态非法: ${v.status}`);
    }
    const status = v.status;
    counts[status]++;
    if (status === 'pending' || status === 'active') counts.valid++;
  });

  if (!['valid', 'pending', 'active', 'invalid'].includes(currentVisaFilter)) {
    throw new Error(`签证筛选值非法: ${currentVisaFilter}`);
  }
  const filterKey = currentVisaFilter;

  const filtered = filterKey === 'valid'
    ? visas.filter(v => v.status === 'pending' || v.status === 'active')
    : visas.filter(v => v.status === filterKey);

  const tabsHtml = ['valid','pending','active','invalid'].map(s =>
    `<button class="tab ${currentVisaFilter === s ? 'active' : ''}" onclick="filterVisas('${s}')" >
      ${{ valid: '有效签证', pending: '待使用', active: '生效中', invalid: '已失效' }[s]} <span style="font-size:.75rem;opacity:.6">${counts[s]}</span>
    </button>`
  ).join('');

  const cardsHtml = filtered.length > 0
    ? `<div class="visa-grid">${filtered.map(visaCardHtml).join('')}</div>`
    : `<div class="empty-state"><div class="icon">🗂️</div><p>暂无${{ valid: '有效', pending:'待使用', active:'生效中', invalid:'已失效' }[filterKey]}签证</p></div>`;

  el.innerHTML = `
    <div class="page-title">签证管理</div>
    <div class="page-subtitle">管理您的有效签证信息</div>
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
  const cardClass = [expirySoon ? 'visa-expiry-soon' : '', expired ? 'visa-expired' : ''].filter(Boolean).join(' ');

  let imgHtml = '';
  if (v.files && v.files.length > 0) {
    imgHtml = `<div class="file-list">${v.files.map(f => `
      <div class="file-item">
        <span>${fileIcon(f.file_name)}</span>
        <span class="file-item-name">${escapeHtml(f.file_name)}</span>
        <a href="${fileUrl(f.file_path)}" target="_blank" class="btn btn-xs btn-secondary">查看</a>
      </div>`).join('')}</div>`;
  } else if (v.file_path) {
    const fname = v.file_name || (v.file_path || '').split('/').pop() || '附件';
    imgHtml = `<div class="file-list"><div class="file-item"><span>${fileIcon(fname)}</span><span class="file-item-name">${escapeHtml(fname)}</span><a href="${fileUrl(v.file_path)}" target="_blank" class="btn btn-xs btn-secondary">查看</a></div></div>`;
  }

  const entriesDisplay = v.total_entries < 0
    ? `<div class="entries-bar"><span class="tag">不限次数</span></div>`
    : entriesHtml(Math.min(v.total_entries, 10), v.used_entries);

  return `
    <div class="visa-card ${cardClass}" id="visa-${v.id}">
      <div class="visa-card-top">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="visa-country">${countryLabel(v.country, v.country_code)}</div>
          ${v.visa_type ? `<span class="tag">${escapeHtml(v.visa_type)}</span>` : ''}
        </div>
        <div class="visa-card-meta">
          ${expirySoon || expired ? `<span class="visa-expiry-badge ${expired ? 'expired' : 'soon'}">${expired ? '已过期' : `${daysLeft}天后到期`}</span>` : ''}
          <span class="visa-status-badge ${statusClass(v.status)}">${statusLabel(v.status)}</span>
        </div>
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
          <label>国家/地区二字码</label>
          <span>${v.country_code || '—'}</span>
        </div>
        <div class="visa-info-item">
          <label>添加时间</label>
          <span>${fmtDate(v.created_at)}</span>
        </div>
      </div>
      ${v.remarks ? `<div style="font-size:.82rem;color:var(--text-2);margin-bottom:12px;padding:8px 10px;background:var(--surface-2);border-radius:var(--radius-xs);">💬 ${v.remarks}</div>` : ''}
      <div class="visa-card-actions">
        ${v.status !== 'invalid' ? `<button class="btn btn-sm btn-danger" onclick="invalidateVisa(${v.id})">结束签证</button>` : ''}
        ${v.status === 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="activateVisa(${v.id})">手动激活</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="showEditVisaModal(${v.id})">编辑</button>
        <button class="btn btn-sm btn-secondary" onclick="showVisaHistory(${v.id})">变更历史</button>
        <button class="btn btn-sm btn-danger" style="margin-left:auto" onclick="deleteVisa(${v.id})">删除</button>
      </div>
    </div>`;
}

function showAddVisaModal() {
  openModal('添加签证', `
    <div class="form-group">
      <label>签证国家/地区二字码 *</label>
      <input type="text" id="v-country" placeholder="例：CN" oninput="document.getElementById('v-country-preview').innerHTML = countryPreviewHtml(this.value)">
      <div id="v-country-preview">${countryPreviewHtml('')}</div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>有效期起</label><input type="text" class="date-input" id="v-from" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
      <div class="form-group"><label>有效期止</label><input type="text" class="date-input" id="v-to" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
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
    <div class="form-group"><label>签证类型</label><input type="text" id="v-type" placeholder="例：B1/B2、V44等（可选）"></div>
    <div class="form-group"><label>备注</label><textarea id="v-remarks" rows="2" placeholder="可选"></textarea></div>
    <div class="form-group">
      <label>签证附件</label>
      <input type="file" id="v-file" accept="image/*,.pdf">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitAddVisa()">保存签证</button>
    </div>`);
}

async function submitAddVisa() {
  const country = document.getElementById('v-country').value.trim();
  if (!country) { toast('请填写国家/地区二字码', 'error'); return; }
  const validFrom = readDateField('v-from', '有效期起');
  if (validFrom === null) return;
  const validTo = readDateField('v-to', '有效期止');
  if (validTo === null) return;
  const fd = new FormData();
  fd.append('country', country);
  const countryCode = countryCodeFromInput(country);
  if (countryCode) fd.append('country_code', countryCode);
  fd.append('valid_from', validFrom);
  fd.append('valid_to', validTo);
  fd.append('total_entries', document.getElementById('v-entries').value);
  fd.append('visa_type', document.getElementById('v-type').value);
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

async function showEditVisaModal(id) {
  try {
    const data = await GET(`/visas/${id}`);
    const v = data.visa;
    openModal('编辑签证', `
      <div class="form-group">
        <label>签证国家/地区二字码 *</label>
        <input type="text" id="ev-country" value="${escapeHtml(v.country || '')}" placeholder="例：CN" oninput="document.getElementById('ev-country-preview').innerHTML = countryPreviewHtml(this.value)">
        <div id="ev-country-preview">${countryPreviewHtml(v.country_code || v.country || '')}</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>有效期起</label><input type="text" class="date-input" id="ev-from" value="${escapeHtml(dateInputValue(v.valid_from))}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
        <div class="form-group"><label>有效期止</label><input type="text" class="date-input" id="ev-to" value="${escapeHtml(dateInputValue(v.valid_to))}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>可用次数</label>
          <select id="ev-entries">
            <option value="1" ${String(v.total_entries) === '1' ? 'selected' : ''}>单次</option>
            <option value="2" ${String(v.total_entries) === '2' ? 'selected' : ''}>双次</option>
            <option value="3" ${String(v.total_entries) === '3' ? 'selected' : ''}>三次</option>
            <option value="5" ${String(v.total_entries) === '5' ? 'selected' : ''}>五次</option>
            <option value="-1" ${String(v.total_entries) === '-1' ? 'selected' : ''}>不限次数（多次）</option>
          </select>
        </div>
        <div class="form-group"><label>签证号码</label><input type="text" id="ev-number" value="${escapeHtml(v.visa_number || '')}" placeholder="可选"></div>
      </div>
      <div class="form-group"><label>签证类型</label><input type="text" id="ev-type" value="${escapeHtml(v.visa_type || '')}" placeholder="例：B1/B2、V44等（可选）"></div>
      <div class="form-group"><label>备注</label><textarea id="ev-remarks" rows="2" placeholder="可选">${escapeHtml(v.remarks || '')}</textarea></div>
      <div class="form-group">
        <label>当前状态</label>
        <select id="ev-status">
          ${['pending','active','invalid'].map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitEditVisa(${id})">保存</button>
      </div>`);
  } catch(e) { toast(e.message, 'error'); }
}

async function submitEditVisa(id) {
  const country = document.getElementById('ev-country').value.trim();
  if (!country) { toast('请填写国家/地区二字码', 'error'); return; }
  const countryCode = countryCodeFromInput(country);
  const validFrom = readDateField('ev-from', '有效期起');
  if (validFrom === null) return;
  const validTo = readDateField('ev-to', '有效期止');
  if (validTo === null) return;
  try {
    await PUT(`/visas/${id}`, {
      country,
      country_code: countryCode || null,
      valid_from: validFrom,
      valid_to: validTo,
      total_entries: parseInt(document.getElementById('ev-entries').value, 10),
      visa_type: document.getElementById('ev-type').value,
      visa_number: document.getElementById('ev-number').value,
      remarks: document.getElementById('ev-remarks').value,
      status: document.getElementById('ev-status').value,
      reason: '编辑签证'
    });
    toast('签证已更新');
    closeModal();
    loadVisas();
  } catch(e) { toast(e.message, 'error'); }
}

async function invalidateVisa(id) {
  openModal('结束签证', `
    <p style="margin-bottom:16px;color:var(--text-2);">请输入结束原因：</p>
    <div class="form-group"><textarea id="invalidate-reason" rows="3" placeholder="例：签证已使用完毕、主动结束..."></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmInvalidateVisa(${id})">确认结束</button>
    </div>`);
}

async function confirmInvalidateVisa(id) {
  const reason = document.getElementById('invalidate-reason').value.trim() || '手动结束';
  try {
    await PUT(`/visas/${id}/status`, { status: 'invalid', reason });
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
    openModal(`${countryLabel(data.visa.country, data.visa.country_code)} 签证状态历史`, histHtml);
  } catch(e) { toast(e.message, 'error'); }
}

function previewImg(src) {
  const overlay = document.createElement('div');
  overlay.className = 'img-preview-overlay';
  overlay.innerHTML = `<img src="${src}" alt="预览">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function previewFile(url, path) {
  const ext = (String(path || '')).split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) {
    window.open(url, '_blank');
  } else if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
    previewImg(url);
  } else {
    window.open(url, '_blank');
  }
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
          <div style="font-size:1rem;font-weight:700;white-space:nowrap">${countryLabel(a.country, a.country_code)}</div>
          ${a.visa_type ? `<span class="tag">${escapeHtml(a.visa_type)}</span>` : ''}
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
          <div><div class="stat-label">签证类型</div><div style="font-weight:600">${a.visa_type || '—'}</div></div>
          <div><div class="stat-label">申请次数</div><div style="font-weight:600">${a.total_entries == null ? '1' : (a.total_entries < 0 ? '不限次数' : a.total_entries + ' 次')}</div></div>
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
                <a href="${fileUrl(f.file_path)}" target="_blank" class="btn btn-xs btn-secondary">查看</a>
                <button class="remove" title="删除文件" onclick="deleteApplicationFile(${a.id}, ${f.id})">×</button>
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
      <div class="form-group">
        <label>申请国家/地区二字码 *</label>
        <input type="text" id="ap-country" placeholder="例：CN" oninput="document.getElementById('ap-country-preview').innerHTML = countryPreviewHtml(this.value)">
        <div id="ap-country-preview">${countryPreviewHtml('')}</div>
      </div>
      <div class="form-group">
        <label>签证类型</label>
        <input type="text" id="ap-visa-type" placeholder="例：B1/B2、V44等（可选）">
      </div>
    </div>
    <div class="form-group">
      <label>签证次数</label>
      <select id="ap-entries">
        <option value="1">单次</option>
        <option value="2">双次</option>
        <option value="3">三次</option>
        <option value="5">五次</option>
        <option value="-1">不限次数（多次）</option>
      </select>
    </div>
    <div class="form-group"><label>申请日期</label><input type="text" class="date-input" id="ap-date" value="${dateInputValue(localTodayIso())}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
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
  if (!country) { toast('请填写国家/地区二字码', 'error'); return; }
  const applyDate = readDateField('ap-date', '申请日期', { required: true });
  if (applyDate === null) return;
  const fd = new FormData();
  fd.append('country', country);
  const countryCode = countryCodeFromInput(country);
  if (countryCode) fd.append('country_code', countryCode);
  fd.append('visa_type', document.getElementById('ap-visa-type').value);
  fd.append('total_entries', document.getElementById('ap-entries').value);
  fd.append('apply_date', applyDate);
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
    <div class="form-group"><label>变更日期</label><input type="text" class="date-input" id="status-date" value="${dateInputValue(localTodayIso())}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
    <div class="form-group"><label>备注</label><input type="text" id="status-note" placeholder="可选"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitUpdateStatus(${id})">保存</button>
    </div>`);
}

async function submitUpdateStatus(id) {
  const status = document.getElementById('new-status').value;
  const change_date = readDateField('status-date', '变更日期', { required: true });
  if (change_date === null) return;
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
        <div class="form-group"><label>有效期起</label><input type="text" class="date-input" id="ri-from" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
        <div class="form-group"><label>有效期止</label><input type="text" class="date-input" id="ri-to" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>签证号码</label><input type="text" id="ri-number"></div>
      </div>
    </div>
    <div id="downgrade-fields" class="hidden">
      <div class="alert alert-warning">降级签发 — 请填写实际签发的签证信息。</div>
      <div class="form-group"><label>实际签发国家/地区二字码</label><input type="text" id="rd-country" value="${country}"></div>
      <div class="form-row">
        <div class="form-group"><label>有效期起</label><input type="text" class="date-input" id="rd-from" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
        <div class="form-group"><label>有效期止</label><input type="text" class="date-input" id="rd-to" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>签证号码</label><input type="text" id="rd-number"></div>
        <div class="form-group">
          <label>次数</label>
          <select id="rd-entries"><option value="1">单次</option><option value="-1">不限次数</option></select>
        </div>
      </div>
      <div class="form-group"><label>签证类型</label><input type="text" id="rd-type" placeholder="例：B1/B2、V44等（可选）"></div>
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
    const validFrom = readDateField('ri-from', '有效期起');
    if (validFrom === null) return;
    const validTo = readDateField('ri-to', '有效期止');
    if (validTo === null) return;
    body.valid_from = validFrom;
    body.valid_to = validTo;
    body.visa_number = document.getElementById('ri-number').value;
  } else if (result === '降级签发') {
    const downgradeCountry = document.getElementById('rd-country').value.trim();
    const downgradeCountryCode = countryCodeFromInput(downgradeCountry);
    const validFrom = readDateField('rd-from', '有效期起');
    if (validFrom === null) return;
    const validTo = readDateField('rd-to', '有效期止');
    if (validTo === null) return;
    body.visa_info = {
      country: downgradeCountry,
      country_code: downgradeCountryCode || null,
      valid_from: validFrom,
      valid_to: validTo,
      visa_number: document.getElementById('rd-number').value,
      total_entries: parseInt(document.getElementById('rd-entries').value, 10),
      visa_type: document.getElementById('rd-type') ? document.getElementById('rd-type').value : undefined,
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

async function deleteApplicationFile(appId, fileId) {
  if (!confirm('确定删除该文件？')) return;
  try {
    await DELETE(`/applications/${appId}/files/${fileId}`);
    toast('文件已删除');
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
  const latestTravel = travels[0] || null;
  const inTravel = latestTravel ? latestTravel.type === 'entry' : false;
  const selectedTravelType = inTravel ? 'exit' : 'entry';

  const visaOptions = pendingVisas.map(v =>
    `<option value="${v.id}" data-country-code="${escapeHtml(v.country_code || '')}" data-country="${escapeHtml((v.country || '').toLowerCase())}">[${statusLabel(v.status)}] ${countryLabel(v.country, v.country_code)}${v.visa_type ? ' (' + escapeHtml(v.visa_type) + ')' : ''} ${v.valid_to ? '(至' + fmtDate(v.valid_to) + ')' : ''}</option>`
  ).join('');

  const listHtml = recent.length > 0
    ? recent.map(t => `
        <div class="travel-item">
          <div class="travel-type-icon ${t.type}">${t.type === 'entry' ? '🛬' : '🛫'}</div>
          <div class="travel-item-content">
            <div class="travel-item-country">${countryLabel(t.country, t.country_code)} <span style="font-size:.8rem;color:var(--text-3);font-weight:400">${t.type === 'entry' ? '入境' : '离境'}</span></div>
            <div class="travel-item-meta">${fmtDate(t.date)}${t.remarks ? ' · ' + t.remarks : ''}${t.visa_country ? ' · 使用签证: ' + countryLabel(t.visa_country) : ''}${t.visa_type ? ' · 类型: ' + escapeHtml(t.visa_type) : ''}</div>
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px"><p>暂无行程记录</p></div>`;

  el.innerHTML = `
    <div class="page-title">行程记录</div>
    <div class="page-subtitle">记录入境与离境行程</div>
    <div class="travel-layout">
      <div class="card">
        <div class="card-header"><div class="card-title">添加行程</div></div>
        <div class="card-body">
          <div class="form-group">
            <label>行程类型</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label id="travel-type-entry" class="travel-type-option ${selectedTravelType === 'entry' ? 'active' : ''}">
                <input type="radio" name="ttype" value="entry" ${selectedTravelType === 'entry' ? 'checked' : ''} onchange="updateTravelTypeSelection(this.value)" style="width:auto"> 🛬 入境
              </label>
              <label id="travel-type-exit" class="travel-type-option ${selectedTravelType === 'exit' ? 'active' : ''}">
                <input type="radio" name="ttype" value="exit" ${selectedTravelType === 'exit' ? 'checked' : ''} onchange="updateTravelTypeSelection(this.value)" style="width:auto"> 🛫 离境
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>国家/地区二字码 *</label>
            <input type="text" id="t-country" placeholder="例：CN" oninput="updateCountryPreview(this.value); autoMatchTravelVisa()">
            <div id="t-country-preview"></div>
          </div>
          <div class="form-group"><label>日期</label><input type="text" class="date-input" id="t-date" value="${dateInputValue(localTodayIso())}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
          <div class="form-group">
            <label>关联签证（可选）</label>
            <select id="t-visa">
              <option value="">不关联签证</option>
              ${visaOptions}
            </select>
            <div class="form-hint">入境时选择签证将自动更新签证状态</div>
            <div class="form-hint" id="t-visa-match-hint"></div>
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

  updateTravelTypeSelection(selectedTravelType);
}

function updateTravelTypeSelection(selectedType) {
  const entryOption = document.getElementById('travel-type-entry');
  const exitOption = document.getElementById('travel-type-exit');
  if (!entryOption || !exitOption) return;

  const entryActive = selectedType === 'entry';
  entryOption.classList.toggle('active', entryActive);
  exitOption.classList.toggle('active', !entryActive);
}

function autoMatchTravelVisa() {
  const countryInput = document.getElementById('t-country');
  const visaSelect = document.getElementById('t-visa');
  const hintEl = document.getElementById('t-visa-match-hint');
  if (!countryInput || !visaSelect) return;

  const input = (countryInput.value || '').trim();
  const code = countryCodeFromInput(input);

  if (!code) {
    if (hintEl) hintEl.textContent = '';
    return;
  }

  let matchedOption = null;
  for (const opt of visaSelect.options) {
    if (!opt.value) continue;
    const optCode = countryCodeFromInput(opt.getAttribute('data-country-code') || '');
    if (optCode && optCode === code) {
      matchedOption = opt;
      break;
    }
  }

  if (matchedOption) {
    visaSelect.value = matchedOption.value;
    if (hintEl) hintEl.textContent = `已自动匹配签证：${matchedOption.textContent}`;
  } else if (hintEl) {
    hintEl.textContent = `未找到 ${code} 对应签证，请手动选择`;
  }
}

async function submitAddTravel() {
  const country = document.getElementById('t-country').value.trim();
  if (!country) { toast('请填写国家/地区二字码', 'error'); return; }
  const type = document.querySelector('input[name="ttype"]:checked').value;
  const date = readDateField('t-date', '日期', { required: true });
  if (date === null) return;
  let visa_id = document.getElementById('t-visa').value || null;
  const remarks = document.getElementById('t-remarks').value;
  const countryCode = countryCodeFromInput(country);
  try {
    await POST('/travels', {
      country,
      country_code: countryCode || null,
      type,
      date,
      visa_id: visa_id ? parseInt(visa_id, 10) : null,
      remarks
    });
    toast(`行程已记录 (${type === 'entry' ? '入境' : '离境'})`);
    loadTravels();
  } catch(e) { toast(e.message, 'error'); }
}

async function showEditTravelModal(id) {
  try {
    const [travels, visas] = await Promise.all([GET('/travels'), GET('/visas')]);
    const travel = travels.find(t => t.id === id);
    if (!travel) {
      toast('未找到该行程记录', 'error');
      return;
    }

    const visaOptions = visas
      .filter(v => v.status === 'pending' || v.status === 'active' || v.id === travel.visa_id)
      .map(v => `<option value="${v.id}" ${travel.visa_id === v.id ? 'selected' : ''}>[${statusLabel(v.status)}] ${countryLabel(v.country, v.country_code)}${v.visa_type ? ' (' + escapeHtml(v.visa_type) + ')' : ''}</option>`)
      .join('');

    openModal('编辑行程', `
      <div class="form-group">
        <label>行程类型</label>
        <select id="et-type">
          <option value="entry" ${travel.type === 'entry' ? 'selected' : ''}>🛬 入境</option>
          <option value="exit" ${travel.type === 'exit' ? 'selected' : ''}>🛫 离境</option>
        </select>
      </div>
      <div class="form-group">
        <label>国家/地区二字码 *</label>
        <input type="text" id="et-country" value="${escapeHtml(travel.country || '')}" placeholder="例：CN" oninput="document.getElementById('et-country-preview').innerHTML = countryPreviewHtml(this.value)">
        <div id="et-country-preview">${countryPreviewHtml(travel.country_code || travel.country || '')}</div>
      </div>
      <div class="form-group"><label>日期</label><input type="text" class="date-input" id="et-date" value="${escapeHtml(dateInputValue(travel.date))}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/YYYY" oninput="formatDateField(this)"></div>
      <div class="form-group">
        <label>关联签证（可选）</label>
        <select id="et-visa">
          <option value="">不关联签证</option>
          ${visaOptions}
        </select>
      </div>
      <div class="form-group"><label>备注</label><textarea id="et-remarks" rows="2" placeholder="可选">${escapeHtml(travel.remarks || '')}</textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitEditTravel(${id})">保存</button>
      </div>`);
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function submitEditTravel(id) {
  const country = document.getElementById('et-country').value.trim();
  if (!country) { toast('请填写国家/地区二字码', 'error'); return; }
  const countryCode = countryCodeFromInput(country);
  const visaId = document.getElementById('et-visa').value;
  const date = readDateField('et-date', '日期', { required: true });
  if (date === null) return;
  try {
    await PUT(`/travels/${id}`, {
      country,
      country_code: countryCode || null,
      date,
      type: document.getElementById('et-type').value,
      visa_id: visaId ? parseInt(visaId, 10) : null,
      remarks: document.getElementById('et-remarks').value
    });
    toast('行程已更新');
    closeModal();
    loadHistory();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function deleteTravel(id, sourcePage = 'travels') {
  if (!confirm('确定删除该行程记录？')) return;
  try {
    await DELETE(`/travels/${id}`);
    toast('已删除');
    if (sourcePage === 'history') loadHistory();
    else loadTravels();
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

  const sorted = [...travels].sort((a, b) => {
    const byDate = new Date(a.date) - new Date(b.date);
    if (byDate !== 0) return byDate;
    // Keep real operation sequence on same day.
    return (a.id || 0) - (b.id || 0);
  });
  const trips = [];
  let currentOpenEntry = null;

  sorted.forEach((t) => {
    if (t.type === 'entry') {
      if (currentOpenEntry) {
        trips.push({ entry: currentOpenEntry, exit: null });
      }
      currentOpenEntry = t;
      return;
    }

    if (t.type === 'exit') {
      if (currentOpenEntry) {
        trips.push({ entry: currentOpenEntry, exit: t });
        currentOpenEntry = null;
      } else {
        trips.push({ entry: null, exit: t });
      }
    }
  });

  if (currentOpenEntry) {
    trips.push({ entry: currentOpenEntry, exit: null });
  }

  const tripLatestEvent = (trip) => trip.exit || trip.entry || null;
  trips.sort((a, b) => {
    const ae = tripLatestEvent(a);
    const be = tripLatestEvent(b);
    const ad = ae?.date || '';
    const bd = be?.date || '';
    const byDate = new Date(bd) - new Date(ad);
    if (byDate !== 0) return byDate;
    return (be?.id || 0) - (ae?.id || 0);
  });

  const tripGroups = {};
  trips.forEach(trip => {
    const groupDate = trip.exit?.date || trip.entry?.date;
    const ym = groupDate ? groupDate.slice(0, 7) : '未知时间';
    if (!tripGroups[ym]) tripGroups[ym] = [];
    tripGroups[ym].push(trip);
  });

  const groupsHtml = Object.keys(tripGroups).sort((a, b) => {
    if (a === '未知时间') return 1;
    if (b === '未知时间') return -1;
    return b.localeCompare(a);
  }).map(ym => {
    const [year, month] = ym.split('-');
    const stayDurationText = (trip) => {
      const entryDate = trip.entry?.date;
      if (!entryDate) return '';
      const endDate = trip.exit?.date || new Date().toISOString().slice(0, 10);
      const start = new Date(`${entryDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      const diffDays = Math.max(0, Math.floor((end - start) / 86400000));

      if (trip.exit) {
        return diffDays === 0 ? '停留时长：当日往返' : `停留时长：${diffDays} 天`;
      }
      return `停留时长：已停留 ${diffDays} 天`;
    };

    const items = tripGroups[ym].sort((a, b) => {
      const ae = tripLatestEvent(a);
      const be = tripLatestEvent(b);
      const ad = ae?.date || '';
      const bd = be?.date || '';
      const byDate = new Date(bd) - new Date(ad);
      if (byDate !== 0) return byDate;
      return (be?.id || 0) - (ae?.id || 0);
    }).map(trip => `
      <div style="padding:12px;background:var(--surface-2);border-radius:var(--radius-xs);margin-bottom:8px;">
        ${trip.exit ? `
          <div class="travel-item" style="margin-bottom:4px;">
            <div class="travel-type-icon exit" style="color:var(--text-3);">🛫</div>
            <div class="travel-item-content">
              <div class="travel-item-country" style="font-weight:600;">${countryLabel(trip.exit.country, trip.exit.country_code)} 离境</div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div class="travel-item-meta">${fmtDate(trip.exit.date)}${trip.exit.remarks ? ' · ' + trip.exit.remarks : ''}</div>
                <div style="display:flex;gap:8px;flex-shrink:0;align-items:center;justify-content:flex-end;">
                  <button class="btn btn-xs btn-secondary" onclick="showEditTravelModal(${trip.exit.id})">编辑</button>
                  <button class="btn btn-xs btn-danger" onclick="deleteTravel(${trip.exit.id}, 'history')">删除</button>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div style="padding:8px;color:var(--text-3);font-size:.85rem;margin-bottom:8px;background:var(--surface);border-radius:var(--radius-xs);">进行中的旅行</div>
        `}
        ${trip.entry ? `
          <div class="travel-item" style="${trip.exit ? 'border-top:1px solid var(--border);padding-top:8px;' : ''}">
            <div class="travel-type-icon entry" style="color:var(--accent);">🛬</div>
            <div class="travel-item-content">
              <div class="travel-item-country" style="font-weight:600;">${countryLabel(trip.entry.country, trip.entry.country_code)} 入境</div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div class="travel-item-meta">${fmtDate(trip.entry.date)}${trip.entry.remarks ? ' · ' + trip.entry.remarks : ''}${trip.entry.visa_country ? ' · 签证: ' + countryLabel(trip.entry.visa_country) : ''}${trip.entry.visa_type ? ' · 类型: ' + escapeHtml(trip.entry.visa_type) : ''}</div>
                <div style="display:flex;gap:8px;flex-shrink:0;align-items:center;justify-content:flex-end;">
                  <button class="btn btn-xs btn-secondary" onclick="showEditTravelModal(${trip.entry.id})">编辑</button>
                  <button class="btn btn-xs btn-danger" onclick="deleteTravel(${trip.entry.id}, 'history')">删除</button>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div class="travel-item">
            <div class="travel-item-content">
              <div class="travel-item-meta">无对应入境记录</div>
            </div>
          </div>
        `}
        <div class="travel-item-meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-weight:600;color:var(--text-2);">${stayDurationText(trip)}</div>
      </div>`).join('');

    return `
      <div style="margin-bottom:24px">
        <div style="font-size:.82rem;font-weight:700;color:var(--text-3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          <span>${year && month ? `${year}年${month}月` : '未知时间'}</span>
          <span style="height:1px;flex:1;background:var(--border)"></span>
        </div>
        <div class="card">${items}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="page-title">行程历史</div>
    <div class="page-subtitle">共 ${trips.length} 次旅行</div>
    ${groupsHtml}`;
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

checkAuth();
