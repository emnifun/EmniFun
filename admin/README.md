# EmniFun Admin Panel (FiveWink)

This folder contains the public frontend administration panel for EmniFun Game 1, FiveWink.

## Security Model

The administration panel does **not** rely on secrecy of its URL. Anyone can access `/admin/index.html`, but all administrative data and mutation operations are strictly authorized server-side by the Cloudflare Worker API.

- **Authentication:** Reuses the permanent EmniFun account identity and `__Host-emnifun_session` HttpOnly cookie.
- **Authorization:** Checked server-side on every `/api/admin/*` API call against the `is_admin` column in the D1 `accounts` table.
- **Access control:**
  - Unauthenticated visitors receive `401 Unauthorized`.
  - Authenticated non-admin users receive `403 Forbidden`.
  - Only accounts with `is_admin = 1` are permitted to perform management operations.

## Features

- **Puzzle Management:** View all FiveWink puzzles (draft, published, unpublished, archived).
- **Date-Based Scheduling:** Assign puzzles to specific dates using the canonical **Asia/Kolkata (IST)** date standard.
- **Strict Content Lock:** Published puzzles cannot have their answer or clues edited, protecting active player sessions and completed game integrity.
- **Duplicate Prevention:** Prevents multiple puzzles from being scheduled or published on the same date.
- **Safe Archival & Unpublishing:** Soft-transitions (`published` -> `draft` or `archived`) without destructive data deletion.

## Initial Administrator Setup

To designate an account as administrator, run this SQL statement in the Cloudflare D1 console:

```sql
UPDATE accounts SET is_admin = 1 WHERE gamer_tag_key = 'your_gamertag_lowercase';
```

To remove administrator access:

```sql
UPDATE accounts SET is_admin = 0 WHERE gamer_tag_key = 'your_gamertag_lowercase';
```
