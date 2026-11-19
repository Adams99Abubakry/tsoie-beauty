# TSOIE Beauty

Static storefront with a protected admin studio and Vercel Node.js API functions.

- Storefront: `https://www.tsoiebeauty.com/`
- Admin: `https://www.tsoiebeauty.com/admin/`
- Deploy: push `main` to the connected Vercel project `tsoie-beauty-web`.

## Product management

The admin can create, edit, publish, unpublish and delete products; set GBP prices in minor units, optional stock quantities, descriptions and badges; and upload JPG, PNG or WebP product images up to 3 MB. Images are re-encoded as optimised WebP. Existing products are seeded once, with their original artwork and unconfirmed prices left unset.

The public storefront and admin share a versioned catalogue stored in private Vercel Blob storage. Writes use ETag preconditions and per-product revisions to prevent silent overwrites. Public catalogue requests bypass caches. Open storefront tabs refresh on focus, on saves in another tab, and every 15 seconds while visible. Uploaded images are immutable and served through a dedicated media endpoint.

## Admin account

This is a provisioned single-admin account, not public registration. No email verification is required. The initial account is provisioned from server environment variables:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`: `salt:scryptHex` (64-byte scrypt output)
- `ADMIN_SESSION_SECRET`: random secret with at least 32 characters
- `BLOB_READ_WRITE_TOKEN`: connected private Blob store credential

Never add real passwords or secret values to source control. The browser receives an encrypted HttpOnly, Secure, SameSite=Strict session cookie lasting eight hours. Use **Change password** in the admin account area to enter the current password and a new password (at least 12 characters). Updated salted scrypt hashes are stored in the private account record in Blob storage and take precedence over the initial environment hash, so password changes survive deployments. No email verification is required. Changing the password signs out all existing sessions, including the session making the change. Admin write endpoints require both a valid session and same-origin requests. Login attempts are limited in persistent shared storage.

Payments remain disabled until Stripe, confirmed prices and delivery rules are connected.

## Checks

Use Node 24 or newer for tests:

```sh
npm ci
npm run check
npm test
```

Tests exercise the real API handlers with an isolated in-memory Blob adapter, HTTP requests, session cookies and image processing. Storefront tests verify catalogue updates, escaped content, UUID products, price totals and stock handling. No production data or real credentials are used by the test suite.
