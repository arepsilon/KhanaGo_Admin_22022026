import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import DashboardStats from '@/components/DashboardStats';
import RecentOrders from '@/components/RecentOrders';
import OrphanedOrdersAlert from '@/components/OrphanedOrdersAlert';


export default async function DashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch dashboard data
    const [deliveredOrdersResult, pendingOrdersResult, customersResult, restaurantsResult] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'on_the_way']),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('restaurants').select('*', { count: 'exact', head: true }),
    ]);

    // Get total revenue from delivered orders
    const { data: revenueData } = await supabase
        .from('orders')
        .select('total')
        .eq('status', 'delivered');

    const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;

    const stats = {
        totalOrders: deliveredOrdersResult.count || 0,
        pendingOrders: pendingOrdersResult.count || 0,
        totalRevenue,
        totalCustomers: customersResult.count || 0,
        totalRestaurants: restaurantsResult.count || 0,
    };

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
                    <OrphanedOrdersAlert />
                    <DashboardStats stats={stats} />
                    <RecentOrders />
                </div>
            </main>
        </div>
    );
}
