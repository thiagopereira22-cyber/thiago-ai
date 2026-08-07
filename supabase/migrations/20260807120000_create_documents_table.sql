create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  name text,
  description text,
  category text,
  due_date date,
  file_url text,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_category_idx on public.documents (category);

alter table public.documents enable row level security;

create policy "Authenticated users can view documents"
  on public.documents
  for select
  to authenticated
  using (true);

create policy "Authenticated users can insert documents"
  on public.documents
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update documents"
  on public.documents
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete documents"
  on public.documents
  for delete
  to authenticated
  using (true);
