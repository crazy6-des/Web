# Sphere Worker

Deploy `src/index.ts` as the existing `sphere-api.binancecompany274.workers.dev` Worker.

Required existing bindings:

- `DB` → D1 database `sphere`
- `R2` → existing Sphere production R2 bucket

Required existing Cloudflare secrets:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `BREVO_API_KEY`
- `BREVO_FROM_EMAIL`

Recommended non-secret variable:

- `FRONTEND_ORIGIN` → the exact Netlify origin, for example `https://your-site.netlify.app`

Do not commit secret values or a new D1 database ID. Keep the already-provisioned Cloudflare bindings and secrets.

The Worker uses `PRAGMA table_info(...)` at runtime to discover compatible existing columns before issuing writes. This is intentionally migration-free; it does not create or replace any application tables.

Before production activation, deploy this Worker and run the persistence test sequence from the project specification against the real D1/R2/Brevo resources.
