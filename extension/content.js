// content.js - iCloud HME Sync
// 注入浮动按钮和设置面板，通过 chrome.runtime.sendMessage 调用 background
// v1.2: 面板可拖动移动（鼠标+触摸），无全屏逻辑
(function () {
  'use strict';

  const CFG_KEY = 'hme_cfg_v1';
  const STYLE_ID = 'hme-sync-style';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uiState() {
    let el = document.getElementById('hme-sync-root');
    if (!el) { el = document.createElement('div'); el.id = 'hme-sync-root'; document.body.appendChild(el); }
    return el;
  }

  function setStatus(msg, cls) {
    const el = document.getElementById('hme-sync-status');
    if (el) { el.textContent = msg; el.className = 'hme-status' + (cls ? ' ' + cls : ''); }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) { return; }
    const s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = `
#hme-sync-root{position:fixed;right:18px;bottom:18px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.hme-fab{width:56px;height:56px;border-radius:50%;background:#0071e3;color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .15s;position:relative;z-index:2}
.hme-fab:hover{transform:scale(1.08)}
.hme-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:340px;max-width:92vw;max-height:88vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);padding:0;font-size:13px;color:#1d1d1f;box-sizing:border-box}
.hme-panel-body{padding:16px}
.hme-dragbar{height:36px;background:#f5f5f7;border-bottom:1px solid #e8e8ed;border-radius:12px 12px 0 0;display:flex;align-items:center;padding:0 10px;box-sizing:border-box;cursor:grab;user-select:none}
.hme-dragbar:active{cursor:grabbing}
.hme-dragbar-title{font-size:13px;font-weight:600;color:#1d1d1f;flex:1;text-align:center;pointer-events:none}
.hme-dragbar .hme-tool{width:28px;height:28px;border:none;background:transparent;cursor:pointer;font-size:15px;color:#6e6e73;border-radius:6px;display:flex;align-items:center;justify-content:center}
.hme-dragbar .hme-tool:hover{background:#e8e8ed}
.hme-panel h3{margin:0 0 10px;font-size:15px;color:#1d1d1f}
.hme-panel label{display:block;font-size:11px;color:#6e6e73;margin:8px 0 3px}
.hme-panel input{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #d2d2d7;border-radius:6px;font-size:13px;color:#1d1d1f}
.hme-btn{width:100%;margin-top:12px;padding:9px;background:#0071e3;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
.hme-btn:disabled{background:#a0c5e8;cursor:not-allowed}
.hme-status{margin-top:10px;font-size:12px;color:#6e6e73;min-height:16px;white-space:pre-wrap;word-break:break-all}
.hme-status.ok{color:#007a3d}
.hme-status.err{color:#d70015}
`;
    document.head.appendChild(s);
  }

  function buildPanel(cfg) {
    const root = uiState();
    root.innerHTML = `
<div class="hme-fab" id="hme-fab" title="同步到 iCloud HME 面板">⇄</div>
<div class="hme-panel" id="hme-panel" style="display:none">
  <div class="hme-dragbar" id="hme-dragbar">
    <span class="hme-dragbar-title">iCloud HME 同步（按住拖动）</span>
    <button class="hme-tool" id="hme-close" title="关闭">✕</button>
  </div>
  <div class="hme-panel-body">
    <label>面板域名（含 https://）</label>
    <input id="hme-base" placeholder="https://hme.example.com" value="${esc(cfg.base)}">
    <label>管理员密码</label>
    <input id="hme-pwd" type="password" placeholder="面板登录密码" value="${esc(cfg.password)}">
    <label>账号名称（不填则用邮箱，填了则用填写内容）</label>
    <input id="hme-name" placeholder="我的 iCloud 账号" value="${esc(cfg.accountName)}">
    <button class="hme-btn" id="hme-sync">一键导入 / 续期</button>
    <div class="hme-status" id="hme-sync-status"></div>
  </div>
</div>`;

    const panel = root.querySelector('#hme-panel');

    root.querySelector('#hme-fab').addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    root.querySelector('#hme-close').addEventListener('click', function () {
      panel.style.display = 'none';
    });

    // 拖动移动（拖拽手柄）—— 鼠标
    const dragbar = root.querySelector('#hme-dragbar');
    let dragging = false, offX = 0, offY = 0;
    dragbar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.hme-tool')) { return; } // 不拦截关闭按钮
      dragging = true;
      const r = panel.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.transform = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) { return; }
      panel.style.left = (e.clientX - offX) + 'px';
      panel.style.top = (e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', function () { dragging = false; });

    // 拖动移动 —— 触摸（手机）
    dragbar.addEventListener('touchstart', function (e) {
      if (e.target.closest('.hme-tool')) { return; }
      const t = e.touches[0];
      dragging = true;
      const r = panel.getBoundingClientRect();
      offX = t.clientX - r.left;
      offY = t.clientY - r.top;
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.transform = 'none';
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      if (!dragging) { return; }
      const t = e.touches[0];
      panel.style.left = (t.clientX - offX) + 'px';
      panel.style.top = (t.clientY - offY) + 'px';
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', function () { dragging = false; });

    root.querySelector('#hme-sync').addEventListener('click', function () {
      const base = root.querySelector('#hme-base').value.trim().replace(/\/+$/, '');
      const password = root.querySelector('#hme-pwd').value;
      const accountName = root.querySelector('#hme-name').value.trim();
      const btn = root.querySelector('#hme-sync');
      if (!base || !password) { setStatus('请填写面板域名和管理员密码', 'err'); return; }
      const newCfg = { base: base, password: password, accountName: accountName, host: 'icloud.com' };
      chrome.runtime.sendMessage({ type: 'saveConfig', cfg: newCfg }, function (r) { /* ignore */ });
      btn.disabled = true;
      btn.textContent = '同步中...';
      setStatus('正在读取 iCloud 会话 cookie（含 httpOnly）...', '');
      doSync(newCfg)
        .then(function () {})
        .catch(function (e) { setStatus('❌ ' + e.message, 'err'); })
        .finally(function () { btn.disabled = false; btn.textContent = '一键导入 / 续期'; });
    });
  }

  async function doSync(cfg) {
    // 1. 让 background 读全部 cookie（含 httpOnly）, 传入当前页面 URL 作为提示
    const rd = await sendMsg({ type: 'readCookies', hintUrl: location.href });
    if (!rd.ok) { throw new Error(rd.error); }
    const cookies = rd.cookies;
    const cookieStr = cookies.map(function (c) { return c.name + '=' + c.value; }).join('; ');
    setStatus('已读取 ' + cookies.length + ' 个会话 cookie，正在导入面板（同邮箱自动续期）...', '');

    // 2. 让 background 同步到面板
    const up = await sendMsg({ type: 'sync', cfg: cfg, cookieStr: cookieStr });
    if (!up.ok) { throw new Error(up.error); }
    const action = up.action === 'renew' ? '续期' : '新增';
    const aliases = up.alias_active + '/' + up.alias_total;
    setStatus('✅ ' + action + '成功：' + (up.real_email || '') + '（别名 ' + aliases + '）', 'ok');
  }

  function sendMsg(msg) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); }
        else { resolve(resp || {}); }
      });
    });
  }

  function init() {
    injectStyle();
    let cfg = { base: '', password: '', accountName: '', host: 'icloud.com' };
    chrome.runtime.sendMessage({ type: 'getConfig' }, function (r) {
      if (!chrome.runtime.lastError && r && r.ok && r.cfg) {
        cfg = Object.assign(cfg, r.cfg);
      }
      buildPanel(cfg);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
