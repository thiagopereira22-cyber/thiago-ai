create table if not exists public.connected_email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  email_address text not null,
  display_name text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create index if not exists connected_email_accounts_user_id_idx on public.connected_email_accounts (user_id);
create index if not exists connected_email_accounts_provider_idx on public.connected_email_accounts (provider);

alter table public.connected_email_accounts enable row level security;

create policy "Users can view their own connected email accounts"
  on public.connected_email_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own connected email accounts"
  on public.connected_email_accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own connected email accounts"
  on public.connected_email_accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own connected email accounts"
  on public.connected_email_accounts
  for delete
  to authenticated
  using (auth.uid() = user_id);
