# CyberSec Studio Web

Next.js + Supabase + real OpenPGP (openpgp.js) + real X.509 PKI (node-forge, coming next).
Deployable straight from GitHub to Vercel.

## What's real here (not a mockup)

- **Real user accounts** via Supabase Auth (email + password, sessions handled for you)
- **Real OpenPGP keypairs**, generated automatically at signup — verified in a sandboxed
  test run against the actual `openpgp` library before being wired in: real armored keys,
  the private key genuinely stays locked (`isDecrypted: false`) until explicitly unlocked
  with a password-derived passphrase, and a full encrypt→sign→decrypt→verify round trip
  produces standards-compliant PGP output — meaning a message encrypted here could, in
  principle, be decrypted by a real `gpg --decrypt` on an actual terminal (same underlying
  format, not a custom lookalike).
- **Private keys encrypted at rest**: `profiles.private_key_armored_encrypted` is never
  decrypted except transiently, in server memory, for the duration of a single send/receive
  operation — never returned to the browser, never logged, never persisted unlocked.
- **Users find each other by username**, exactly like the assignment's "public key like a
  username" model — sending a message only requires the recipient's username; their public
  key lookup happens server-side.
- **Row Level Security** (see `schema.sql`): every user can read any public key (needed to
  find each other) but can only touch their own profile row and only read messages they
  actually sent or received.

## What's next (not built yet)
- X.509 PKI (CA/CSR/signing) using `node-forge`, mirroring the OpenPGP identity pattern
- Steganography, watermarking, forensics, and classical-cipher panels — port from the
  existing browser prototype (`preview-v9.html`) into real pages here
- Terminal-command display alongside every operation (e.g., showing the exact `gpg`/`openssl`
  equivalent of whatever the UI just did)
- Algorithm comparison + crack-time estimation view

## Setup

1. Create a free Supabase project at supabase.com
2. In the SQL editor, run `schema.sql`
3. Copy `.env.example` to `.env.local` and fill in your project's URL + anon key
4. `npm install`
5. `npm run dev` — open http://localhost:3000

## Deploy

Push to GitHub, import the repo in Vercel, add the same two environment variables in
Vercel's project settings. That's the whole deploy — no server to manage.
