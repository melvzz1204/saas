# Render.com Deployment Guide — Dental SaaS (NovaClinic)

This guide deploys the project to Render as **two services**:

| Service         | What it is                                                      | Render type     |
| --------------- | --------------------------------------------------------------- | --------------- |
| **Backend API** | Express + Socket.IO + MongoDB + local file uploads (`backend/`) | **Web Service** |
| **Frontend**    | Vite multi-page static site (`frontend/`)                       | **Static Site** |

> The frontend already has build-time support for a baked backend URL: every
> HTML page injects `<script>window.VITE_API_URL="%VITE_API_URL%";</script>` and
> [`src/util/apiBase.js`](../frontend/src/util/apiBase.js) resolves the API
> origin in this order: **1)** baked `VITE_API_URL` → **2)** same-origin
> (single-service deploy) → **3)** `http://localhost:5000` (dev only).
>
> Socket.IO also connects through the same resolved base, so live patient
> tracking works out of the box.

---

## 1. Prerequisites

- A [Render](https://render.com) account (free tier is fine for a capstone
  demo).
- A MongoDB Atlas cluster (the app already targets `saas_dental_clinic` — reuse
  or create a new database for production).
- A Gmail account + app password for email verification (optional but
  recommended).
- Your code pushed to GitHub/GitLab so Render can auto-deploy.

---

## 2. Backend — Render Web Service

### 2.1 Create the service

1. Render dashboard → **New +** → **Web Service**.
2. Connect your repo, then point at the `backend/` directory:
   - **Root Directory:** `backend`
3. Render detects Node → uses these defaults:

   | Setting           | Value                                        |
   | ----------------- | -------------------------------------------- |
   | **Environment**   | `Node`                                       |
   | **Build Command** | `npm install`                                |
   | **Start Command** | `npm start` (runs `node server.js`)          |
   | **Instance Type** | Free (or Starter for websockets reliability) |

   > The server auto-seeds default dental services and subscription plans on
   > boot ([`server.js`](../backend/server.js:64)), so no manual seeding is
   > needed.

### 2.2 Environment variables

Add these under **Environment** (do **not** commit the real `.env`):

| Variable            | Value / Notes                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | `production`                                                                                                                                                                                            |
| `PORT`              | Render injects this automatically (leave unset or `10000`)                                                                                                                                              |
| `MONGO_URI`         | `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/saas_dental_clinic`                                                                                                                         |
| `JWT_SECRET`        | A long random string (generate with `openssl rand -hex 32`)                                                                                                                                             |
| `SAAS_ADMIN_SECRET` | The shared secret used by `saasAdminLogin` to mint admin tokens                                                                                                                                         |
| `EMAIL_USER`        | Gmail address used by nodemailer (e.g. `bahalakahh@gmail.com`)                                                                                                                                          |
| `EMAIL_PASS`        | Gmail **App Password** (not the account password)                                                                                                                                                       |
| `MAIL_FROM_NAME`    | `NovaClinic`                                                                                                                                                                                            |
| `FRONTEND_URL`      | **The deployed frontend origin**, e.g. `https://frontend.onrender.com` — used to build login/public links in emails AND added to the Socket.IO CORS allow-list ([`server.js`](../backend/server.js:13)) |
| `PAYMONGO_MOCK`     | Leave unset (defaults to `true` → PayMongo-shaped simulated gateway)                                                                                                                                    |

