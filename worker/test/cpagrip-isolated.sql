PRAGMA foreign_keys=OFF;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE offerwall_events (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE,
  provider TEXT,
  provider_name TEXT,
  event_type TEXT,
  user_id TEXT,
  offer_id TEXT,
  status TEXT,
  state TEXT,
  amount REAL,
  created_at INTEGER,
  processed_at INTEGER
);

CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  offer_id TEXT,
  offerwall_event_id TEXT,
  event_id TEXT,
  provider TEXT,
  type TEXT,
  status TEXT,
  state TEXT,
  amount REAL,
  created_at INTEGER
);

CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT,
  user_id TEXT,
  type TEXT,
  transaction_type TEXT,
  direction TEXT,
  amount REAL,
  amount_points REAL,
  balance_after REAL,
  status TEXT,
  reference_id TEXT,
  created_at INTEGER
);

INSERT INTO users (id, username, email)
VALUES ('cpagrip-isolated-user', 'cpagrip_isolated_user', 'cpagrip-isolated@example.invalid');

INSERT INTO wallets (id, user_id, balance, updated_at)
VALUES ('cpagrip-isolated-wallet', 'cpagrip-isolated-user', 0, 0);
