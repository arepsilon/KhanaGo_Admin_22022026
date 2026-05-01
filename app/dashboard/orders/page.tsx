import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import OrdersTable from '@/components/OrdersTable';

export default async function OrdersPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Check if user is admin
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        redirect('/login');
    }

    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Orders Management</h1>
            <OrdersTable />
        </div>
    );
}
