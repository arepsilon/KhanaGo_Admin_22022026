CREATE POLICY \
Owners
can
view
own
link\ ON restaurant_owners FOR SELECT USING (auth.uid() = user_id); CREATE POLICY \Admins
can
view
all
links\ ON restaurant_owners FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
