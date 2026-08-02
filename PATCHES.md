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

共修复 **5 处问题**：

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
| `account_manager.py` | +1 / -1（RLock） |
| `mail_cache.py` | +1 / -1（RLock） |
| `web_ui.py` | 新增鉴权门（约 55 行）、路由拆分、Base URL 动态化 |

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
