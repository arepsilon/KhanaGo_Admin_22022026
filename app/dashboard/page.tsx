import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import DashboardStats from '@/components/DashboardStats';
import RecentOrders from '@/components/RecentOrders';
import OrphanedOrdersAlert from '@/components/OrphanedOrdersAlert';
import { Suspense } from 'react';
import DashboardFilters from '@/components/DashboardFilters';

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const { startDate: qStart, endDate: qEnd } = await searchParams;
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Get today's IST date as default (YYYY-MM-DD)
    const now = new Date();
    const istDateStr = now.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    // toLocaleString returns MM/DD/YYYY, convert to YYYY-MM-DD
    const [mm, dd, yyyy] = istDateStr.split('/');
    const today = `${yyyy}-${mm}-${dd}`;

    const startDate = qStart || today;
    const endDate = qEnd || today;

    // Helper to apply date filters
    const applyDateFilter = (query: any) => {
        if (startDate) {
            query = query.gte('created_at', `${startDate}T00:00:00Z`);
        }
        if (endDate) {
            query = query.lte('created_at', `${endDate}T23:59:59Z`);
        }
        return query;
    };

    // Fetch dashboard data
    const [deliveredOrdersResult, pendingOrdersResult, customersResult, restaurantsResult] = await Promise.all([
        applyDateFilter(supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'delivered')),
        applyDateFilter(supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'on_the_way'])),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('restaurants').select('*', { count: 'exact', head: true }),
    ]);

    // Get total revenue from delivered orders
    let revenueQuery = supabase
        .from('orders')
        .select('total')
        .eq('status', 'delivered');

    revenueQuery = applyDateFilter(revenueQuery);

    const { data: revenueData } = await revenueQuery;

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

                    <Suspense fallback={<div className="h-24 bg-white animate-pulse rounded-xl mb-8 border border-slate-100"></div>}>
                        <DashboardFilters />
                    </Suspense>

                    <DashboardStats stats={stats} />
                    <RecentOrders startDate={startDate} endDate={endDate} />
                </div>
            </main>
        </div>
    );
}
