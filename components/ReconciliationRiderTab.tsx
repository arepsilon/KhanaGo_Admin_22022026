'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Loader2, CreditCard, ChevronDown, ChevronUp, History, CheckCircle2, X, Trash2 } from 'lucide-react';

interface DateRange {
    start: string;
    end: string;
}

interface RiderStat {
    id: string;
    full_name: string;
    email: string;
    openingBalance: number;
    earnedInPeriod: number;
    paidInPeriod: number;
    closingBalance: number;
    history: any[];
}

interface PayoutForm {
    riderId: string;
    amount: string;
    note: string;
    date: string; // YYYY-MM-DD — actual date of payment, used for period bucketing
}

// ── Rider pay structure (new from 2026-04-17) ─────────────────────────────────
const RIDER_PAY = { dailyFixed: 300, perDelivery: 15, bonus15: 100, bonus20: 150 };
const NEW_PAY_CUTOFF = '2026-04-17';

function getISTDate(utcString: string) {
    const istMs = new Date(utcString).getTime() + 5.5 * 60 * 60 * 1000;
    return new Date(istMs).toISOString().split('T')[0];
}

function calcEarnings(deliveries: { updated_at: string; delivery_fee: number | null }[]) {
    // Pre-cutoff: use recorded delivery_fee
    const legacy = deliveries.filter(d => getISTDate(d.updated_at) < NEW_PAY_CUTOFF);
    const legacyTotal = legacy.reduce((sum, d) => sum + Number(d.delivery_fee || 0), 0);

    // Post-cutoff: ₹300/day + ₹15/delivery + bonus
    const newOnes = deliveries.filter(d => getISTDate(d.updated_at) >= NEW_PAY_CUTOFF);
    const byDay: Record<string, number> = {};
    newOnes.forEach(d => {
        const day = getISTDate(d.updated_at);
        byDay[day] = (byDay[day] || 0) + 1;
    });
    const fixed = Object.keys(byDay).length * RIDER_PAY.dailyFixed;
    const perDelivery = newOnes.length * RIDER_PAY.perDelivery;
    const bonus = Object.values(byDay).reduce((sum, cnt) => {
        if (cnt >= 20) return sum + RIDER_PAY.bonus20;
        if (cnt >= 15) return sum + RIDER_PAY.bonus15;
        return sum;
    }, 0);
    return legacyTotal + fixed + perDelivery + bonus;
}

