-- Keep the number of visible volume checkboxes per series. This is UI state
-- that affects future edits, so it belongs with the series instead of a
-- device-local value.
alter table public.manga_shelf_series
  add column if not exists volume_display_count integer not null default 10
    check (volume_display_count >= 1);

-- Existing records keep every checked volume visible after the migration.
update public.manga_shelf_series
set volume_display_count = greatest(
  10,
  coalesce(total_volumes, 0),
  coalesce((select max(volume) from pg_catalog.unnest(checked_volumes) as volume), 0)
)
where volume_display_count < greatest(
  10,
  coalesce(total_volumes, 0),
  coalesce((select max(volume) from pg_catalog.unnest(checked_volumes) as volume), 0)
);
