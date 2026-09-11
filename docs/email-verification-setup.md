# Clinic Registration — Email Verification

A clinic account (Clinic + CLINIC_ADMIN) is now created **only after** the
person registering proves they control the admin email by entering a
short‑lived, single‑use code that is emailed to them via Gmail.

## Flow overview

```
Register form ──▶ POST /register/initiate ──▶ code emailed, "pending" stored
                                              (NO clinic created yet)
Verify dialog ──▶ POST /register/verify   ──▶ code checked → Clinic + Admin created
                                              → documents uploaded → done
   (optional)  ──▶ POST /register/resend  ──▶ a fresh code is emailed
```

- The clinic + admin are created **inside `/register/verify`**, never before.
- The verification code is generated with `crypto.randomInt` and stored only as
  a **bcrypt hash**. It is never returned in an API response, never written to
  logs, and never placed in client‑side code.
- The admin password is bcrypt‑hashed at `initiate` and stored on the pending
  record as a hash (never plaintext).

## Backend pieces

| File | Purpose |
|------|---------|
| `backend/src/models/pendingRegistrationModel.js` | Stores the un‑verified submission (hashed code, hashed password, attempts, resend counters). TTL index auto‑purges abandoned records. |
| `backend/src/utils/verificationCode.js` | Secure code generation, bcrypt hash/compare, expiry helpers, env‑driven policy. |
| `backend/src/services/emailService.js` | Gmail (nodemailer) transport + verification email. Logs only a masked recipient, never the code. |
| `backend/src/middlewares/rateLimit.js` | In‑memory per‑IP rate limiter for the registration endpoints. |
| `backend/src/routes/tenantRoutes.js` | `POST /register/initiate`, `/register/verify`, `/register/resend` (and legacy `/register` → initiate). |

### Endpoints (base: `/api/v1/tenants`)

| Method & path | Body | Success | Notes |
|---------------|------|---------|-------|
| `POST /register/initiate` | `{ clinicName, slug, address, description?, adminData:{ firstName, lastName, email, contactNumber, password } }` | `200 { data:{ pendingId, email, expiresInSeconds, attemptsRemaining, resendsRemaining, resendCooldownSeconds } }` | Validates + sanitizes input, blocks duplicate email/slug, emails a code. |
| `POST /register/verify` | `{ pendingId, code }` | `201 { data:{ _id, clinic, admin } }` | Creates the clinic + admin, deletes the pending (single‑use). |
| `POST /register/resend` | `{ pendingId }` | `200 { data:{ … } }` | Rate‑limited; issues a brand‑new code and invalidates the old one. |

`POST /register` is kept as a backward‑compatible alias that now behaves exactly
like `/register/initiate` (so there is no path that creates a clinic without
verification).

## Configuration (environment variables)

All secrets live in `backend/.env` (never hard‑coded). Required:

```dotenv
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-16-char-app-password      # Gmail App Password, NOT your login password
MAIL_FROM_NAME=NovaClinic                 # optional display name
FRONTEND_URL=http://localhost:5173        # used to build login/public links in emails (set to your HTTPS origin in prod)
```

Optional policy overrides (sensible defaults are built in):

```dotenv
VERIFICATION_CODE_LENGTH=6
VERIFICATION_CODE_TTL_MINUTES=10
VERIFICATION_MAX_ATTEMPTS=5
VERIFICATION_RESEND_COOLDOWN_SECONDS=60
VERIFICATION_MAX_RESENDS=3
VERIFICATION_PENDING_TTL_MINUTES=60
```

### Getting a Gmail App Password

1. Enable **2‑Step Verification** on the Google account: <https://myaccount.google.com/security>.
2. Open **App passwords**: <https://myaccount.google.com/apppasswords>.
3. Create a password (app: “Mail”, device: “Other”). Google shows a 16‑character
   value like `wajr omkf xadl mrrd`.
