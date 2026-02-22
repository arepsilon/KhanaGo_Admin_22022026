-- Create the 'restaurants' bucket if it doesn't exist
insert into storage.buckets (id, name, public) 
values ('restaurants', 'restaurants', true) 
on conflict (id) do nothing;

-- Public Access Policy (Read)
create policy "Public Access" 
on storage.objects for select 
using ( bucket_id = 'restaurants' );

-- Authenticated Upload Policy
create policy "Authenticated Upload" 
on storage.objects for insert 
with check ( bucket_id = 'restaurants' and auth.role() = 'authenticated' );

-- Authenticated Delete Policy
create policy "Authenticated Delete" 
on storage.objects for delete 
using ( bucket_id = 'restaurants' and auth.role() = 'authenticated' );
