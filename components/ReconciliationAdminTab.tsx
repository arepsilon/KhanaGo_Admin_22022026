'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Loader2, TrendingUp, TrendingDown, Wallet, AlertCircle,
    Bike, Store, IndianRupee, Table2, Download, ChevronDown, ChevronUp, Banknote,
} from 'lucide-react';
import jsPDF from 'jspdf';

interface DateRange {
    start: string;
    end: string;
}

interface AdminOrderBreakdown {
    id: string;
    order_number: string;
    created_at: string;
    restaurantName: string;
    orderTotal: number;          // what the customer paid
    markup: number;
    customerPlatformFee: number; // o.platform_fee — from customer
    platformFee: number;         // restaurant.platform_fee_per_order — from restaurant
    transactionFee: number;
    deliveryFee: number;
    totalRevenue: number;
}

interface AdminStats {
    markupRevenue: number;
    restaurantPlatformFeeRevenue: number;  // platform_fee_per_order charged to restaurant
    customerPlatformFeeRevenue: number;    // o.platform_fee charged to customer
    transactionFeeRevenue: number;
    deliveryFeeRevenue: number;
    totalRevenue: number;
    riderCost: number;
    netIncome: number;
    restaurantPayoutsMade: number;
    riderPayoutsMade: number;
    restaurantOutstanding: number;
    riderOutstanding: number;
    orderCount: number;
    riderPayoutCount: number;
    cashInHand: number;          // COD cash with riders not yet handed to admin
    codOrderCount: number;
    periodOrderBreakdown: AdminOrderBreakdown[];
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
    label: string; value: string; sub?: string;
    color: 'green' | 'red' | 'orange' | 'slate' | 'blue' | 'purple';
    icon: React.ReactNode;
}) {
    const p = {
        green:  { card: 'bg-emerald-50 border-emerald-100',  text: 'text-emerald-700',  icon: 'bg-emerald-100 text-emerald-600'  },
        red:    { card: 'bg-red-50 border-red-100',          text: 'text-red-700',       icon: 'bg-red-100 text-red-600'          },
        orange: { card: 'bg-orange-50 border-orange-100',    text: 'text-orange-700',    icon: 'bg-orange-100 text-orange-600'    },
        slate:  { card: 'bg-slate-50 border-slate-200',      text: 'text-slate-700',     icon: 'bg-slate-200 text-slate-600'      },
        blue:   { card: 'bg-blue-50 border-blue-100',        text: 'text-blue-700',      icon: 'bg-blue-100 text-blue-600'        },
        purple: { card: 'bg-purple-50 border-purple-100',    text: 'text-purple-700',    icon: 'bg-purple-100 text-purple-600'    },
    }[color];
    return (
        <div className={`rounded-2xl border p-5 ${p.card}`}>
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                <div className={`p-2 rounded-lg ${p.icon}`}>{icon}</div>
            </div>
            <p className={`text-2xl font-bold ${p.text}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
    );
}

function RevenueRow({ label, description, amount, positive }: {
    label: string; description: string; amount: number; positive: boolean;
}) {
    return (
        <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <p className="text-xs text-slate-400 truncate">{description}</p>
            </div>
            <span className={`font-bold text-sm shrink-0 ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                {positive ? '+' : '-'}₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
        </div>
    );
}

function PayoutRow({ label, icon, amount, warn = false }: {
    label: string; icon: React.ReactNode; amount: number; warn?: boolean;
}) {
    return (
        <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-400">{icon}</span>{label}
            </div>
            <span className={`font-semibold text-sm ${warn ? 'text-amber-600' : 'text-slate-700'}`}>
                ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReconciliationAdminTab({ dateRange }: { dateRange: DateRange }) {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    const supabase = createClient();

    useEffect(() => { fetchAdminStats(); }, [dateRange]);

    const fetchAdminStats = async () => {
        setLoading(true);
        try {
            // Restaurants — for fee fallback + name lookup
            const { data: restaurants } = await supabase
                .from('restaurants')
                .select('id, name, platform_fee_per_order, transaction_charge_percent');
            const restFeeMap: Record<string, number>  = {};
            const restTxnMap: Record<string, number>  = {};
            const restNameMap: Record<string, string> = {};
            restaurants?.forEach(r => {
                restFeeMap[r.id]  = r.platform_fee_per_order ?? 0;
                restTxnMap[r.id]  = r.transaction_charge_percent ?? 0;
                restNameMap[r.id] = r.name ?? '—';
            });

            // Orders
            const { data: orders, error: ordErr } = await supabase
                .from('orders')
                .select(`
                    id, order_number, restaurant_id,
                    total, delivery_fee, platform_fee, created_at,
                    order_items(quantity, unit_price, base_price)
                `)
                .in('status', ['delivered', 'completed']);
            if (ordErr) throw ordErr;

            // Deliveries (for rider outstanding only)
            const { data: deliveries, error: delErr } = await supabase
                .from('deliveries')
                .select('delivery_fee, updated_at')
                .eq('status', 'completed');
            if (delErr) throw delErr;

            // Restaurant payouts
            const { data: restaurantPayouts } = await supabase
                .from('restaurant_payouts')
                .select('restaurant_id, amount, payout_date, created_at');

            // Rider payouts
            const { data: riderPayouts } = await supabase
                .from('rider_payouts')
                .select('amount, payout_date, created_at');

            // Cash in hand: COD order totals collected by riders minus what's been handed over
            const { data: codDeliveries } = await supabase
                .from('deliveries')
                .select('orders(total, payment_method, created_at)')
                .eq('status', 'completed');

            const { data: cashHandovers } = await supabase
                .from('rider_cash_collections')
                .select('amount, created_at');

            const startUTC      = new Date(`${dateRange.start}T00:00:00.000Z`).getTime();
            const endUTC        = new Date(`${dateRange.end}T23:59:59.999Z`).getTime();
            const LEGACY_CUTOFF = new Date('2026-04-09T00:00:00.000Z').getTime();

            // ── Revenue from orders ──────────────────────────────────────────
            let markupRevenue = 0, restaurantPlatformFeeRevenue = 0, customerPlatformFeeRevenue = 0, transactionFeeRevenue = 0, deliveryFeeRevenue = 0, orderCount = 0;
            let restaurantEarnedTotal = 0, restaurantPaidTotal = 0;
            const periodOrderBreakdown: AdminOrderBreakdown[] = [];

            orders?.forEach((o: any) => {
                const t = new Date(o.created_at).getTime();
                if (t < LEGACY_CUTOFF) return;

                const baseTotal = (o.order_items?.length > 0)
                    ? o.order_items.reduce((s: number, i: any) => s + (i.base_price ?? i.unit_price) * i.quantity, 0)
                    : 0;
                const unitTotal = (o.order_items?.length > 0)
                    ? o.order_items.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0)
                    : 0;

                // Two separate platform fees: one from restaurant, one from customer
                const restPlatFee    = restFeeMap[o.restaurant_id] ?? 0;
                const custPlatFee    = Number(o.platform_fee || 0);
                const txnPercent     = restTxnMap[o.restaurant_id] ?? 0;
                const markup         = unitTotal - baseTotal;
                const delFee         = Number(o.delivery_fee || 0);
                // Use DB total; fall back to unitTotal + delivery + customer platform fee
                const orderTotal     = Number(o.total || unitTotal + delFee + custPlatFee);
                const txnFee         = orderTotal * txnPercent / 100;

                // Restaurant outstanding uses only restaurant-side deductions
                if (t <= endUTC) restaurantEarnedTotal += (baseTotal - restPlatFee - txnFee);

                if (t >= startUTC && t <= endUTC) {
                    markupRevenue                += markup;
                    restaurantPlatformFeeRevenue += restPlatFee;
                    customerPlatformFeeRevenue   += custPlatFee;
                    transactionFeeRevenue        += txnFee;
                    deliveryFeeRevenue           += delFee;
                    orderCount++;
                    periodOrderBreakdown.push({
                        id:                 o.id,
                        order_number:       o.order_number ?? '—',
                        created_at:         o.created_at,
                        restaurantName:     restNameMap[o.restaurant_id] ?? '—',
                        orderTotal,
                        markup,
                        customerPlatformFee: custPlatFee,
                        platformFee:         restPlatFee,
                        transactionFee:      txnFee,
                        deliveryFee:         delFee,
                        totalRevenue:        markup + restPlatFee + custPlatFee + txnFee + delFee,
                    });
                }
            });

            // Sort by date ascending
            periodOrderBreakdown.sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            // ── Rider earned (outstanding calc) ──────────────────────────────
            let riderEarnedTotal = 0;
            deliveries?.forEach(d => {
                const t = new Date(d.updated_at).getTime();
                if (t < LEGACY_CUTOFF || t > endUTC) return;
                riderEarnedTotal += Number(d.delivery_fee || 0);
            });

            // ── Payouts ───────────────────────────────────────────────────────
            let restaurantPayoutsMade = 0;
            restaurantPayouts?.forEach(p => {
                const t = new Date(p.payout_date || p.created_at).getTime();
                if (t < LEGACY_CUTOFF) return;
                if (t <= endUTC) restaurantPaidTotal += Number(p.amount || 0);
                if (t >= startUTC && t <= endUTC) restaurantPayoutsMade += Number(p.amount || 0);
            });

            let riderPayoutsMade = 0, riderPayoutCount = 0, riderPaidTotal = 0;
            riderPayouts?.forEach(p => {
                const t = new Date(p.payout_date || p.created_at).getTime();
                if (t < LEGACY_CUTOFF) return;
                if (t <= endUTC) riderPaidTotal += Number(p.amount || 0);
                if (t >= startUTC && t <= endUTC) { riderPayoutsMade += Number(p.amount || 0); riderPayoutCount++; }
            });

            // ── Cash in hand (COD orders not yet remitted) ───────────────────
            let totalCODCollected = 0, codOrderCount = 0;
            codDeliveries?.forEach((d: any) => {
                const order = d.orders;
                if (!order || order.payment_method !== 'cash') return;
                const t = new Date(order.created_at).getTime();
                if (t < LEGACY_CUTOFF) return;
                totalCODCollected += Number(order.total || 0);
                codOrderCount++;
            });
            const totalCashHandedOver = (cashHandovers || []).reduce((s: number, c: any) => {
                const t = new Date(c.created_at).getTime();
                return t >= LEGACY_CUTOFF ? s + Number(c.amount || 0) : s;
            }, 0);
            const cashInHand = Math.max(0, totalCODCollected - totalCashHandedOver);

            const riderCost             = riderPayoutsMade;
            const totalRevenue          = markupRevenue + restaurantPlatformFeeRevenue + customerPlatformFeeRevenue + transactionFeeRevenue + deliveryFeeRevenue;
            const netIncome             = totalRevenue - riderCost;
            const restaurantOutstanding = Math.max(0, restaurantEarnedTotal - restaurantPaidTotal);
            const riderOutstanding      = Math.max(0, riderEarnedTotal - riderPaidTotal);

            setStats({
                markupRevenue, restaurantPlatformFeeRevenue, customerPlatformFeeRevenue, transactionFeeRevenue, deliveryFeeRevenue, totalRevenue,
                riderCost, netIncome,
                restaurantPayoutsMade, riderPayoutsMade,
                restaurantOutstanding, riderOutstanding,
                orderCount, riderPayoutCount,
                cashInHand, codOrderCount,
                periodOrderBreakdown,
            });
        } catch (err) {
            console.error('Error fetching admin stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const fmt = (n: number) =>
        `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

    const handleExportPDF = () => {
        if (!stats) return;
        setExportingPdf(true);
        try {
            const pdf  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pw   = pdf.internal.pageSize.getWidth();
            const ph   = pdf.internal.pageSize.getHeight();
            let y      = 0;

            // Header band
            pdf.setFillColor(234, 88, 12);
            pdf.rect(0, 0, pw, 28, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text('Admin P&L — Order Breakdown', 14, 13);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(
                `Period: ${fmtDate(dateRange.start)} – ${fmtDate(dateRange.end)}   |   Generated: ${fmtDate(new Date().toISOString())}`,
                14, 22
            );

            // Summary strip
            y = 38;
            const summaryItems = [
                { label: 'Orders',          val: stats.orderCount.toString() },
                { label: 'Gross Revenue',   val: fmt(stats.totalRevenue) },
                { label: 'Markup',          val: fmt(stats.markupRevenue) },
                { label: 'Cust.Plat.Fee',  val: fmt(stats.customerPlatformFeeRevenue) },
                { label: 'Rest.Plat.Fee',  val: fmt(stats.restaurantPlatformFeeRevenue) },
                { label: 'Txn Charges',     val: fmt(stats.transactionFeeRevenue) },
                { label: 'Delivery Fees',   val: fmt(stats.deliveryFeeRevenue) },
                { label: 'Paid to Riders',  val: fmt(stats.riderCost) },
                { label: 'Net Income',      val: fmt(stats.netIncome) },
            ];
            pdf.setFontSize(7.5);
            summaryItems.forEach((s, i) => {
                const x = 14 + i * 30;
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(100, 100, 100);
                pdf.text(s.label, x, y);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(0, 0, 0);
                pdf.text(s.val, x, y + 6);
            });

            y += 18;

            // Table
            // Landscape A4 = 297mm, usable 14–283
            const COL = { num: 14, date: 20, order: 44, rest: 65, orderTotal: 100, markup: 122, custPlat: 141, restPlat: 161, txnFee: 181, delFee: 200, total: 220 };

            const drawHeader = () => {
                pdf.setFillColor(241, 245, 249);
                pdf.rect(14, y - 5, pw - 28, 8, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(6.5);
                pdf.setTextColor(71, 85, 105);
                pdf.text('#',             COL.num,        y);
                pdf.text('Date',          COL.date,       y);
                pdf.text('Order #',       COL.order,      y);
                pdf.text('Restaurant',    COL.rest,       y);
                pdf.text('Ord.Total',     COL.orderTotal, y);
                pdf.text('Markup',        COL.markup,     y);
                pdf.text('Cust.Plat',     COL.custPlat,   y);
                pdf.text('Rest.Plat',     COL.restPlat,   y);
                pdf.text('Txn Fee',       COL.txnFee,     y);
                pdf.text('Del.Fee',       COL.delFee,     y);
                pdf.text('Revenue',       COL.total,      y);
                y += 7;
            };

            drawHeader();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);

            stats.periodOrderBreakdown.forEach((o, idx) => {
                if (y > ph - 20) { pdf.addPage(); y = 14; drawHeader(); }

                if (idx % 2 === 0) {
                    pdf.setFillColor(249, 250, 251);
                    pdf.rect(14, y - 4, pw - 28, 7, 'F');
                }

                pdf.setTextColor(30, 30, 30);
                pdf.text(String(idx + 1),        COL.num,    y);
                pdf.text(fmtDate(o.created_at),  COL.date,   y);
                pdf.text(`#${o.order_number}`,   COL.order,  y);

                // Truncate restaurant name if too long
                const restName = o.restaurantName.length > 22 ? o.restaurantName.slice(0, 20) + '…' : o.restaurantName;
                pdf.text(restName, COL.rest, y);

                pdf.setTextColor(71, 85, 105);
                pdf.text(`Rs.${o.orderTotal.toFixed(2)}`,    COL.orderTotal, y);

                pdf.setTextColor(22, 163, 74);
                pdf.text(`Rs.${o.markup.toFixed(2)}`,        COL.markup,   y);
                pdf.text(o.customerPlatformFee > 0 ? `Rs.${o.customerPlatformFee.toFixed(2)}` : '—', COL.custPlat, y);
                pdf.text(o.platformFee   > 0 ? `Rs.${o.platformFee.toFixed(2)}`   : '—', COL.restPlat, y);
                pdf.text(o.transactionFee > 0 ? `Rs.${o.transactionFee.toFixed(2)}` : '—', COL.txnFee, y);
                pdf.text(o.deliveryFee   > 0 ? `Rs.${o.deliveryFee.toFixed(2)}`   : '—', COL.delFee,  y);

                pdf.setFont('helvetica', 'bold');
                pdf.text(`Rs.${o.totalRevenue.toFixed(2)}`, COL.total, y);
                pdf.setFont('helvetica', 'normal');

                pdf.setTextColor(30, 30, 30);
                y += 7;
            });

            if (stats.periodOrderBreakdown.length === 0) {
                pdf.setTextColor(150, 150, 150);
                pdf.setFont('helvetica', 'italic');
                pdf.text('No orders in this period.', 14, y);
                y += 8;
            }

            // Totals row
            y += 2;
            pdf.setFillColor(234, 88, 12);
            pdf.rect(14, y - 5, pw - 28, 8, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(255, 255, 255);
            pdf.text('TOTAL',                                                                                          COL.rest,       y);
            pdf.text(`Rs.${stats.periodOrderBreakdown.reduce((s, o) => s + o.orderTotal, 0).toFixed(2)}`,             COL.orderTotal, y);
            pdf.text(`Rs.${stats.markupRevenue.toFixed(2)}`,                                                          COL.markup,     y);
            pdf.text(`Rs.${stats.customerPlatformFeeRevenue.toFixed(2)}`,                                             COL.custPlat,   y);
            pdf.text(`Rs.${stats.restaurantPlatformFeeRevenue.toFixed(2)}`,                                           COL.restPlat,   y);
            pdf.text(`Rs.${stats.transactionFeeRevenue.toFixed(2)}`,                                                  COL.txnFee,     y);
            pdf.text(`Rs.${stats.deliveryFeeRevenue.toFixed(2)}`,                                                     COL.delFee,     y);
            pdf.text(`Rs.${stats.totalRevenue.toFixed(2)}`,                                                           COL.total,      y);
            y += 12;

            // Rider payments note
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(100, 100, 100);
            pdf.text(
                `Note: Rider payments (${fmt(stats.riderCost)} across ${stats.riderPayoutCount} payment${stats.riderPayoutCount !== 1 ? 's' : ''}) are lump-sum daily settlements and are not per-order.`,
                14, y
            );
            y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 0, 0);
            pdf.text(`Net Income (Revenue − Rider Payments): ${fmt(stats.netIncome)}`, 14, y);

            // Page footers
            const pages = (pdf as any).internal.getNumberOfPages();
            for (let i = 1; i <= pages; i++) {
                pdf.setPage(i);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`Page ${i} of ${pages}  •  Payment terms effective from 9 Apr 2026`, pw / 2, ph - 6, { align: 'center' });
            }

            pdf.save(`AdminPL_Breakdown_${dateRange.start}_to_${dateRange.end}.pdf`);
        } catch (err) {
            console.error('PDF error:', err);
            alert('Failed to export PDF.');
        } finally {
            setExportingPdf(false);
        }
    };

    if (loading) return (
        <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
    );
    if (!stats) return null;

    const cashPosition = stats.netIncome - stats.restaurantOutstanding - stats.riderOutstanding;

    return (
        <div className="space-y-8">

            {/* ── KPI cards ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard label="Gross Revenue"  value={fmt(stats.totalRevenue)} sub={`${stats.orderCount} orders`}                                                   color="green"  icon={<TrendingUp size={18} />}   />
                <StatCard label="Paid to Riders" value={fmt(stats.riderCost)}    sub={`${stats.riderPayoutCount} payment${stats.riderPayoutCount !== 1 ? 's' : ''}`}  color="red"    icon={<Bike size={18} />}          />
                <StatCard label="Net Income"      value={fmt(stats.netIncome)}    sub="Revenue minus rider payments"                                                   color={stats.netIncome  >= 0 ? 'orange' : 'red'} icon={<IndianRupee size={18} />} />
                <StatCard label="Cash Position"  value={fmt(cashPosition)}       sub="After all outstanding payables"                                                 color={cashPosition >= 0 ? 'blue' : 'red'}       icon={<Wallet size={18} />}      />
                <StatCard label="Cash in Hand"   value={fmt(stats.cashInHand)}   sub={`${stats.codOrderCount} COD order${stats.codOrderCount !== 1 ? 's' : ''} · with riders`} color={stats.cashInHand > 0 ? 'purple' : 'slate'} icon={<Banknote size={18} />} />
            </div>

            {/* ── Revenue breakdown + Outstanding ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                        <TrendingUp size={16} className="text-emerald-500" />
                        <h3 className="font-bold text-slate-800">Revenue Breakdown</h3>
                        <span className="ml-auto text-xs text-slate-400">Period</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                        <RevenueRow label="Food Markup (Commission)"        description="Unit price charged to customer minus base price paid to restaurant"  amount={stats.markupRevenue}                   positive />
                        <RevenueRow label="Platform Fee (from Customer)"    description="Platform/service fee charged to customer on each order"           amount={stats.customerPlatformFeeRevenue}      positive />
                        <RevenueRow label="Platform Fee (from Restaurant)"  description="Per-order flat fee deducted from restaurant payables"              amount={stats.restaurantPlatformFeeRevenue}    positive />
                        <RevenueRow label="Transaction Charges"             description="% of order total charged to restaurants per their fee schedule"    amount={stats.transactionFeeRevenue}          positive />
                        <RevenueRow label="Delivery Fees Collected"         description="Delivery charges paid by customers"                               amount={stats.deliveryFeeRevenue}             positive />
                        <div className="px-6 py-4 flex items-center justify-between bg-slate-50">
                            <span className="font-bold text-slate-800">Total Revenue</span>
                            <span className="font-bold text-emerald-600 text-lg">{fmt(stats.totalRevenue)}</span>
                        </div>
                        <RevenueRow label="Paid to Riders" description="Actual payments made to riders in this period" amount={stats.riderCost} positive={false} />
                        <div className="px-6 py-4 flex items-center justify-between bg-orange-50">
                            <span className="font-bold text-slate-800">Net Income</span>
                            <span className={`font-bold text-lg ${stats.netIncome >= 0 ? 'text-orange-600' : 'text-red-600'}`}>{fmt(stats.netIncome)}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <TrendingDown size={16} className="text-slate-400" />
                            <h3 className="font-bold text-slate-800">Payouts Made</h3>
                            <span className="ml-auto text-xs text-slate-400">Period</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                            <PayoutRow label="To Restaurants" icon={<Store size={14} />} amount={stats.restaurantPayoutsMade} />
                            <PayoutRow label="To Riders"      icon={<Bike size={14} />}  amount={stats.riderPayoutsMade} />
                            <div className="px-6 py-3 flex items-center justify-between bg-slate-50">
                                <span className="font-bold text-slate-700 text-sm">Total Paid Out</span>
                                <span className="font-bold text-slate-800">{fmt(stats.restaurantPayoutsMade + stats.riderPayoutsMade)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <h3 className="font-bold text-slate-800">Outstanding Payables</h3>
                            <span className="ml-auto text-xs text-slate-400">Cumulative from 9 Apr 2026</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                            <PayoutRow label="Still owed to Restaurants" icon={<Store size={14} />} amount={stats.restaurantOutstanding} warn={stats.restaurantOutstanding > 0} />
                            <PayoutRow label="Still owed to Riders"      icon={<Bike size={14} />}  amount={stats.riderOutstanding}      warn={stats.riderOutstanding > 0} />
                            <div className="px-6 py-3 flex items-center justify-between bg-red-50">
                                <span className="font-bold text-red-700 text-sm">Total Outstanding</span>
                                <span className="font-bold text-red-600">{fmt(stats.restaurantOutstanding + stats.riderOutstanding)}</span>
                            </div>
                        </div>
                    </div>

                    <div className={`rounded-2xl border p-5 ${cashPosition >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Actual Cash Position</p>
                        <p className={`text-3xl font-bold ${cashPosition >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(cashPosition)}</p>
                        <p className="text-xs text-slate-400 mt-2">
                            Net income {fmt(stats.netIncome)} minus outstanding restaurant ({fmt(stats.restaurantOutstanding)}) and rider ({fmt(stats.riderOutstanding)}) payables
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Order breakdown toggle ────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div
                    className="px-6 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                    onClick={() => setShowBreakdown(v => !v)}
                >
                    <Table2 size={16} className="text-orange-500" />
                    <h3 className="font-bold text-slate-800">Order Breakdown</h3>
                    <span className="text-xs text-slate-400">{stats.orderCount} orders in period</span>
                    <div className="ml-auto flex items-center gap-2">
                        {showBreakdown && (
                            <button
                                onClick={e => { e.stopPropagation(); handleExportPDF(); }}
                                disabled={exportingPdf}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60 transition-all"
                            >
                                {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download size={13} />}
                                Download PDF
                            </button>
                        )}
                        {showBreakdown ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                </div>

                {showBreakdown && (
                    <>
                        <div className="overflow-x-auto">
                            {stats.periodOrderBreakdown.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                                    <Table2 size={28} className="mb-2 opacity-40" />
                                    <p className="text-sm">No orders in this period.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50 border-y border-slate-100">
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-10">#</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Order #</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Restaurant</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Order Total</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Markup</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Cust. Plat.</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Rest. Plat.</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Txn Fee</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Del. Fee</th>
                                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {stats.periodOrderBreakdown.map((o, idx) => (
                                            <tr key={o.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                                <td className="px-4 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                                                <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">#{o.order_number}</td>
                                                <td className="px-4 py-2.5 text-slate-700 max-w-[160px] truncate">{o.restaurantName}</td>
                                                <td className="px-4 py-2.5 text-right text-slate-600 font-medium">₹{o.orderTotal.toFixed(2)}</td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">₹{o.markup.toFixed(2)}</td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">
                                                    {o.customerPlatformFee > 0 ? `₹${o.customerPlatformFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">
                                                    {o.platformFee > 0 ? `₹${o.platformFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">
                                                    {o.transactionFee > 0 ? `₹${o.transactionFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">
                                                    {o.deliveryFee > 0 ? `₹${o.deliveryFee.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-slate-900">₹{o.totalRevenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-orange-50 border-t-2 border-orange-200 sticky bottom-0">
                                        <tr>
                                            <td colSpan={4} className="px-4 py-3 font-bold text-slate-700">Total</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-600">
                                                ₹{stats.periodOrderBreakdown.reduce((s, o) => s + o.orderTotal, 0).toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{stats.markupRevenue.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{stats.customerPlatformFeeRevenue.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{stats.restaurantPlatformFeeRevenue.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{stats.transactionFeeRevenue.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{stats.deliveryFeeRevenue.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-orange-600 text-base">₹{stats.totalRevenue.toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>

                        {/* Rider payments note */}
                        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>
                                <span className="font-semibold text-slate-600">Rider payments:</span> {fmt(stats.riderCost)} across {stats.riderPayoutCount} payment{stats.riderPayoutCount !== 1 ? 's' : ''} — lump-sum daily settlements, not per-order.
                            </span>
                            <span className="font-semibold text-slate-700">
                                Net Income = {fmt(stats.totalRevenue)} − {fmt(stats.riderCost)} = {fmt(stats.netIncome)}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
