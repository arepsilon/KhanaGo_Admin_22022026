'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AnalyticsDashboard() {
    const [analytics, setAnalytics] = useState<any>({
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        totalCustomers: 0,
        ordersByStatus: [],
        topRestaurants: [],
        adminEarnings: {
            commission: 0,
            restaurantPlatformFee: 0,
            transactionFee: 0,
            deliveryFees: 0,
            customerPlatformFees: 0,
            total: 0
        }
    });

    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            // Fetch all orders with restaurant details and fee settings
            const { data: orders } = await supabase
                .from('orders')
                .select(`
                    *,
                    restaurant:restaurants(
                        name,
                        commission_percent,
                        platform_fee_per_order,
                        transaction_charge_percent
                    )
                `);

            // Fetch customers count
            const { count: customersCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'customer');

            console.log('Analytics: Fetched orders:', orders?.length, 'orders');
            console.log('Analytics: Sample order:', orders?.[0]);
            console.log('Analytics: Delivered orders:', orders?.filter(o => o.status === 'delivered').length);

            if (orders) {
                // Filter to delivered/completed orders for revenue calculations (same as restaurant app)
                const completedOrders = orders.filter(order =>
                    order.status === 'delivered' || order.status === 'completed'
                );

                // Calculate totals (only delivered/completed)
                const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
                const totalOrders = completedOrders.length;
                const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

                // Group ALL orders by status (for status chart)
                const ordersByStatus = orders.reduce((acc: any, order) => {
                    const status = order.status;
                    if (!acc[status]) {
                        acc[status] = 0;
                    }
                    acc[status]++;
                    return acc;
                }, {});

                // Calculate revenue by restaurant (using subtotal like restaurant app)
                const restaurantRevenue = completedOrders.reduce((acc: any, order) => {
                    const restaurantName = order.restaurant?.name || 'Unknown';
                    if (!acc[restaurantName]) {
                        acc[restaurantName] = { name: restaurantName, revenue: 0, orders: 0 };
                    }
                    acc[restaurantName].revenue += order.subtotal || 0; // Use subtotal to match restaurant app
                    acc[restaurantName].orders += 1;
                    return acc;
                }, {});

                // Calculate Admin Earnings (delivered/completed orders)
                const adminEarnings = completedOrders.reduce((acc, order) => {
                    const subtotal = order.subtotal || 0;
                    const total = order.total || 0;
                    const deliveryFee = order.delivery_fee || 0;
                    const customerPlatformFee = order.platform_fee || 0;
                    const restaurant = order.restaurant;

                    // Fees collected from customer
                    acc.deliveryFees += deliveryFee;
                    acc.customerPlatformFees += customerPlatformFee;

                    // Fees from restaurant
                    if (restaurant) {
                        const commission = subtotal * ((restaurant.commission_percent || 0) / 100);
                        const platformFee = restaurant.platform_fee_per_order || 0;
                        const transactionFee = total * ((restaurant.transaction_charge_percent || 0) / 100);

                        acc.commission += commission;
                        acc.restaurantPlatformFee += platformFee;
                        acc.transactionFee += transactionFee;
                    }

                    acc.total = acc.commission + acc.restaurantPlatformFee + acc.transactionFee + acc.customerPlatformFees;
                    return acc;
                }, {
                    commission: 0,
                    restaurantPlatformFee: 0,
                    transactionFee: 0,
                    deliveryFees: 0,
                    customerPlatformFees: 0,
                    total: 0
                });

                const topRestaurants = Object.values(restaurantRevenue)
                    .sort((a: any, b: any) => b.revenue - a.revenue)
                    .slice(0, 5);

                setAnalytics({
                    totalRevenue,
                    totalOrders,
                    avgOrderValue,
                    totalCustomers: customersCount || 0,
                    ordersByStatus: Object.entries(ordersByStatus).map(([status, count]) => ({
                        status,
                        count
                    })),
                    topRestaurants,
                    adminEarnings
                });
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 bg-slate-200 rounded-lg"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Admin Earnings Section */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg p-6 text-white">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span>💰</span> Admin Earnings Breakdown
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                        <p className="text-slate-300 text-sm mb-1">Total Earnings</p>
                        <p className="text-2xl font-bold text-emerald-400">₹{analytics.adminEarnings.total.toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-1">Net Income</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Commission</p>
                        <p className="text-xl font-semibold text-white">₹{analytics.adminEarnings.commission.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">% from food value</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Restaurant Fees</p>
                        <p className="text-xl font-semibold text-white">₹{analytics.adminEarnings.restaurantPlatformFee.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">Per order from rest.</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Tx Charges</p>
                        <p className="text-xl font-semibold text-white">₹{analytics.adminEarnings.transactionFee.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">% from total</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Customer Platform Fee</p>
                        <p className="text-xl font-semibold text-cyan-300">₹{analytics.adminEarnings.customerPlatformFees.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">From customers</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm mb-1">Delivery Fees</p>
                        <p className="text-xl font-semibold text-amber-300">₹{analytics.adminEarnings.deliveryFees.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">Collected (paid to riders)</p>
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                    <p className="text-sm font-medium text-slate-600 mb-2">Total GMV</p>
                    <p className="text-3xl font-bold text-slate-900">₹{analytics.totalRevenue.toFixed(2)}</p>
                    <p className="text-xs text-slate-500 mt-2">Gross Merchandise Value</p>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                    <p className="text-sm font-medium text-slate-600 mb-2">Total Orders</p>
                    <p className="text-3xl font-bold text-slate-900">{analytics.totalOrders}</p>
                    <p className="text-xs text-slate-500 mt-2">Orders placed</p>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                    <p className="text-sm font-medium text-slate-600 mb-2">Avg Order Value</p>
                    <p className="text-3xl font-bold text-slate-900">₹{analytics.avgOrderValue.toFixed(2)}</p>
                    <p className="text-xs text-slate-500 mt-2">Per order average</p>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
                    <p className="text-sm font-medium text-slate-600 mb-2">Total Customers</p>
                    <p className="text-3xl font-bold text-slate-900">{analytics.totalCustomers}</p>
                    <p className="text-xs text-slate-500 mt-2">Registered users</p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Orders by Status */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Orders by Status</h3>
                    <div className="space-y-4">
                        {analytics.ordersByStatus.map((item: any, index: number) => {
                            const percentage = (item.count / analytics.totalOrders) * 100;
                            const colors = [
                                'bg-amber-500',
                                'bg-blue-500',
                                'bg-indigo-500',
                                'bg-emerald-500',
                                'bg-rose-500'
                            ];
                            const color = colors[index % colors.length];

                            return (
                                <div key={item.status}>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium text-slate-700 capitalize">
                                            {item.status.replace('_', ' ')}
                                        </span>
                                        <span className="text-sm font-bold text-slate-900">{item.count}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                                        <div
                                            className={`${color} h-2.5 rounded-full transition-all`}
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Restaurants */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">Top Restaurants by Revenue</h3>
                    <div className="space-y-3">
                        {analytics.topRestaurants.map((restaurant: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-900">{restaurant.name}</p>
                                        <p className="text-xs text-slate-500">{restaurant.orders} orders</p>
                                    </div>
                                </div>
                                <p className="font-bold text-emerald-600">₹{restaurant.revenue.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Performance Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Platform Performance</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-6 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-2">Successful Orders</p>
                        <p className="text-3xl font-bold text-emerald-600">
                            {analytics.ordersByStatus.find((s: any) => s.status === 'delivered')?.count || 0}
                        </p>
                    </div>
                    <div className="text-center p-6 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-2">Pending Orders</p>
                        <p className="text-3xl font-bold text-amber-600">
                            {analytics.ordersByStatus.find((s: any) => s.status === 'pending')?.count || 0}
                        </p>
                    </div>
                    <div className="text-center p-6 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-sm font-medium text-slate-600 mb-2">Cancelled Orders</p>
                        <p className="text-3xl font-bold text-rose-600">
                            {analytics.ordersByStatus.find((s: any) => s.status === 'cancelled')?.count || 0}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
