'use client';

import { useState, useEffect } from 'react';
import { Calendar, Bike, Store, LayoutDashboard, Receipt, Lock } from 'lucide-react';
import ReconciliationRiderTab from './ReconciliationRiderTab';
import ReconciliationRestaurantTab from './ReconciliationRestaurantTab';
import ReconciliationAdminTab from './ReconciliationAdminTab';
import ReconciliationOverheadTab from './ReconciliationOverheadTab';

const SESSION_KEY = 'reconciliation_unlocked';
const CORRECT_PASSWORD = 'Jbb@10072022';

export default function ReconciliationDashboard() {
    const [unlocked, setUnlocked] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<'riders' | 'restaurants' | 'admin' | 'overhead'>('riders');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (sessionStorage.getItem(SESSION_KEY) === 'true') setUnlocked(true);
    }, []);

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === CORRECT_PASSWORD) {
            sessionStorage.setItem(SESSION_KEY, 'true');
            setUnlocked(true);
            setError(false);
        } else {
            setError(true);
            setPassword('');
        }
    };

    if (!unlocked) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 w-full max-w-sm text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 bg-orange-50 rounded-full">
                            <Lock className="w-8 h-8 text-orange-500" />
                        </div>
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">Protected Page</h2>
                    <p className="text-sm text-slate-400 mb-6">Enter the password to access reconciliation data</p>
                    <form onSubmit={handleUnlock} className="space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(false); }}
                            placeholder="Enter password"
                            autoFocus
                            className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${
                                error ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-orange-400'
                            }`}
                        />
                        {error && <p className="text-xs text-red-500">Incorrect password. Try again.</p>}
                        <button
                            type="submit"
                            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all"
                        >
                            Unlock
                        </button>
                    </form>
                </div>
            </div>
        );
    }

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
                    <button
                        onClick={() => setActiveTab('overhead')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold transition-all ${
                            activeTab === 'overhead' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Receipt size={18} />
                        Overhead
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
                {activeTab === 'overhead' && <ReconciliationOverheadTab dateRange={dateRange} />}
            </div>
        </div>
    );
}
