'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Loader2, CreditCard, ChevronDown, ChevronUp, History, CheckCircle2, X, Trash2, FileText } from 'lucide-react';

interface DateRange {
    start: string;
    end: string;
}

interface DeliveryBreakdown {
    order_id: string;
    order_number: string;
    updated_at: string;
    delivery_fee: number;
    deliveryType: 'Short' | 'Medium' | 'Long';
    riderEarning: number;
}

interface DayBreakdown {
    date: string;
    count: number;
    deliveries: DeliveryBreakdown[];
    dailyFixed: number;
    perDeliveryTotal: number;
    bonus: number;
    dayTotal: number;
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
    periodDeliveries: DeliveryBreakdown[];
}

interface PayoutForm {
    riderId: string;
    amount: string;
    note: string;
    date: string; // YYYY-MM-DD — actual date of payment, used for period bucketing
}

// ── Rider pay structure ────────────────────────────────────────────────────────
// V1: 2026-04-17 to 2026-04-24 — ₹300/day + ₹15/delivery + bonus
// V2: 2026-04-25 onwards       — ₹400/day + max(₹15, delivery_fee×50%) + bonus
const RIDER_PAY_V1 = { dailyFixed: 300, perDelivery: 15, bonus15: 100, bonus20: 150 };
const RIDER_PAY_V2 = { dailyFixed: 400, minPerDelivery: 15, feePercent: 0.5, bonus15: 100, bonus20: 150 };
const NEW_PAY_CUTOFF_V1 = '2026-04-17';
const NEW_PAY_CUTOFF_V2 = '2026-04-25';

function getISTDate(utcString: string) {
    const istMs = new Date(utcString).getTime() + 5.5 * 60 * 60 * 1000;
    return new Date(istMs).toISOString().split('T')[0];
}

function calcEarnings(deliveries: { updated_at: string; delivery_fee: number | null }[]) {
    const legacy = deliveries.filter(d => getISTDate(d.updated_at) < NEW_PAY_CUTOFF_V1);
    const v1 = deliveries.filter(d => { const day = getISTDate(d.updated_at); return day >= NEW_PAY_CUTOFF_V1 && day < NEW_PAY_CUTOFF_V2; });
    const v2 = deliveries.filter(d => getISTDate(d.updated_at) >= NEW_PAY_CUTOFF_V2);

    const legacyTotal = legacy.reduce((sum, d) => sum + Number(d.delivery_fee || 0), 0);

    const v1ByDay: Record<string, number> = {};
    v1.forEach(d => { const day = getISTDate(d.updated_at); v1ByDay[day] = (v1ByDay[day] || 0) + 1; });
    const v1Fixed = Object.keys(v1ByDay).length * RIDER_PAY_V1.dailyFixed;
    const v1PerDelivery = v1.length * RIDER_PAY_V1.perDelivery;
    const v1Bonus = Object.values(v1ByDay).reduce((sum, cnt) => {
        if (cnt >= 20) return sum + RIDER_PAY_V1.bonus20;
        if (cnt >= 15) return sum + RIDER_PAY_V1.bonus15;
        return sum;
    }, 0);

    const v2ByDay: Record<string, number> = {};
    v2.forEach(d => { const day = getISTDate(d.updated_at); v2ByDay[day] = (v2ByDay[day] || 0) + 1; });
    const v2Fixed = Object.keys(v2ByDay).length * RIDER_PAY_V2.dailyFixed;
    const v2PerDelivery = v2.reduce((sum, d) => sum + Math.max(RIDER_PAY_V2.minPerDelivery, Number(d.delivery_fee || 0) * RIDER_PAY_V2.feePercent), 0);
    const v2Bonus = Object.values(v2ByDay).reduce((sum, cnt) => {
        if (cnt >= 20) return sum + RIDER_PAY_V2.bonus20;
        if (cnt >= 15) return sum + RIDER_PAY_V2.bonus15;
        return sum;
    }, 0);

    return legacyTotal + v1Fixed + v1PerDelivery + v1Bonus + v2Fixed + v2PerDelivery + v2Bonus;
}

function getDeliveryType(fee: number): 'Short' | 'Medium' | 'Long' {
    if (fee <= 20) return 'Short';
    if (fee <= 35) return 'Medium';
    return 'Long';
}

