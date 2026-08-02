// background.js - iCloud HME Sync
// 用 chrome.cookies API 读取 httpOnly cookie（油猴做不到的），并在 background 里 fetch 面板（绕过 CORS）
const CFG_KEY = 'hme_cfg_v1';

// 候选域（含前后缀, 不带前导点）
const CANDIDATE_DOMAINS = [
  'icloud.com',
  'icloud.com.cn',
  'apple.com',
  'apple.com.cn',
  'appleid.com',
  'appleid.com.cn'
];

// 监听 content script 消息
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  (async function () {
    try {
      switch (msg.type) {
        case 'readCookies': {
          const cookies = await readAllCookies(msg.hintUrl || '');
          sendResponse({ ok: true, cookies: cookies, diagnosis: lastDiagnosis });
          break;
        }
        case 'sync': {
          const result = await doSync(msg.cfg, msg.cookieStr);
          sendResponse(result);
          break;
        }
        case 'getConfig': {
          const data = await chrome.storage.local.get(CFG_KEY);
          sendResponse({ ok: true, cfg: data[CFG_KEY] || null });
          break;
        }
        case 'saveConfig': {
          await chrome.storage.local.set({ [CFG_KEY]: msg.cfg });
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: '未知消息类型: ' + msg.type });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true;
});

let lastDiagnosis = {};

// 读取所有候选域的 cookie（含 httpOnly），跨域合并去重
async function readAllCookies(hintUrl) {
  lastDiagnosis = {};
  let all = [];

  // 策略1: 用 hintUrl 读取当前页面的 cookie
  if (hintUrl) {
    try {
      const byUrl = await chrome.cookies.getAll({ url: hintUrl });
      if (byUrl && byUrl.length) { all = all.concat(byUrl); }
      lastDiagnosis.byUrl = byUrl ? byUrl.length : 0;
    } catch (e) { lastDiagnosis.byUrlErr = String(e); }
  }

  // 策略2: 逐个候选域显式读取（最可靠, 覆盖所有 iCloud 相关域）
  for (const domain of CANDIDATE_DOMAINS) {
    try {
      const list = await chrome.cookies.getAll({ domain: domain });
      if (list && list.length) { all = all.concat(list); }
      lastDiagnosis['d_' + domain] = list ? list.length : 0;
    } catch (e) { lastDiagnosis['d_' + domain] = 'ERR:' + e; }
  }

  // 去重: 按 name 去重(同名保留 value 更长的)
  const map = new Map();
  (all || []).forEach(function (c) {
    const name = c.name || '';
    if (!c.value) { return; }
    if (!/^X-APPLE/i.test(name) && name !== 'iclsc') { return; }
    const prev = map.get(name);
    if (!prev || c.value.length > prev.value.length) {
      map.set(name, { name: name, value: c.value, domain: c.domain || '' });
    }
  });

  // 兜底: 若没抓到任何 X-APPLE, 把所有 icloud 域下非空 cookie 导出
  if (map.size === 0) {
    (all || []).forEach(function (c) {
      if (c.value && c.domain && /icloud\.com/.test(c.domain)) {
        map.set(c.name, { name: c.name, value: c.value, domain: c.domain || '' });
      }
    });
  }

  const arr = Array.from(map.values());
  lastDiagnosis.total = all ? all.length : 0;
  lastDiagnosis.filtered = arr.length;
  lastDiagnosis.names = arr.map(function (c) { return c.name + '@' + (c.domain || '?'); });

  if (!arr.length) {
    throw new Error('未读取到任何 cookie，请确认已在 iCloud 页面登录（诊断: ' + JSON.stringify(lastDiagnosis) + '）');
  }
  return arr;
}

// 组装 header string 并同步到面板
async function doSync(cfg, cookieStr) {
  const base = String(cfg.base || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    throw new Error('面板域名格式错误，需以 https:// 开头');
  }
  const url = base + '/api/accounts/upsert';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cfg.accountName || '',
      cookie_input: cookieStr,
      host: cfg.host || 'icloud.com',
      admin_password: cfg.password
    })
  });

  let body = null;
  try { body = await resp.json(); } catch (e) { body = null; }

  if (resp.status === 401) {
    throw new Error('面板鉴权失败：管理员密码不正确');
  }
  if (!body || body.ok !== true) {
    const err = body && body.error ? body.error : ('导入失败 (HTTP ' + resp.status + ')');
    throw new Error(err);
  }
  return { ok: true, action: body.action, real_email: body.real_email, alias_active: body.alias_active, alias_total: body.alias_total };
}
