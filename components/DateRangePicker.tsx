'use client';

import React from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onStartChange: (value: string) => void;
    onEndChange: (value: string) => void;
    label?: string;
}

export default function DateRangePicker({
    startDate,
    endDate,
    onStartChange,
    onEndChange,
    label = 'Filter by Date'
}: DateRangePickerProps) {
    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2 text-black mr-2">
                <Calendar className="w-5 h-5 text-black" />
                <span className="font-medium text-sm"> {label}</span>
            </div>

            <div className="flex items-center gap-2">
                <div className="relative">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartChange(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                    />
                </div>
                <span className="text-black">to</span>
                <div className="relative">
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => onEndChange(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                    />
                </div>
            </div>

            <button
                onClick={() => {
                    onStartChange('');
                    onEndChange('');
                }}
                className="text-xs text-black hover:text-orange-500 transition-colors ml-auto font-medium"
            >
                Clear Filter
            </button>
        </div>
    );
}
