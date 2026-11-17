# Supabase setup for Route Tracker

## Email authentication settings

The profile screen expects a six-digit email OTP. In the hosted Supabase Dashboard:

1. Enable the Email provider and email signups.
2. Enable **Confirm email** so an email account is not treated as verified before confirmation.
3. Set the email OTP length to **6**.
4. In the confirmation email template, include `{{ .Token }}` so users receive a code. Do not configure this flow to send only `{{ .ConfirmationURL }}`; that sends a magic link while the application asks for a code.
5. Configure the hosted Site URL, allowed redirect URLs, SMTP sender and rate limits for the deployed application.

The local `config.toml` enables email confirmations and six-digit OTPs for the local Supabase stack. It does not change hosted Dashboard settings.

The local CLI config currently sets `db.major_version = 15`. This value is not evidence of the hosted project's PostgreSQL version. Confirm the hosted project's major version before using local/hosted schema comparison commands; it has not been checked here and should not be changed without reliable version information.

## Local database tests

These instructions concern the **local Supabase database only**. With the Supabase CLI and Docker available, run `supabase start`, then `supabase db reset` to apply local migrations, and `supabase test db` to run the pgTAP suite in `tests/`. `supabase db reset` drops and recreates the local database; local data not recreated by migrations or seed files is discarded. The current config disables seed files, so do not use reset if the local database contains data you need to keep. These commands target the local stack unless explicitly passed remote options. Do not use `--linked` or `--remote` for this local workflow; no hosted database is changed by these instructions.

The SQL tests seed Auth users as the local database administrator, then switch to the `authenticated` and `anon` roles and set `request.jwt.claim.sub` to exercise the same `auth.uid()`-based RLS rules used by Supabase requests.
