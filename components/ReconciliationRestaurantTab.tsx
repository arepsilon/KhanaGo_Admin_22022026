'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Search, Loader2, CreditCard, ChevronDown, ChevronUp,
    History, CheckCircle2, FileText, Download, X, Trash2
} from 'lucide-react';
import jsPDF from 'jspdf';

interface DateRange {
    start: string;
    end: string;
}

interface PayoutForm {
    restId: string;
    amount: string;
    note: string;
    date: string; // YYYY-MM-DD — actual date of payment, used for period bucketing
}

interface OrderBreakdown {
    id: string;
    order_number: string;
    created_at: string;
    orderTotal: number;      // what the customer paid (o.total)
    baseTotal: number;
    platformFee: number;
    transactionFee: number;  // transaction_charge_percent of orderTotal
    netPayable: number;
}

interface RestaurantStat {
    id: string;
    name: string;
    platform_fee_per_order: number;
    transaction_charge_percent: number;
    openingBalance: number;
    earnedInPeriod: number;
    paidInPeriod: number;
    closingBalance: number;
    history: any[];
    periodOrders: OrderBreakdown[];
}

// ─── Breakdown Modal ──────────────────────────────────────────────────────────

function BreakdownModal({
    restaurant,
    dateRange,
    onClose,
}: {
    restaurant: RestaurantStat;
    dateRange: DateRange;
    onClose: () => void;
}) {
    const [exporting, setExporting] = useState(false);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
        });
    };

    const totalOrderAmt  = restaurant.periodOrders.reduce((s, o) => s + o.orderTotal, 0);
    const totalBase      = restaurant.periodOrders.reduce((s, o) => s + o.baseTotal, 0);
    const totalPlatFee   = restaurant.periodOrders.reduce((s, o) => s + o.platformFee, 0);
    const totalTxnFee    = restaurant.periodOrders.reduce((s, o) => s + o.transactionFee, 0);
    const totalFee       = totalPlatFee + totalTxnFee;
    const totalNet       = restaurant.periodOrders.reduce((s, o) => s + o.netPayable, 0);

    const handleDownloadPDF = () => {
        setExporting(true);
        try {
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = 0;

            // Header band
            pdf.setFillColor(234, 88, 12);
            pdf.rect(0, 0, pageWidth, 38, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.text('Payment Breakdown', 15, 16);
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
            pdf.text(restaurant.name, 15, 26);
            pdf.text(
                `Period: ${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`,
                pageWidth - 15, 16, { align: 'right' }
            );
            pdf.text(
                `Generated: ${formatDate(new Date().toISOString())}`,
                pageWidth - 15, 26, { align: 'right' }
            );

            y = 50;

            // Summary
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text('Summary', 15, y);
            y += 8;

            const summary = [
                { label: 'Orders in Period',   value: restaurant.periodOrders.length.toString() },
                { label: 'Total Order Value',  value: `Rs. ${totalOrderAmt.toFixed(2)}` },
                { label: 'Total Base Amount',  value: `Rs. ${totalBase.toFixed(2)}` },
                { label: 'Total Deductions',   value: `-Rs. ${totalFee.toFixed(2)}` },
                { label: 'Net Payable',        value: `Rs. ${totalNet.toFixed(2)}` },
            ];
            pdf.setFontSize(9);
            summary.forEach((item, idx) => {
                const xPos = 15 + idx * 38;
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(100, 100, 100);
                pdf.text(item.label, xPos, y);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(idx === 2 ? 220 : idx === 3 ? 22 : 0, idx === 2 ? 38 : idx === 3 ? 163 : 0, 0);
                pdf.text(item.value, xPos, y + 6);
            });
            y += 20;

            // Deduction note
            pdf.setTextColor(71, 85, 105);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            const deductionParts: string[] = [];
            if (restaurant.platform_fee_per_order > 0)
                deductionParts.push(`Platform fee: Rs.${restaurant.platform_fee_per_order.toFixed(2)}/order × ${restaurant.periodOrders.length} = Rs.${totalPlatFee.toFixed(2)}`);
            if (restaurant.transaction_charge_percent > 0)
                deductionParts.push(`Transaction charge: ${restaurant.transaction_charge_percent}% of order total = Rs.${totalTxnFee.toFixed(2)}`);
            if (deductionParts.length > 0) {
                pdf.text('Deductions: ' + deductionParts.join('   |   '), 15, y);
                y += 10;
            }

            // Table
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text('Order Breakdown', 15, y);
            y += 8;

            const COL = { date: 15, order: 47, orderTotal: 71, base: 97, pFee: 124, txnFee: 149, net: 173 };

            const drawTableHeader = () => {
                pdf.setFillColor(241, 245, 249);
                pdf.rect(15, y - 5, pageWidth - 30, 9, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7.5);
                pdf.setTextColor(71, 85, 105);
                pdf.text('Date',         COL.date,       y);
                pdf.text('Order #',      COL.order,      y);
                pdf.text('Order Total',  COL.orderTotal, y);
                pdf.text('Base Amt',     COL.base,       y);
                pdf.text('Plat. Fee',    COL.pFee,       y);
                pdf.text('Txn Fee',      COL.txnFee,     y);
                pdf.text('Payable',      COL.net,        y);
                y += 7;
            };

            drawTableHeader();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);

            restaurant.periodOrders.forEach((order, idx) => {
                if (y > 270) { pdf.addPage(); y = 20; drawTableHeader(); }
                if (idx % 2 === 0) {
                    pdf.setFillColor(249, 250, 251);
                    pdf.rect(15, y - 4, pageWidth - 30, 7, 'F');
                }
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                pdf.setTextColor(30, 30, 30);
                pdf.text(formatDate(order.created_at), COL.date, y);
                pdf.text(`#${order.order_number ?? '—'}`, COL.order, y);
                pdf.setTextColor(51, 65, 85);
                pdf.text(`Rs. ${order.orderTotal.toFixed(2)}`, COL.orderTotal, y);
                pdf.setTextColor(0, 0, 0);
                pdf.text(`Rs. ${order.baseTotal.toFixed(2)}`, COL.base, y);
                pdf.setTextColor(220, 38, 38);
                pdf.text(order.platformFee > 0 ? `-Rs. ${order.platformFee.toFixed(2)}` : '—', COL.pFee, y);
                pdf.text(order.transactionFee > 0 ? `-Rs. ${order.transactionFee.toFixed(2)}` : '—', COL.txnFee, y);
                pdf.setTextColor(22, 163, 74);
                pdf.text(`Rs. ${order.netPayable.toFixed(2)}`, COL.net, y);
                y += 7;
            });

            if (restaurant.periodOrders.length === 0) {
                pdf.setTextColor(150, 150, 150);
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(9);
                pdf.text('No orders in this period.', 15, y);
                y += 8;
            }

            // Totals row
            y += 2;
            pdf.setFillColor(234, 88, 12);
            pdf.rect(15, y - 5, pageWidth - 30, 9, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.setTextColor(255, 255, 255);
            pdf.text('TOTAL',                                  COL.date,       y);
            pdf.text(`Rs. ${totalOrderAmt.toFixed(2)}`,       COL.orderTotal, y);
            pdf.text(`Rs. ${totalBase.toFixed(2)}`,           COL.base,       y);
            pdf.text(`-Rs. ${totalPlatFee.toFixed(2)}`,       COL.pFee,       y);
            pdf.text(`-Rs. ${totalTxnFee.toFixed(2)}`,        COL.txnFee,     y);
            pdf.text(`Rs. ${totalNet.toFixed(2)}`,            COL.net,        y);

            // Page footers
            const pageCount = (pdf as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(150, 150, 150);
                pdf.text(
                    `Page ${i} of ${pageCount}  •  Payment terms effective from 9 Apr 2026`,
                    pageWidth / 2,
                    pdf.internal.pageSize.getHeight() - 8,
                    { align: 'center' }
                );
            }

            pdf.save(`Breakdown_${restaurant.name.replace(/\s+/g, '_')}_${dateRange.start}_to_${dateRange.end}.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
            alert('Failed to export PDF.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">

                {/* Modal header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{restaurant.name}</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Payment breakdown · {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownloadPDF}
                            disabled={exporting}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60 transition-all"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download size={15} />}
                            Download PDF
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Summary strip */}
                <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-4 bg-white shrink-0">
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Orders</p>
                        <p className="text-xl font-bold text-slate-800 mt-0.5">{restaurant.periodOrders.length}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Order Total</p>
                        <p className="text-xl font-bold text-slate-800 mt-0.5">₹{totalOrderAmt.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Base Amount</p>
                        <p className="text-xl font-bold text-slate-800 mt-0.5">₹{totalBase.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Deductions</p>
                        <p className="text-xl font-bold text-red-500 mt-0.5">-₹{totalFee.toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {restaurant.platform_fee_per_order > 0 && `Plat. ₹${restaurant.platform_fee_per_order.toFixed(2)}/order`}
                            {restaurant.platform_fee_per_order > 0 && restaurant.transaction_charge_percent > 0 && ' + '}
                            {restaurant.transaction_charge_percent > 0 && `Txn ${restaurant.transaction_charge_percent}%`}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold">Net Payable</p>
                        <p className="text-xl font-bold text-emerald-600 mt-0.5">₹{totalNet.toFixed(2)}</p>
                    </div>
                </div>

                {/* Order table */}
                <div className="overflow-auto flex-1">
                    {restaurant.periodOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                            <FileText size={32} className="mb-3 opacity-40" />
                            <p className="text-sm">No orders in this period.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">#</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Order No.</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Order Total</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Base Amount</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Plat. Fee</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Txn Fee ({restaurant.transaction_charge_percent}%)</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Payable</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {restaurant.periodOrders.map((order, idx) => (
                                    <tr key={order.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(order.created_at)}</td>
                                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                                            #{order.order_number ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">₹{order.orderTotal.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">₹{order.baseTotal.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right text-red-500 font-medium">
                                            {order.platformFee > 0 ? `-₹${order.platformFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-500 font-medium">
                                            {order.transactionFee > 0 ? `-₹${order.transactionFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{order.netPayable.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-orange-50 border-t-2 border-orange-200">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 font-bold text-slate-700 text-sm">Total</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-600">₹{totalOrderAmt.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-800">₹{totalBase.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-500">-₹{totalPlatFee.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-500">-₹{totalTxnFee.toFixed(2)}</td>
                                    <td className="px-6 py-3 text-right font-bold text-emerald-600 text-base">₹{totalNet.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function ReconciliationRestaurantTab({ dateRange }: { dateRange: DateRange }) {
    const [restaurants, setRestaurants] = useState<RestaurantStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [processing, setProcessing] = useState<string | null>(null);
    const [breakdownRestaurant, setBreakdownRestaurant] = useState<RestaurantStat | null>(null);
    const [payoutForm, setPayoutForm] = useState<PayoutForm | null>(null);
    const [deletingPayoutId, setDeletingPayoutId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchRestaurantLedger();
    }, [dateRange]);

    const fetchRestaurantLedger = async () => {
        setLoading(true);
        try {
            const { data: restsData, error: restErr } = await supabase
                .from('restaurants')
                .select('id, name, platform_fee_per_order, transaction_charge_percent');
            if (restErr) throw restErr;

            const { data: orders, error: ordErr } = await supabase
                .from('orders')
                .select(`
                    id,
                    order_number,
                    restaurant_id,
                    subtotal,
                    total,
                    platform_fee,
                    delivery_fee,
                    created_at,
                    order_items(quantity, unit_price, base_price)
                `)
                .in('status', ['delivered', 'completed']);
            if (ordErr) throw ordErr;

            const { data: payouts, error: payErr } = await supabase
                .from('restaurant_payouts')
                .select('id, restaurant_id, amount, payout_date, created_at, metadata');
            if (payErr) console.warn('Could not fetch restaurant payouts', payErr);
            const safePayouts = payouts || [];

            const startUTC = new Date(`${dateRange.start}T00:00:00.000Z`).getTime();
            const endUTC   = new Date(`${dateRange.end}T23:59:59.999Z`).getTime();

            // New payment terms effective from 9th April 2026.
            // All pre-cutoff earnings/payouts are zeroed out — no legacy dues are carried forward.
            const LEGACY_CUTOFF = new Date('2026-04-09T00:00:00.000Z').getTime();

            const stats = restsData.map(restaurant => {
                let lifetimeEarnedBefore = 0;
                let lifetimePaidBefore   = 0;
                let earnedInPeriod       = 0;
                let paidInPeriod         = 0;
                const restHistory: any[]          = [];
                const periodOrders: OrderBreakdown[] = [];

                orders?.forEach((o: any) => {
                    if (o.restaurant_id !== restaurant.id) return;
                    const t = new Date(o.created_at).getTime();
                    if (t < LEGACY_CUTOFF) return;

                    const baseTotal = (o.order_items && o.order_items.length > 0)
                        ? o.order_items.reduce((sum: number, item: any) => {
                            const bp = item.base_price ?? item.unit_price;
                            return sum + bp * item.quantity;
                        }, 0)
                        : (o.subtotal || 0);

                    // Deduction from restaurant payable is the restaurant's platform fee — NOT the customer-facing o.platform_fee
                    const pFee       = restaurant.platform_fee_per_order ?? 0;
                    const txnPercent = restaurant.transaction_charge_percent ?? 0;
                    // Use o.total (grand total customer paid). Fall back to unit price sum + delivery fee.
                    const unitTotal  = (o.order_items && o.order_items.length > 0)
                        ? o.order_items.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0)
                        : (o.subtotal || 0);
                    const orderTotal    = Number(o.total || unitTotal + Number(o.delivery_fee || 0));
                    const transactionFee = orderTotal * txnPercent / 100;
                    const netEarnedForOrder = baseTotal - pFee - transactionFee;

                    if (t < startUTC) {
                        lifetimeEarnedBefore += netEarnedForOrder;
                    } else if (t >= startUTC && t <= endUTC) {
                        earnedInPeriod += netEarnedForOrder;
                        periodOrders.push({
                            id: o.id,
                            order_number: o.order_number,
                            created_at: o.created_at,
                            orderTotal,
                            baseTotal,
                            platformFee: pFee,
                            transactionFee,
                            netPayable: netEarnedForOrder,
                        });
                    }
                });

                periodOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                safePayouts?.forEach((p: any) => {
                    if (p.restaurant_id !== restaurant.id) return;
                    const amt = Number(p.amount || 0);
                    // Use payout_date (actual payment date) if available, fall back to created_at
                    const t   = new Date(p.payout_date || p.created_at).getTime();
                    if (t < LEGACY_CUTOFF) return;

                    if (t >= startUTC && t <= endUTC) {
                        restHistory.push(p);
                        paidInPeriod += amt;
                    } else if (t < startUTC) {
                        lifetimePaidBefore += amt;
                    }
                });

                const openingBalance = lifetimeEarnedBefore - lifetimePaidBefore;
                const closingBalance = openingBalance + earnedInPeriod - paidInPeriod;
                restHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                return {
                    id: restaurant.id,
                    name: restaurant.name,
                    platform_fee_per_order: restaurant.platform_fee_per_order ?? 0,
                    transaction_charge_percent: restaurant.transaction_charge_percent ?? 0,
                    openingBalance,
                    earnedInPeriod,
                    paidInPeriod,
                    closingBalance,
                    history: restHistory,
                    periodOrders,
                };
            });

            stats.sort((a, b) => b.closingBalance - a.closingBalance);
            setRestaurants(stats);
        } catch (error) {
            console.error('Error fetching restaurant ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayout = async (payoutId: string, amount: number) => {
        if (!confirm(`Reverse payout of ₹${amount.toLocaleString()}? This cannot be undone.`)) return;
        setDeletingPayoutId(payoutId);
        try {
            const { error } = await supabase
                .from('restaurant_payouts')
                .delete()
                .eq('id', payoutId);
            if (error) throw error;
            await fetchRestaurantLedger();
        } catch (err: any) {
            console.error(err);
            alert('Error reversing payout: ' + err.message);
        } finally {
            setDeletingPayoutId(null);
        }
    };

    const openPayoutForm = (r: RestaurantStat) => {
        setPayoutForm({
            restId: r.id,
            amount: r.closingBalance > 0 ? r.closingBalance.toFixed(2) : '',
            note: '',
            date: dateRange.end, // default to end of the selected period
        });
        setExpandedId(null);
    };

    const handleSubmitPayout = async () => {
        if (!payoutForm) return;
        const amount = parseFloat(payoutForm.amount);
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }

        setProcessing(payoutForm.restId);
        try {
            const { error } = await supabase
                .from('restaurant_payouts')
                .insert({
                    restaurant_id: payoutForm.restId,
                    amount,
                    order_count: 0,
                    status: 'completed',
                    payout_date: new Date(`${payoutForm.date}T12:00:00.000Z`).toISOString(),
                    metadata: payoutForm.note.trim() ? { note: payoutForm.note.trim() } : {},
                });
            if (error) throw error;
            setPayoutForm(null);
            await fetchRestaurantLedger();
        } catch (err: any) {
            console.error(err);
            alert('Error recording payout: ' + err.message);
        } finally {
            setProcessing(null);
        }
    };

    const filtered = restaurants.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
    );

    const totalOwedGlobally = filtered.reduce((acc, r) => acc + r.closingBalance, 0);

    return (
        <>
            {breakdownRestaurant && (
                <BreakdownModal
                    restaurant={breakdownRestaurant}
                    dateRange={dateRange}
                    onClose={() => setBreakdownRestaurant(null)}
                />
            )}

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search restaurants..."
                            className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg border border-red-100 font-semibold shadow-sm">
                        Total Platform Debt: ₹{totalOwedGlobally.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Restaurant</th>
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
                                        <td className="px-6 py-4 font-semibold text-slate-900">{r.name}</td>
                                        <td className="px-6 py-4 text-slate-600">₹{r.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 font-semibold text-emerald-600">+₹{r.earnedInPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 font-semibold text-red-500">-₹{r.paidInPeriod.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className={`font-bold inline-block px-3 py-1 rounded-full text-xs ${
                                                r.closingBalance > 0 ? 'bg-orange-100 text-orange-700' :
                                                r.closingBalance < 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {r.closingBalance < 0
                                                    ? `(Credit) ₹${Math.abs(r.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                    : `₹${r.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setBreakdownRestaurant(r)}
                                                    title="View order breakdown"
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
                                                >
                                                    <FileText size={14} />
                                                    Breakdown
                                                </button>
                                                <button
                                                    onClick={() => payoutForm?.restId === r.id ? setPayoutForm(null) : openPayoutForm(r)}
                                                    disabled={processing === r.id}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                        payoutForm?.restId === r.id
                                                            ? 'bg-slate-200 text-slate-700'
                                                            : 'bg-slate-900 text-white hover:bg-slate-800'
                                                    }`}
                                                >
                                                    {processing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard size={14} />}
                                                    {payoutForm?.restId === r.id ? 'Cancel' : 'Record Payout'}
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
                                    {payoutForm?.restId === r.id && (
                                        <tr className="bg-orange-50/60">
                                            <td colSpan={6} className="px-8 py-5 border-b border-orange-100">
                                                <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                                    <CreditCard size={15} className="text-orange-500" />
                                                    Record Payout — {r.name}
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
                                                            placeholder="e.g. Weekly settlement, Advance…"
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
        </>
    );
}