export default function ReconciliationRiderTab({ dateRange }: { dateRange: DateRange }) {
    const [riders, setRiders] = useState<RiderStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const [payoutForm, setPayoutForm] = useState<PayoutForm | null>(null);
    const [deletingPayoutId, setDeletingPayoutId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchRiderLedger();
    }, [dateRange]);

    const fetchRiderLedger = async () => {
        setLoading(true);
        try {
            const { data: profiles, error: profErr } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('role', 'rider');
            if (profErr) throw profErr;

            const { data: deliveries, error: delErr } = await supabase
                .from('deliveries')
                .select('rider_id, delivery_fee, updated_at')
                .eq('status', 'completed');
            if (delErr) throw delErr;

            const { data: payouts, error: payErr } = await supabase
                .from('rider_payouts')
                .select('id, rider_id, amount, payout_date, created_at, metadata');
            if (payErr) throw payErr;

            const startUTC = new Date(`${dateRange.start}T00:00:00.000Z`).getTime();
            const endUTC   = new Date(`${dateRange.end}T23:59:59.999Z`).getTime();
            const LEGACY_CUTOFF = new Date('2026-04-09T00:00:00.000Z').getTime();

            const stats = profiles.map(rider => {
                let lifetimeEarnedBefore = 0;
                let lifetimePaidBefore   = 0;
                let earnedInPeriod       = 0;
                let paidInPeriod         = 0;
                const riderHistory: any[] = [];

                const riderDeliveries = (deliveries || []).filter(d => {
                    if (d.rider_id !== rider.id) return false;
                    const t = new Date(d.updated_at).getTime();
                    return t >= LEGACY_CUTOFF;
                });
                lifetimeEarnedBefore = calcEarnings(
                    riderDeliveries.filter(d => new Date(d.updated_at).getTime() < startUTC)
                );
                earnedInPeriod = calcEarnings(
                    riderDeliveries.filter(d => {
                        const t = new Date(d.updated_at).getTime();
                        return t >= startUTC && t <= endUTC;
                    })
                );

                payouts?.forEach(p => {
                    if (p.rider_id !== rider.id) return;
                    const amt = Number(p.amount || 0);
                    // Use payout_date (actual payment date) if available, fall back to created_at
                    const t   = new Date(p.payout_date || p.created_at).getTime();
                    if (t < LEGACY_CUTOFF) return;
                    if (t >= startUTC && t <= endUTC) {
                        riderHistory.push(p);
                        paidInPeriod += amt;
                    } else if (t < startUTC) {
                        lifetimePaidBefore += amt;
                    }
                });

                const openingBalance = lifetimeEarnedBefore - lifetimePaidBefore;
                const closingBalance = openingBalance + earnedInPeriod - paidInPeriod;
                riderHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                return { id: rider.id, full_name: rider.full_name, email: rider.email, openingBalance, earnedInPeriod, paidInPeriod, closingBalance, history: riderHistory };
            });

            stats.sort((a, b) => b.closingBalance - a.closingBalance);
            setRiders(stats);
        } catch (error) {
            console.error('Error fetching rider ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayout = async (payoutId: string, amount: number) => {
        if (!confirm(`Reverse payout of ₹${amount.toLocaleString()}? This cannot be undone.`)) return;
        setDeletingPayoutId(payoutId);
        try {
            const { error } = await supabase
                .from('rider_payouts')
                .delete()
                .eq('id', payoutId);
            if (error) throw error;
            await fetchRiderLedger();
        } catch (err: any) {
            console.error(err);
            alert('Error reversing payout: ' + err.message);
        } finally {
            setDeletingPayoutId(null);
        }
    };

    const openPayoutForm = (rider: RiderStat) => {
        setPayoutForm({
            riderId: rider.id,
            amount: rider.closingBalance > 0 ? rider.closingBalance.toFixed(2) : '',
            note: '',
            date: dateRange.end, // default to end of the selected period
        });
        setExpandedId(null); // close history if open
    };

    const handleSubmitPayout = async () => {
        if (!payoutForm) return;
        const amount = parseFloat(payoutForm.amount);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }

        setProcessing(payoutForm.riderId);
        try {
            const { error } = await supabase
                .from('rider_payouts')
                .insert({
                    rider_id:       payoutForm.riderId,
                    amount:         amount,
                    delivery_count: 0,
                    status:         'completed',
                    payout_date:    new Date(`${payoutForm.date}T12:00:00.000Z`).toISOString(),
                    metadata:       payoutForm.note.trim() ? { note: payoutForm.note.trim() } : {},
                });

            if (error) throw error;

            setPayoutForm(null);
            await fetchRiderLedger();
        } catch (err: any) {
            console.error('Payout error:', err);
            alert('Error recording payout: ' + err.message);
        } finally {
            setProcessing(null);
        }
    };

    const filtered = riders.filter(r =>
        r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
    );

    const totalOwedGlobally = filtered.reduce((acc, r) => acc + r.closingBalance, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search delivery boys..."
                        className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg border border-red-100 font-semibold shadow-sm">
                    Total Platform Debt: ₹{totalOwedGlobally.toLocaleString()}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Rider</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Opening Balance</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Earned (Period)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Paid (Period)</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Closing Balance</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.map(r => (
                            <React.Fragment key={r.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-900">{r.full_name}</p>
                                        <p className="text-xs text-slate-400">{r.email}</p>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">₹{r.openingBalance.toLocaleString()}</td>
                                    <td className="px-6 py-4 font-semibold text-emerald-600">+₹{r.earnedInPeriod.toLocaleString()}</td>
                                    <td className="px-6 py-4 font-semibold text-red-500">-₹{r.paidInPeriod.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className={`font-bold inline-block px-3 py-1 rounded-full text-xs ${
                                            r.closingBalance > 0 ? 'bg-orange-100 text-orange-700' :
                                            r.closingBalance < 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {r.closingBalance < 0
                                                ? `(Credit) ₹${Math.abs(r.closingBalance).toLocaleString()}`
                                                : `₹${r.closingBalance.toLocaleString()}`}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => payoutForm?.riderId === r.id ? setPayoutForm(null) : openPayoutForm(r)}
                                                disabled={processing === r.id}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                    payoutForm?.riderId === r.id
                                                        ? 'bg-slate-200 text-slate-700'
                                                        : 'bg-slate-900 text-white hover:bg-slate-800'
                                                }`}
                                            >
                                                {processing === r.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <CreditCard size={14} />}
                                                {payoutForm?.riderId === r.id ? 'Cancel' : 'Record Payout'}
                                            </button>
                                            <button
                                                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"
                                            >
                                                {expandedId === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Inline payout form */}
                                {payoutForm?.riderId === r.id && (
                                    <tr className="bg-orange-50/60">
                                        <td colSpan={6} className="px-8 py-5 border-b border-orange-100">
                                            <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                                <CreditCard size={15} className="text-orange-500" />
                                                Record Payout — {r.full_name}
                                            </p>
                                            <div className="flex items-end gap-3 flex-wrap">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Date *</label>
                                                    <input
                                                        type="date"
                                                        value={payoutForm.date}
                                                        onChange={e => setPayoutForm(f => f ? { ...f, date: e.target.value } : f)}
                                                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (₹) *</label>
                                                    <input
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        value={payoutForm.amount}
                                                        onChange={e => setPayoutForm(f => f ? { ...f, amount: e.target.value } : f)}
                                                        className="w-40 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-48">
                                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Note (optional)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Fuel bonus, Advance pay…"
                                                        value={payoutForm.note}
                                                        onChange={e => setPayoutForm(f => f ? { ...f, note: e.target.value } : f)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleSubmitPayout}
                                                    disabled={processing === r.id || !payoutForm.amount}
                                                    className="px-5 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 transition-all"
                                                >
                                                    {processing === r.id
                                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                                        : <><CheckCircle2 size={15} /> Confirm Payout</>}
                                                </button>
                                                <button
                                                    onClick={() => setPayoutForm(null)}
                                                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-400"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                {/* History */}
                                {expandedId === r.id && (
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={6} className="px-8 py-4 border-b border-slate-100">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                                <History size={16} className="text-slate-400" />
                                                Payouts Within Selected Period
                                            </h4>
                                            {r.history.length === 0 ? (
                                                <div className="text-slate-400 text-sm italic">No payouts logged in this date range.</div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {r.history.map(pay => (
                                                        <div key={pay.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-sm">
                                                            <div className="flex justify-between items-start font-bold text-slate-800 mb-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                                    <span>₹{Number(pay.amount).toLocaleString()}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleDeletePayout(pay.id, Number(pay.amount))}
                                                                    disabled={deletingPayoutId === pay.id}
                                                                    title="Reverse this payout"
                                                                    className="p-1 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                                                                >
                                                                    {deletingPayoutId === pay.id
                                                                        ? <Loader2 size={13} className="animate-spin" />
                                                                        : <Trash2 size={13} />}
                                                                </button>
                                                            </div>
                                                            <div className="text-xs text-slate-400">
                                                                {new Date(pay.payout_date || pay.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                                            </div>
                                                            {pay.metadata?.note && (
                                                                <div className="mt-2 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">
                                                                    {pay.metadata.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
