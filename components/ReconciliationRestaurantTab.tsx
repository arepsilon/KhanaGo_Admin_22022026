'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Search, Loader2, CreditCard, ChevronDown, ChevronUp,
    History, CheckCircle2, FileText, Download, X, Trash2, Wallet
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
    orderItems: string;
    status: string;
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
    payment_mode: 'upi' | 'bank_transfer' | null;
    upi_id: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc_code: string | null;
    bank_name: string | null;
}

type PaymentDetailsForm = {
    restId: string;
    restName: string;
    payment_mode: 'upi' | 'bank_transfer';
    upi_id: string;
    bank_account_name: string;
    bank_account_number: string;
    bank_ifsc_code: string;
    bank_name: string;
};

// ─── Payment Details Modal ───────────────────────────────────────────────────

function PaymentDetailsModal({
    form,
    onChange,
    onClose,
    onSave,
    saving,
}: {
    form: PaymentDetailsForm;
    onChange: (f: PaymentDetailsForm) => void;
    onClose: () => void;
    onSave: () => void;
    saving: boolean;
}) {
    const isUpi = form.payment_mode === 'upi';

    const isValid = isUpi
        ? form.upi_id.trim().length > 0
        : form.bank_account_number.trim().length > 0
            && form.bank_ifsc_code.trim().length > 0
            && form.bank_account_name.trim().length > 0
            && form.bank_name.trim().length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Wallet size={18} className="text-orange-500" />
                            Payment Details
                        </h2>
                        <p className="text-sm text-slate-500 mt-0.5">{form.restName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Payment Mode *</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => onChange({ ...form, payment_mode: 'upi' })}
                                className={`px-4 py-3 rounded-lg text-sm font-bold border-2 transition-all ${
                                    isUpi
                                        ? 'bg-orange-50 border-orange-400 text-orange-700'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                            >
                                UPI
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange({ ...form, payment_mode: 'bank_transfer' })}
                                className={`px-4 py-3 rounded-lg text-sm font-bold border-2 transition-all ${
                                    !isUpi
                                        ? 'bg-orange-50 border-orange-400 text-orange-700'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                            >
                                Account Transfer
                            </button>
                        </div>
                    </div>

                    {isUpi ? (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">UPI ID *</label>
                            <input
                                type="text"
                                placeholder="e.g. owner@upi"
                                value={form.upi_id}
                                onChange={e => onChange({ ...form, upi_id: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                autoFocus
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Account Holder Name *</label>
                                <input
                                    type="text"
                                    value={form.bank_account_name}
                                    onChange={e => onChange({ ...form, bank_account_name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Bank Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. HDFC Bank"
                                    value={form.bank_name}
                                    onChange={e => onChange({ ...form, bank_name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Account Number *</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={form.bank_account_number}
                                    onChange={e => onChange({ ...form, bank_account_number: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">IFSC Code *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. HDFC0001234"
                                    value={form.bank_ifsc_code}
                                    onChange={e => onChange({ ...form, bank_ifsc_code: e.target.value.toUpperCase() })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono uppercase focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!isValid || saving}
                        className="px-5 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                        {saving
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                            : <><CheckCircle2 size={15} /> Save Details</>}
                    </button>
                </div>
            </div>
        </div>
    );
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

    const handleDownloadPDF = async () => {
        setExporting(true);
        try {
            // Load logo
            const logoImg = new window.Image();
            logoImg.src = '/khanago_logo.jpg';
            await new Promise<void>((res) => { logoImg.onload = () => res(); logoImg.onerror = () => res(); });

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const PW = pdf.internal.pageSize.getWidth();   // 297
            const PH = pdf.internal.pageSize.getHeight();  // 210
            const M  = 15; // margin
            let y = 0;

            // ── HEADER ──────────────────────────────────────────────────────────
            // Orange top accent bar
            pdf.setFillColor(234, 88, 12);
            pdf.rect(0, 0, PW, 2.5, 'F');

            // Header background
            pdf.setFillColor(248, 250, 252);
            pdf.rect(0, 2.5, PW, 42, 'F');

            // Logo
            try { pdf.addImage(logoImg, 'JPEG', M, 7, 28, 28); } catch (_) { /* silent */ }

            // Brand
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(15);
            pdf.setTextColor(234, 88, 12);
            pdf.text('KhanaGO', M + 32, 17);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.text('Payment Statement', M + 32, 24);

            // Right-side meta
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(13);
            pdf.setTextColor(15, 23, 42);
            pdf.text('Payment Breakdown', PW - M, 14, { align: 'right' });

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(71, 85, 105);
            pdf.text(restaurant.name, PW - M, 22, { align: 'right' });
            pdf.setFontSize(7.5);
            pdf.text(`Period: ${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`, PW - M, 29, { align: 'right' });
            pdf.text(`Generated: ${formatDate(new Date().toISOString())}`, PW - M, 35, { align: 'right' });

            // Header bottom divider
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.4);
            pdf.line(M, 44.5, PW - M, 44.5);

            y = 53;

            // ── SUMMARY CARDS ────────────────────────────────────────────────────
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.setTextColor(148, 163, 184);
            pdf.text('SUMMARY', M, y - 4);

            const cards = [
                { label: 'Orders in Period',  value: restaurant.periodOrders.length.toString(), r: 15,  g: 23,  b: 42  },
                { label: 'Total Base Amount', value: `Rs. ${totalBase.toFixed(2)}`,             r: 15,  g: 23,  b: 42  },
                { label: 'Total Deductions',  value: `-Rs. ${totalFee.toFixed(2)}`,             r: 220, g: 38,  b: 38  },
                { label: 'Net Payable',       value: `Rs. ${totalNet.toFixed(2)}`,              r: 22,  g: 163, b: 74  },
            ];
            const cardW = (PW - M * 2 - 6) / cards.length;
            cards.forEach((c, i) => {
                const cx = M + i * (cardW + 1.5);
                pdf.setFillColor(255, 255, 255);
                pdf.setDrawColor(226, 232, 240);
                pdf.setLineWidth(0.3);
                pdf.roundedRect(cx, y, cardW, 22, 1.5, 1.5, 'FD');
                // top accent stripe
                pdf.setFillColor(234, 88, 12);
                pdf.roundedRect(cx, y, cardW, 2, 1.5, 1.5, 'F');
                pdf.rect(cx, y + 0.8, cardW, 1.2, 'F'); // flatten bottom of top accent
                // label
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6.5);
                pdf.setTextColor(100, 116, 139);
                pdf.text(c.label, cx + cardW / 2, y + 9, { align: 'center' });
                // value
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9.5);
                pdf.setTextColor(c.r, c.g, c.b);
                pdf.text(c.value, cx + cardW / 2, y + 17, { align: 'center' });
            });
            y += 28;

            // Deduction breakdown note
            const deductionParts: string[] = [];
            if (restaurant.platform_fee_per_order > 0)
                deductionParts.push(`Platform fee: Rs.${restaurant.platform_fee_per_order.toFixed(2)}/order × ${restaurant.periodOrders.length} orders = Rs.${totalPlatFee.toFixed(2)}`);
            if (restaurant.transaction_charge_percent > 0)
                deductionParts.push(`Transaction charge: ${restaurant.transaction_charge_percent}% of order total = Rs.${totalTxnFee.toFixed(2)}`);
            if (deductionParts.length > 0) {
                pdf.setFillColor(255, 247, 237);
                pdf.setDrawColor(253, 186, 116);
                pdf.setLineWidth(0.3);
                pdf.roundedRect(M, y - 3, PW - M * 2, 9, 1.5, 1.5, 'FD');
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(154, 52, 18);
                pdf.text('Deductions:  ' + deductionParts.join('   |   '), M + 4, y + 2.5);
                y += 13;
            }

            // ── TABLE ────────────────────────────────────────────────────────────
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.setTextColor(148, 163, 184);
            pdf.text('ORDER BREAKDOWN', M, y);
            y += 5;

            const COL = { date: M + 4, order: M + 35, items: M + 87, base: M + 187, pFee: M + 213, net: M + 247 };

            const drawTableHeader = () => {
                pdf.setFillColor(241, 245, 249);
                pdf.rect(M, y - 4.5, PW - M * 2, 9, 'F');
                pdf.setFillColor(234, 88, 12);
                pdf.rect(M, y - 4.5, 2, 9, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.setTextColor(71, 85, 105);
                pdf.text('DATE',                COL.date,  y);
                pdf.text('ORDER #',             COL.order, y);
                pdf.text('ORDER ITEMS',         COL.items, y);
                pdf.text('BASE AMT',            COL.base,  y);
                pdf.text('PLAT. FEE DEDUCT.',   COL.pFee,  y);
                pdf.text('TOTAL PAYABLE',       COL.net,   y);
                y += 7;
            };

            drawTableHeader();

            const LINE_H = 4.5;
            const ROW_PAD = 3;

            restaurant.periodOrders.forEach((order, idx) => {
                const itemsText: string[] = pdf.splitTextToSize(order.orderItems, COL.base - COL.items - 5);
                const rowH = ROW_PAD * 2 + Math.max(1, itemsText.length) * LINE_H;

                if (y + rowH > PH - 16) { pdf.addPage(); y = 20; drawTableHeader(); }

                // Row bg
                if (idx % 2 === 0) {
                    pdf.setFillColor(250, 251, 252);
                    pdf.rect(M, y - ROW_PAD, PW - M * 2, rowH, 'F');
                }
                // Row bottom rule
                pdf.setDrawColor(241, 245, 249);
                pdf.setLineWidth(0.2);
                pdf.line(M, y - ROW_PAD + rowH, PW - M, y - ROW_PAD + rowH);

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                pdf.setTextColor(51, 65, 85);
                pdf.text(formatDate(order.created_at), COL.date, y);

                pdf.setTextColor(100, 116, 139);
                pdf.text(`#${order.order_number ?? '—'}`, COL.order, y);

                pdf.setTextColor(30, 41, 59);
                pdf.text(itemsText, COL.items, y, { lineHeightFactor: LINE_H / 2.8 });

                pdf.setTextColor(15, 23, 42);
                pdf.text(`Rs. ${order.baseTotal.toFixed(2)}`, COL.base, y);

                pdf.setTextColor(220, 38, 38);
                const totalDeduction = order.platformFee + order.transactionFee;
                pdf.text(totalDeduction > 0 ? `-Rs. ${totalDeduction.toFixed(2)}` : '—', COL.pFee, y);

                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(22, 163, 74);
                pdf.text(`Rs. ${order.netPayable.toFixed(2)}`, COL.net, y);

                y += rowH;
            });

            if (restaurant.periodOrders.length === 0) {
                pdf.setTextColor(148, 163, 184);
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(9);
                pdf.text('No orders in this period.', M, y);
                y += 8;
            }

            // Totals row
            y += 2;
            pdf.setFillColor(234, 88, 12);
            pdf.rect(M, y - 4, PW - M * 2, 10, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(255, 255, 255);
            pdf.text('TOTAL',                            COL.date, y + 1);
            pdf.text(`Rs. ${totalBase.toFixed(2)}`,     COL.base, y + 1);
            pdf.text(`-Rs. ${totalFee.toFixed(2)}`,     COL.pFee, y + 1);
            pdf.text(`Rs. ${totalNet.toFixed(2)}`,      COL.net,  y + 1);

            // ── PAGE FOOTERS ─────────────────────────────────────────────────────
            const pageCount = (pdf as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setDrawColor(226, 232, 240);
                pdf.setLineWidth(0.3);
                pdf.line(M, PH - 11, PW - M, PH - 11);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6.5);
                pdf.setTextColor(148, 163, 184);
                pdf.text('KhanaGO  •  Confidential Payment Statement', M, PH - 6.5);
                pdf.text('Payment terms effective from 9 Apr 2026', PW / 2, PH - 6.5, { align: 'center' });
                pdf.text(`Page ${i} of ${pageCount}`, PW - M, PH - 6.5, { align: 'right' });
            }

            pdf.save(`KhanaGO_Breakdown_${restaurant.name.replace(/\s+/g, '_')}_${dateRange.start}_to_${dateRange.end}.pdf`);
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
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-28">Date</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36">Order No.</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Order Items</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right w-32">Base Amount</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right w-40">Platform Fee Deduction</th>
                                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right w-32">Total Payable</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {restaurant.periodOrders.map((order, idx) => (
                                    <tr key={order.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                        <td className="px-4 py-5 text-slate-600 whitespace-nowrap align-top">{formatDate(order.created_at)}</td>
                                        <td className="px-4 py-5 font-mono font-semibold text-slate-800 align-top">
                                            #{order.order_number ?? '—'}
                                            {order.status === 'wastage' && (
                                                <div className="mt-1">
                                                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 rounded-sm">
                                                        WASTAGE
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-5 text-slate-600 text-xs max-w-xs align-top whitespace-normal break-words leading-relaxed">{order.orderItems}</td>
                                        <td className="px-4 py-5 text-right text-slate-700 align-top">₹{order.baseTotal.toFixed(2)}</td>
                                        <td className="px-4 py-5 text-right text-red-500 font-medium align-top">
                                            {(order.platformFee + order.transactionFee) > 0
                                                ? `-₹${(order.platformFee + order.transactionFee).toFixed(2)}`
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-5 text-right font-bold text-emerald-600 align-top">₹{order.netPayable.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-orange-50 border-t-2 border-orange-200">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 font-bold text-slate-700 text-sm">Total</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-800">₹{totalBase.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-500">-₹{totalFee.toFixed(2)}</td>
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
    const [paymentDetailsForm, setPaymentDetailsForm] = useState<PaymentDetailsForm | null>(null);
    const [savingPaymentDetails, setSavingPaymentDetails] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        fetchRestaurantLedger();
    }, [dateRange]);

    const fetchRestaurantLedger = async () => {
        setLoading(true);
        try {
            const { data: restsData, error: restErr } = await supabase
                .from('restaurants')
                .select('id, name, platform_fee_per_order, transaction_charge_percent, payment_mode, upi_id, bank_account_name, bank_account_number, bank_ifsc_code, bank_name');
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
                    status,
                    order_items(quantity, unit_price, base_price, menu_item:menu_items(name))
                `)
                .in('status', ['delivered', 'completed', 'wastage'])
                .gte('created_at', '2026-04-09T00:00:00.000Z')
                .limit(10000);
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
                        const orderItems = (o.order_items && o.order_items.length > 0)
                            ? o.order_items.map((item: any) => `${item.menu_item?.name ?? 'Item'} ×${item.quantity}`).join(', ')
                            : '—';
                        periodOrders.push({
                            id: o.id,
                            order_number: o.order_number,
                            created_at: o.created_at,
                            orderTotal,
                            baseTotal,
                            platformFee: pFee,
                            transactionFee,
                            netPayable: netEarnedForOrder,
                            orderItems,
                            status: o.status,
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
                    payment_mode: (restaurant as any).payment_mode ?? null,
                    upi_id: (restaurant as any).upi_id ?? null,
                    bank_account_name: (restaurant as any).bank_account_name ?? null,
                    bank_account_number: (restaurant as any).bank_account_number ?? null,
                    bank_ifsc_code: (restaurant as any).bank_ifsc_code ?? null,
                    bank_name: (restaurant as any).bank_name ?? null,
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

    const openPaymentDetailsForm = (r: RestaurantStat) => {
        setPaymentDetailsForm({
            restId: r.id,
            restName: r.name,
            payment_mode: r.payment_mode ?? 'upi',
            upi_id: r.upi_id ?? '',
            bank_account_name: r.bank_account_name ?? '',
            bank_account_number: r.bank_account_number ?? '',
            bank_ifsc_code: r.bank_ifsc_code ?? '',
            bank_name: r.bank_name ?? '',
        });
    };

    const handleSavePaymentDetails = async () => {
        if (!paymentDetailsForm) return;
        setSavingPaymentDetails(true);
        try {
            const payload = paymentDetailsForm.payment_mode === 'upi'
                ? {
                    payment_mode: 'upi',
                    upi_id: paymentDetailsForm.upi_id.trim(),
                    bank_account_name: null,
                    bank_account_number: null,
                    bank_ifsc_code: null,
                    bank_name: null,
                }
                : {
                    payment_mode: 'bank_transfer',
                    upi_id: null,
                    bank_account_name: paymentDetailsForm.bank_account_name.trim(),
                    bank_account_number: paymentDetailsForm.bank_account_number.trim(),
                    bank_ifsc_code: paymentDetailsForm.bank_ifsc_code.trim().toUpperCase(),
                    bank_name: paymentDetailsForm.bank_name.trim(),
                };

            const { error } = await supabase
                .from('restaurants')
                .update(payload)
                .eq('id', paymentDetailsForm.restId);
            if (error) throw error;

            setPaymentDetailsForm(null);
            await fetchRestaurantLedger();
        } catch (err: any) {
            console.error(err);
            alert('Error saving payment details: ' + err.message);
        } finally {
            setSavingPaymentDetails(false);
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

            {paymentDetailsForm && (
                <PaymentDetailsModal
                    form={paymentDetailsForm}
                    onChange={setPaymentDetailsForm}
                    onClose={() => setPaymentDetailsForm(null)}
                    onSave={handleSavePaymentDetails}
                    saving={savingPaymentDetails}
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
                                                    onClick={() => openPaymentDetailsForm(r)}
                                                    title={r.payment_mode ? `Payment via ${r.payment_mode === 'upi' ? 'UPI' : 'Bank Transfer'}` : 'No payment details set'}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                                        r.payment_mode
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                    }`}
                                                >
                                                    <Wallet size={14} />
                                                    {r.payment_mode ? 'Payment Details' : 'Add Payment Details'}
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
