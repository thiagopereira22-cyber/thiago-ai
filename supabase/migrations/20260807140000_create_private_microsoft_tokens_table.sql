create schema if not exists private;

create table if not exists private.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connected_email_account_id uuid not null references public.connected_email_accounts(id) on delete cascade,
  provider text not null default 'microsoft',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_tokens_connected_account_unique unique (connected_email_account_id)
);

create unique index if not exists connected_email_accounts_user_provider_email_idx
  on public.connected_email_accounts (user_id, provider, email_address);

create index if not exists oauth_tokens_user_id_idx on private.oauth_tokens (user_id);
create index if not exists oauth_tokens_provider_idx on private.oauth_tokens (provider);

alter table private.oauth_tokens enable row level security;

create policy "Users can view their own OAuth tokens"
  on private.oauth_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own OAuth tokens"
  on private.oauth_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own OAuth tokens"
  on private.oauth_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own OAuth tokens"
  on private.oauth_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);
