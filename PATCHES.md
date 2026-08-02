# PATCHES

本仓库是 **补丁集**（patch set），不含上游 `heartmore/icloud-hme` 的完整源码。
上游源码版权归原作者所有；本仓库仅包含针对上游的修复补丁与配套文档/配置示例。

## 上游基准

| 项 | 值 |
|---|---|
| 上游仓库 | [heartmore/icloud-hme](https://github.com/heartmore/icloud-hme) |
| 基准 commit | `40a1d847c6886d5ad641b3fd0e9dec90f90be389`（HEAD，2026-06-04） |
| 上游 License | **无 LICENSE 文件**（默认保留版权） |
| 本仓库 License | MIT（仅针对补丁、文档、配置示例，不含上游源码） |

> 由于上游未提供开源许可证，本仓库**不重新分发上游源码**。使用者需自行 clone 上游，
> 再应用本补丁。详见 `README.md`。

## 补丁清单

补丁文件：`patches/icloud-hme-fixes.patch`（标准 unified diff，`git apply` 可应用）

共修复 **13 处问题**：

### 1. `account_manager.py` — 收件设置保存死锁

**症状**：Web UI「收件设置」点击保存后整个面板卡死，后续所有请求排队挂起
（waitress 单线程被占满）。

**根因**：`AccountManager` 用非可重入锁 `threading.Lock()`。`update_account()` 在
`with self._lock:` 块内调用 `self._save()`，而 `_save()` 又执行 `with self._lock:` ——
同一线程对同一把 `threading.Lock` 重复 acquire，直接死锁。

**修复**：`threading.Lock()` → `threading.RLock()`（可重入锁）。调用链
`set_app_password → update_account → _save` 不再死锁。

```diff
-        self._lock = threading.Lock()
+        self._lock = threading.RLock()
```

### 2. `mail_cache.py` — 收件箱刷新死锁

**症状**：Web UI「收件箱」标签页刷新时，接口一直转圈无响应，面板连带卡死。

**根因**：与 #1 完全同类。`MailCache.set_inbox()` 在 `with self._lock:` 内调用
`self._save()`，`_save()` 又 `with self._lock:`，非可重入锁死锁。

**修复**：同样改为 `threading.RLock()`。

```diff
-        self._lock = threading.Lock()
+        self._lock = threading.RLock()
```

### 3. `web_ui.py` — Flask 路由装饰器堆叠语法错误

**症状**：服务可能无法启动，或 `/` 与 `/index.html` 路由注册异常。

**根因**：上游将两个装饰器写在同一行：
```python
@app.route("/") @app.route("/index.html")
```
这是**非法 Python 语法**（两个装饰器不能共用一行）。

**修复**：拆成两行。
```diff
-@app.route("/") @app.route("/index.html")
+@app.route("/")
+@app.route("/index.html")
 def index(): return render_template_string(UI_HTML)
```

### 4. `web_ui.py` — 增加会话登录门（安全加固）

**背景**：上游 `web_ui.py` 绑定 `0.0.0.0` 且**无任何鉴权**，任何人可访问控制台、
导入 Cookie、读取账号数据。部署到公网前必须加访问控制。

**改动**（全部新增，不影响原有功能）：
- 持久化 `secrets.token_hex(32)` 到 `.secret_key` 作为 Flask `secret_key`
- 新增 `GET/POST /login` 页面，校验环境变量 `HME_ADMIN_PASSWORD`
- `@app.before_request`：未登录时，`/api/*` 返回 `401 {"ok":false,"error":"未登录"}`，
  其余页面 302 跳转 `/login`
- 新增 `GET /logout`

**要求**：运行时必须设置环境变量 `HME_ADMIN_PASSWORD`，否则无法登录。

### 5. `web_ui.py` — API 文档 Base URL 动态化

**症状**：面板「API 文档」页的 `Base URL` 硬编码为 `http://127.0.0.1:5050`，
对通过公网/反向代理访问的用户没有意义。

**修复**：改用 JS `location.origin` 动态获取当前访问地址。通过 `https://example.com`
访问时显示 `https://example.com`；本机访问时显示 `http://127.0.0.1:5050`。

```diff
-所有接口返回 JSON。Base URL: <code>http://127.0.0.1:5050</code>
+所有接口返回 JSON。Base URL: <code>'+(location.origin)+'</code>
```

## 变更统计

| 文件 | 改动 |
|---|---|
| `account_manager.py` | +1 / -1（RLock）、新增 `upsert_account()`（约 30 行） |
| `mail_cache.py` | +1 / -1（RLock） |
| `web_ui.py` | 新增鉴权门（约 55 行）、路由拆分、Base URL 动态化、校验 API 修复、按钮反馈、cookie 友好提示、移动端精细适配（抽屉侧边栏）、`/api/accounts/upsert` 端点 |

## 变更统计（UX 增强部分，针对 `web_ui.py`）

| 改动 | 说明 |
|---|---|
| `friendlyErr()` | 新增错误友好化函数：匹配 `/421|expired\|invalid\|session\|cookie\|未登录\|403/i` 时返回「⚠️ Cookie 已过期」，否则截断 40 字符显示原文 |
| 校验 API | `api_validate_account` 改为按 `account["status"]=="active"` 判断 ok，修复「cookie 已过期却显示校验成功」误报 |
| 按钮反馈 | 新增 `btnLoading(id,on,text)`；刷新/邮箱刷新/云端同步/CSV 导出带操作反馈与防连点 |

### 6. `web_ui.py` — 校验 API 误报修复

**症状**：账号 cookie 已过期，点「校验」仍显示「校验通过」。

**根因**：`account_manager.validate_account()` 用 `try/except` 全捕获，过期仅置
`status="error"` 永不抛异常；而 `api_validate_account` 只检查「是否抛异常」→
永远返回 `ok:true` → 前端永远「校验通过」。

**修复**：按 `account["status"]=="active"` 判断真实结果，否则返回 `ok:false` + 错误信息。

### 7. `web_ui.py` — Cookie 过期友好提示

账号卡片状态徽标与校验失败 toast 改用 `friendlyErr()`，遇到
`421/expired/invalid/session/cookie/未登录/403` 直接提示「⚠️ Cookie 已过期」，
替代裸显 `HTTP 421: {...}` 长串。

### 8. `web_ui.py` — 按钮操作反馈

新增 `btnLoading(id,on,text)` 辅助函数（禁用+文本切换+防连点），为以下按钮加反馈：
- 「刷新」→ 完成后「已刷新」/ 失败「刷新失败」（仅手动点击时，自动刷新不弹）
- 邮箱「刷新」→「邮箱已刷新 (N)」
- 「云端同步」→ 加载中「同步中...」+ 完成「云端同步完成 (N 个已更新)」/ 失败红 toast
- 「CSV」→「已导出 N 个」

### 9. `web_ui.py` — 移动端精细适配

去掉桌面端 `min-width:1040px` 硬锁（改为仅桌面生效），新增移动端适配：
- 侧边栏变**抽屉**（汉堡按钮展开 + 遮罩关闭）
- 卡片/账号卡片改单列、弹窗底部弹出全屏
- 表格横向滚动、底部留 safe-area 间距

### 10. `account_manager.py` + `web_ui.py` — cookie 续期功能

新增「续期」按钮与 `POST /api/accounts/<id>/renew` 端点，解决 cookie 过期后手动更新繁琐：
- 账号卡片上加「续期」按钮 → 弹窗粘贴新 cookie（Header String 或 JSON 均可）
- 后端 `renew_account()`：**先校验新 cookie 成功，才 `update_account` 写回**——坏/空 cookie 不覆盖原值，避免误操作丢 cookie
- 提交时按钮「校验中...」防连点，成功后自动刷新账号状态与别名数

### 11. `web_ui.py` — 手机端收件箱溢出 + 导航去重

- **收件箱头部横溢**：收件箱工具栏（账号下拉 + 数量/查件输入框 + 5 个按钮）放在不换行的 flex 容器里，手机上一行撑到 868px 撑破布局 → 改为 `flex-wrap:wrap` 自动换行 + 输入框自适应宽度
- **底部 Tab 与侧边栏重复**：手机端同时存在底部 Tab 栏与侧边栏抽屉，导航功能重复 → 移除底部 Tab 栏，统一用汉堡 + 侧边栏导航（与桌面一致）

### 12. `web_ui.py` — 删除账号按钮常显

删除账号按钮（侧边栏账号项右侧的 `✕`）默认 `opacity:0`，仅 `:hover` 时显示。在触摸设备（手机）上无 hover，按钮**始终透明不可见**，看起来像「删除功能被删掉了」。

**修复**：基础规则 `opacity:0` → `opacity:.6`，桌面与移动端均常显；hover 加深到 `1`。桌面与手机行为一致，删除入口随时可见可点。

### 13. `account_manager.py` + `web_ui.py` — 一键导入 Cookie（upsert，同邮箱续期）+ 配套油猴脚本

解决「在浏览器 iCloud 界面一键把当前登录会话同步到面板」的需求，配合油猴脚本 `scripts/icloud-hme-sync.user.js`：

- 新增 `AccountManager.upsert_account(name, cookie_input, host)`：先校验 cookie 识别账号身份（`real_email`），再**按邮箱查重**——面板已有同邮箱账号则**续期**（更新 cookie，复用 `renew_account` 的「校验成功才写回」安全逻辑），否则**新增**
- 新增 `POST /api/accounts/upsert` 端点，body `{"name","cookie_input","host"}`，返回 `{ok, action: "renew"|"add", id, real_email, alias_total, alias_active}`
- API 文档页新增该端点的说明条目

**配套油猴脚本**（`scripts/icloud-hme-sync.user.js`）：在 `*.icloud.com` 页面显示一个浮动按钮，点击展开面板，填入「面板域名 + 管理员密码」，点「一键导入/续期」即：
1. 用 `GM_cookie` 读取当前浏览器已登录的 iCloud 会话 cookie（含 httpOnly）
2. 组装成 `name=value; ...` 格式（保留全部 `X-APPLE-*` 会话 cookie）
3. 调面板 `/login` 换取 session，再调 `/api/accounts/upsert` 导入——同邮箱自动续期、新邮箱自动新增
4. 显示导入结果（续期/新增 + 邮箱 + 别名数）

> 脚本利用**浏览器当前已登录的 iCloud 会话**，无需在服务器侧处理 Apple 强制登录/2FA，是最省事的续期路径。

## 如何应用补丁

```bash
git clone https://github.com/heartmore/icloud-hme.git
cd icloud-hme
git apply /path/to/icloud-hme-fixes.patch
```

应用后：
- 安装依赖 `pip install -r requirements.txt`
- 设置管理密码 `export HME_ADMIN_PASSWORD=你的密码`
- 启动 `python web_ui.py`
- 浏览器打开 http://127.0.0.1:5050 ，输入管理密码登录
