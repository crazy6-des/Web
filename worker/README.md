# Sphere Worker

This is the production Cloudflare Worker API for Sphere Social & Rewards.

## Existing production bindings

- `DB` → D1 database `sphere`
- `R2` → R2 bucket `sphere socials`

The Wrangler configuration maps the existing D1 database ID `4de71dc8-fd19-44c2-994f-e5c0dbbf4dc2` to `DB` and the existing R2 bucket `sphere socials` to `R2`.

The Worker uses the native bindings only:

- `env.DB` for D1
- `env.R2` for R2

No R2 S3 credentials or database passwords are required by the Worker.

## Existing Cloudflare secrets

Keep the already-configured secrets in Cloudflare Runtime Variables/Secrets:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `BREVO_API_KEY`
- `BREVO_FROM_EMAIL`

Never commit or paste secret values into GitHub or chat.

## Frontend origin

Set the non-secret `FRONTEND_ORIGIN` in Cloudflare to the exact deployed Netlify origin before the frontend uses credentialed cross-origin requests.

## Optional provider boundaries

The backend has inactive-by-default provider boundaries for:

- `OFFERWALL_PROVIDER` + `OFFERWALL_SECRET` for signed offerwall postbacks
- `PAYSTACK_SECRET_KEY` for Paystack withdrawals
- `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` for PayPal withdrawals
- `MUSIC_PROVIDER_URL` for an external music metadata/search provider

These are optional and must not be populated with fake values. Paystack, PayPal and offerwall crediting remain inactive until real provider configuration is supplied.

## Deploying the Worker

From the `worker` directory, after authenticating Wrangler to the Cloudflare account that owns the existing Worker:

```bash
npx wrangler deploy
```

Do not use `wrangler d1 create`, do not create another D1 database, and do not configure R2 through S3 access keys.

## Schema compatibility

The Worker uses `PRAGMA table_info(...)` internally to discover compatible columns in the already-provisioned schema before issuing writes. This is not a public schema/debug endpoint and it does not create, replace, or migrate application tables.

Before production activation, deploy this Worker and run the persistence test sequence from the project specification against the real D1/R2/Brevo resources. CI success only verifies source/type/build correctness; it does not prove live Cloudflare persistence.