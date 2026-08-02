// ==UserScript==
// @name         iCloud HME Sync
// @namespace    17sho.icloud-hme
// @version      1.0.0
// @description  在 iCloud 界面一键导出当前登录会话的 Cookie 并同步到 iCloud HME 面板（同邮箱自动续期，新邮箱自动新增）
// @author       17sho
// @match        https://*.icloud.com/*
// @match        https://www.icloud.com.cn/*
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CFG_KEY = 'hme_cfg_v1';
    const STYLE_ID = 'hme-sync-style';

    /* ---------- 工具 ---------- */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* ---------- 读取 iCloud cookie (httpOnly 也可) ---------- */
    function getAllCookies() {
        return new Promise(function (resolve, reject) {
            if (typeof GM_cookie === 'undefined') {
                reject(new Error('需要 GM_cookie 权限，请在油猴设置里给本脚本勾选「读取 Cookie」并授权 icloud.com'));
                return;
            }
            GM_cookie.list({}, function (cookies, error) {
                if (error) { reject(new Error('读取 cookie 失败: ' + error)); return; }
                if (!cookies || !cookies.length) { reject(new Error('未读取到任何 cookie，请确认已登录 icloud.com')); return; }
                resolve(cookies);
            });
        });
    }

    /* ---------- 组装 cookie 字符串 (name=value; ...) ---------- */
    function buildCookieString(cookies, host) {
        const wanted = ['X-APPLE-WEBAUTH-USER', 'X-APPLE-WEBAUTH-TOKEN',
                        'X-APPLE-WEBAUTH-VALIDATE', 'X-APPLE-DS-WEB-SESSION-TOKEN',
                        'X-APPLE-DS-WEB-SESSION-TTL', 'X-APPLE-DS-WEB-SESSION-VALIDATE',
                        'X-APPLE-DS-WEB-SESSION-USER', 'X-APPLE-DS-WEBAUTH-USER',
                        'X-APPLE-DS-WEBAUTH-TOKEN', 'X-APPLE-DS-WEBAUTH-VALIDATE',
                        'X-APPLE-ICLOUD-SESSION-TOKEN', 'X-APPLE-ICLOUD-VALIDATE'];
        const all = new Set();
        cookies.forEach(function (c) {
            const name = c.name || '';
            // 保留所有 X-APPLE 开头 + 基础会话 cookie
            if (/^X-APPLE/i.test(name) || ['iclsc'].includes(name)) {
                if (c.value) { all.add(name + '=' + c.value); }
            }
        });
        // 兜底：如果没抓到任何 X-APPLE，则把所有 icloud.com 域 cookie 都导出
        if (all.size === 0) {
            cookies.forEach(function (c) {
                if (c.value && c.hostDomain && /icloud\.com/.test(c.hostDomain)) {
                    all.add(c.name + '=' + c.value);
                }
            });
        }
        const arr = Array.from(all);
        if (!arr.length) { throw new Error('未找到 X-APPLE 会话 cookie，请确认已完整登录 icloud.com'); }
        return arr.join('; ');
    }

    /* ---------- 跨域请求面板 ---------- */
    function panelRequest(url, opts) {
        return new Promise(function (resolve, reject) {
            opts = opts || {};
            GM_xmlhttpRequest({
                method: opts.method || 'GET',
                url: url,
                headers: Object.assign({
                    'Content-Type': 'application/json'
                }, opts.headers || {}),
                data: opts.data,
                cookie: opts.cookie || '',      // 携带面板 session cookie
                withCredentials: true,
                onload: function (resp) {
                    let body = null;
                    try { body = JSON.parse(resp.responseText); }
                    catch (e) { body = resp.responseText; }
                    resolve({ status: resp.status, body: body, resp: resp });
                },
                onerror: function (err) {
                    reject(new Error('网络错误: ' + (err && err.error ? err.error : '无法连接面板，请检查域名与网络')));
                },
                ontimeout: function () { reject(new Error('请求超时')); },
                timeout: 30000
            });
        });
    }

    /* ---------- 登录面板换 session ---------- */
    async function loginPanel(base, password) {
        // 先 GET /login 拿 session 容器, 再 POST (Flask 需要同一会话)
        const r = await panelRequest(base + '/login', { method: 'GET' });
        const sid = extractSessionId(r.resp);
        // 用 form 编码 POST 密码 (Flask login 用 request.form)
        const body = 'password=' + encodeURIComponent(password);
        const r2 = await panelRequest(base + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: body,
            cookie: sid
        });
        const sid2 = extractSessionId(r2.resp) || sid;
        return sid2;
    }

    function extractSessionId(resp) {
        try {
            const setCookie = resp.responseHeaders || '';
            const m = setCookie.match(/session=([^;,\s]+)/);
            if (m) { return 'session=' + m[1]; }
        } catch (e) { /* ignore */ }
        return '';
    }

    /* ---------- 主流程 ---------- */
    async function doSync(cfg) {
        setStatus('正在读取 iCloud 会话 cookie...', '');
        const cookies = await getAllCookies();
        const cookieStr = buildCookieString(cookies, cfg.host);
        setStatus('已读取 ' + (cookieStr.split('; ').length) + ' 个会话 cookie，正在登录面板...', '');

        let sid = '';
        try {
            sid = await loginPanel(cfg.base, cfg.password);
        } catch (e) {
            throw new Error('面板登录失败: ' + e.message);
        }
        if (!sid) {
            throw new Error('面板登录失败：未获取到会话，请检查管理员密码与域名');
        }

        setStatus('正在导入到面板（同邮箱自动续期）...', '');
        const up = await panelRequest(cfg.base + '/api/accounts/upsert', {
            method: 'POST',
            data: JSON.stringify({
                name: cfg.accountName || '',
                cookie_input: cookieStr,
                host: cfg.host
            }),
            cookie: sid
        });

        if (up.status === 401) { throw new Error('面板鉴权失败：管理员密码不正确'); }
        if (!up.body || up.body.ok !== true) {
            const err = up.body && up.body.error ? up.body.error : ('导入失败 (HTTP ' + up.status + ')');
            throw new Error(err);
        }
        const action = up.body.action === 'renew' ? '续期' : '新增';
        const aliases = up.body.alias_active + '/' + up.body.alias_total;
        setStatus('✅ ' + action + '成功：' + (up.body.real_email || '') +
                  '（别名 ' + aliases + '）', 'ok');
        return up.body;
    }

    /* ---------- UI ---------- */
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
.hme-fab{width:56px;height:56px;border-radius:50%;background:#0071e3;color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .15s}
.hme-fab:hover{transform:scale(1.08)}
.hme-panel{position:absolute;right:0;bottom:70px;width:320px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);padding:16px;font-size:13px;color:#1d1d1f}
.hme-panel h3{margin:0 0 10px;font-size:15px;color:#1d1d1f}
.hme-panel label{display:block;font-size:11px;color:#6e6e73;margin:8px 0 3px}
.hme-panel input{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #d2d2d7;border-radius:6px;font-size:13px}
.hme-btn{width:100%;margin-top:12px;padding:9px;background:#0071e3;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
.hme-btn:disabled{background:#a0c5e8;cursor:not-allowed}
.hme-status{margin-top:10px;font-size:12px;color:#6e6e73;min-height:16px;white-space:pre-wrap;word-break:break-all}
.hme-status.ok{color:#007a3d}
.hme-status.err{color:#d70015}
.hme-close{position:absolute;top:8px;right:10px;border:none;background:none;font-size:16px;cursor:pointer;color:#6e6e73}
`;
        document.head.appendChild(s);
    }

    function buildPanel(cfg) {
        const root = uiState();
        root.innerHTML = `
<div class="hme-fab" id="hme-fab" title="同步到 iCloud HME 面板">⇄</div>
<div class="hme-panel" id="hme-panel" style="display:none">
  <button class="hme-close" id="hme-close">✕</button>
  <h3>iCloud HME 同步</h3>
  <label>面板域名（含 https://）</label>
  <input id="hme-base" placeholder="https://hme.example.com" value="${esc(cfg.base)}">
  <label>管理员密码</label>
  <input id="hme-pwd" type="password" placeholder="面板登录密码" value="${esc(cfg.password)}">
  <label>账号名称（可选，续期时忽略）</label>
  <input id="hme-name" placeholder="我的 iCloud 账号" value="${esc(cfg.accountName)}">
  <button class="hme-btn" id="hme-sync">一键导入 / 续期</button>
  <div class="hme-status" id="hme-sync-status"></div>
</div>`;
        root.querySelector('#hme-fab').addEventListener('click', function () {
            const p = root.querySelector('#hme-panel');
            p.style.display = p.style.display === 'none' ? 'block' : 'none';
        });
        root.querySelector('#hme-close').addEventListener('click', function () {
            root.querySelector('#hme-panel').style.display = 'none';
        });
        root.querySelector('#hme-sync').addEventListener('click', function () {
            const base = root.querySelector('#hme-base').value.trim().replace(/\/+$/, '');
            const password = root.querySelector('#hme-pwd').value;
            const accountName = root.querySelector('#hme-name').value.trim();
            const btn = root.querySelector('#hme-sync');
            if (!base || !password) { setStatus('请填写面板域名和管理员密码', 'err'); return; }
            const newCfg = { base: base, password: password, accountName: accountName, host: 'icloud.com' };
            GM_setValue(CFG_KEY, JSON.stringify(newCfg));
            btn.disabled = true;
            btn.textContent = '同步中...';
            doSync(newCfg)
                .then(function () { btn.textContent = '一键导入 / 续期'; })
                .catch(function (e) { setStatus('❌ ' + e.message, 'err'); })
                .finally(function () { btn.disabled = false; btn.textContent = '一键导入 / 续期'; });
        });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        injectStyle();
        let cfg = { base: '', password: '', accountName: '', host: 'icloud.com' };
        try {
            const saved = GM_getValue(CFG_KEY, '');
            if (saved) { cfg = Object.assign(cfg, JSON.parse(saved)); }
        } catch (e) { /* ignore */ }
        buildPanel(cfg);
    }

    // 等待页面就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
