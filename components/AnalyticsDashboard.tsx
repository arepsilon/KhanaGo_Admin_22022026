'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const mins = (ms: number) => Math.round(ms / 60000);

function StatCard({
    label, value, sub, color = 'text-slate-900', bg = 'bg-white'
}: { label: string; value: string | number; sub?: string; color?: string; bg?: string }) {
    return (
        <div className={`${bg} rounded-xl border border-slate-200 p-5 shadow-sm`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
    );
}

const STATUS_COLORS: Record<string, string> = {
    delivered: '#10b981',
    pending: '#f59e0b',
    accepted: '#3b82f6',
    preparing: '#8b5cf6',
    ready: '#6366f1',
    assigned: '#06b6d4',
    picked_up: '#14b8a6',
    cancelled: '#ef4444',
    rejected: '#f97316',
    awaiting_payment: '#94a3b8',
};

const CANCEL_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#94a3b8'];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnalyticsDashboard({
    startDate, endDate, cityId
}: {
    startDate: string; endDate: string; cityId: string | null;
}) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => { fetchAll(); }, [startDate, endDate, cityId]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            // ── Orders (core dataset) ────────────────────────────────────────
            let q = supabase
                .from('orders')
                .select(`
                    id, status, total, subtotal, delivery_fee, platform_fee,
                    payment_method, payment_status,
                    created_at, accepted_at, prepared_at, delivered_at,
                    cancelled_by, cancellation_reason,
                    customer_id, city_id,
                    restaurant:restaurants(name, commission_percent, platform_fee_per_order, transaction_charge_percent),
                    delivery:deliveries(pickup_time, rider_id, rider:profiles!rider_id(full_name))
                `)
                .gte('created_at', `${startDate}T00:00:00+05:30`)
                .lte('created_at', `${endDate}T23:59:59+05:30`)
                .order('created_at', { ascending: true });
            if (cityId) q = q.eq('city_id', cityId);
            const { data: orders } = await q;

            // ── Customers ────────────────────────────────────────────────────
            let cq = supabase
                .from('profiles')
                .select('id, created_at', { count: 'exact' })
                .eq('role', 'customer');
            if (cityId) cq = cq.eq('city_id', cityId);
            const { data: allCustomers, count: totalCustomers } = await cq;

            // New customers in period
            const newCustomers = (allCustomers || []).filter(c =>
                c.created_at >= `${startDate}T00:00:00+05:30` &&
                c.created_at <= `${endDate}T23:59:59+05:30`
            ).length;

            if (!orders) { setLoading(false); return; }

            const completed = orders.filter(o => o.status === 'delivered');
            const cancelled = orders.filter(o => ['cancelled', 'rejected'].includes(o.status));
            const allExceptAwaiting = orders.filter(o => o.status !== 'awaiting_payment');

            // ── KPIs ─────────────────────────────────────────────────────────
            const gmv = completed.reduce((s, o) => s + (o.total || 0), 0);
            const aov = completed.length > 0 ? gmv / completed.length : 0;
            const cancelRate = allExceptAwaiting.length > 0
                ? (cancelled.length / allExceptAwaiting.length) * 100 : 0;

            // Returning customers: placed more than 1 order in the period
            const custOrderCount: Record<string, number> = {};
            orders.forEach(o => { custOrderCount[o.customer_id] = (custOrderCount[o.customer_id] || 0) + 1; });
            const returningCount = Object.values(custOrderCount).filter(c => c > 1).length;
            const uniqueCustomers = Object.keys(custOrderCount).length;

            // ── Admin Earnings ────────────────────────────────────────────────
            const earnings = completed.reduce((acc, o) => {
                acc.deliveryFees += o.delivery_fee || 0;
                acc.platformFees += o.platform_fee || 0;
                const r = Array.isArray(o.restaurant) ? o.restaurant[0] : o.restaurant as any;
                if (r) {
                    acc.commission += (o.subtotal || 0) * ((r.commission_percent || 0) / 100);
                    acc.restaurantFee += r.platform_fee_per_order || 0;
                    acc.txFee += (o.total || 0) * ((r.transaction_charge_percent || 0) / 100);
                }
                return acc;
            }, { deliveryFees: 0, platformFees: 0, commission: 0, restaurantFee: 0, txFee: 0 } as { deliveryFees: number; platformFees: number; commission: number; restaurantFee: number; txFee: number; total?: number });
            earnings.total = earnings.commission + earnings.restaurantFee + earnings.txFee + earnings.platformFees;

            // ── Daily Trend ───────────────────────────────────────────────────
            const dailyMap: Record<string, { date: string; gmv: number; orders: number; cancelled: number }> = {};
            orders.forEach(o => {
                const day = o.created_at.slice(0, 10);
                if (!dailyMap[day]) dailyMap[day] = { date: day, gmv: 0, orders: 0, cancelled: 0 };
                if (o.status === 'delivered') { dailyMap[day].gmv += o.total || 0; dailyMap[day].orders++; }
                if (['cancelled', 'rejected'].includes(o.status)) dailyMap[day].cancelled++;
            });
            const dailyTrend = Object.values(dailyMap).map(d => ({
                ...d,
                date: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                gmv: Math.round(d.gmv)
            }));

            // ── Hourly Heatmap ────────────────────────────────────────────────
            const hourlyMap: Record<number, number> = {};
            for (let h = 0; h < 24; h++) hourlyMap[h] = 0;
            allExceptAwaiting.forEach(o => {
                const h = new Date(o.created_at).getHours();
                hourlyMap[h]++;
            });
            const hourlyData = Object.entries(hourlyMap).map(([h, count]) => ({
                hour: `${String(h).padStart(2, '0')}:00`,
                orders: count
            }));

            // ── Orders by Status ──────────────────────────────────────────────
            const statusMap: Record<string, number> = {};
            orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });
            const ordersByStatus = Object.entries(statusMap)
                .map(([status, count]) => ({ status, count }))
                .sort((a, b) => b.count - a.count);

            // ── Cancellation Breakdown ────────────────────────────────────────
            const cancelBy: Record<string, number> = {};
            cancelled.forEach(o => {
                const by = o.cancelled_by || 'unknown';
                cancelBy[by] = (cancelBy[by] || 0) + 1;
            });
            const cancelBreakdown = Object.entries(cancelBy).map(([by, count]) => ({
                name: by.charAt(0).toUpperCase() + by.slice(1),
                value: count
            }));

            // ── Top Cancellation Reasons ──────────────────────────────────────
            const reasonMap: Record<string, number> = {};
            cancelled.forEach(o => {
                if (o.cancellation_reason) {
                    reasonMap[o.cancellation_reason] = (reasonMap[o.cancellation_reason] || 0) + 1;
                }
            });
            const topCancelReasons = Object.entries(reasonMap)
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // ── Restaurant Performance ────────────────────────────────────────
            const restMap: Record<string, any> = {};
            orders.forEach(o => {
                const rest = Array.isArray(o.restaurant) ? o.restaurant[0] : o.restaurant as any;
                const name = rest?.name || 'Unknown';
                if (!restMap[name]) restMap[name] = { name, orders: 0, revenue: 0, cancelled: 0 };
                if (o.status === 'delivered') { restMap[name].orders++; restMap[name].revenue += o.subtotal || 0; }
                if (['cancelled', 'rejected'].includes(o.status)) restMap[name].cancelled++;
            });
            const restaurantPerf = Object.values(restMap)
                .map((r: any) => ({
                    ...r,
                    revenue: Math.round(r.revenue),
                    cancelRate: (r.orders + r.cancelled) > 0
                        ? Math.round((r.cancelled / (r.orders + r.cancelled)) * 100) : 0
                }))
                .sort((a: any, b: any) => b.orders - a.orders);

            // ── Delivery Performance ──────────────────────────────────────────
            let prepMs = 0, prepCount = 0;
            let riderWaitMs = 0, riderWaitCount = 0;
            let transitMs = 0, transitCount = 0;
            let totalTimeMs = 0, totalTimeCount = 0;

            completed.forEach(o => {
                const del = Array.isArray(o.delivery) ? o.delivery[0] : o.delivery;
                if (o.accepted_at && o.prepared_at) {
                    prepMs += new Date(o.prepared_at).getTime() - new Date(o.accepted_at).getTime();
                    prepCount++;
                }
                if (o.prepared_at && del?.pickup_time) {
                    riderWaitMs += new Date(del.pickup_time).getTime() - new Date(o.prepared_at).getTime();
                    riderWaitCount++;
                }
                if (del?.pickup_time && o.delivered_at) {
                    transitMs += new Date(o.delivered_at).getTime() - new Date(del.pickup_time).getTime();
                    transitCount++;
                }
                if (o.created_at && o.delivered_at) {
                    totalTimeMs += new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime();
                    totalTimeCount++;
                }
            });

            // ── Rider Performance ─────────────────────────────────────────────
            const riderMap: Record<string, any> = {};
            completed.forEach(o => {
                const del = Array.isArray(o.delivery) ? o.delivery[0] : o.delivery;
                if (!del?.rider_id) return;
                const rider = Array.isArray(del.rider) ? del.rider[0] : del.rider as any;
                const name = rider?.full_name || del.rider_id.slice(0, 8);
                if (!riderMap[name]) riderMap[name] = { name, deliveries: 0, totalTransitMs: 0, earnings: 0 };
                riderMap[name].deliveries++;
                riderMap[name].earnings += o.delivery_fee || 0;
                if (del.pickup_time && o.delivered_at) {
                    riderMap[name].totalTransitMs += new Date(o.delivered_at).getTime() - new Date(del.pickup_time).getTime();
                }
            });
            const riderPerf = Object.values(riderMap)
                .map((r: any) => ({
                    ...r,
                    avgTransit: r.totalTransitMs > 0 ? mins(r.totalTransitMs / r.deliveries) : 0,
                    earnings: Math.round(r.earnings)
                }))
                .sort((a: any, b: any) => b.deliveries - a.deliveries)
                .slice(0, 10);

            // ── Payment Methods ───────────────────────────────────────────────
            const pmMap: Record<string, number> = {};
            orders.forEach(o => { pmMap[o.payment_method || 'unknown'] = (pmMap[o.payment_method || 'unknown'] || 0) + 1; });
            const paymentMethods = Object.entries(pmMap).map(([method, count]) => ({
                method: method === 'cash' ? 'Cash on Delivery' : method === 'online' ? 'Online' : method,
                count,
                pct: Math.round((count / orders.length) * 100)
            }));

            setData({
                gmv, aov, cancelRate, totalCustomers, newCustomers, uniqueCustomers, returningCount,
                totalOrders: allExceptAwaiting.length,
                completedOrders: completed.length,
                cancelledOrders: cancelled.length,
                earnings,
                dailyTrend,
                hourlyData,
                ordersByStatus,
                cancelBreakdown,
                topCancelReasons,
                restaurantPerf,
                riderPerf,
                paymentMethods,
                avgPrepMin: prepCount > 0 ? mins(prepMs / prepCount) : 0,
                avgRiderWaitMin: riderWaitCount > 0 ? mins(riderWaitMs / riderWaitCount) : 0,
                avgTransitMin: transitCount > 0 ? mins(transitMs / transitCount) : 0,
                avgTotalMin: totalTimeCount > 0 ? mins(totalTimeMs / totalTimeCount) : 0,
            });
        } catch (e) {
            console.error('Analytics error:', e);
        }
        setLoading(false);
    };

    if (loading) return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-slate-200 rounded-xl" />)}
            </div>
            <div className="h-64 bg-slate-200 rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
                <div className="h-64 bg-slate-200 rounded-xl" />
                <div className="h-64 bg-slate-200 rounded-xl" />
            </div>
        </div>
    );

    if (!data) return <div className="text-center text-slate-500 py-20">No data available for this period.</div>;

    const completionRate = data.totalOrders > 0
        ? Math.round((data.completedOrders / data.totalOrders) * 100) : 0;

    return (
        <div className="space-y-8">

            {/* ── KPI Row ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="GMV" value={fmt(data.gmv)} sub="Delivered orders only" color="text-emerald-600" />
                <StatCard label="Total Orders" value={data.totalOrders} sub={`${data.completedOrders} delivered`} />
                <StatCard label="Avg Order Value" value={fmt(data.aov)} sub="Delivered orders" />
                <StatCard
                    label="Completion Rate"
                    value={`${completionRate}%`}
                    sub={`${data.cancelledOrders} cancelled`}
                    color={completionRate >= 80 ? 'text-emerald-600' : 'text-rose-600'}
                />
                <StatCard label="Avg Delivery Time" value={`${data.avgTotalMin}m`} sub="Order placed → delivered" />
            </div>

            {/* ── Customer Row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Customers" value={data.totalCustomers?.toLocaleString()} sub="All time registered" />
                <StatCard label="New Customers" value={data.newCustomers} sub="Registered in period" color="text-blue-600" />
                <StatCard label="Active Customers" value={data.uniqueCustomers} sub="Ordered in period" color="text-violet-600" />
                <StatCard
                    label="Returning Customers"
                    value={data.uniqueCustomers > 0 ? `${Math.round((data.returningCount / data.uniqueCustomers) * 100)}%` : '—'}
                    sub={`${data.returningCount} placed 2+ orders`}
                    color="text-orange-600"
                />
            </div>

            {/* ── Admin Earnings ───────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg p-6 text-white">
                <h3 className="text-base font-bold mb-5 text-slate-300 uppercase tracking-wider">Admin Earnings Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="md:col-span-1 p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                        <p className="text-emerald-300 text-xs mb-1">Net Earnings</p>
                        <p className="text-2xl font-bold text-emerald-300">{fmt(data.earnings.total)}</p>
                    </div>
                    {[
                        { label: 'Commission', value: data.earnings.commission, sub: '% from food value' },
                        { label: 'Restaurant Fee', value: data.earnings.restaurantFee, sub: 'Per order' },
                        { label: 'Tx Charges', value: data.earnings.txFee, sub: '% from total' },
                        { label: 'Customer Platform', value: data.earnings.platformFees, sub: 'From customers' },
                        { label: 'Delivery Fees', value: data.earnings.deliveryFees, sub: 'Collected (→ riders)' },
                    ].map(({ label, value, sub }) => (
                        <div key={label}>
                            <p className="text-slate-400 text-xs mb-1">{label}</p>
                            <p className="text-lg font-semibold text-white">{fmt(value)}</p>
                            <p className="text-xs text-slate-500">{sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Daily Trend ──────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-slate-900 mb-5">Revenue & Orders — Daily Trend</h3>
                <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={data.dailyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(val: any, name?: string) => name === 'gmv' ? [fmt(val), 'GMV'] : [val, 'Orders']} />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="gmv" stroke="#10b981" strokeWidth={2} fill="url(#gmvGrad)" name="GMV" />
                        <Bar yAxisId="right" dataKey="orders" fill="#3b82f6" opacity={0.7} name="Orders" radius={[3, 3, 0, 0]} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* ── Hourly Heatmap + Order Status ────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-1">Orders by Hour</h3>
                    <p className="text-xs text-slate-400 mb-4">Peak ordering times</p>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.hourlyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                            <Tooltip />
                            <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
                                {data.hourlyData.map((_: any, i: number) => {
                                    const h = parseInt(_.hour);
                                    const intensity = _ .orders / Math.max(...data.hourlyData.map((d: any) => d.orders), 1);
                                    const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f59e0b' : '#3b82f6';
                                    return <Cell key={i} fill={color} />;
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"></span>Low</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>Medium</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Peak</span>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Orders by Status</h3>
                    <div className="space-y-2.5">
                        {data.ordersByStatus.map((item: any) => {
                            const pct = data.totalOrders > 0 ? (item.count / data.totalOrders) * 100 : 0;
                            const color = STATUS_COLORS[item.status] || '#94a3b8';
                            return (
                                <div key={item.status}>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-xs font-medium text-slate-700 capitalize">{item.status.replace(/_/g, ' ')}</span>
                                        <span className="text-xs font-bold text-slate-900">{item.count} <span className="font-normal text-slate-400">({Math.round(pct)}%)</span></span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Delivery Time Breakdown ──────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-slate-900 mb-5">Delivery Time Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Avg Prep Time', value: `${data.avgPrepMin}m`, sub: 'Accepted → Prepared', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                        { label: 'Avg Rider Wait', value: `${data.avgRiderWaitMin}m`, sub: 'Prepared → Picked Up', color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: 'Avg Transit Time', value: `${data.avgTransitMin}m`, sub: 'Picked Up → Delivered', color: 'text-violet-600', bg: 'bg-violet-50' },
                        { label: 'Avg Total Time', value: `${data.avgTotalMin}m`, sub: 'Order → Delivered', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    ].map(({ label, value, sub, color, bg }) => (
                        <div key={label} className={`${bg} rounded-xl p-5 text-center`}>
                            <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                            <p className={`text-3xl font-bold ${color}`}>{value}</p>
                            <p className="text-xs text-slate-400 mt-1">{sub}</p>
                        </div>
                    ))}
                </div>
                {/* Visual timeline */}
                <div className="mt-6 flex items-center gap-0 text-xs">
                    {[
                        { label: 'Order Placed', color: 'bg-slate-400' },
                        { label: `Prep ${data.avgPrepMin}m`, color: 'bg-indigo-500', w: data.avgPrepMin },
                        { label: `Wait ${data.avgRiderWaitMin}m`, color: 'bg-amber-500', w: data.avgRiderWaitMin },
                        { label: `Transit ${data.avgTransitMin}m`, color: 'bg-violet-500', w: data.avgTransitMin },
                        { label: 'Delivered', color: 'bg-emerald-500' },
                    ].map((seg, i) => {
                        if (i === 0 || i === 4) return (
                            <div key={i} className="flex flex-col items-center mx-1">
                                <div className={`w-3 h-3 rounded-full ${seg.color}`} />
                                <span className="text-slate-500 mt-1 whitespace-nowrap">{seg.label}</span>
                            </div>
                        );
                        const total = data.avgPrepMin + data.avgRiderWaitMin + data.avgTransitMin || 1;
                        const width = Math.max(8, Math.round((seg.w! / total) * 100));
                        return (
                            <div key={i} className="flex flex-col items-center flex-1">
                                <div className={`h-2 w-full rounded-full ${seg.color}`} />
                                <span className="text-slate-500 mt-1">{seg.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Cancellation Analysis ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-1">Cancellation Breakdown</h3>
                    <p className="text-xs text-slate-400 mb-4">{data.cancelledOrders} cancellations ({Math.round(data.cancelRate)}% cancel rate)</p>
                    {data.cancelledOrders > 0 ? (
                        <div className="flex items-center gap-6">
                            <ResponsiveContainer width={160} height={160}>
                                <PieChart>
                                    <Pie data={data.cancelBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                                        {data.cancelBreakdown.map((_: any, i: number) => (
                                            <Cell key={i} fill={CANCEL_COLORS[i % CANCEL_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2 flex-1">
                                {data.cancelBreakdown.map((item: any, i: number) => (
                                    <div key={item.name} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CANCEL_COLORS[i % CANCEL_COLORS.length] }} />
                                            <span className="text-sm text-slate-700">{item.name}</span>
                                        </div>
                                        <span className="text-sm font-bold text-slate-900">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-400 text-sm text-center py-8">No cancellations 🎉</p>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Top Cancellation Reasons</h3>
                    {data.topCancelReasons.length > 0 ? (
                        <div className="space-y-3">
                            {data.topCancelReasons.map((r: any) => (
                                <div key={r.reason} className="flex items-center justify-between p-3 bg-rose-50 rounded-lg">
                                    <span className="text-sm text-slate-700 truncate max-w-[240px]">{r.reason}</span>
                                    <span className="text-sm font-bold text-rose-600 ml-2 shrink-0">{r.count}×</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-400 text-sm text-center py-8">No cancellation reasons recorded.</p>
                    )}
                </div>
            </div>

            {/* ── Restaurant Performance ───────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-slate-900 mb-5">Restaurant Performance</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Restaurant</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Orders</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Revenue</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Avg Order</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Cancelled</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Cancel Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.restaurantPerf.map((r: any, i: number) => (
                                <tr key={r.name} className="hover:bg-slate-50">
                                    <td className="py-2.5 px-3 text-slate-400 font-medium">{i + 1}</td>
                                    <td className="py-2.5 px-3 font-medium text-slate-900">{r.name}</td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">{r.orders}</td>
                                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{fmt(r.revenue)}</td>
                                    <td className="py-2.5 px-3 text-right text-slate-600">{r.orders > 0 ? fmt(r.revenue / r.orders) : '—'}</td>
                                    <td className="py-2.5 px-3 text-right text-rose-600">{r.cancelled}</td>
                                    <td className="py-2.5 px-3 text-right">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.cancelRate > 20 ? 'bg-rose-100 text-rose-700' : r.cancelRate > 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {r.cancelRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Rider Performance ───────────────────────────────────────── */}
            {data.riderPerf.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-5">Rider Performance</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Rider</th>
                                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Deliveries</th>
                                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Avg Transit</th>
                                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Earnings</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.riderPerf.map((r: any, i: number) => (
                                    <tr key={r.name} className="hover:bg-slate-50">
                                        <td className="py-2.5 px-3 text-slate-400 font-medium">{i + 1}</td>
                                        <td className="py-2.5 px-3 font-medium text-slate-900">{r.name}</td>
                                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{r.deliveries}</td>
                                        <td className="py-2.5 px-3 text-right text-violet-600">{r.avgTransit > 0 ? `${r.avgTransit}m` : '—'}</td>
                                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{fmt(r.earnings)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Payment Methods ──────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">Payment Methods</h3>
                <div className="flex h-5 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                    {data.paymentMethods.map((pm: any, i: number) => {
                        const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500'];
                        return (
                            <div key={pm.method} style={{ width: `${pm.pct}%` }}
                                className={`${colors[i % colors.length]} h-full`}
                                title={`${pm.method} ${pm.pct}%`} />
                        );
                    })}
                </div>
                <div className="flex gap-6 flex-wrap">
                    {data.paymentMethods.map((pm: any, i: number) => {
                        const dots = ['text-emerald-500', 'text-blue-500', 'text-purple-500', 'text-amber-500'];
                        return (
                            <div key={pm.method} className="flex items-center gap-2 text-sm">
                                <span className={`text-lg ${dots[i % dots.length]}`}>●</span>
                                <span className="font-medium text-slate-700">{pm.method}</span>
                                <span className="text-slate-400">{pm.count} orders ({pm.pct}%)</span>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