4. Put the Gmail address in `EMAIL_USER` and that 16‑char value in `EMAIL_PASS`
   (spaces are fine). Restart the backend.

> Regular account passwords will **not** work while 2‑Step Verification is on —
> you must use an App Password.

Verify the credentials without sending mail:

```bash
cd backend
node --input-type=module -e "import('dotenv').then(d=>{d.default.config();return import('./src/services/emailService.js')}).then(m=>m.verifyEmailTransport()).then(()=>console.log('GMAIL OK')).catch(e=>console.log('FAIL',e.message))"
```

## Install & run

```bash
# Backend
cd backend
npm install            # installs nodemailer (already added to package.json)
npm run dev            # or: npm start   (http://localhost:5000)

# Frontend (separate terminal)
cd frontend
npm run dev            # Vite dev server
```

## How to test the complete flow (manually)

1. Open the marketing site (`index.html`) and click **Register**
   (or open `/index.html?auth=register` directly).
2. Fill in the clinic + administrator details, attach the Business License and
   Medical License files, and submit.
3. You are taken to the **Verify your email** step. Check the admin email inbox
   for the 6‑digit code and enter it.
4. On success the clinic workspace is created, the documents upload, and you see
   the confirmation. Sign in from the login page with the admin email/password.

Things to try (all produce clear messages):

- **Wrong code** → “Incorrect code. N attempts remaining.” After 5 wrong tries it
  locks and asks you to resend.
- **Expired code** → wait past the TTL (default 10 min) → “This code has expired.”
- **Resend** → click *Resend code*; it is disabled for 60 s and capped at 3 resends.
- **Duplicate email** → registering an email that already has an account returns
  “An account with this email already exists.”
- **Reused code** → after a successful verification the same code no longer works.

## Automated tests

```bash
cd backend
npm test                                   # unit tests (code gen/hash/format) always run

# Full endpoint flow (needs a DISPOSABLE Mongo — its DB is dropped afterwards):
TEST_MONGO_URI=mongodb://localhost:27017/novaclinic-test npm test
```

`tests/registrationVerify.test.js` mocks the email service and captures the code,
so it exercises initiate → verify → resend, attempt lock‑out, expiry, duplicate
handling, and single‑use invalidation without sending real email.

> Do **not** point `TEST_MONGO_URI` at a production/Atlas database — the suite
> calls `dropDatabase()` in teardown.

## Application approval / rejection emails

The same Gmail configuration is reused to notify the clinic administrator when a
SaaS super admin reviews the application (`PATCH /api/v1/saas-admin/applications/:clinicId/review`):

- **Approved** → `sendApplicationApprovedEmail` (welcome + link to sign in, and the
  clinic's public page when `FRONTEND_URL` is set).
- **Rejected** → `sendApplicationRejectedEmail` (includes the rejection reason and a
  link to sign in and resubmit corrected documents).

Email delivery is wrapped in try/catch so a mail failure never blocks the review;
the in‑app `notifications[]` entry on the clinic remains the source of truth. Links
are built from `FRONTEND_URL` (omitted gracefully if it isn't set).

## Security notes

- Codes are random (`crypto.randomInt`), bcrypt‑hashed at rest, single‑use, and
  time‑boxed; comparison is constant‑time (`bcrypt.compare`).
- Attempts are capped per code; resends are cooldown‑ + count‑limited; endpoints
  are per‑IP rate‑limited (`rateLimit.js`).
- All inputs are validated and sanitized server‑side (email/slug format, length
  caps, password length). Duplicate emails/slugs are rejected.
- The code is never logged or returned to the client.
- **HTTPS:** run the API behind TLS in production (e.g. a reverse proxy / managed
  HTTPS) and change the frontend base URLs from `http://localhost:5000` to your
  HTTPS origin. The verification payloads (code, password) must only travel over
  HTTPS off‑localhost.
- The in‑memory rate limiter is per‑process; for multiple instances back it with
  a shared store (e.g. Redis).
