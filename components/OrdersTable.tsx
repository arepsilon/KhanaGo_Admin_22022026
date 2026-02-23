'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Edit } from 'lucide-react';
import EditOrderModal from './EditOrderModal';

export default function OrdersTable() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [onlineRiders, setOnlineRiders] = useState<any[]>([]);
    const [isAssigning, setIsAssigning] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
    const [retryingOrder, setRetryingOrder] = useState<string | null>(null);
    const [editingOrder, setEditingOrder] = useState<any>(null);
    const supabase = createClient();

    useEffect(() => {
        fetchOrders();
        fetchOnlineRiders();

        // Subscribe to real-time updates
        const channel = supabase
            .channel('orders_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                () => {
                    fetchOrders();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'deliveries',
                },
                () => {
                    fetchOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [filter]);

    const fetchOrders = async () => {
        let query = supabase
            .from('orders')
            .select(`
                *,
                restaurant:restaurants(name),
                customer:profiles!customer_id(full_name, phone, orders(count)),
                address:addresses(address_line1, city, label, latitude, longitude),
                order_items(
                    *,
                    menu_item:menu_items(name, price)
                ),
                delivery:deliveries(
                    *,
                    rider:profiles!rider_id(full_name, phone)
                )
            `)
            .order('created_at', { ascending: false });

        if (filter === 'awaiting_rider') {
            // Special filter for orders awaiting rider assignment
            query = query
                .in('status', ['accepted', 'preparing', 'ready'])
                .not('rider_assignment_exhausted_at', 'is', null);
        } else if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching orders:', error);
        } else {
            setOrders(data || []);
        }
        setLoading(false);
    };

    const fetchOnlineRiders = async () => {
        const { data: statusData } = await supabase
            .from('rider_live_status')
            .select(`
                rider_id,
                is_online,
                active_deliveries_count,
                last_updated,
                rider:profiles!rider_id(full_name, phone)
            `)
            .eq('is_online', true);

        setOnlineRiders(statusData || []);
    };

    const handleForceAssign = async (orderId: string, riderId: string) => {
        setIsAssigning(true);
        try {
            const { error } = await supabase.rpc('admin_force_assign_rider', {
                p_order_id: orderId,
                p_rider_id: riderId
            });

            if (error) throw error;

            alert('Rider assigned successfully! 🛵');
            setShowAssignModal(null);
            fetchOrders();
        } catch (error: any) {
            console.error('Error force assigning rider:', error);
            alert('Failed to assign rider: ' + error.message);
        } finally {
            setIsAssigning(false);
        }
    };

    const handleRetryAssignment = async (orderId: string) => {
        setRetryingOrder(orderId);
        try {
            const { data, error } = await supabase.rpc('admin_retry_rider_assignment', {
                p_order_id: orderId
            });

            if (error) {
                console.error('Error retrying assignment:', error);
                alert('Failed to retry assignment: ' + error.message);
            } else if (data) {
                alert('✅ Rider assigned successfully!');
                fetchOrders();
            } else {
                alert('⚠️ No riders available at this time. Will auto-retry in 2 minutes.');
                fetchOrders();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to retry assignment');
        } finally {
            setRetryingOrder(null);
        }
    };

    const updateOrderStatus = async (orderId: string, newStatus: string) => {
        const updatePayload: any = { status: newStatus };
        if (newStatus === 'cancelled' || newStatus === 'rejected') {
            updatePayload.cancelled_by = 'admin';
        }

        const { error } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', orderId);

        if (error) {
            alert('Error updating order status');
        } else {
            fetchOrders();
        }
    };

    const toggleExpand = (orderId: string) => {
        const newExpanded = new Set(expandedOrders);
        if (newExpanded.has(orderId)) {
            newExpanded.delete(orderId);
        } else {
            newExpanded.add(orderId);
        }
        setExpandedOrders(newExpanded);
    };

    const expandAll = () => {
        setExpandedOrders(new Set(orders.map(o => o.id)));
    };

    const collapseAll = () => {
        setExpandedOrders(new Set());
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            accepted: 'bg-blue-100 text-blue-800 border-blue-200',
            preparing: 'bg-purple-100 text-purple-800 border-purple-200',
            ready: 'bg-indigo-100 text-indigo-800 border-indigo-200',
            assigned: 'bg-cyan-100 text-cyan-800 border-cyan-200',
            picked_up: 'bg-teal-100 text-teal-800 border-teal-200',
            on_the_way: 'bg-orange-100 text-orange-800 border-orange-200',
            delivered: 'bg-green-100 text-green-800 border-green-200',
            cancelled: 'bg-red-100 text-red-800 border-red-200',
            rejected: 'bg-red-100 text-red-800 border-red-200',
        };
        return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
    };

    const formatDuration = (start: string, end: string) => {
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const diffInMs = endTime - startTime;

        if (diffInMs <= 0) return '0m';

        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        const hours = Math.floor(diffInMinutes / 60);
        const minutes = diffInMinutes % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div>
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-700">Filter by Status</h3>
                    <button
                        onClick={expandedOrders.size === 0 ? expandAll : collapseAll}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        {expandedOrders.size === 0 ? '⬇️ Expand All' : '⬆️ Collapse All'}
                    </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {['all', 'awaiting_rider', 'pending', 'accepted', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status
                                ? status === 'awaiting_rider' ? 'bg-amber-500 text-white' : 'bg-orange-500 text-white'
                                : status === 'awaiting_rider' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {status === 'awaiting_rider' ? '⚠️ AWAITING RIDER' : status.replace('_', ' ').toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Order</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Customer</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Restaurant</th>
                            <th className="text-center py-3 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Items</th>
                            <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Total</th>
                            <th className="text-center py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                            <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Rider</th>
                            <th className="text-center py-3 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Prep</th>
                            <th className="text-center py-3 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">Delivery</th>
                            <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Time</th>
                            <th className="w-6 py-3 px-1"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {orders.map((order) => {
                            const isExpanded = expandedOrders.has(order.id);
                            const delivery = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery;
                            const rider = delivery?.rider;
                            const orderTime = new Date(order.created_at);
                            const timeStr = orderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const dateStr = orderTime.toLocaleDateString([], { day: 'numeric', month: 'short' });
                            const cancelledByLabel = (() => {
                                const by = (order.cancelled_by || '').toLowerCase();
                                if (by === 'customer') return 'User';
                                if (by === 'admin') return 'Admin';
                                if (by === 'restaurant') return 'Restaurant';
                                if (by === 'rider') return 'Rider';
                                return null;
                            })();

                            return (
                                <React.Fragment key={order.id}>
                                    {/* Compact Table Row */}
                                    <tr
                                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-orange-50' : ''}`}
                                        onClick={() => toggleExpand(order.id)}
                                    >
                                        <td className="py-2.5 px-3">
                                            <span className="font-bold text-gray-900 text-xs">{order.order_number}</span>
                                            {order.rider_assignment_exhausted_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
                                                <span className="ml-1 inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" title="Awaiting Rider"></span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="font-medium text-gray-900 text-xs truncate max-w-[120px]">{order.customer?.full_name || 'Unknown'}</div>
                                            <div className="text-[10px] text-gray-500">{order.customer?.phone || 'No phone'}</div>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="text-xs text-gray-900 truncate max-w-[120px]">{order.restaurant?.name}</div>
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                            <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 rounded-full text-xs font-bold text-gray-700">
                                                {order.order_items?.length || 0}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            <span className="font-bold text-orange-600 text-xs">₹{order.total.toFixed(0)}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${getStatusColor(order.status)}`}>
                                                {order.status.replace('_', ' ').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            {rider ? (
                                                <div className="text-xs font-medium text-cyan-700 truncate max-w-[90px]">{rider.full_name}</div>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                            {order.accepted_at && order.prepared_at ? (
                                                <span className="text-xs font-medium text-indigo-600">{formatDuration(order.accepted_at, order.prepared_at)}</span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-2 text-center">
                                            {order.delivered_at ? (
                                                <span className="text-xs font-medium text-emerald-600">{formatDuration(order.created_at, order.delivered_at)}</span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            <div className="text-xs text-gray-900 font-medium">{timeStr}</div>
                                            <div className="text-[10px] text-gray-500">{dateStr}</div>
                                            {(order.status === 'cancelled' || order.status === 'rejected') && cancelledByLabel && (
                                                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${order.cancelled_by === 'customer' ? 'bg-blue-50 text-blue-700'
                                                    : order.cancelled_by === 'restaurant' ? 'bg-purple-50 text-purple-700'
                                                        : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    ✕ {cancelledByLabel}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-1">
                                            <svg
                                                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </td>
                                    </tr>

                                    {/* Expanded Details — Compact */}
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={11} className="p-0 border-b-4 border-orange-200">
                                                <div className="border-t border-orange-200 px-4 py-3 bg-orange-50/50">
                                                    {/* Top: Badges */}
                                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                                        {(() => {
                                                            const orderCount = order.customer?.orders?.[0]?.count || 0;
                                                            return orderCount === 1
                                                                ? <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-black">🌟 New Customer</span>
                                                                : <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-black">👤 {orderCount} orders</span>;
                                                        })()}
                                                        {rider && (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-cyan-50 text-cyan-700">
                                                                🛵 {rider.full_name} • {rider.phone}
                                                            </span>
                                                        )}
                                                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">
                                                            💳 {order.payment_method.toUpperCase()} — {order.payment_status.toUpperCase()}
                                                        </span>
                                                        {order.delivered_at && (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-black">
                                                                ⏱️ {formatDuration(order.created_at, order.delivered_at)}
                                                            </span>
                                                        )}
                                                        {order.accepted_at && order.prepared_at && (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-100 text-black">
                                                                🍳 {formatDuration(order.accepted_at, order.prepared_at)}
                                                            </span>
                                                        )}
                                                        {(order.status === 'cancelled' || order.status === 'rejected') && cancelledByLabel && (
                                                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${order.cancelled_by === 'customer' ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                : order.cancelled_by === 'restaurant' ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                    : 'bg-gray-100 text-gray-700 border-gray-200'
                                                                }`}>
                                                                {order.status === 'cancelled' ? 'Cancelled' : 'Rejected'} by {cancelledByLabel}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Main content: 3-column grid */}
                                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                                        {/* Col 1: Address */}
                                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                                            <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">📍 Delivery Address</h5>
                                                            <p className="text-xs font-medium text-gray-900">{order.address?.label}</p>
                                                            <p className="text-xs text-gray-600">{order.address?.address_line1}</p>
                                                            {order.address?.latitude && order.address?.longitude && (
                                                                <p className="text-[10px] text-gray-400 mt-1 font-mono">{order.address.latitude}, {order.address.longitude}</p>
                                                            )}
                                                        </div>

                                                        {/* Col 2: Order Items */}
                                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">🍽️ Items ({order.order_items?.length || 0})</h5>
                                                                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                                                                        className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 rounded text-[10px] font-bold"
                                                                    >
                                                                        <Edit className="w-2.5 h-2.5" />
                                                                        EDIT
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                                                {order.order_items?.map((item: any, index: number) => (
                                                                    <div key={index} className="flex justify-between text-xs">
                                                                        <span className="text-gray-900 truncate max-w-[180px]">{item.quantity}× {item.menu_item?.name}</span>
                                                                        <span className="font-medium text-gray-700 ml-2 whitespace-nowrap">₹{item.subtotal.toFixed(0)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Col 3: Bill */}
                                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                                            <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">💰 Bill</h5>
                                                            <div className="space-y-0.5 text-xs">
                                                                <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="text-black">₹{order.subtotal.toFixed(0)}</span></div>
                                                                <div className="flex justify-between"><span className="text-gray-600">Delivery</span><span className="text-black">₹{order.delivery_fee.toFixed(0)}</span></div>
                                                                <div className="flex justify-between"><span className="text-gray-600">Platform</span><span className="text-black">₹{(order.platform_fee || 0).toFixed(0)}</span></div>
                                                                {(order.discount_amount > 0) && (
                                                                    <div className="flex justify-between"><span className="text-green-600">Discount</span><span className="text-green-600">-₹{order.discount_amount.toFixed(0)}</span></div>
                                                                )}
                                                                <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                                                                    <span className="font-bold text-gray-900">Total</span>
                                                                    <span className="font-bold text-orange-600">₹{order.total.toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Bottom: Timestamps + Actions */}
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                            <span>Placed: {new Date(order.created_at).toLocaleString()}</span>
                                                            {order.delivered_at && <span>• Delivered: {new Date(order.delivered_at).toLocaleString()}</span>}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {/* Rider Assignment Alert */}
                                                            {order.rider_assignment_exhausted_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleRetryAssignment(order.id); }}
                                                                    disabled={retryingOrder === order.id}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${retryingOrder === order.id
                                                                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                                        : 'bg-amber-500 text-white hover:bg-amber-600'
                                                                        }`}
                                                                >
                                                                    {retryingOrder === order.id ? '⏳ Retrying...' : `🔄 Retry Rider (${order.rider_assignment_attempts || 0})`}
                                                                </button>
                                                            )}

                                                            {/* Force Assign */}
                                                            {['accepted', 'preparing', 'ready', 'assigned'].includes(order.status) && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); fetchOnlineRiders(); setShowAssignModal(order.id); }}
                                                                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition-colors"
                                                                >
                                                                    🛵 Force Assign
                                                                </button>
                                                            )}

                                                            {/* Status Dropdown */}
                                                            <select
                                                                value={order.status}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                                className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-black focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                            >
                                                                <option value="pending">Pending</option>
                                                                <option value="accepted">Accepted</option>
                                                                <option value="preparing">Preparing</option>
                                                                <option value="ready">Ready</option>
                                                                <option value="assigned">Assigned to Rider</option>
                                                                <option value="picked_up">Picked Up</option>
                                                                <option value="on_the_way">On the Way</option>
                                                                <option value="delivered">Delivered</option>
                                                                <option value="cancelled">Cancelled</option>
                                                                <option value="rejected">Rejected</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>


                {/* Force Assign Modal */}
                {showAssignModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Force Assign Rider</h2>
                                    <p className="text-sm text-gray-500">Order: {orders.find(o => o.id === showAssignModal)?.order_number}</p>
                                </div>
                                <button onClick={() => setShowAssignModal(null)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Online Riders ({onlineRiders.length})</h3>
                                <div className="space-y-3">
                                    {onlineRiders.map((item) => (
                                        <div
                                            key={item.rider_id}
                                            className="p-4 border border-gray-200 rounded-xl hover:border-cyan-500 hover:bg-cyan-50 transition-all cursor-pointer group"
                                            onClick={() => handleForceAssign(showAssignModal, item.rider_id)}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-gray-900 group-hover:text-cyan-900">{item.rider.full_name}</p>
                                                    <p className="text-xs text-gray-500">{item.rider.phone || 'No phone number'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.active_deliveries_count >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                                        }`}>
                                                        {item.active_deliveries_count} active orders
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {onlineRiders.length === 0 && (
                                        <div className="text-center py-8 bg-gray-50 rounded-xl">
                                            <p className="text-gray-500">No riders are currently online.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isAssigning && (
                                <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="font-bold text-cyan-600">Assigning Rider...</p>
                                    </div>
                                </div>
                            )}

                            <div className="p-6 bg-gray-50 border-t border-gray-100">
                                <button
                                    onClick={() => setShowAssignModal(null)}
                                    className="w-full py-3 text-gray-600 font-bold hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {editingOrder && (
                    <EditOrderModal
                        isOpen={!!editingOrder}
                        onClose={() => setEditingOrder(null)}
                        onSuccess={fetchOrders}
                        order={editingOrder}
                    />
                )}

                {orders.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <p className="text-gray-500 text-lg">No orders found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
