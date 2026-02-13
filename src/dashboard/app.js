/** AI Dev Pipeline Dashboard — 前端逻辑 */

const API = window.location.origin;

// ========== 导航 ==========
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('tab-' + item.dataset.tab).classList.add('active');
    loadTab(item.dataset.tab);
  });
});

function loadTab(tab) {
  const loaders = { overview: loadOverview, pipelines: loadPipelines, llm: loadLLMRoutes, skills: loadSkills, mcp: loadMCP };
  if (loaders[tab]) loaders[tab]();
}

// ========== 工具函数 ==========
function badge(status) {
  const map = { success: 'success', failed: 'failed', running: 'running', blocked: 'blocked', pending: 'pending', skipped: 'pending' };
  return `<span class="badge badge-${map[status] || 'pending'}">${status}</span>`;
}

function shortId(id) { return id ? id.substring(0, 8) : '-'; }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleString('zh-CN') : '-'; }

async function api(path, opts) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

// ========== 概览 ==========
async function loadOverview() {
  const pipelines = await api('/api/pipelines');
  const total = pipelines.length;
  const success = pipelines.filter(p => p.status === 'success').length;
  const failed = pipelines.filter(p => p.status === 'failed').length;
  const running = pipelines.filter(p => p.status === 'running').length;

  document.getElementById('stats-grid').innerHTML = [
    { label: '总数', value: total, cls: '' },
    { label: '成功', value: success, cls: 'green' },
    { label: '失败', value: failed, cls: 'red' },
    { label: '运行中', value: running, cls: 'blue' },
  ].map(s => `<div class="stat-card"><div class="label">${s.label}</div><div class="value ${s.cls}">${s.value}</div></div>`).join('');
/* PLACEHOLDER_OVERVIEW_CONTINUE */
  const recent = pipelines.slice(0, 10);
  document.querySelector('#recent-pipelines tbody').innerHTML = recent.map(p =>
    `<tr><td>${shortId(p.id)}</td><td>${p.event?.project?.name || '-'}</td><td>${p.event?.type || '-'}</td><td>${badge(p.status)}</td><td>${fmtTime(p.createdAt)}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">暂无数据</td></tr>';
}

// ========== 流水线 ==========
async function loadPipelines() {
  const status = document.getElementById('filter-status').value;
  const qs = status ? `?status=${status}` : '';
  const pipelines = await api('/api/pipelines' + qs);
  document.querySelector('#pipelines-table tbody').innerHTML = pipelines.map(p =>
    `<tr>
      <td>${shortId(p.id)}</td>
      <td>${p.event?.project?.name || '-'}</td>
      <td>${p.event?.type || '-'}</td>
      <td>${badge(p.status)}</td>
      <td>${p.stages?.length || 0} 阶段</td>
      <td>${fmtTime(p.createdAt)}</td>
      <td><button class="btn btn-sm" onclick="showPipelineDetail('${p.id}')">详情</button></td>
    </tr>`
  ).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">暂无数据</td></tr>';
}

document.getElementById('btn-filter').addEventListener('click', loadPipelines);

async function showPipelineDetail(id) {
  const [pipeline, logs] = await Promise.all([api(`/api/pipelines/${id}`), api(`/api/pipelines/${id}/logs`)]);
  const detail = document.getElementById('pipeline-detail');
  detail.style.display = 'block';

  const stagesHtml = (pipeline.stages || []).map(s =>
    `<li class="${s.status}"><strong>${s.stage}</strong> ${badge(s.status)} — 重试 ${s.retries} 次${s.error ? ` <span style="color:var(--red)">${s.error}</span>` : ''}<br><small>${fmtTime(s.startedAt)} → ${fmtTime(s.completedAt)}</small></li>`
  ).join('');

  const logsHtml = logs.map(l =>
    `<div class="log-entry"><span class="log-time">${fmtTime(l.timestamp)}</span>[${l.event}] ${l.stage || ''} ${l.output ? l.output.substring(0, 200) : ''}</div>`
  ).join('') || '<div style="color:var(--text-muted)">暂无日志</div>';

  detail.innerHTML = `<h3>流水线 ${shortId(id)}</h3>
    <p>状态: ${badge(pipeline.status)} | 项目: ${pipeline.event?.project?.name || '-'} | 创建: ${fmtTime(pipeline.createdAt)}</p>
    <h3>阶段时间线</h3><ul class="timeline">${stagesHtml}</ul>
    <h3>审计日志</h3><div class="log-list">${logsHtml}</div>`;
}
/* PLACEHOLDER_LLM_SECTION */

// ========== LLM 配置 ==========
let currentOverrideTask = null;

async function loadLLMRoutes() {
  const routes = await api('/api/llm/routes');
  document.querySelector('#llm-routes-table tbody').innerHTML = Object.entries(routes).map(([task, r]) =>
    `<tr>
      <td><strong>${task}</strong></td>
      <td>${r.default.provider}</td>
      <td>${r.default.model}</td>
      <td>${r.default.temperature ?? '-'}</td>
      <td>${r.default.maxTokens ?? '-'}</td>
      <td>${r.fallback.provider}/${r.fallback.model}</td>
      <td>
        <button class="btn btn-sm" onclick="openOverrideForm('${task}')">覆盖</button>
        <button class="btn btn-sm btn-danger" onclick="clearOverride('${task}')">清除</button>
      </td>
    </tr>`
  ).join('');
}

window.openOverrideForm = function(task) {
  currentOverrideTask = task;
  document.getElementById('llm-override-task').textContent = task;
  document.getElementById('llm-override-form').style.display = 'block';
};

document.getElementById('btn-cancel-override').addEventListener('click', () => {
  document.getElementById('llm-override-form').style.display = 'none';
});

document.getElementById('btn-save-override').addEventListener('click', async () => {
  if (!currentOverrideTask) return;
  const body = {
    provider: document.getElementById('llm-provider').value,
    model: document.getElementById('llm-model').value,
    temperature: parseFloat(document.getElementById('llm-temperature').value) || undefined,
    maxTokens: parseInt(document.getElementById('llm-max-tokens').value) || undefined,
  };
  await api(`/api/llm/routes/${currentOverrideTask}`, { method: 'PUT', body: JSON.stringify(body) });
  document.getElementById('llm-override-form').style.display = 'none';
  loadLLMRoutes();
});

window.clearOverride = async function(task) {
  await api(`/api/llm/routes/${task}`, { method: 'DELETE' });
  loadLLMRoutes();
};

// ========== Skills ==========
async function loadSkills() {
  const skills = await api('/api/skills');
  document.querySelector('#skills-table tbody').innerHTML = skills.map(s =>
    `<tr><td>${s.name}</td><td>${s.description || '-'}</td><td>${badge(s.source === 'builtin' ? 'pending' : s.source === 'global' ? 'running' : 'success').replace(/>.*</, `>${s.source}<`)}</td><td>${(s.tags || []).join(', ') || '-'}</td></tr>`
  ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">暂无 Skills</td></tr>';
}

// ========== MCP ==========
async function loadMCP() {
  const servers = await api('/api/mcp/servers');
  document.querySelector('#mcp-table tbody').innerHTML = servers.map(s =>
    `<tr><td>${s.name}</td><td>${s.transport}</td><td>${s.description || '-'}</td><td><code>${s.command || s.url || '-'}</code></td></tr>`
  ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">暂无 MCP Server</td></tr>';
}

// ========== 初始化 ==========
loadOverview();
