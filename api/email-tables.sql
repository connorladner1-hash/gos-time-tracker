-- ═══════════════════════════════════════════════════════════
--  GOS Time Tracker — Email Support Tables
--  Run this in your EXISTING Supabase project (gos-time-tracker)
--  This enables server-side auto email without the app being open
-- ═══════════════════════════════════════════════════════════

-- Tracks which weeks have already had emails sent (prevents duplicates)
create table if not exists email_sends (
  id bigserial primary key,
  week_key text not null unique,   -- e.g. "2025-03-17" (Monday of that week)
  sent_at timestamptz default now(),
  session_count int default 0
);

-- Stores the EmailJS config set by admin in the app
-- The app will write to this table when admin saves email settings
create table if not exists email_settings (
  id bigserial primary key,
  service_id text,
  template_id text,
  public_key text,
  manager_email text,
  auto_send_enabled boolean default true,
  updated_at timestamptz default now()
);

-- Enable open access (same as other tables in this project)
alter table email_sends enable row level security;
alter table email_settings enable row level security;
create policy "allow_all" on email_sends for all using (true) with check (true);
create policy "allow_all" on email_settings for all using (true) with check (true);

-- Seed initial email settings row (the app will update this)
-- Replace these with your actual EmailJS values
insert into email_settings (
  service_id, template_id, public_key,
  manager_email, auto_send_enabled
) values (
  'service_w5zq5l9',
  'template_91t3pr7',
  'qpUx_SZipNwP4o8RX',
  'michael@gulfofficesystems.com',
  true
) on conflict do nothing;
