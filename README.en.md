# iCloud HME — Patch Set

> English: [README.en.md](README.en.md) · 中文：[README.md](README.md)

This repository is **not the complete application source**. It is a **patch set +
deployment docs** for [heartmore/icloud-hme](https://github.com/heartmore/icloud-hme),
an iCloud Hide My Email multi-account management platform.

```
⚠️ COPYRIGHT NOTICE
The upstream heartmore/icloud-hme declares MIT in its README but does not ship a separate LICENSE file; to avoid uncertainty from that incomplete form, this repository ships patches/docs only and includes no upstream source.
This repository only provides patches and documentation against upstream — it does
NOT redistribute upstream source code. Clone the upstream repo yourself first, then
apply these patches.
```

---

## What is this

`heartmore/icloud-hme` is a multi-account aggregation platform built on iCloud
**Hide My Email**, used to bulk-create `@icloud.com` throwaway addresses. It ships a
Flask web panel: import iCloud cookies, manage multiple accounts and aliases, schedule
bulk alias creation, and receive mail over IMAP.

While deploying the upstream project to a production/public environment and actually
using the "inbox" feature, we found and fixed **5 real issues**, including **2 deadlocks
that hard-freeze the panel**. This repo packages those fixes as a reusable patch plus
deployment docs.

## What this patch fixes

| # | File | Issue | Severity |
|---|------|-------|----------|
| 1 | `account_manager.py` | Save inbox settings → non-reentrant lock deadlock, panel freezes | 🔴 Critical |
| 2 | `mail_cache.py` | Refresh inbox → non-reentrant lock deadlock, panel freezes | 🔴 Critical |
| 3 | `web_ui.py` | Stacked Flask route decorators → Python syntax error | 🔴 Critical |
| 4 | `web_ui.py` | No authentication → anyone can access a public deployment | 🟡 Security |
| 5 | `web_ui.py` | API docs Base URL hard-coded to localhost | 🟢 UX |

Full details: [PATCHES.md](PATCHES.md).

## Quick start

### 1. Clone upstream and apply the patch

```bash
git clone https://github.com/heartmore/icloud-hme.git
cd icloud-hme
git apply /path/to/icloud-hme-fixes.patch   # apply this patch
```

> If `git apply` conflicts due to upstream changes, try `git apply --3way` or apply the
> diffs in [PATCHES.md](PATCHES.md) manually.

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set the admin password (added by patch #4)

```bash
export HME_ADMIN_PASSWORD='your-strong-password'
```

> ⚠️ After patch #4, the panel **requires login**. Without this env var you cannot log in.

### 4. Run

```bash
python web_ui.py                # listens on 127.0.0.1:5050
python web_ui.py --port 8080    # custom port
python web_ui.py --scheduler    # auto-start scheduler
```

Open http://127.0.0.1:5050 in a browser and log in with the admin password.

### 5. Import a cookie to add an account

Use the "Import Cookie" button (bottom-left of the panel) and paste a
[Cookie Editor](https://cookie-editor.cgagnier.ca/) export as **Header String** or
**JSON**. Each account keeps its own session.

## Public deployment (recommended)

Do **not** bind `web_ui.py` directly to the public internet. Use a reverse proxy plus a
process supervisor. See `deploy/`:

- `deploy/icloud-hme.service` — systemd unit
- `deploy/Caddyfile` — Caddy reverse proxy (auto TLS)

After going HTTPS, make sure `HME_ADMIN_PASSWORD` is set.

## API overview (JSON responses, Base URL = your access origin)

After logging in, the "API Docs" tab lists all endpoints. Core ones:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login (form field `password`), sets session cookie |
| GET  | `/logout` | Logout |
| GET  | `/api/accounts` | List all accounts (redacted, no cookies) |
| GET  | `/api/accounts/{id}/inbox?limit=10&force=1` | Inbox (IMAP) |
| POST | `/api/accounts/{id}/app-password` | Set iCloud email + app-specific password (for inbox) |

## Receiving mail

Hide My Email inbox works over IMAP and needs a separate **app-specific password**:

1. Generate one at [appleid.apple.com](https://appleid.apple.com) → "App-Specific Passwords"
2. In the panel "Mail settings", enter the iCloud address (`xxx@icloud.com`) + the app
   password and save
3. Open the "Inbox" tab and refresh

> Note: the IMAP login name must be an `@icloud.com` / `@me.com` / `@mac.com` address.
> The Apple ID registered email (e.g. `xxx@qq.com`) cannot be used as an IMAP login.

## Ban / abuse risk

This tool targets **personal, small-scale, compliant use**. Bulk-creating throwaway
addresses carries some risk:

- Operate in **small manual batches** to avoid triggering rate limits
- The panel auto-pauses on throttling (detects limit/exceeded/429/too many/rate limit)
- Cookies expire in days-to-two-weeks; re-import manually — **no auto-refresh**

## Config examples

- `deploy/icloud-hme.service` — systemd unit
- `deploy/Caddyfile` — Caddy reverse proxy sample
- Runtime requires `HME_ADMIN_PASSWORD` (patch #4)

## Layout

```
.
├── README.md          # Chinese README
├── README.en.md       # English README
├── PATCHES.md         # Detailed patch notes + change stats
├── LICENSE            # MIT (this repo's patches/docs only)
├── patches/
│   └── icloud-hme-fixes.patch   # full unified diff
├── docs/              # extra docs
└── deploy/            # systemd / Caddy samples
```

## License

- **This repository** (patches, docs, config samples): MIT, see [LICENSE](LICENSE)
- **Upstream source** `heartmore/icloud-hme`: declares MIT in its README but ships no LICENSE file; this repository includes no upstream source — refer to the upstream declaration for usage

---

If these fixes help you, a ⭐ Star would be appreciated. Thanks!
