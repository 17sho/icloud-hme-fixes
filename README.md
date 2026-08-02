# iCloud HME — 修复补丁集 · Patch Set

> **English**: [README.en.md](README.en.md) · 中文：[README.md](README.md)

> ### 🚀 想要一步到位？用完整可部署版！
>
> 如果你不想「clone 上游 → 打补丁」，可直接使用 **完整增强版仓库**，所有 16 项修复已内置、附带 Chrome 扩展与部署配置，clone 即用：
>
> 🔗 **https://github.com/17sho/icloud-hme-full**
>
> 本仓库（修复补丁集）是它的构建来源；两者功能一致，二选一即可。

本仓库 **不是完整的应用源码**，而是针对
[heartmore/icloud-hme](https://github.com/heartmore/icloud-hme)（iCloud Hide My Email
多账号管理平台）的 **修复补丁集 + 部署文档**。

```
⚠️ 版权声明
上游 heartmore/icloud-hme 在 README 中声明为 MIT 许可，但未附带独立的 LICENSE 文件；为避免形式不完整带来的不确定性，本仓库仅发布补丁/文档，不包含上游源码。
本仓库仅提供针对上游的补丁与文档，不重新分发上游源码。
使用前请自行 clone 上游仓库，再应用本补丁。
```

---

## 这是什么

`heartmore/icloud-hme` 是一个基于 iCloud **Hide My Email**（隐藏邮件地址）协议、批量创建
`@icloud.com` 隐私邮箱的多账号聚合管理平台。它自带一个 Flask Web 面板，可导入 iCloud
Cookie、管理多个账号与别名、定时批量创建隐私邮箱、并通过 IMAP 收件。

|在将上游项目部署到生产/公网环境并实际使用「收件」功能时，我们发现并修复了 **13 处
|真实问题**，其中包含 **2 个会导致面板彻底卡死的死锁 bug**。本仓库把这些修复整理成
可复用的补丁与文档，供其他使用者直接应用。

## 本补丁修复了什么

| # | 文件 | 问题 | 严重度 |
|---|------|------|--------|
| 1 | `account_manager.py` | 收件设置保存 → 非可重入锁死锁，面板卡死 | 🔴 严重 |
| 2 | `mail_cache.py` | 收件箱刷新 → 非可重入锁死锁，面板卡死 | 🔴 严重 |
| 3 | `web_ui.py` | Flask 路由装饰器堆叠 → Python 语法错误 | 🔴 严重 |
| 4 | `web_ui.py` | 无任何鉴权 → 公网部署可被任意访问 | 🟡 安全加固 |
| 5 | `web_ui.py` | API 文档 Base URL 硬编码内网地址 | 🟢 体验改进 |
| 6 | `web_ui.py` | 校验 API 误报——cookie 已过期仍显示「校验通过」 | 🟠 功能性 |
| 7 | `web_ui.py` | cookie 过期错误信息不友好 → `friendlyErr()` 直接提示「Cookie 已过期」 | 🟢 体验改进 |
| 8 | `web_ui.py` | 刷新/云端同步/CSV 等按钮无操作反馈 → 新增 `btnLoading` 反馈与防连点 | 🟢 体验改进 |
| 9 | `web_ui.py` | 手机端不适配 → 去掉桌面 `min-width:1040px` 硬锁，新增移动端精细适配（侧边栏抽屉 + 卡片单列 + 弹窗全屏） | 🟢 体验改进 |
| 10 | `account_manager.py` + `web_ui.py` | cookie 过期后手动更新繁琐 → 新增「续期」按钮与 `POST /api/accounts/<id>/renew` 端点（先校验、成功才写回，坏 cookie 不覆盖原值） | 🟠 功能性 |
| 11 | `web_ui.py` | 手机端收件箱头部一行元素横溢撑破布局 + 底部 Tab 栏与侧边栏功能重复 → 收件箱控件可换行自适应，手机端移除底部 Tab 栏统一用汉堡侧边栏导航 | 🟢 体验改进 |
| 12 | `web_ui.py` | 删除账号按钮默认 `opacity:0` 仅 hover 显示，手机上无 hover 完全不可见（像功能被删掉）→ 改为桌面/手机端常显（opacity .6，hover 加深到 1） | 🟢 体验改进 |
| 13 | `account_manager.py` + `web_ui.py` | 一键导入 Cookie 去重（upsert）——同邮箱自动续期、新邮箱自动新增 + 配套 Chrome 扩展 `extension/`（读取 httpOnly cookie 一键同步） | 🟠 功能性 |
| 14 | `account_manager.py` + `web_ui.py` | 添加/导入账号时「名称」留空 → 后端自动用邮箱名，不再存成「未命名账号」（命名规则：不填=邮箱名，填了=填的内容） | 🟢 体验改进 |
| 15 | `web_ui.py` | 面板不能直接改账号名 → 新增「编辑」按钮 + `POST /api/accounts/<id>/edit` 端点（支持 `admin_password` 直接鉴权），改名弹窗即改即存 | 🟠 功能性 |
| 16 | `web_ui.py` | 邮箱列表只有本地创建记录、和仪表盘/云端别名对不上 → `/api/emails` 改为以云端完整别名为主数据源（实时拉取+本地补充去重合并），列表打开即完整 | 🟠 功能性 |

完整说明见 [PATCHES.md](PATCHES.md)。

## 快速开始

### 1. 获取上游源码并应用补丁

```bash
git clone https://github.com/heartmore/icloud-hme.git
cd icloud-hme
git apply /path/to/icloud-hme-fixes.patch   # 应用本补丁
```

> 若 `git apply` 因上游更新产生冲突，可改用 `git apply --3way` 或手动按
> [PATCHES.md](PATCHES.md) 的 diff 调整。

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 设置管理密码（补丁 #4 新增）

```bash
export HME_ADMIN_PASSWORD='你的强密码'
```

> ⚠️ 应用补丁 #4 后，面板**强制要求**登录。未设置该环境变量将无法登录。

### 4. 启动

```bash
python web_ui.py                # 监听 127.0.0.1:5050
python web_ui.py --port 8080    # 自定义端口
python web_ui.py --scheduler    # 启动时自动开启调度器
```

浏览器打开 http://127.0.0.1:5050 ，输入管理密码登录。

### 5. 导入 Cookie 添加账号

面板左下角「导入 Cookie」→ 粘贴 [Cookie Editor](https://cookie-editor.cgagnier.ca/)
导出的 **Header String** 或 **JSON**。每个账号独立存储会话。

### 6. 一键导入 / 自动续期（Chrome 扩展，推荐）

通过 `chrome.cookies` API 读取浏览器里**已登录 iCloud 会话的 httpOnly cookie** 并同步到面板：**面板已有相同邮箱账号 → 自动续期**（更新 Cookie）；**没有 → 自动新增**。无需在服务器侧处理 Apple 强制登录/2FA，是最省事的续期方式。

📥 **直接下载 zip**：[`dist/icloud-hme-extension.zip`](https://raw.githubusercontent.com/17sho/icloud-hme-fixes/main/dist/icloud-hme-extension.zip)（解压后即源码）。也可查看 `extension/` 目录（MV3）：

1. 打开 `chrome://extensions` → 开启右上角**开发者模式**
2. 点「加载已解压的扩展程序」→ 选择 `extension/` 目录
3. 打开并**登录** iCloud → 页面出现 ⇄ 按钮 → 展开面板
4. 填入**面板域名**（如 `https://hme.example.com`）和**管理员密码**，点「同步」

> **注意**：扩展的 `host_permissions` 使用 `<all_urls>`，可同步到任意 HTTPS 面板域名。若你只连自己的面板，可在 `manifest.json` 的 `host_permissions` 里把 `<all_urls>` 收紧为你的面板域名（如 `*://hme.example.com/*`）以减少权限。

## 部署到公网（推荐）

不要直接把 `web_ui.py` 绑到公网。推荐用反向代理 + systemd 守护进程，
配置示例见 `deploy/` 目录：

- `deploy/icloud-hme.service` — systemd 服务单元
- `deploy/Caddyfile` — Caddy 反向代理（TLS 自动）

部署后通过 HTTPS 访问，请确认已设置 `HME_ADMIN_PASSWORD` 环境变量。

## API 概览（均返回 JSON，Base URL = 你的访问地址）

登录面板后，Web UI 的「API 文档」标签页会列出全部接口。核心如下：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/login` | 登录（表单 `password` 字段），设置 session cookie |
| GET  | `/logout` | 登出 |
| GET  | `/api/accounts` | 列出所有账号（脱敏，不含 Cookie） |
| GET  | `/api/accounts/{id}/inbox?limit=10&force=1` | 收件箱（IMAP） |
| POST | `/api/accounts/{id}/app-password` | 设置 iCloud 邮箱 + App 专用密码（收件用） |

## 收件功能设置

Hide My Email 收件走 IMAP，需要单独的 **App 专用密码**：

1. 到 [appleid.apple.com](https://appleid.apple.com) → 登录 → 「App 专用密码」生成一个
2. 在面板「收件设置」填入 iCloud 邮箱（`xxx@icloud.com`）+ App 专用密码并保存
3. 到「收件箱」刷新即可收到邮件

> 注意：IMAP 登录名必须是 `@icloud.com` / `@me.com` / `@mac.com` 邮箱，**不能**用
> Apple ID 注册邮箱（如 `xxx@qq.com`）。

## 封号 / 滥用风险

本工具面向 **个人自用、小批量、合规场景**。批量创建隐私邮箱有一定风险：

- 建议**手动小批量**操作，避免高频自动化触发风控
- 触达限流时面板会自动暂停（识别 limit/exceeded/429/too many/上限/频繁 等关键词）
- Cookie 有效期约数天~两周，过期后需重新导入，**无自动刷新**

## 配置示例

- `deploy/icloud-hme.service` — systemd 服务单元
- `deploy/Caddyfile` — Caddy 反向代理示例
- 运行时需要 `HME_ADMIN_PASSWORD` 环境变量（补丁 #4）

## 目录结构

```
.
├── README.md          # 本说明（中文）
├── README.en.md       # English README
├── PATCHES.md         # 补丁详细说明与变更统计
├── LICENSE            # MIT（仅针对本仓库的补丁/文档）
├── patches/
│   └── icloud-hme-fixes.patch   # 完整 unified diff
├── extension/          # Chrome 扩展（MV3）：读取 httpOnly cookie 一键同步（推荐）
│   ├── manifest.json
│   ├── background.js
│   └── content.js
├── docs/              # 补充文档
└── deploy/            # systemd / Caddy 配置示例
```

## License

- **本仓库**（补丁、文档、配置示例）：MIT，见 [LICENSE](LICENSE)
- **上游源码** `heartmore/icloud-hme`：README 中声明为 MIT，但未附 LICENSE 文件；本仓库不包含上游源码，使用请参考上游声明

---

如果这些修复对你有帮助，欢迎 ⭐ Star 支持一下，谢谢！
