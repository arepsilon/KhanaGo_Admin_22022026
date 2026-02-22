'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Download, Share2, Building2, Loader2, Printer } from 'lucide-react';
import jsPDF from 'jspdf';


type Restaurant = {
    id: string;
    name: string;
    commission_percent: number;
    phone?: string;
    platform_fee_per_order?: number;
    transaction_charge_percent?: number;
};

type OrderItem = {
    id: string;
    quantity: number;
    unit_price: number;
    menu_item: { name: string }[];
};

type Order = {
    id: string;
    order_number: string;
    created_at: string;
    subtotal: number;
    status: string;
    order_items: OrderItem[];
};

type FeeSettings = {
    platform_fee: number;
    transaction_fee_percent: number;
};

export default function PaymentReports() {
    const supabase = createClient();

    // State
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingRestaurants, setLoadingRestaurants] = useState(true);
    const [feeSettings, setFeeSettings] = useState<FeeSettings>({ platform_fee: 5, transaction_fee_percent: 2 });
    const [reportGenerated, setReportGenerated] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    // Get restaurant details
    const restaurantDetails = restaurants.find(r => r.id === selectedRestaurant);

    useEffect(() => {
        loadRestaurants();
        loadFeeSettings();
        // Set default dates (current month)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }, []);

    const loadRestaurants = async () => {
        const { data } = await supabase
            .from('restaurants')
            .select('id, name, commission_percent, phone, platform_fee_per_order, transaction_charge_percent')
            .order('name');
        if (data) setRestaurants(data);
        setLoadingRestaurants(false);
    };

    const loadFeeSettings = async () => {
        const { data } = await supabase
            .from('fee_settings')
            .select('*')
            .single();
        if (data) {
            setFeeSettings({
                platform_fee: data.platform_fee || 5,
                transaction_fee_percent: data.transaction_fee_percent || 2
            });
        }
    };

    const generateReport = async () => {
        if (!selectedRestaurant || !startDate || !endDate) return;

        setLoading(true);
        setReportGenerated(false);

        // Convert selected dates (Input is YYYY-MM-DD) to IST Range -> UTC
        // IST is UTC+5:30

        // 1. Create base UTC dates for the selected days (00:00 UTC)
        const startBase = new Date(`${startDate}T00:00:00.000Z`);
        const endBase = new Date(`${endDate}T23:59:59.999Z`);

        // 2. Subtract 5.5 hours (19800000 ms) to shift "00:00 IST" to "18:30 Prev Day UTC"
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

        const startUTC = new Date(startBase.getTime() - IST_OFFSET_MS);
        const endUTC = new Date(endBase.getTime() - IST_OFFSET_MS);

        console.log('Generating Report (IST Enforced):', {
            selectedRestaurant,
            inputStart: startDate,
            queryStartUTC: startUTC.toISOString(),
            inputEnd: endDate,
            queryEndUTC: endUTC.toISOString()
        });

        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, order_number, created_at, subtotal, status,
                order_items(id, quantity, unit_price, menu_item:menu_items(name))
            `)
            .eq('restaurant_id', selectedRestaurant)
            .in('status', ['delivered', 'completed'])
            .gte('created_at', startUTC.toISOString())
            .lte('created_at', endUTC.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching payment report:', error);
            alert('Failed to generate report: ' + error.message);
        } else if (data) {
            setOrders(data);
            setReportGenerated(true);
        }
        setLoading(false);
    };

    // Calculations
    const calculateOrderDeductions = (order: Order) => {
        const subtotal = order.subtotal || 0;

        // Prioritize Restaurant Specific settings, fallback to Global
        // Ensure we check for null/undefined specifically as 0 is a valid value
        const commissionPercent = restaurantDetails?.commission_percent ?? 0;

        const platformFeeVal = (restaurantDetails?.platform_fee_per_order !== null && restaurantDetails?.platform_fee_per_order !== undefined)
            ? restaurantDetails.platform_fee_per_order
            : feeSettings.platform_fee;

        const txFeePercent = (restaurantDetails?.transaction_charge_percent !== null && restaurantDetails?.transaction_charge_percent !== undefined)
            ? restaurantDetails.transaction_charge_percent
            : feeSettings.transaction_fee_percent;

        const commission = subtotal * (commissionPercent / 100);
        const platformFee = platformFeeVal;
        const transactionFee = subtotal * (txFeePercent / 100);

        const totalDeductions = commission + platformFee + transactionFee;
        const netPayable = subtotal - totalDeductions;

        return { commission, platformFee, transactionFee, totalDeductions, netPayable };
    };

    const totals = orders.reduce((acc, order) => {
        const deductions = calculateOrderDeductions(order);
        return {
            grossRevenue: acc.grossRevenue + order.subtotal,
            totalCommission: acc.totalCommission + deductions.commission,
            totalPlatformFee: acc.totalPlatformFee + deductions.platformFee,
            totalTransactionFee: acc.totalTransactionFee + deductions.transactionFee,
            totalDeductions: acc.totalDeductions + deductions.totalDeductions,
            netPayable: acc.netPayable + deductions.netPayable,
        };
    }, { grossRevenue: 0, totalCommission: 0, totalPlatformFee: 0, totalTransactionFee: 0, totalDeductions: 0, netPayable: 0 });

    const handlePrint = () => {
        window.print();
    };

    const handleShareWhatsApp = async () => {
        if (!restaurantDetails) return;

        setIsSharing(true);

        try {
            // Generate PDF using jsPDF directly (text-based, no html2canvas)
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            let yPos = 20;

            // Header
            pdf.setFillColor(234, 88, 12); // Orange
            pdf.rect(0, 0, pageWidth, 35, 'F');

            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(20);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Payment Report', 15, 18);

            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'normal');
            pdf.text(restaurantDetails.name, 15, 28);

            pdf.setFontSize(10);
            pdf.text(`Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, pageWidth - 15, 18, { align: 'right' });

            yPos = 50;

            // Summary Section
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Summary', 15, yPos);
            yPos += 10;

            // Summary boxes
            const summaryData = [
                { label: 'Total Orders', value: orders.length.toString() },
                { label: 'Gross Revenue', value: `Rs. ${totals.grossRevenue.toFixed(2)}` },
                { label: 'Total Deductions', value: `-Rs. ${totals.totalDeductions.toFixed(2)}` },
                { label: 'Net Payable', value: `Rs. ${totals.netPayable.toFixed(2)}` },
            ];

            pdf.setFontSize(10);
            summaryData.forEach((item, idx) => {
                const xPos = 15 + (idx * 45);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(100, 100, 100);
                pdf.text(item.label, xPos, yPos);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(0, 0, 0);
                pdf.text(item.value, xPos, yPos + 6);
            });

            yPos += 20;

            // Deduction Breakdown
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Deduction Breakdown', 15, yPos);
            yPos += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');

            const effectivePlatformFee = restaurantDetails.platform_fee_per_order ?? feeSettings.platform_fee;
            const effectiveTxPercent = restaurantDetails.transaction_charge_percent ?? feeSettings.transaction_fee_percent;

            pdf.text(`Commission (${restaurantDetails.commission_percent}%): -Rs. ${totals.totalCommission.toFixed(2)}`, 15, yPos);
            yPos += 6;
            pdf.text(`Platform Fee (Rs. ${effectivePlatformFee}/order): -Rs. ${totals.totalPlatformFee.toFixed(2)}`, 15, yPos);
            yPos += 6;
            pdf.text(`Transaction Fee (${effectiveTxPercent}%): -Rs. ${totals.totalTransactionFee.toFixed(2)}`, 15, yPos);
            yPos += 15;

            // Orders Table Header
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Order Details', 15, yPos);
            yPos += 8;

            // Table header
            pdf.setFillColor(241, 245, 249);
            pdf.rect(15, yPos - 4, pageWidth - 30, 8, 'F');

            pdf.setFontSize(9);
            pdf.setTextColor(71, 85, 105);
            pdf.text('Order #', 17, yPos);
            pdf.text('Date', 45, yPos);
            pdf.text('Subtotal', 85, yPos);
            pdf.text('Commission', 115, yPos);
            pdf.text('Fees', 145, yPos);
            pdf.text('Net', 175, yPos);
            yPos += 8;

            // Table rows
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');

            orders.forEach((order) => {
                if (yPos > 270) {
                    pdf.addPage();
                    yPos = 20;
                }

                const deductions = calculateOrderDeductions(order);

                pdf.text(`#${order.order_number}`, 17, yPos);
                pdf.text(formatDate(order.created_at), 45, yPos);
                pdf.text(`Rs. ${order.subtotal.toFixed(2)}`, 85, yPos);
                pdf.setTextColor(220, 38, 38);
                pdf.text(`-Rs. ${deductions.commission.toFixed(2)}`, 115, yPos);
                pdf.text(`-Rs. ${(deductions.platformFee + deductions.transactionFee).toFixed(2)}`, 145, yPos);
                pdf.setTextColor(22, 163, 74);
                pdf.text(`Rs. ${deductions.netPayable.toFixed(2)}`, 175, yPos);
                pdf.setTextColor(0, 0, 0);
                yPos += 6;
            });

            // Footer with totals
            yPos += 5;
            pdf.setFillColor(241, 245, 249);
            pdf.rect(15, yPos - 4, pageWidth - 30, 10, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.text('TOTAL', 17, yPos + 2);
            pdf.text(`Rs. ${totals.grossRevenue.toFixed(2)}`, 85, yPos + 2);
            pdf.setTextColor(220, 38, 38);
            pdf.text(`-Rs. ${totals.totalCommission.toFixed(2)}`, 115, yPos + 2);
            pdf.text(`-Rs. ${(totals.totalPlatformFee + totals.totalTransactionFee).toFixed(2)}`, 145, yPos + 2);
            pdf.setTextColor(22, 163, 74);
            pdf.text(`Rs. ${totals.netPayable.toFixed(2)}`, 175, yPos + 2);

            // Generate filename and save
            const filename = `Payment_Report_${restaurantDetails.name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.pdf`;
            pdf.save(filename);

            // After a short delay, open WhatsApp with a message
            setTimeout(() => {
                const message = `*Payment Report - ${restaurantDetails.name}*
        
📅 Period: ${formatDate(startDate)} to ${formatDate(endDate)}
📦 Total Orders: ${orders.length}

💰 *Summary*
Net Payable: ₹${totals.netPayable.toFixed(2)}

📎 Please find the detailed PDF report attached above.
Please confirm receipt of this report.`;

                const phone = restaurantDetails.phone?.replace(/\D/g, '') || '';
                const waLink = `https://wa.me/${phone ? '91' + phone : ''}?text=${encodeURIComponent(message)}`;
                window.open(waLink, '_blank');
            }, 500);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    const formatDate = (dateStr: string) => {
        // Enforce IST Display
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        });
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Generate Payment Report</h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Restaurant Selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Restaurant</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedRestaurant}
                                onChange={(e) => setSelectedRestaurant(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                disabled={loadingRestaurants}
                            >
                                <option value="">Select Restaurant</option>
                                {restaurants.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Start Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Start Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            />
                        </div>
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">End Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            />
                        </div>
                    </div>

                    {/* Generate Button */}
                    <div className="flex items-end">
                        <button
                            onClick={generateReport}
                            disabled={!selectedRestaurant || loading}
                            className="w-full bg-orange-500 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Generate Report
                        </button>
                    </div>
                </div>
            </div>

            {/* Report Preview (Printable Area) */}
            {reportGenerated && (
                <div id="print-area" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Report Header */}
                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 print:bg-orange-500">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold">Payment Report</h1>
                                <p className="text-orange-100 mt-1">{restaurantDetails?.name}</p>
                            </div>
                            <div className="text-right text-sm">
                                <p className="font-semibold">Period</p>
                                <p className="text-orange-100">{formatDate(startDate)} - {formatDate(endDate)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-50 print:bg-white">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                            <p className="text-sm text-slate-500">Total Orders</p>
                            <p className="text-2xl font-bold text-slate-800">{orders.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                            <p className="text-sm text-slate-500">Gross Revenue</p>
                            <p className="text-2xl font-bold text-slate-800">₹{totals.grossRevenue.toFixed(2)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                            <p className="text-sm text-slate-500">Total Deductions</p>
                            <p className="text-2xl font-bold text-red-500">-₹{totals.totalDeductions.toFixed(2)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-green-200 bg-green-50">
                            <p className="text-sm text-green-600">Net Payable</p>
                            <p className="text-2xl font-bold text-green-600">₹{totals.netPayable.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Orders Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="text-left p-3 font-semibold text-slate-600">Order #</th>
                                    <th className="text-left p-3 font-semibold text-slate-600">Date</th>
                                    <th className="text-left p-3 font-semibold text-slate-600">Items</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Subtotal</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Commission</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Fees</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const deductions = calculateOrderDeductions(order);
                                    return (
                                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-800">#{order.order_number}</td>
                                            <td className="p-3 text-slate-600">{formatDate(order.created_at)}</td>
                                            <td className="p-3 text-slate-600">
                                                <ul className="text-xs space-y-0.5">
                                                    {order.order_items?.map((item) => (
                                                        <li key={item.id}>
                                                            {item.quantity}x {item.menu_item?.[0]?.name}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </td>
                                            <td className="p-3 text-right font-medium">₹{order.subtotal.toFixed(2)}</td>
                                            <td className="p-3 text-right text-red-500">-₹{deductions.commission.toFixed(2)}</td>
                                            <td className="p-3 text-right text-red-500">-₹{(deductions.platformFee + deductions.transactionFee).toFixed(2)}</td>
                                            <td className="p-3 text-right font-semibold text-green-600">₹{deductions.netPayable.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-100 font-semibold">
                                <tr>
                                    <td colSpan={3} className="p-3">Total</td>
                                    <td className="p-3 text-right">₹{totals.grossRevenue.toFixed(2)}</td>
                                    <td className="p-3 text-right text-red-500">-₹{totals.totalCommission.toFixed(2)}</td>
                                    <td className="p-3 text-right text-red-500">-₹{(totals.totalPlatformFee + totals.totalTransactionFee).toFixed(2)}</td>
                                    <td className="p-3 text-right text-green-600">₹{totals.netPayable.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Deduction Breakdown */}
                    <div className="p-6 bg-slate-50 border-t border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-3">Deduction Breakdown</h3>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Commission ({restaurantDetails?.commission_percent}%)</span>
                                <span className="font-medium text-red-500">-₹{totals.totalCommission.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                {(() => {
                                    const effectivePlatformFee = (restaurantDetails?.platform_fee_per_order !== null && restaurantDetails?.platform_fee_per_order !== undefined)
                                        ? restaurantDetails.platform_fee_per_order
                                        : feeSettings.platform_fee;
                                    return (
                                        <>
                                            <span className="text-slate-500">Platform Fee (₹{effectivePlatformFee}/order)</span>
                                            <span className="font-medium text-red-500">-₹{totals.totalPlatformFee.toFixed(2)}</span>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="flex justify-between">
                                {(() => {
                                    const effectiveTxPercent = (restaurantDetails?.transaction_charge_percent !== null && restaurantDetails?.transaction_charge_percent !== undefined)
                                        ? restaurantDetails.transaction_charge_percent
                                        : feeSettings.transaction_fee_percent;
                                    return (
                                        <>
                                            <span className="text-slate-500">Transaction Fee ({effectiveTxPercent}%)</span>
                                            <span className="font-medium text-red-500">-₹{totals.totalTransactionFee.toFixed(2)}</span>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons (Hidden in Print) */}
                    <div className="p-6 flex gap-4 print:hidden print-hidden-buttons">
                        <button
                            onClick={handlePrint}
                            className="flex-1 bg-slate-800 text-white py-3 px-4 rounded-lg font-semibold hover:bg-slate-900 flex items-center justify-center gap-2"
                        >
                            <Printer className="w-4 h-4" />
                            Print / Save PDF
                        </button>
                        <button
                            onClick={handleShareWhatsApp}
                            disabled={isSharing}
                            className="flex-1 bg-green-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-600 disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                            {isSharing ? 'Generating PDF...' : 'Share PDF on WhatsApp'}
                        </button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {reportGenerated && orders.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Download className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No Orders Found</h3>
                    <p className="text-slate-500">No delivered orders found for this restaurant in the selected date range.</p>
                </div>
            )}

            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #print-area, #print-area * {
                        visibility: visible;
                    }
                    #print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
