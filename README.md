# Sphere Social & Rewards

Production serverless social application.

## Architecture

- Netlify/Vite React frontend
- Cloudflare Worker API
- Cloudflare D1 database `sphere` through `env.DB`
- Cloudflare R2 through `env.R2`
- Brevo for password-reset email only

The browser never connects directly to D1 and no application state is persisted in localStorage.

## Worker

The production Worker source is under `worker/src/index.ts`. It uses runtime D1 schema introspection (`PRAGMA table_info`) so existing table names are respected without creating a replacement schema. It must be deployed to the existing Sphere Worker with the existing D1/R2 bindings and secrets.

**Important:** the repository does not contain the production D1 database ID or secret values. Do not commit them. Keep the existing Cloudflare configuration and secrets in Cloudflare.

## Frontend

Set `VITE_API_BASE_URL` to the deployed Worker URL. Netlify is configured as a SPA and never accesses D1 directly.

## Media

Only authenticated image uploads are accepted. R2 object keys are generated server-side. Video uploads/transcoding are intentionally not implemented.

## Verification status

The GitHub implementation is committed, but live persistence verification requires deploying the Worker source to the existing Cloudflare Worker and executing the D1/R2/Brevo test sequence against that production environment. No successful live test is claimed until those requests and database/storage checks have actually been observed.
