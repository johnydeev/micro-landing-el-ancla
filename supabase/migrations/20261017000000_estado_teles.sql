-- Activación de pantallas, Parte A: estado de cada tele y cobros por comercio.
-- Spec: docs/superpowers/specs/2026-10-17-activacion-supabase-parte-a-design.md
--
-- Solo el servidor (service_role) toca estas tablas: RLS sin políticas y la
-- función cerrada para anon/authenticated.

create table public.comercios (
  slug text primary key,
  requiere_activacion boolean not null default false,
  pagado_hasta date null
);

create table public.teles (
  id text primary key,
  comercio text not null references public.comercios (slug) on delete restrict,
  nombre text null,
  rubros text[] null,
  activa boolean not null default true,
  ultima_conexion timestamptz null,
  creada_en timestamptz not null default now()
);

alter table public.comercios enable row level security;
alter table public.teles enable row level security;

-- Una llamada por carga de pantalla. Registra la tele si es nueva (autoregistro),
-- anota su conexión y devuelve el estado del comercio y de la tele.
-- Sin fila de comercio: no registra nada y devuelve todo null (sin control).
-- Una tele de otro comercio no se toca y vuelve como null.
create or replace function public.estado_tele(p_comercio text, p_tele text, p_rubros text[])
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  c comercios%rowtype;
  t teles%rowtype;
begin
  select * into c from comercios where slug = p_comercio;
  if not found then
    return json_build_object('comercio', null, 'tele', null);
  end if;

  if p_tele is not null then
    insert into teles (id, comercio, rubros) values (p_tele, p_comercio, p_rubros)
      on conflict (id) do nothing;
    update teles set ultima_conexion = now()
      where id = p_tele and comercio = p_comercio
      returning * into t;
  end if;

  return json_build_object(
    'comercio', json_build_object(
      'requiere_activacion', c.requiere_activacion,
      'pagado_hasta', to_char(c.pagado_hasta, 'YYYY-MM-DD')),
    'tele', case when t.id is null then null
      else json_build_object('activa', t.activa, 'rubros', t.rubros) end);
end
$$;

revoke execute on function public.estado_tele(text, text, text[]) from public, anon, authenticated;
grant execute on function public.estado_tele(text, text, text[]) to service_role;
