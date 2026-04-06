'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Download, Share2, Building2, Loader2, Printer, Wallet } from 'lucide-react';
import jsPDF from 'jspdf';


type Restaurant = {
    id: string;
    name: string;
    phone?: string;
    platform_fee_per_order?: number;
    city_id?: string | null;
};

type OrderItem = {
    id: string;
    quantity: number;
    unit_price: number;
    base_price: number;
    menu_item: any;
    name?: string;
};
type Order = {
    id: string;
    order_number: string;
    created_at: string;
    subtotal: number;
    status: string;
    order_items: OrderItem[];
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
    const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<string>('all');
    const [reportGenerated, setReportGenerated] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [payingOut, setPayingOut] = useState(false);
    const [overallStats, setOverallStats] = useState<{
        totalPayable: number;
        totalPaid: number;
        balance: number;
    } | null>(null);
    const [drilldownData, setDrilldownData] = useState<any[]>([]);
    const [showDrilldown, setShowDrilldown] = useState(false);
    const [loadingStats, setLoadingStats] = useState(false);

    // Get restaurant details
    const restaurantDetails = restaurants.find(r => r.id === selectedRestaurant);

    useEffect(() => {
        loadCities();
        loadRestaurants();
        loadOverallStats();
        // Set default dates (current month)
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }, []);

    const loadCities = async () => {
        const { data } = await supabase.from('cities').select('id, name').eq('is_active', true).order('name');
        if (data) setCities(data);
    };

    const loadRestaurants = async () => {
        const { data } = await supabase
            .from('restaurants')
            .select('id, name, phone, platform_fee_per_order, city_id')
            .order('name');
        if (data) setRestaurants(data);
        setLoadingRestaurants(false);
    };

    const filteredRestaurants = selectedCityId === 'all' 
        ? restaurants 
        : restaurants.filter(r => r.city_id === selectedCityId);

    const loadOverallStats = async () => {
        setLoadingStats(true);
        try {
            // 1. Fetch all restaurants
            const { data: restaurantsData } = await supabase
                .from('restaurants')
                .select('id, name, platform_fee_per_order, city_id');

            if (!restaurantsData) return;

            // 2. Fetch all completed/delivered orders across all time
            // (In a production app, this would be an aggregate RPC or View)
            const { data: ordersData } = await supabase
                .from('orders')
                .select(`
                    restaurant_id, subtotal, 
                    order_items(quantity, unit_price, base_price)
                `)
                .in('status', ['delivered', 'completed']);

            // 3. Fetch all payouts
            const { data: payoutsData } = await supabase
                .from('restaurant_payouts')
                .select('restaurant_id, amount');

            // 4. Calculate per-restaurant stats
            const statsMap: Record<string, any> = {};
            restaurantsData.forEach(r => {
                statsMap[r.id] = {
                    id: r.id,
                    name: r.name,
                    payable: 0,
                    paid: 0,
                    balance: 0,
                    platform_fee_per_order: r.platform_fee_per_order ?? 0,
                    city_id: r.city_id
                };
            });

            // Aggregate Payable (Earnings)
            ordersData?.forEach((order: any) => {
                const rId = order.restaurant_id;
                if (!statsMap[rId]) return;

                const baseTotal = order.order_items?.reduce((sum: number, item: any) => {
                    const bp = item.base_price ?? item.unit_price;
                    return sum + bp * item.quantity;
                }, 0) ?? order.subtotal;

                const platformFee = statsMap[rId].platform_fee_per_order;
                statsMap[rId].payable += (baseTotal - platformFee);
            });

            // Aggregate Paid
            payoutsData?.forEach((p: any) => {
                const rId = p.restaurant_id;
                if (statsMap[rId]) {
                    statsMap[rId].paid += p.amount;
                }
            });

            // Compute Balances and Overall Totals
            let totalPayable = 0;
            let totalPaid = 0;
            const drilldown: any[] = [];

            Object.values(statsMap).forEach((s: any) => {
                s.balance = s.payable - s.paid;
                totalPayable += s.payable;
                totalPaid += s.paid;
                drilldown.push(s);
            });

            setOverallStats({
                totalPayable,
                totalPaid,
                balance: totalPayable - totalPaid
            });
            setDrilldownData(drilldown.sort((a, b) => b.balance - a.balance));

        } catch (error) {
            console.error('Error loading overall stats:', error);
        } finally {
            setLoadingStats(false);
        }
    };


    const generateReport = async (overrideRestaurantId?: string) => {
        const targetRestaurantId = overrideRestaurantId || selectedRestaurant;
        if (!targetRestaurantId || !startDate || !endDate) return;

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
            targetRestaurantId,
            inputStart: startDate,
            queryStartUTC: startUTC.toISOString(),
            inputEnd: endDate,
            queryEndUTC: endUTC.toISOString()
        });

        const { data, error } = await supabase
            .from('orders')
            .select(`
                id, order_number, created_at, subtotal, status,
                order_items(id, quantity, unit_price, base_price, menu_item:menu_items(name))
            `)
            .eq('restaurant_id', targetRestaurantId)
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
        // Base total = restaurant's actual menu prices (sum of base_price × qty)
        // Falls back to unit_price for pre-migration orders
        const baseTotal = order.order_items?.reduce((sum, item) => {
            const bp = item.base_price ?? item.unit_price;
            return sum + bp * item.quantity;
        }, 0) ?? (order.subtotal || 0);

        const platformFeeVal = restaurantDetails?.platform_fee_per_order ?? 0;

        const platformFee = platformFeeVal;

        // Restaurant receives base price minus the per-order platform fee
        const netPayable = baseTotal - platformFee;

        return { platformFee, netPayable, baseTotal };
    };

    const totals = orders.reduce((acc, order) => {
        const d = calculateOrderDeductions(order);
        return {
            baseRevenue: acc.baseRevenue + d.baseTotal,
            totalPlatformFee: acc.totalPlatformFee + d.platformFee,
            netPayable: acc.netPayable + d.netPayable,
        };
    }, { baseRevenue: 0, totalPlatformFee: 0, netPayable: 0 });

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
                { label: 'Total Base Value', value: `Rs. ${totals.baseRevenue.toFixed(2)}` },
                { label: 'Platform Fee Deduction', value: `-Rs. ${totals.totalPlatformFee.toFixed(2)}` },
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

            const effectivePlatformFee = restaurantDetails.platform_fee_per_order ?? 0;
            pdf.text(`Platform Fee (Rs. ${effectivePlatformFee}/order × ${orders.length} orders): -Rs. ${totals.totalPlatformFee.toFixed(2)}`, 15, yPos);
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
            pdf.text('Date', 55, yPos);
            pdf.text('Base Value', 105, yPos);
            pdf.text('Platform Fee', 145, yPos);
            pdf.text('Net', 178, yPos);
            yPos += 8;

            // Table rows
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');

            orders.forEach((order) => {
                if (yPos > 270) {
                    pdf.addPage();
                    yPos = 20;
                }

                const d = calculateOrderDeductions(order);

                pdf.text(`#${order.order_number}`, 17, yPos);
                pdf.text(formatDate(order.created_at), 55, yPos);
                pdf.text(`Rs. ${d.baseTotal.toFixed(2)}`, 105, yPos);
                pdf.setTextColor(220, 38, 38);
                pdf.text(`-Rs. ${d.platformFee.toFixed(2)}`, 145, yPos);
                pdf.setTextColor(22, 163, 74);
                pdf.text(`Rs. ${d.netPayable.toFixed(2)}`, 178, yPos);
                pdf.setTextColor(0, 0, 0);
                yPos += 6;
            });

            // Footer with totals
            yPos += 5;
            pdf.setFillColor(241, 245, 249);
            pdf.rect(15, yPos - 4, pageWidth - 30, 10, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.text('TOTAL', 17, yPos + 2);
            pdf.text(`Rs. ${totals.baseRevenue.toFixed(2)}`, 105, yPos + 2);
            pdf.setTextColor(220, 38, 38);
            pdf.text(`-Rs. ${totals.totalPlatformFee.toFixed(2)}`, 145, yPos + 2);
            pdf.setTextColor(22, 163, 74);
            pdf.text(`Rs. ${totals.netPayable.toFixed(2)}`, 178, yPos + 2);

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

    const handlePayNow = async () => {
        if (!restaurantDetails || orders.length === 0) return;
        if (!confirm(`Mark ₹${totals.netPayable.toFixed(2)} as paid to ${restaurantDetails.name}?`)) return;

        setPayingOut(true);
        try {
            const { error } = await supabase
                .from('restaurant_payouts')
                .insert({
                    restaurant_id: selectedRestaurant,
                    amount: totals.netPayable,
                    order_count: orders.length,
                    status: 'completed',
                    payout_date: new Date().toISOString()
                });

            if (error) throw error;
            alert(`Payout of ₹${totals.netPayable.toFixed(2)} recorded successfully for ${restaurantDetails.name}`);
        } catch (error: any) {
            console.error('Payout failed:', error);
            alert('Failed to record payout: ' + error.message);
        } finally {
            setPayingOut(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div 
                    onClick={() => setShowDrilldown(!showDrilldown)}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:border-orange-200 transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                            <Wallet className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Amount Earned (Payable)</p>
                            <h3 className="text-2xl font-bold text-slate-900">
                                {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : `₹${overallStats?.totalPayable?.toFixed(1) || '0.0'}`}
                            </h3>
                        </div>
                    </div>
                </div>

                <div 
                    onClick={() => setShowDrilldown(!showDrilldown)}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:border-green-200 transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                            <Download className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Amount Paid</p>
                            <h3 className="text-2xl font-bold text-slate-900">
                                {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : `₹${overallStats?.totalPaid?.toFixed(1) || '0.0'}`}
                            </h3>
                        </div>
                    </div>
                </div>

                <div 
                    onClick={() => setShowDrilldown(!showDrilldown)}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:border-blue-200 transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Pending Balance</p>
                            <h3 className="text-2xl font-bold text-slate-900">
                                {loadingStats ? <Loader2 className="w-5 h-5 animate-spin" /> : `₹${overallStats?.balance?.toFixed(1) || '0.0'}`}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drilldown Table */}
            {showDrilldown && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in slide-in-from-top duration-300">
                    <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-900">Restaurant-wise Drilldown</h3>
                        <button 
                            onClick={() => setShowDrilldown(false)}
                            className="text-slate-400 hover:text-slate-600 text-sm font-medium"
                        >
                            Close
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="text-left p-4 font-semibold text-slate-600">Restaurant</th>
                                    <th className="text-right p-4 font-semibold text-slate-600">Total Earned</th>
                                    <th className="text-right p-4 font-semibold text-slate-600">Total Paid</th>
                                    <th className="text-right p-4 font-semibold text-slate-600">Balance</th>
                                    <th className="text-center p-4 font-semibold text-slate-600">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drilldownData.map((s) => (
                                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 font-bold text-slate-900">{s.name}</td>
                                        <td className="p-4 text-right text-slate-600">₹{s.payable.toFixed(1)}</td>
                                        <td className="p-4 text-right text-green-600 font-medium">₹{s.paid.toFixed(1)}</td>
                                        <td className="p-4 text-right font-bold text-slate-800">₹{s.balance.toFixed(1)}</td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => {
                                                    setSelectedCityId('all');
                                                    setSelectedRestaurant(s.id);
                                                    setShowDrilldown(false);
                                                    // Immediately trigger report generation for the selected restaurant
                                                    generateReport(s.id);
                                                    // Scroll down to the report section
                                                    window.scrollTo({ top: 400, behavior: 'smooth' });
                                                }}
                                                className="text-orange-600 font-semibold hover:underline"
                                            >
                                                View Report
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Generate Payment Report</h2>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* City Selector */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">City</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedCityId}
                                onChange={(e) => {
                                    setSelectedCityId(e.target.value);
                                    setSelectedRestaurant(''); // Reset restaurant on city change
                                }}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            >
                                <option value="all">All Cities</option>
                                {cities.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

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
                                {filteredRestaurants.map(r => (
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
                            onClick={() => generateReport()}
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
                            <p className="text-sm text-slate-500">Total Base Value</p>
                            <p className="text-2xl font-bold text-slate-800">₹{totals.baseRevenue.toFixed(2)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-red-200 bg-red-50">
                            <p className="text-sm text-red-500">Platform Fee Deduction</p>
                            <p className="text-2xl font-bold text-red-500">-₹{totals.totalPlatformFee.toFixed(2)}</p>
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
                                    <th className="text-right p-3 font-semibold text-slate-600">Base Value</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Platform Fee</th>
                                    <th className="text-right p-3 font-semibold text-slate-600">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const d = calculateOrderDeductions(order);
                                    return (
                                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-800">#{order.order_number}</td>
                                            <td className="p-3 text-slate-600">{formatDate(order.created_at)}</td>
                                            <td className="p-3 text-slate-600">
                                                <ul className="text-xs space-y-0.5">
                                                    {order.order_items?.map((item) => {
                                                        const itemName = Array.isArray(item.menu_item)
                                                            ? item.menu_item?.[0]?.name
                                                            : item.menu_item?.name;
                                                        return (
                                                            <li key={item.id}>
                                                                {item.quantity}x {itemName || item.name || 'Unknown'}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </td>
                                            <td className="p-3 text-right font-medium text-slate-800">₹{d.baseTotal.toFixed(2)}</td>
                                            <td className="p-3 text-right text-red-500">-₹{d.platformFee.toFixed(2)}</td>
                                            <td className="p-3 text-right font-semibold text-green-600">₹{d.netPayable.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-100 font-semibold">
                                <tr>
                                    <td colSpan={3} className="p-3">Total</td>
                                    <td className="p-3 text-right">₹{totals.baseRevenue.toFixed(2)}</td>
                                    <td className="p-3 text-right text-red-500">-₹{totals.totalPlatformFee.toFixed(2)}</td>
                                    <td className="p-3 text-right text-green-600">₹{totals.netPayable.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
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
                        <button
                            onClick={handlePayNow}
                            disabled={payingOut || orders.length === 0}
                            className="flex-1 bg-orange-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {payingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                            {payingOut ? 'Processing...' : `Pay Now ₹${totals.netPayable.toFixed(2)}`}
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
