'use client';

import { useState } from 'react';
import { Calendar, Bike, Store, LayoutDashboard } from 'lucide-react';
import ReconciliationRiderTab from './ReconciliationRiderTab';
import ReconciliationRestaurantTab from './ReconciliationRestaurantTab';
import ReconciliationAdminTab from './ReconciliationAdminTab';

export default function ReconciliationDashboard() {
    const [activeTab, setActiveTab] = useState<'riders' | 'restaurants' | 'admin'>('riders');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    return (
        <div className="space-y-6">
            {/* Header / Date Pickers */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                        onClick={() => setActiveTab('riders')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold transition-all ${
                            activeTab === 'riders' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Bike size={18} />
                        Delivery Boys
                    </button>
                    <button
                        onClick={() => setActiveTab('restaurants')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold transition-all ${
                            activeTab === 'restaurants' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Store size={18} />
                        Restaurants
                    </button>
                    <button
                        onClick={() => setActiveTab('admin')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold transition-all ${
                            activeTab === 'admin' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <LayoutDashboard size={18} />
                        Admin P&amp;L
                    </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">From</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 text-slate-700 w-32 outline-none"
                        />
                    </div>
                    <span className="text-slate-300">-</span>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">To</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 text-slate-700 w-32 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="transition-all duration-300 ease-in-out">
                {activeTab === 'riders' && <ReconciliationRiderTab dateRange={dateRange} />}
                {activeTab === 'restaurants' && <ReconciliationRestaurantTab dateRange={dateRange} />}
                {activeTab === 'admin' && <ReconciliationAdminTab dateRange={dateRange} />}
            </div>
        </div>
    );
}
