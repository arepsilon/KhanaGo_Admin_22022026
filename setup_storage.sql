insert into storage.buckets (id, name, public) values ('menu_items', 'menu_items', true) on conflict (id) do nothing; create policy \
Public
Access\ on storage.objects for select using ( bucket_id = 'menu_items' ); create policy \Authenticated
Upload\ on storage.objects for insert with check ( bucket_id = 'menu_items' and auth.role() = 'authenticated' ); create policy \Authenticated
Delete\ on storage.objects for delete using ( bucket_id = 'menu_items' and auth.role() = 'authenticated' );
