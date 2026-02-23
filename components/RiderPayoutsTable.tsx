'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Search,
    Bike,
    Wallet,
    History,
    CreditCard,
    CheckCircle2,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Calendar,
    ArrowRight,
    Loader2
} from 'lucide-react';

interface Rider {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    bank_account_number: string | null;
    bank_ifsc_code: string | null;
    bank_account_name: string | null;
    total_earned: number;
    pending_balance: number;
}

export default function RiderPayoutsTable() {
    const [riders, setRiders] = useState<Rider[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedRiderId, setExpandedRiderId] = useState<string | null>(null);
    const [processingPayout, setProcessingPayout] = useState<string | null>(null);
    const [payoutDateRange, setPayoutDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    const supabase = createClient();

    useEffect(() => {
        fetchRiderData();
    }, []);

    const fetchRiderData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all riders
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'rider');

            if (profileError) throw profileError;

            // 2. For each rider, fetch their delivery stats
            const riderStats = await Promise.all(profiles.map(async (rider) => {
                // Total completed deliveries within date range
                let allDeliveriesQuery = supabase
                    .from('deliveries')
                    .select('delivery_fee')
                    .eq('rider_id', rider.id)
                    .eq('status', 'completed')
                    .gte('updated_at', `${payoutDateRange.start}T00:00:00.000Z`)
                    .lte('updated_at', `${payoutDateRange.end}T23:59:59.999Z`);

                const { data: allDeliveries, error: allErr } = await allDeliveriesQuery;

                // Deliveries not yet paid within date range
                let pendingDeliveriesQuery = supabase
                    .from('deliveries')
                    .select('delivery_fee')
                    .eq('rider_id', rider.id)
                    .eq('status', 'completed')
                    .is('payout_id', null)
                    .gte('updated_at', `${payoutDateRange.start}T00:00:00.000Z`)
                    .lte('updated_at', `${payoutDateRange.end}T23:59:59.999Z`);

                const { data: pendingDeliveries, error: pendingErr } = await pendingDeliveriesQuery;

                const totalEarned = (allDeliveries || []).reduce((sum, d) => sum + Number(d.delivery_fee || 0), 0);
                const pendingBalance = (pendingDeliveries || []).reduce((sum, d) => sum + Number(d.delivery_fee || 0), 0);

                return {
                    id: rider.id,
                    full_name: rider.full_name,
                    email: rider.email,
                    phone: rider.phone,
                    bank_account_number: rider.bank_account_number,
                    bank_ifsc_code: rider.bank_ifsc_code,
                    bank_account_name: rider.bank_account_name,
                    total_earned: totalEarned,
                    pending_balance: pendingBalance
                };
            }));

            setRiders(riderStats);
        } catch (error) {
            console.error('Error fetching rider data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProcessPayout = async (riderId: string, amount: number) => {
        if (amount <= 0) {
            alert('No pending balance to pay');
            return;
        }

        if (!confirm(`Process payout of ₹${amount} for this rider?`)) return;

        setProcessingPayout(riderId);
        try {
            // 1. Create Payout Record
            const { data: payout, error: payoutErr } = await supabase
                .from('rider_payouts')
                .insert({
                    rider_id: riderId,
                    amount: amount,
                    delivery_count: 0, // Will update below or leave as is if not critical
                    status: 'completed',
                    payout_date: new Date().toISOString()
                })
                .select()
                .single();

            if (payoutErr) throw payoutErr;

            // 2. Link deliveries to this payout
            const { error: updateErr } = await supabase
                .from('deliveries')
                .update({ payout_id: payout.id })
                .eq('rider_id', riderId)
                .eq('status', 'completed')
                .is('payout_id', null);

            if (updateErr) throw updateErr;

            alert('Payout processed successfully');
            fetchRiderData();
        } catch (error: any) {
            console.error('Payout failed:', error);
            alert('Failed to process payout: ' + error.message);
        } finally {
            setProcessingPayout(null);
        }
    };

    const filteredRiders = riders.filter(r =>
        r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Re-fetch data when date range changes
    useEffect(() => {
        // Prevent initial double fetch
        if (payoutDateRange.start && payoutDateRange.end) {
            fetchRiderData();
        }
    }, [payoutDateRange]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search riders by name or email..."
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">From</span>
                        <input
                            type="date"
                            value={payoutDateRange.start}
                            onChange={(e) => setPayoutDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 text-slate-700 w-32 outline-none"
                        />
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">To</span>
                        <input
                            type="date"
                            value={payoutDateRange.end}
                            onChange={(e) => setPayoutDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0 text-slate-700 w-32 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Riders Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-bottom border-slate-100">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rider</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bank Details</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Earned</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Balance</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredRiders.map((rider) => (
                            <React.Fragment key={rider.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                                                {rider.full_name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900">{rider.full_name}</div>
                                                <div className="text-xs text-slate-500">{rider.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {rider.bank_account_number ? (
                                            <div className="text-xs space-y-1">
                                                <p className="font-medium text-slate-900">{rider.bank_account_name}</p>
                                                <p className="text-slate-500">{rider.bank_account_number}</p>
                                                <p className="text-slate-400 font-medium tracking-wider">{rider.bank_ifsc_code}</p>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">No details added</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-900">₹{rider.total_earned.toLocaleString()}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`font-bold ${rider.pending_balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                            ₹{rider.pending_balance.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleProcessPayout(rider.id, rider.pending_balance)}
                                                disabled={rider.pending_balance <= 0 || processingPayout === rider.id}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${rider.pending_balance > 0
                                                    ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-200'
                                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                    }`}
                                            >
                                                {processingPayout === rider.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Wallet size={16} />
                                                )}
                                                Pay Now
                                            </button>
                                            <button
                                                onClick={() => setExpandedRiderId(expandedRiderId === rider.id ? null : rider.id)}
                                                className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                                            >
                                                {expandedRiderId === rider.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Expanded Details - History */}
                                {expandedRiderId === rider.id && (
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={5} className="px-8 py-6">
                                            <RiderHistory riderId={rider.id} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                {filteredRiders.length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                        <Bike className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                        <p>No riders found matching your search.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function RiderHistory({ riderId }: { riderId: string }) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        fetchHistory();
    }, [riderId]);

    const fetchHistory = async () => {
        const { data, error } = await supabase
            .from('rider_payouts')
            .select('*')
            .eq('rider_id', riderId)
            .order('created_at', { ascending: false });

        if (!error) setHistory(data || []);
        setLoading(false);
    };

    if (loading) return <div className="text-center p-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>;

    return (
        <div className="space-y-4">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <History size={18} className="text-orange-500" />
                Payout History
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((payout) => (
                    <div key={payout.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400">{new Date(payout.created_at).toLocaleDateString()}</div>
                            <div className="font-bold text-slate-900">₹{payout.amount.toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-[10px] font-bold">
                            <CheckCircle2 size={12} />
                            COMPLETED
                        </div>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-400 text-sm italic">
                        No payout history found for this rider.
                    </div>
                )}
            </div>
        </div>
    );
}

import React from 'react';
