'use client';

import React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import DateRangePicker from './DateRangePicker';

export default function DashboardFilters() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

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

    const updateUrl = (start: string, end: string) => {
        const params = new URLSearchParams(searchParams);
        if (start) params.set('startDate', start);
        else params.delete('startDate');

        if (end) params.set('endDate', end);
        else params.delete('endDate');

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="mb-8">
            <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={(val) => updateUrl(val, endDate)}
                onEndChange={(val) => updateUrl(startDate, val)}
            />
        </div>
    );
}
