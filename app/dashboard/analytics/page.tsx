import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import DashboardFilters from '@/components/DashboardFilters';
import { Suspense } from 'react';

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string; cityId?: string }>;
}) {
    const { startDate: qStart, endDate: qEnd, cityId: qCityId } = await searchParams;
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
    const cityId = qCityId || null;

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">Analytics & Insights</h1>
                    <Suspense fallback={<div className="h-24 bg-white animate-pulse rounded-xl mb-8 border border-slate-100"></div>}>
                        <DashboardFilters />
                    </Suspense>

                    <AnalyticsDashboard 
                        cityId={cityId} 
                        startDate={startDate} 
                        endDate={endDate} 
                    />
                </div>
            </main>
        </div>
    );
}
