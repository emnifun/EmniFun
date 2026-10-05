-- EmniFun permanent account + Google authentication + recovery vault.
-- This migration is intentionally NOT applied to production by this task.
-- EmniFeed ID is the permanent backend identity/bridge.

CREATE TABLE IF NOT EXISTS accounts (
  emnifeed_id TEXT PRIMARY KEY,
  gamer_tag TEXT NOT NULL,
  gamer_tag_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  google_changed_at INTEGER,
  CHECK (length(emnifeed_id) >= 8),
  CHECK (length(gamer_tag) > 0)
);

CREATE INDEX IF NOT EXISTS idx_accounts_last_active
  ON accounts(last_active_at);

CREATE TABLE IF NOT EXISTS google_identities (
  google_sub TEXT PRIMARY KEY,
  emnifeed_id TEXT NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL,
  FOREIGN KEY (emnifeed_id) REFERENCES accounts(emnifeed_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recovery_keys (
  recovery_key_id TEXT PRIMARY KEY,
  emnifeed_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  version INTEGER NOT NULL CHECK (version >= 1),
  key_hash TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  viewable_until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (emnifeed_id, slot),
  FOREIGN KEY (emnifeed_id) REFERENCES accounts(emnifeed_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_keys_account
  ON recovery_keys(emnifeed_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  emnifeed_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (emnifeed_id) REFERENCES accounts(emnifeed_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_account
  ON auth_sessions(emnifeed_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
  ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (
    purpose IN ('google_login', 'registration', 'recovery')
  ),
  emnifeed_id TEXT,
  google_sub TEXT,
  recovery_key_id TEXT,
  recovery_key_version INTEGER,
  nonce_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (emnifeed_id) REFERENCES accounts(emnifeed_id) ON DELETE CASCADE,
  FOREIGN KEY (recovery_key_id) REFERENCES recovery_keys(recovery_key_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry
  ON auth_challenges(expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_emnifeed
  ON auth_challenges(emnifeed_id);

CREATE TABLE IF NOT EXISTS auth_challenge_consumptions (
  challenge_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  consumed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_key_consumptions (
  recovery_key_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  emnifeed_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  consumed_at INTEGER NOT NULL,
  PRIMARY KEY (recovery_key_id, version)
);

CREATE INDEX IF NOT EXISTS idx_recovery_key_consumptions_account
  ON recovery_key_consumptions(emnifeed_id);
