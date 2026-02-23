'use client';

import { useEffect, useState } from 'react';
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

            {/* Orders Cards */}
            <div className="space-y-4">
                {orders.map((order) => {
                    const isExpanded = expandedOrders.has(order.id);
                    return (
                        <div key={order.id} className={`bg-white rounded-xl shadow-sm border-2 ${getStatusColor(order.status)} transition-all`}>
                            {/* Order Header - Always Visible */}
                            <div
                                className="p-6 cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleExpand(order.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-4 mb-3">
                                            <h3 className="text-xl font-bold text-gray-900">
                                                {order.order_number}
                                            </h3>
                                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.status)}`}>
                                                {order.status.replace('_', ' ').toUpperCase()}
                                            </span>
                                            {order.delivered_at && (
                                                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-emerald-100 text-black border border-emerald-200">
                                                    ⏱️ Delivery: {formatDuration(order.created_at, order.delivered_at)}
                                                </span>
                                            )}
                                            {order.accepted_at && order.prepared_at && (
                                                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-indigo-100 text-black border border-indigo-200">
                                                    🍳 Prep: {formatDuration(order.accepted_at, order.prepared_at)}
                                                </span>
                                            )}
                                            {order.rider_assignment_exhausted_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
                                                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                    ⚠️ AWAITING RIDER
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-500">Customer</p>
                                                <p className="font-medium text-gray-900">{order.customer?.full_name || 'Unknown'}</p>
                                                <p className="text-gray-600 text-xs">{order.customer?.phone}</p>
                                                <div className="mt-1">
                                                    {(() => {
                                                        const orderCount = order.customer?.orders?.[0]?.count || 0;
                                                        if (orderCount === 1) {
                                                            return (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-black">
                                                                    🌟 New Customer
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-black">
                                                                Existing Customer ({orderCount} orders)
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Restaurant</p>
                                                <p className="font-medium text-gray-900">{order.restaurant?.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Total Amount</p>
                                                <p className="font-bold text-lg text-orange-600">₹{order.total.toFixed(2)}</p>
                                                {(() => {
                                                    const delivery = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery;
                                                    const rider = delivery?.rider;
                                                    if (!rider) return null;

                                                    return (
                                                        <div className="mt-2 p-2 bg-cyan-50 border border-cyan-100 rounded-lg">
                                                            <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider">Assigned Rider</p>
                                                            <p className="text-sm font-semibold text-cyan-800">{rider.full_name}</p>
                                                            <p className="text-[10px] text-cyan-600">{rider.phone}</p>
                                                        </div>
                                                    );
                                                })()}
                                                {(order.status === 'cancelled' || order.status === 'rejected') && (
                                                    <div className="mt-2 text-sm">
                                                        <span className="text-gray-500 block mb-1">
                                                            {order.status === 'cancelled' ? 'Cancelled By:' : 'Rejected By:'}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${order.cancelled_by === 'customer'
                                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                            : order.cancelled_by === 'restaurant'
                                                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                : 'bg-gray-100 text-gray-700 border-gray-200'
                                                            }`}>
                                                            {(() => {
                                                                const by = (order.cancelled_by || '').toLowerCase();
                                                                if (by === 'customer') return 'USER';
                                                                if (by === 'admin') return 'ADMIN';
                                                                if (by === 'restaurant') return 'RESTAURANT';
                                                                if (by === 'rider') return 'RIDER';
                                                                return 'UNKNOWN';
                                                            })()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <button className="ml-4 text-gray-400 hover:text-gray-600">
                                        <svg
                                            className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="border-t border-gray-200 p-6 bg-gray-50">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        {/* Delivery Address */}
                                        <div>
                                            <h4 className="font-semibold text-gray-900 mb-2">📍 Delivery Address</h4>
                                            <div className="bg-white p-4 rounded-lg border border-gray-200">
                                                <p className="font-medium text-gray-900">{order.address?.label}</p>
                                                <p className="text-sm text-gray-600 mb-2">{order.address?.address_line1}</p>
                                                {order.address?.latitude && order.address?.longitude && (
                                                    <div className="text-xs bg-gray-50 p-2 rounded border border-gray-200 text-gray-500 font-mono">
                                                        Lat: {order.address.latitude}<br />
                                                        Long: {order.address.longitude}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Order Details */}
                                        <div>
                                            <h4 className="font-semibold text-gray-900 mb-2">📅 Order Details</h4>
                                            <div className="bg-white p-4 rounded-lg border border-gray-200">
                                                <p className="text-sm text-gray-600">
                                                    Placed: {new Date(order.created_at).toLocaleString()}
                                                </p>
                                                {order.delivered_at && (
                                                    <>
                                                        <p className="text-sm text-gray-600">
                                                            Delivered: {new Date(order.delivered_at).toLocaleString()}
                                                        </p>
                                                        <p className="text-sm font-semibold text-black mt-1">
                                                            ⏱️ Delivery Time: {formatDuration(order.created_at, order.delivered_at)}
                                                        </p>
                                                    </>
                                                )}
                                                {order.accepted_at && order.prepared_at && (
                                                    <p className="text-sm font-semibold text-black mt-1">
                                                        🍳 Prep Time: {formatDuration(order.accepted_at, order.prepared_at)}
                                                    </p>
                                                )}
                                                <p className="text-sm text-gray-600">
                                                    Payment: {order.payment_method.toUpperCase()} - {order.payment_status.toUpperCase()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Order Items */}
                                    <div className="mb-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-semibold text-gray-900">🍽️ Order Items ({order.order_items?.length || 0})</h4>
                                            {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                                <button
                                                    onClick={() => setEditingOrder(order)}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 rounded-lg text-xs font-bold transition-all shadow-sm"
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                    EDIT ITEMS
                                                </button>
                                            )}
                                        </div>
                                        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
                                            {order.order_items?.map((item: any, index: number) => (
                                                <div key={index} className="p-4 flex justify-between items-center">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-gray-900">{item.menu_item?.name}</p>
                                                        <p className="text-sm text-gray-600">
                                                            Quantity: {item.quantity} × ₹{item.unit_price.toFixed(2)}
                                                        </p>
                                                        {item.special_instructions && (
                                                            <p className="text-xs text-gray-500 mt-1">Note: {item.special_instructions}</p>
                                                        )}
                                                    </div>
                                                    <p className="font-semibold text-gray-900">
                                                        ₹{item.subtotal.toFixed(2)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bill Breakdown */}
                                    <div className="mb-6">
                                        <h4 className="font-semibold text-gray-900 mb-3">💰 Bill Details</h4>
                                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                                            <div className="flex justify-between py-2">
                                                <span className="text-gray-600">Subtotal</span>
                                                <span className="font-medium">₹{order.subtotal.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between py-2">
                                                <span className="text-gray-600">Delivery Fee</span>
                                                <span className="font-medium">₹{order.delivery_fee.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between py-2">
                                                <span className="text-gray-600">Platform Fee</span>
                                                <span className="font-medium">₹{(order.platform_fee || 0).toFixed(2)}</span>
                                            </div>
                                            {(order.discount_amount > 0) && (
                                                <div className="flex justify-between py-2">
                                                    <span className="text-green-600 font-medium">Discount</span>
                                                    <span className="text-green-600 font-medium">-₹{order.discount_amount.toFixed(2)}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                                                <span className="font-bold text-gray-900">Total</span>
                                                <span className="font-bold text-xl text-orange-600">₹{order.total.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rider Assignment - Show for orders awaiting rider */}
                                    {order.rider_assignment_exhausted_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
                                        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                            <h4 className="font-semibold text-amber-800 mb-2">🚴 Rider Assignment</h4>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-amber-700">
                                                        No riders available. Auto-retrying every 2 minutes.
                                                    </p>
                                                    {order.rider_assignment_attempts > 0 && (
                                                        <p className="text-xs text-amber-600 mt-1">
                                                            Retry attempts: {order.rider_assignment_attempts}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRetryAssignment(order.id);
                                                    }}
                                                    disabled={retryingOrder === order.id}
                                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${retryingOrder === order.id
                                                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                        : 'bg-amber-500 text-white hover:bg-amber-600'
                                                        }`}
                                                >
                                                    {retryingOrder === order.id ? 'Retrying...' : 'Retry Now'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Status Update */}
                                    <div>
                                        <h4 className="font-semibold text-gray-900 mb-3">⚡ Update Status</h4>
                                        <select
                                            value={order.status}
                                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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

                                    {/* Force Assign Button */}
                                    {['accepted', 'preparing', 'ready', 'assigned'].includes(order.status) && (
                                        <div className="mt-6 pt-6 border-t border-gray-200">
                                            <button
                                                onClick={() => {
                                                    fetchOnlineRiders();
                                                    setShowAssignModal(order.id);
                                                }}
                                                className="w-full md:w-auto px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                                            >
                                                🛵 Force Assign a Rider
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

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
