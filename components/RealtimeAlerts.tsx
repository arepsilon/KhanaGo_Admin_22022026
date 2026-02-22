'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, X, ShoppingBag } from 'lucide-react';

interface OrderAlert {
    id: string;
    order_number: string;
    restaurant_name: string;
    total: number;
    created_at: string;
}

export default function RealtimeAlerts() {
    const supabase = createClient();
    const [alerts, setAlerts] = useState<OrderAlert[]>([]);
    const [alertsEnabled, setAlertsEnabled] = useState(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Check if alerts are enabled
        checkAlertsEnabled();

        // Subscribe to new orders
        const channel = supabase
            .channel('admin_order_alerts')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                },
                async (payload) => {
                    if (!alertsEnabled) return;

                    // Fetch restaurant name
                    const { data: restaurant } = await supabase
                        .from('restaurants')
                        .select('name')
                        .eq('id', payload.new.restaurant_id)
                        .single();

                    const newAlert: OrderAlert = {
                        id: payload.new.id,
                        order_number: payload.new.order_number || payload.new.id.slice(0, 8),
                        restaurant_name: restaurant?.name || 'Unknown',
                        total: payload.new.total || 0,
                        created_at: payload.new.created_at,
                    };

                    setAlerts(prev => [newAlert, ...prev].slice(0, 5)); // Keep last 5
                    playNotificationSound();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [alertsEnabled]);

    const checkAlertsEnabled = async () => {
        const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'realtime_alerts_enabled')
            .single();

        if (data) {
            setAlertsEnabled(data.value === true || data.value === 'true');
        }
    };

    const playNotificationSound = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.log('Audio play failed:', e));
        }
    };

    const dismissAlert = (id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    const dismissAll = () => {
        setAlerts([]);
    };

    if (!alertsEnabled || alerts.length === 0) return null;

    return (
        <>
            {/* Audio element for notification sound */}
            <audio
                ref={audioRef}
                src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
                preload="auto"
            />

            {/* Alerts container - fixed position */}
            <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className="bg-white border border-orange-200 rounded-xl shadow-lg p-4 animate-slide-in"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <ShoppingBag className="w-5 h-5 text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-slate-900">New Order!</p>
                                    <button
                                        onClick={() => dismissAlert(alert.id)}
                                        className="text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <p className="text-sm text-slate-600 truncate">
                                    #{alert.order_number} • {alert.restaurant_name}
                                </p>
                                <p className="text-sm font-medium text-green-600">
                                    ₹{alert.total.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}

                {alerts.length > 1 && (
                    <button
                        onClick={dismissAll}
                        className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
                    >
                        Dismiss all
                    </button>
                )}
            </div>

            {/* Add animation styles */}
            <style jsx>{`
                @keyframes slide-in {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .animate-slide-in {
                    animation: slide-in 0.3s ease-out;
                }
            `}</style>
        </>
    );
}
