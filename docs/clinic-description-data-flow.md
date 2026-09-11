# Clinic Profile & Landing Page Data Flow

## Purpose

A clinic's public page text now lives in the merged **landing configuration**
(`Clinic.landing`), stored twice per clinic:

- `landing.draft` — edited in the dashboard "Landing Page Builder".
- `landing.published` — served to the public page after "Publish".

The clinic profile fields that remain dynamic (name, address, contact number,
operating hours) are **not** edited in the landing editor. Operating hours keep
their own `panel-hours` workflow.

Static content owned by the landing editor:

| Field | Where it renders publicly | Limit |
| --- | --- | --- |
| `logoUrl` | header logo | 5MB upload, `/uploads/...` or http(s) |
| `primaryColor` | CTAs, tagline | hex |
| `secondaryColor` | section eyebrows | hex |
| `headerBackground` | `#site-header` background (blank = frosted white) | hex |
| `footerBackground` | `#site-footer` background (blank = dark navy) | hex |
| `typography` | headings / serif text | `default\|clean\|elegant\|rounded` |
| `tagline` | under clinic name | 160 |
| `description` | hero, `#clinic-description` (migrated from `Clinic.description`) | 600 |
| `heroEyebrow` | hero "Welcome to" line | 120 |
| `sectionTexts.{services,dentists,testimonials,pricing,visit}` | each section `{eyebrow, heading, intro}` | 120/160/300 |
| `socialLinks[]` | footer "Follow us" | max 5, http(s) URLs |
| `blocks[]` | custom content blocks | max 12 |
| `hiddenSections[]` / `sectionOrder[]` | section visibility and order | allow-listed keys |

## Write paths

- `POST /api/v1/tenants/register` seeds a fresh clinic with
  `landing.draft` / `landing.published` defaults (description copied from the
  registration form).
- `PATCH /api/v1/tenants/:id/landing` saves the draft. The body is sanitized by
  `backend/src/utils/landingSanitize.js` (allow-lists, limits, hex/URL checks).
- `POST /api/v1/tenants/:id/landing/publish` copies `draft` → `published`.
- `POST /api/v1/tenants/:id/landing/upload` stores images (multer, 5MB);
  the dashboard crops client-side with Cropper.js before uploading.
- `DELETE /api/v1/tenants/:id/landing/image` removes an orphaned upload if no
  draft/published/document still references it.

## Read path

- `GET /api/v1/tenants/:id/landing` returns `{ draft, published,
  clinicDescription }` for the authenticated administrator. It lazily
  back-fills any legacy clinics via `backend/src/utils/landingMigration.js`
  (idempotent) and copies `Clinic.description` into landing when empty.
- Public controllers serve `landing.published`; the page falls back to the
  clinic record (`Clinic.description`) when the landing description is empty.
- Draft preview (`/clinicHomePage.html?clinic=...&preview=1`) and the embedded
  dashboard preview post draft updates to the page via `postMessage`
  (`landing-preview-update`).

## Migration

`cd backend && npm run migrate:landing` runs the idempotent one-shot script
(`backend/src/scripts/migrateLanding.js`). It walks every clinic and merges
profile values (e.g. `description`) into `landing.draft`/`landing.published`
with safe defaults. Safe to re-run.

## Permissions and validation

- Writes require a bearer token; only the owning `CLINIC_ADMIN` or a
  `SUPER_ADMIN` may edit a clinic's landing page (`ownsClinicOr403`).
- The backend trims and length-caps every field, rejects invalid hex / URLs,
  allow-lists section keys, platforms, typography, and block styles.
  Registration and dashboard forms mirror the same limits.

## Application access states

- `CLINIC_ADMIN` dashboards remain locked (navigation disabled) until the
  clinic application is `Approved`, checked after sign-in and every 30 seconds.

## Tests

`cd backend && npm test` (vitest):

- `tests/landingSanitize.test.js` and `tests/landingMigration.test.js` are
  pure unit tests and always run.
- `tests/landingEndpoints.test.js` runs supertest + real MongoDB integration
  tests only when `TEST_MONGO_URI` is set; otherwise the suite auto-skips.