create table public.capital_additions (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.capital_additions enable row level security;

create policy "Authenticated users can view capital additions"
  on public.capital_additions for select
  to authenticated
  using (true);

create policy "Admins can insert capital additions"
  on public.capital_additions for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
