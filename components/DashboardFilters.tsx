'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DateRangePicker from './DateRangePicker';

export default function DashboardFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const [cities, setCities] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        supabase.from('cities').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
            setCities(data || []);
        });
    }, []);

    // Get today's IST date as default (YYYY-MM-DD)
    const now = new Date();
    const istDateStr = now.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [mm, dd, yyyy] = istDateStr.split('/');
    const today = `${yyyy}-${mm}-${dd}`;

    const startDate = searchParams.get('startDate') || today;
    const endDate = searchParams.get('endDate') || today;
    const cityId = searchParams.get('cityId') || 'all';

    const updateUrl = (start: string, end: string, city?: string) => {
        const params = new URLSearchParams(searchParams);
        if (start) params.set('startDate', start);
        else params.delete('startDate');

        if (end) params.set('endDate', end);
        else params.delete('endDate');

        const c = city ?? cityId;
        if (c && c !== 'all') params.set('cityId', c);
        else params.delete('cityId');

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="mb-8 flex items-end gap-4 flex-wrap">
            <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={(val) => updateUrl(val, endDate)}
                onEndChange={(val) => updateUrl(startDate, val)}
            />
            <select
                value={cityId}
                onChange={(e) => updateUrl(startDate, endDate, e.target.value)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors shadow-sm"
            >
                <option value="all">All Cities</option>
                {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                ))}
            </select>
        </div>
    );
}
