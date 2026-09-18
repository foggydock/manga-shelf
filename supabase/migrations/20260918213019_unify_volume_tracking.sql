-- A series has one user-selected tracking meaning and one set of checked volumes.
-- Keep the former owned/read columns untouched so existing history remains recoverable.
alter table public.manga_shelf_series
  add column if not exists tracking_kind text not null default '持っている'
    check (tracking_kind in ('読んだ', '買った', '借りた', '持っている')),
  add column if not exists checked_volumes integer[] not null default '{}';

-- Existing records become a single sensible history: prefer read volumes when present,
-- otherwise retain the former owned volumes. New entries only use checked_volumes.
update public.manga_shelf_series
set
  tracking_kind = case
    when coalesce(array_length(read_volumes, 1), 0) > 0 then '読んだ'
    else '持っている'
  end,
  checked_volumes = case
    when coalesce(array_length(read_volumes, 1), 0) > 0 then read_volumes
    else coalesce(owned_volumes, '{}')
  end
where coalesce(array_length(checked_volumes, 1), 0) = 0;
