-- Enforce the invariants of the single volume-tracking model even when a
-- caller bypasses the browser UI. The function deliberately runs as invoker
-- and has no public execute grant because it is trigger-only.
do $$
begin
  if exists (
    select 1
    from public.manga_shelf_series
    where (total_volumes is not null and total_volumes < 1)
      or exists (select 1 from pg_catalog.unnest(checked_volumes) as volume where volume < 1)
      or pg_catalog.cardinality(checked_volumes) <> pg_catalog.cardinality(
        array(select distinct volume from pg_catalog.unnest(checked_volumes) as volume)
      )
      or (
        total_volumes is not null
        and coalesce((select max(volume) from pg_catalog.unnest(checked_volumes) as volume), 0) > total_volumes
      )
  ) then
    raise exception 'existing manga_shelf_series rows violate volume tracking invariants';
  end if;
end;
$$;

create or replace function public.validate_manga_shelf_series_volume_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_checked integer;
begin
  if new.total_volumes is not null and new.total_volumes < 1 then
    raise exception 'total_volumes must be at least 1';
  end if;

  if exists (
    select 1 from pg_catalog.unnest(new.checked_volumes) as volume
    where volume < 1
  ) then
    raise exception 'checked_volumes must contain positive integers only';
  end if;

  if pg_catalog.cardinality(new.checked_volumes) <> pg_catalog.cardinality(
    array(select distinct volume from pg_catalog.unnest(new.checked_volumes) as volume)
  ) then
    raise exception 'checked_volumes must not contain duplicates';
  end if;

  select max(volume) into max_checked
  from pg_catalog.unnest(new.checked_volumes) as volume;
  if new.total_volumes is not null and coalesce(max_checked, 0) > new.total_volumes then
    raise exception 'checked_volumes cannot exceed total_volumes';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_manga_shelf_series_volume_state() from public;

drop trigger if exists validate_manga_shelf_series_volume_state on public.manga_shelf_series;
create trigger validate_manga_shelf_series_volume_state
before insert or update of total_volumes, checked_volumes
on public.manga_shelf_series
for each row
execute function public.validate_manga_shelf_series_volume_state();
