-- Panel admin, Parte B: baja de comercios, codigos de alta y funciones.
-- Spec: docs/superpowers/specs/2026-10-19-panel-admin-parte-b-design.md
--
-- Solo el servidor (service_role) toca todo esto: RLS sin politicas y las
-- funciones cerradas para anon/authenticated.

alter table public.comercios
  add column dado_de_baja boolean not null default false;

create table public.codigos_alta (
  codigo text primary key,
  comercio text not null references public.comercios (slug) on delete cascade,
  nonce_sha256 text not null,
  vence_en timestamptz not null,
  tele_id text null
);

alter table public.codigos_alta enable row level security;

-- Igual que la Parte A, mas comercio.dado_de_baja. Un comercio dado de baja no
-- autoregistra teles ni actualiza ultima_conexion: devuelve la tele solo si
-- ya existe.
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
    if c.dado_de_baja then
      select * into t from teles where id = p_tele and comercio = p_comercio;
    else
      insert into teles (id, comercio, rubros) values (p_tele, p_comercio, p_rubros)
        on conflict (id) do nothing;
      update teles set ultima_conexion = now()
        where id = p_tele and comercio = p_comercio
        returning * into t;
    end if;
  end if;

  return json_build_object(
    'comercio', json_build_object(
      'requiere_activacion', c.requiere_activacion,
      'pagado_hasta', to_char(c.pagado_hasta, 'YYYY-MM-DD'),
      'dado_de_baja', c.dado_de_baja),
    'tele', case when t.id is null then null
      else json_build_object('activa', t.activa, 'rubros', t.rubros) end);
end
$$;

-- Crea un codigo de alta de 15 min. Borra los vencidos de paso.
create or replace function public.crear_codigo_alta(p_comercio text, p_codigo text, p_nonce_sha256 text)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v timestamptz;
begin
  /* No purgar activados recientes: la tele aun tiene que consultarlos para
     recibir su cookie. Los activados se borran con 1 dia de margen. */
  delete from codigos_alta
    where (tele_id is null and vence_en < now())
       or (tele_id is not null and vence_en < now() - interval '1 day');

  if not exists (select 1 from comercios where slug = p_comercio and not dado_de_baja) then
    return json_build_object('ok', false, 'motivo', 'comercio');
  end if;

  if exists (select 1 from codigos_alta where codigo = p_codigo) then
    return json_build_object('ok', false, 'motivo', 'repetido');
  end if;

  v := now() + interval '15 minutes';
  insert into codigos_alta (codigo, comercio, nonce_sha256, vence_en)
    values (p_codigo, p_comercio, p_nonce_sha256, v);

  return json_build_object('ok', true, 'vence_en', to_char(v at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end
$$;

-- Lo consulta la tele (con su nonce) para saber si ya la activaron.
create or replace function public.consultar_codigo_alta(p_codigo text, p_nonce_sha256 text)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  k codigos_alta%rowtype;
  t teles%rowtype;
begin
  select * into k from codigos_alta where codigo = p_codigo and nonce_sha256 = p_nonce_sha256;
  if not found then
    return json_build_object('estado', 'invalido');
  end if;

  if k.tele_id is not null then
    select * into t from teles where id = k.tele_id;
    return json_build_object('estado', 'activada',
      'tele', json_build_object('id', t.id, 'comercio', t.comercio, 'rubros', t.rubros));
  end if;

  if k.vence_en < now() then
    return json_build_object('estado', 'vencido');
  end if;

  return json_build_object('estado', 'pendiente');
end
$$;

-- Lo usa el dueno desde el panel/celu: crea la tele con el codigo.
-- Orden: existe -> no vencido -> sin usar -> comercio no dado de baja.
create or replace function public.activar_codigo_alta(p_codigo text, p_tele_id text, p_rubros text[])
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  k codigos_alta%rowtype;
begin
  select * into k from codigos_alta where codigo = p_codigo for update;
  if not found then
    return json_build_object('ok', false, 'motivo', 'invalido');
  end if;
  if k.vence_en < now() then
    return json_build_object('ok', false, 'motivo', 'vencido');
  end if;
  if k.tele_id is not null then
    return json_build_object('ok', false, 'motivo', 'usado');
  end if;
  if not exists (select 1 from comercios where slug = k.comercio and not dado_de_baja) then
    return json_build_object('ok', false, 'motivo', 'comercio');
  end if;

  insert into teles (id, comercio, rubros, activa) values (p_tele_id, k.comercio, p_rubros, true);
  update codigos_alta set tele_id = p_tele_id where codigo = p_codigo;

  return json_build_object('ok', true, 'comercio', k.comercio);
end
$$;

revoke execute on function public.estado_tele(text, text, text[]) from public, anon, authenticated;
grant execute on function public.estado_tele(text, text, text[]) to service_role;
revoke execute on function public.crear_codigo_alta(text, text, text) from public, anon, authenticated;
grant execute on function public.crear_codigo_alta(text, text, text) to service_role;
revoke execute on function public.consultar_codigo_alta(text, text) from public, anon, authenticated;
grant execute on function public.consultar_codigo_alta(text, text) to service_role;
revoke execute on function public.activar_codigo_alta(text, text, text[]) from public, anon, authenticated;
grant execute on function public.activar_codigo_alta(text, text, text[]) to service_role;