function getPerDeliveryEarning(fee: number, istDate: string): number {
    if (istDate < NEW_PAY_CUTOFF_V1) return fee;
    if (istDate < NEW_PAY_CUTOFF_V2) return RIDER_PAY_V1.perDelivery;
    return Math.max(RIDER_PAY_V2.minPerDelivery, fee * RIDER_PAY_V2.feePercent);
}

function getDailyFixed(istDate: string): number {
    if (istDate < NEW_PAY_CUTOFF_V1) return 0;
    if (istDate < NEW_PAY_CUTOFF_V2) return RIDER_PAY_V1.dailyFixed;
    return RIDER_PAY_V2.dailyFixed;
}

function getDayBonus(count: number, istDate: string): number {
    const rules = istDate < NEW_PAY_CUTOFF_V2 ? RIDER_PAY_V1 : RIDER_PAY_V2;
    if (count >= 20) return rules.bonus20;
    if (count >= 15) return rules.bonus15;
    return 0;
}

// ── Rider Breakdown Modal ──────────────────────────────────────────────────────

function RiderBreakdownModal({ rider, dateRange, onClose }: {
    rider: RiderStat;
    dateRange: DateRange;
    onClose: () => void;
}) {
    const formatDate = (s: string) => new Date(s).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });

    // Group deliveries by IST date
    const dayMap: Record<string, DeliveryBreakdown[]> = {};
    rider.periodDeliveries.forEach(d => {
        const day = getISTDate(d.updated_at);
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push(d);
    });

    const days: DayBreakdown[] = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, deliveries]) => {
            const dailyFixed = getDailyFixed(date);
            const perDeliveryTotal = deliveries.reduce((s, d) => s + d.riderEarning, 0);
            const bonus = getDayBonus(deliveries.length, date);
            return { date, count: deliveries.length, deliveries, dailyFixed, perDeliveryTotal, bonus, dayTotal: dailyFixed + perDeliveryTotal + bonus };
        });

    const totalDays = days.length;
    const totalDeliveries = rider.periodDeliveries.length;
    const totalFixed = days.reduce((s, d) => s + d.dailyFixed, 0);
    const totalPerDelivery = days.reduce((s, d) => s + d.perDeliveryTotal, 0);
    const totalBonus = days.reduce((s, d) => s + d.bonus, 0);
    const grandTotal = totalFixed + totalPerDelivery + totalBonus;

    const typeColors: Record<string, string> = {
        Short:  'bg-blue-50 text-blue-700',
        Medium: 'bg-amber-50 text-amber-700',
        Long:   'bg-purple-50 text-purple-700',
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{rider.full_name}</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Earnings breakdown · {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Summary strip */}
                <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-3 sm:grid-cols-6 gap-4 bg-white shrink-0">
                    {[
                        { label: 'Days Active',    value: totalDays,                        fmt: (v: number) => String(v) },
                        { label: 'Deliveries',     value: totalDeliveries,                  fmt: (v: number) => String(v) },
                        { label: 'Daily Fixed',    value: totalFixed,                       fmt: (v: number) => `₹${v.toFixed(2)}` },
                        { label: 'Per Delivery',   value: totalPerDelivery,                 fmt: (v: number) => `₹${v.toFixed(2)}` },
                        { label: 'Bonus',          value: totalBonus,                       fmt: (v: number) => `₹${v.toFixed(2)}` },
                        { label: 'Total Earned',   value: grandTotal,                       fmt: (v: number) => `₹${v.toFixed(2)}` },
                    ].map(({ label, value, fmt }) => (
                        <div key={label}>
                            <p className="text-xs text-slate-400 uppercase font-semibold">{label}</p>
                            <p className={`text-lg font-bold mt-0.5 ${label === 'Total Earned' ? 'text-emerald-600' : label === 'Bonus' ? 'text-orange-500' : 'text-slate-800'}`}>
                                {fmt(value)}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Day-by-day breakdown */}
                <div className="overflow-auto flex-1 px-6 py-4 space-y-6">
                    {days.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                            <FileText size={32} className="mb-3 opacity-40" />
                            <p className="text-sm">No deliveries in this period.</p>
                        </div>
                    ) : days.map(day => (
                        <div key={day.date} className="border border-slate-100 rounded-xl overflow-hidden">
                            {/* Day header */}
                            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-slate-800 text-sm">
                                        {new Date(day.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                    <span className="text-xs text-slate-400">{day.count} deliveries</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-semibold">
                                    <span className="text-slate-500">Fixed: <span className="text-slate-800">₹{day.dailyFixed}</span></span>
                                    <span className="text-slate-500">Per-delivery: <span className="text-slate-800">₹{day.perDeliveryTotal.toFixed(2)}</span></span>
                                    {day.bonus > 0 && (
                                        <span className="text-slate-500">Bonus: <span className="text-orange-600">+₹{day.bonus}</span></span>
                                    )}
                                    <span className="text-emerald-600 font-bold">Day Total: ₹{day.dayTotal.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Order table */}
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-2.5 text-xs font-bold text-slate-400 uppercase text-left">Time</th>
                                        <th className="px-4 py-2.5 text-xs font-bold text-slate-400 uppercase text-left">Order No.</th>
                                        <th className="px-4 py-2.5 text-xs font-bold text-slate-400 uppercase text-left">Type</th>
                                        <th className="px-4 py-2.5 text-xs font-bold text-slate-400 uppercase text-right">Delivery Fee</th>
                                        <th className="px-4 py-2.5 text-xs font-bold text-slate-400 uppercase text-right">Rider Earning</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {day.deliveries.map((d, idx) => (
                                        <tr key={d.order_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                                            <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                                {new Date(d.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                                            </td>
                                            <td className="px-4 py-3 font-mono font-semibold text-slate-800">#{d.order_number}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColors[d.deliveryType]}`}>
                                                    {d.deliveryType}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500">₹{d.delivery_fee.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{d.riderEarning.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {day.bonus > 0 && (
                                    <tfoot>
                                        <tr className="bg-orange-50 border-t border-orange-100">
                                            <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-orange-700">
                                                🎯 Performance Bonus ({day.count >= 20 ? '20+' : '15+'} deliveries)
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold text-orange-600">+₹{day.bonus}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    ))}
                </div>

                {/* Grand total footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-orange-50/60 shrink-0 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                        {totalDays} day{totalDays !== 1 ? 's' : ''} · {totalDeliveries} deliveries · ₹{totalFixed} fixed + ₹{totalPerDelivery.toFixed(2)} per-delivery + ₹{totalBonus} bonus
                    </div>
                    <div className="text-xl font-bold text-emerald-600">Total: ₹{grandTotal.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}

export default function ReconciliationRiderTab({ dateRange }: { dateRange: DateRange }) {
    const [riders, setRiders] = useState<RiderStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const [payoutForm, setPayoutForm] = useState<PayoutForm | null>(null);
    const [deletingPayoutId, setDeletingPayoutId] = useState<string | null>(null);
    const [breakdownRider, setBreakdownRider] = useState<RiderStat | null>(null);

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
                .select('rider_id, delivery_fee, updated_at, order_id, orders(order_number)')
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
                const periodRaw = riderDeliveries.filter(d => {
                    const t = new Date(d.updated_at).getTime();
                    return t >= startUTC && t <= endUTC;
                });
                earnedInPeriod = calcEarnings(periodRaw);

                const periodDeliveries: DeliveryBreakdown[] = periodRaw
                    .map(d => {
                        const istDate = getISTDate(d.updated_at);
                        const fee = Number(d.delivery_fee || 0);
                        return {
                            order_id: d.order_id,
                            order_number: (d.orders as any)?.order_number ?? '—',
                            updated_at: d.updated_at,
                            delivery_fee: fee,
                            deliveryType: getDeliveryType(fee),
                            riderEarning: getPerDeliveryEarning(fee, istDate),
                        };
                    })
                    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

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

                return { id: rider.id, full_name: rider.full_name, email: rider.email, openingBalance, earnedInPeriod, paidInPeriod, closingBalance, history: riderHistory, periodDeliveries };
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
            {breakdownRider && (
                <RiderBreakdownModal
                    rider={breakdownRider}
                    dateRange={dateRange}
                    onClose={() => setBreakdownRider(null)}
                />
            )}
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
                                                onClick={() => setBreakdownRider(r)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
                                            >
                                                <FileText size={14} />
                                                Breakdown
                                            </button>
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
