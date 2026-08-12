-- À exécuter dans l'éditeur SQL de ton projet Supabase (onglet "SQL Editor")

-- ---------- table du morceau en cours ----------
create table now_playing (
  id int primary key default 1,
  is_playing boolean not null default false,
  title text,
  artist text,
  url text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into now_playing (id) values (1);

alter table now_playing enable row level security;

-- lecture publique autorisée (pour ton site statique)
create policy "lecture publique now_playing"
  on now_playing for select
  using (true);

-- ---------- table du statut ----------
create table statut (
  id int primary key default 1,
  online boolean not null default false,
  message text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into statut (id, online, message) values (1, false, 'parti bidouiller autre chose');

alter table statut enable row level security;

create policy "lecture publique statut"
  on statut for select
  using (true);

-- Pour modifier le statut plus tard : va dans Table Editor > statut,
-- clique sur la ligne, coche/décoche "online", édite "message", sauvegarde.
-- Aucun code à toucher.
