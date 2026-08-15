create table if not exists public.student_submissions (
  submission_key text primary key,
  student_name text not null,
  student_id text not null default '',
  class_name text not null default '',
  payload jsonb not null,
  first_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_submissions_class_updated
on public.student_submissions (class_name, updated_at desc);

alter table public.student_submissions enable row level security;

-- 浏览器不会直接访问此表；只有服务器端 service role 可以读写。
