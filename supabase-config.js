/* ============================================================================
   PASTE YOUR SUPABASE PROJECT DETAILS HERE.

   Where to get them:
   1. https://supabase.com -> sign in -> New project (free tier is enough).
      Pick any name/password/region (the database password it asks you to
      set is separate from everyone's account passwords -- just save it
      somewhere, this app never uses it directly).
   2. IMPORTANT: Authentication -> Providers -> Email -> turn OFF
      "Confirm email". Accounts here use a fake @otsheets.local address
      (see USERNAME_DOMAIN below) that can't receive a real confirmation
      link, so this must be off or nobody can ever finish signing up.
   3. Project Settings (gear icon) -> Data API -> copy the "Project URL"
      and the "anon public" key into SUPABASE_URL / SUPABASE_ANON_KEY below.
   4. SQL Editor -> New query -> paste the contents of supabase-schema.sql
      (in this repo) -> Run. That creates the tables and the real access
      control (Row Level Security policies) -- the part that actually
      enforces who can read/write what, on Supabase's servers.
   5. Create the superadmin account: open this site, use "Create an
      account" with username "Admin" and password "Councilc14". Then in
      the Supabase dashboard go to Table Editor -> profiles, find the row
      whose username is "Admin", and edit it: set role = superadmin and
      attendance_access = true. Save. That one manual edit is the only
      time anyone is ever granted admin from outside the app.

   The anon key is NOT a secret in the way a password is -- it's meant to
   sit in public client code. Supabase's real security is the Row Level
   Security policies in supabase-schema.sql, which run on their database,
   not in this file. It is safe to commit.
   ========================================================================= */
export const SUPABASE_URL = "http://localhost:3000/oauth/consent";
export const SUPABASE_ANON_KEY = "sb_publishable_BiAjBAO_Srd5m93hTpCcjw_m7PYXusN";

/** Supabase Auth needs an email-shaped identifier; usernames get this
    suffix appended under the hood so people never have to think about it. */
export const USERNAME_DOMAIN = "otsheets.local";
