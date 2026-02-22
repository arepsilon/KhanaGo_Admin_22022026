CREATE POLICY \
Admins
can
manage
all
menu
items\ ON menu_items FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
