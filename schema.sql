-- Supabase Postgres schema for CyberSec Studio Web
-- Supabase Auth (auth.users) handles login/signup/session management itself.
-- This table extends it with the crypto identity every user gets on signup.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  created_at timestamptz not null default now(),

  -- Public key material: safe to expose to any other user, this is how
  -- people "find" each other for secure messaging (mirrors GPG's public
  -- keyservers, just scoped to this app's user directory).
  public_key_armored text not null,       -- OpenPGP public key, ASCII-armored

  -- Private key material: NEVER sent to the browser in plaintext.
  -- OpenPGP's own key encryption protects it, using a passphrase derived
  -- from the user's account password (see lib/crypto/identity.ts).
  -- The server can decrypt this in memory when needed (e.g. to decrypt an
  -- incoming message on the user's behalf) but the decrypted key is never
  -- persisted or returned to the client.
  private_key_armored_encrypted text not null,

  constraint username_format check (username ~ '^[a-zA-Z0-9_.-]{3,32}$')
);

-- Row-level security: users can read any public key (needed to find/message
-- each other), but only ever touch their own row for anything else.
alter table profiles enable row level security;

create policy "Public keys are visible to all authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update only their own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert only their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Messages: encrypted client-side or server-side before storage, so the
-- database never holds plaintext. sender/recipient are usernames (public,
-- like the assignment's "find each other via public key/username" model).
create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  encrypted_payload text not null,   -- OpenPGP-encrypted + signed message
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

create policy "Users can read messages they sent or received"
  on messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "Users can send messages as themselves"
  on messages for insert
  with check (auth.uid() = sender_id);

-- Password vault: stores site credentials ENCRYPTED (reversible, AES-GCM) not
-- hashed (irreversible) — a vault has to give the real password back to the
-- user, which hashing can never do. The encryption key is derived from the
-- user's account password the same way the OpenPGP identity key is (see
-- lib/crypto/identity.ts), but with a distinct salt context (see
-- lib/crypto/vault.ts) so the two derived keys are cryptographically
-- unrelated even though they share the same source password.
create table vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  site_name text not null,
  site_username text,
  encrypted_password_iv text not null,
  encrypted_password_ciphertext text not null,
  created_at timestamptz not null default now()
);

alter table vault_entries enable row level security;

create policy "Users can read only their own vault entries"
  on vault_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert only their own vault entries"
  on vault_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete only their own vault entries"
  on vault_entries for delete
  using (auth.uid() = user_id);
