
create table products (
  id uuid primary key default gen_random_uuid(),
  name text,
  category text,
  quantity int,
  unit text,
  expiry_date date,
  location text,
  image_url text,
  status text default 'good',
  created_at timestamp default now()
);
