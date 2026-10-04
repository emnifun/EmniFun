-- Security fixes for permanent account authentication.
-- Apply after 0001_auth.sql. This migration is intentionally not applied here.

ALTER TABLE accounts ADD COLUMN recovery_lock_token TEXT;
ALTER TABLE accounts ADD COLUMN recovery_lock_until INTEGER;

ALTER TABLE recovery_keys ADD COLUMN crypto_version INTEGER NOT NULL DEFAULT 1 CHECK (crypto_version >= 1);

ALTER TABLE auth_challenge_consumptions ADD COLUMN credential_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_challenge_consumptions_credential
  ON auth_challenge_consumptions(credential_hash);

CREATE INDEX IF NOT EXISTS idx_accounts_recovery_lock
  ON accounts(recovery_lock_until);
