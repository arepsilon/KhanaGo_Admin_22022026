'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import NotificationRulesTable from '@/components/NotificationRulesTable';

export default function NotificationsPage() {
    const supabase = createClient();
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/');
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile?.role !== 'admin' || user.email !== '9867109138@khanago.admin') {
                router.push('/dashboard');
                return;
            }

            setIsAdmin(true);
            setLoading(false);
        };

        checkAdmin();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!isAdmin) return null;

    return (
        <div className="p-8 bg-white min-h-screen">
            <NotificationRulesTable />
        </div>
    );
}
