-- Run once in Supabase: SQL Editor > New query > paste > Run
create table subjects(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,name text not null check(char_length(name)<=40),color text not null,created_at timestamptz default now(),unique(user_id,name));
create table sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,subject text not null,seconds int not null check(seconds>0),started_at timestamptz not null default now());
create table tasks(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,title text not null check(char_length(title)<=200),subject text,deadline date,done boolean not null default false,created_at timestamptz default now());
create table active_timer(user_id uuid primary key default auth.uid() references auth.users on delete cascade,subject text not null,acc double precision not null default 0,running boolean not null default true,started_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['subjects','sessions','tasks','active_timer'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy "own rows" on %I for all using (auth.uid()=user_id) with check (auth.uid()=user_id)',t);
end loop; end $$;
create index on sessions(user_id,started_at);