> ✅ All password hashing uses the **pure-JS `bcryptjs`** — no native addon
> compilation. `bcryptjs` **must** be declared in `backend/package.json`
> (present as `^2.4.3`) and committed with `package-lock.json`. If you hit
> `ERR_MODULE_NOT_FOUND: Cannot find package 'bcryptjs'`, the dependency is
> missing from the committed lockfile — commit `package.json` +
> `package-lock.json` and redeploy (see gotcha #4).

### 2.3 Persistent Disk — REQUIRED for uploads

Render's filesystem is **ephemeral** — anything written to disk is wiped on
every deploy. The app stores uploaded documents (licenses, profile images,
landing assets) on local disk:

- [`uploadMiddleware.js`](../backend/src/middlewares/uploadMiddleware.js:11)
  writes to `backend/uploads/documents`
- [`app.js`](../backend/src/app.js:71) serves that folder at
  `/uploads/documents`

**To keep uploads between deploys:**

1. In the Web Service → **Disks** → **Add Disk**:
   - **Mount Path:** `/opt/render/project/src/backend/uploads`
   - **Size:** 1 GB (free tier allows 1 GB)
2. This path is **absolute** and survives deploys. Because `uploadMiddleware.js`
   resolves `uploads` relative to `__dirname`, a disk mounted at
   `/opt/render/project/src/backend/uploads` lands exactly on the folder the app
   uses.

> ⚠️ Uploads are still **per-service only**. If you scale to multiple instances
> or re-create the service, files won't be shared. For a production
> multi-instance setup, move uploads to a cloud object store (S3/R2) — the disk
> is the right call for a capstone demo.

### 2.4 Deploy & verify

1. **Manual Deploy** → **Deploy latest commit** (or push to the connected
   branch).
2. After the build finishes, open `https://<backend>.onrender.com/health` —
   expect:
   ```json
   { "status": "OK", "message": "Server is running smoothly" }
   ```
3. Test a billing endpoint:
   ```bash
   curl https://<backend>.onrender.com/api/v1/billing/meta
   ```
   → returns `{ "success": true, "simulated": true, ... }` with plans + test
   payment methods.

---

## 3. Frontend — Render Static Site

### 3.1 Create the service

1. Render dashboard → **New +** → **Static Site**.
2. Connect the repo, point at `frontend/`:

   | Setting               | Value                          |
   | --------------------- | ------------------------------ |
   | **Root Directory**    | `frontend`                     |
   | **Build Command**     | `npm install && npm run build` |
   | **Publish Directory** | `dist`                         |

3. Because the project is a **multi-page** Vite app (dashboards, logins, clinic
   templates), [`vite.config.js`](../frontend/vite.config.js:14) auto-builds an
   input map from every `.html` file (excluding the `probe-*` scratch pages).
   All pages are emitted into `dist/`.

### 3.2 Environment variables (build-time)

| Variable       | Value                                                |
| -------------- | ---------------------------------------------------- |
| `VITE_API_URL` | `https://<backend>.onrender.com` (no trailing slash) |

This bakes the backend URL into every HTML page's `window.VITE_API_URL`, so
[`apiBase.js`](../frontend/src/util/apiBase.js) uses it and never falls back to
`localhost:5000`.

### 3.3 SPA / route handling

The project is **plain multi-page HTML** (no client-side router), so there is no
catch-all redirect needed. If you add a hash router later, you can leave
Render's default redirect settings as-is — hash routes (`#/overview`) are
handled entirely in the browser.

### 3.4 Deploy & verify

1. Deploy, then open `https://<frontend>.onrender.com/`.
2. Confirm API calls hit the backend:
   - Open DevTools → Network, load the landing page, and check that requests to
     `/api/v1/...` go to your **backend origin** (not `localhost:5000`).
3. Log in and confirm **live updates** work (Socket.IO connects to the same
   backend origin).

---

## 4. Post-deploy checks

| #   | Check                                | How                                                                                      |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | Health endpoint                      | `GET /health` → `status: OK`                                                             |
| 2   | Landing page loads                   | Frontend URL, no console errors                                                          |
| 3   | Login works                          | `clinicLogin.html` / `saasAdminLogin.html` against the backend                           |
| 4   | Registration + **simulated payment** | Register a clinic → choose a test card → check billing console                           |
| 5   | Uploads survive a redeploy           | Upload a license → `Manual Deploy` → the file still renders via `/uploads/documents/...` |
| 6   | WebSockets live updates              | Open patient dashboard + staff board; update status → both update without refresh        |
| 7   | Billing cycle                        | SaaS admin → Billing → **Run billing cycle now**; verify via `billingAdmin.html`         |
| 8   | Emails                               | Verify registration code arrives (check Gmail app-password setup)                        |

---

## 5. Common issues & gotchas

1. **`VITE_API_URL` not set at build time** → the static site falls back to
   `http://localhost:5000` in the browser and every API call fails. Always set
   it on the **Static Site** service (not the Web Service).
2. **`FRONTEND_URL` not set on the backend** → Socket.IO CORS rejects the
   frontend origin (`Origin mismatch`) and email links point at `localhost`. Set
   it to the frontend URL.
3. **Uploads vanish after deploy** → missing **Persistent Disk**. Add the disk
   at `/opt/render/project/src/backend/uploads` (see §2.3).
4. **`ERR_MODULE_NOT_FOUND: Cannot find package 'bcryptjs'`** → all backend
   password hashing uses the pure-JS `bcryptjs` (no native build needed), but it
   must be a **declared dependency**. If the error appears on a clean Render
   build, commit `backend/package.json` (it now lists `"bcryptjs": "^2.4.3"`)
   **and** the regenerated `backend/package-lock.json`, then redeploy. Do
   **not** `npm rebuild bcrypt` — the native `bcrypt` package is no longer
   imported anywhere (all imports point at `bcryptjs`).
5. **Free tier sleep** → both services spin down after ~15 min idle; first
   request after sleep can take 30–60s to wake. Not a bug.
6. **CORS on upload URLs** → [`app.js`](../backend/src/app.js:71) already sends
   `Access-Control-Allow-Origin: *` for `/uploads/*` and
   `Cross-Origin-Resource-Policy: cross-origin`, so documents render
   cross-origin.
7. **Two checkouts in `staffDashboard.js`** → one hardcodes ₱1,500 to
   `/settle-payment`; the other posts to `/appointments/:id/checkout`, which has
   **no backend route** (404). Use `/settle-payment` (or the billing simulation)
   in production demos.

---

## 6. Optional: single-service deployment

If you prefer **one** Web Service instead of two:

1. Serve the built `frontend/dist` from Express (add `express.static("dist")` +
   a fallback).
2. Build the frontend as part of the backend's Render build command:
   `cd ../frontend && npm install && npm run build && cd ../backend && npm install`
3. Leave `VITE_API_URL` **empty** —
   [`apiBase.js`](../frontend/src/util/apiBase.js) then falls back to
   **same-origin**, so all API + Socket.IO calls go to the one service.

---

## 7. Quick reference — env var summary

```env
# ---- Backend (Render Web Service) ----
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/saas_dental_clinic
JWT_SECRET=<random-64-hex>
SAAS_ADMIN_SECRET=<shared-capstone-secret>
EMAIL_USER=<gmail>
EMAIL_PASS=<gmail-app-password>
MAIL_FROM_NAME=NovaClinic
FRONTEND_URL=https://<frontend>.onrender.com
# PAYMONGO_MOCK=true   (optional; simulated gateway is the default)

# ---- Frontend (Render Static Site, build-time) ----
VITE_API_URL=https://<backend>.onrender.com
```
