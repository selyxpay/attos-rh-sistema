-- ==========================================================================
-- R&T VAGAS IA — Configuração do Supabase
-- ==========================================================================
-- COMO USAR:
--   1) No painel do Supabase, abra:  SQL Editor  ->  New query
--   2) Cole TODO este conteúdo
--   3) Clique em RUN (Executar)
-- Pode rodar mais de uma vez sem problema (é seguro/idempotente).
-- ==========================================================================

-- 1) TABELA DE ESTADO -------------------------------------------------------
-- Guarda os dados do sistema (candidatos, vagas, funcionários, permissões...)
-- em uma única linha (os documentos pesados ficam no Storage, não aqui).
create table if not exists public.rt_estado (
  chave         text primary key,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- 2) TEMPO REAL -------------------------------------------------------------
-- Faz a tabela transmitir mudanças para todos os dispositivos na hora.
do $$
begin
  begin
    alter publication supabase_realtime add table public.rt_estado;
  exception when duplicate_object then null;  -- já estava ligado, tudo bem
  end;
end $$;

-- 3) REGRAS DE ACESSO DA TABELA (RLS) --------------------------------------
-- NÍVEL TESTE: libera leitura/gravação com a chave pública (anon).
-- (Na versão oficial depois trancamos com login real.)
alter table public.rt_estado enable row level security;

drop policy if exists rt_estado_select on public.rt_estado;
drop policy if exists rt_estado_insert on public.rt_estado;
drop policy if exists rt_estado_update on public.rt_estado;

create policy rt_estado_select on public.rt_estado for select using (true);
create policy rt_estado_insert on public.rt_estado for insert with check (true);
create policy rt_estado_update on public.rt_estado for update using (true) with check (true);

-- 4) STORAGE: PASTA DE DOCUMENTOS ------------------------------------------
-- Onde ficam RG, CPF, comprovantes, fotos (cada arquivo até 10 MB).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

-- 5) REGRAS DO STORAGE ------------------------------------------------------
drop policy if exists docs_envio    on storage.objects;
drop policy if exists docs_leitura  on storage.objects;
drop policy if exists docs_remover  on storage.objects;
drop policy if exists docs_update   on storage.objects;

create policy docs_envio   on storage.objects for insert
  with check (bucket_id = 'documentos');
create policy docs_leitura on storage.objects for select
  using (bucket_id = 'documentos');
create policy docs_update  on storage.objects for update
  using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
create policy docs_remover on storage.objects for delete
  using (bucket_id = 'documentos');

-- ==========================================================================
-- Pronto! Quando terminar, o sistema já consegue ler e gravar na nuvem.
-- ==========================================================================
