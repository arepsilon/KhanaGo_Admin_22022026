'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, RefreshCw, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface OrphanedOrder {
    id: string;
    order_number: string;
    status: string;
    rider_assignment_attempts: number;
    rider_assignment_exhausted_at: string;
    created_at: string;
    restaurant: { name: string } | null;
    customer: { full_name: string } | null;
    total: number;
}

export default function OrphanedOrdersAlert() {
    const [orphanedOrders, setOrphanedOrders] = useState<OrphanedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        fetchOrphanedOrders();

        // Subscribe to real-time updates
        const channel = supabase
            .channel('orphaned_orders_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                () => {
                    fetchOrphanedOrders();
                }
            )
            .subscribe();

        // Also poll every 30 seconds as backup
        const interval = setInterval(fetchOrphanedOrders, 30000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, []);

    const fetchOrphanedOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id,
                    order_number,
                    status,
                    rider_assignment_attempts,
                    rider_assignment_exhausted_at,
                    created_at,
                    total,
                    restaurant:restaurants(name),
                    customer:profiles!customer_id(full_name)
                `)
                .not('rider_assignment_exhausted_at', 'is', null)
                .in('status', ['accepted', 'preparing', 'ready'])
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching orphaned orders:', error);
            } else if (data) {
                // Transform data to handle Supabase join responses
                const transformed = data.map((order: any) => ({
                    ...order,
                    restaurant: Array.isArray(order.restaurant) ? order.restaurant[0] : order.restaurant,
                    customer: Array.isArray(order.customer) ? order.customer[0] : order.customer,
                }));
                setOrphanedOrders(transformed);
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRetryAssignment = async (orderId: string) => {
        setRetrying(orderId);
        try {
            const { data, error } = await supabase.rpc('admin_retry_rider_assignment', {
                p_order_id: orderId
            });

            if (error) {
                console.error('Error retrying assignment:', error);
                alert('Failed to retry assignment: ' + error.message);
            } else if (data) {
                alert('✅ Rider assigned successfully!');
                fetchOrphanedOrders();
            } else {
                alert('⚠️ No riders available at this time. Will auto-retry in 2 minutes.');
                fetchOrphanedOrders();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to retry assignment');
        } finally {
            setRetrying(null);
        }
    };

    const getTimeSince = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };

    if (loading) {
        return null;
    }

    if (orphanedOrders.length === 0) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-6 mb-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-amber-800">
                            Orders Awaiting Rider
                        </h3>
                        <p className="text-sm text-amber-600">
                            {orphanedOrders.length} order{orphanedOrders.length !== 1 ? 's' : ''} with no available riders
                        </p>
                    </div>
                </div>
                <Link
                    href="/dashboard/orders?filter=awaiting_rider"
                    className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
                >
                    View All <ChevronRight className="w-4 h-4" />
                </Link>
            </div>

            {/* Orders List */}
            <div className="space-y-3">
                {orphanedOrders.slice(0, 5).map((order) => (
                    <div
                        key={order.id}
                        className="bg-white rounded-lg p-4 border border-amber-200 flex items-center justify-between"
                    >
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="font-bold text-gray-900">{order.order_number}</span>
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${order.status === 'ready'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : order.status === 'preparing'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                    {order.status.toUpperCase()}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600">
                                <span>{order.restaurant?.name}</span>
                                <span className="mx-2">•</span>
                                <span>₹{order.total.toFixed(0)}</span>
                                <span className="mx-2">•</span>
                                <span className="text-amber-600">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {getTimeSince(order.created_at)}
                                </span>
                            </div>
                            {order.rider_assignment_attempts > 1 && (
                                <div className="text-xs text-gray-500 mt-1">
                                    Retry attempts: {order.rider_assignment_attempts}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => handleRetryAssignment(order.id)}
                            disabled={retrying === order.id}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${retrying === order.id
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm hover:shadow'
                                }`}
                        >
                            <RefreshCw className={`w-4 h-4 ${retrying === order.id ? 'animate-spin' : ''}`} />
                            {retrying === order.id ? 'Retrying...' : 'Retry'}
                        </button>
                    </div>
                ))}
            </div>

            {orphanedOrders.length > 5 && (
                <div className="mt-4 text-center">
                    <Link
                        href="/dashboard/orders?filter=awaiting_rider"
                        className="text-sm font-medium text-amber-700 hover:text-amber-900"
                    >
                        + {orphanedOrders.length - 5} more orders
                    </Link>
                </div>
            )}

            {/* Info Footer */}
            <div className="mt-4 pt-4 border-t border-amber-200 text-xs text-amber-700">
                <p>
                    💡 Orders are automatically retried every 2 minutes when new riders become available.
                    You can also manually retry using the button above.
                </p>
            </div>
        </div>
    );
}
