-- Only the signed-in owner may read or modify a manga series.
-- The UPDATE policy must include WITH CHECK so a user cannot reassign user_id.
drop policy if exists "owner can read" on public.manga_shelf_series;
drop policy if exists "owner can insert" on public.manga_shelf_series;
drop policy if exists "owner can update" on public.manga_shelf_series;
drop policy if exists "owner can delete" on public.manga_shelf_series;

create policy "owner can read"
on public.manga_shelf_series
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can insert"
on public.manga_shelf_series
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "owner can update"
on public.manga_shelf_series
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can delete"
on public.manga_shelf_series
for delete
to authenticated
using ((select auth.uid()) = user_id);
