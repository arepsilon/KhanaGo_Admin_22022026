import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { riderId, startDate, endDate } = body;

        if (!riderId || !startDate || !endDate) {
            return NextResponse.json({ error: 'Rider ID, startDate, and endDate are required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase configuration');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const startIso = `${startDate}T00:00:00.000Z`;
        const endIso = `${endDate}T23:59:59.999Z`;

        // 1. Fetch deliveries
        const { data: deliveries, error: deliveriesError } = await supabase
            .from('deliveries')
            .select(`
                delivery_fee,
                orders (
                    created_at,
                    total,
                    payment_method,
                    restaurants (
                        name
                    ),
                    order_items (
                        quantity,
                        menu_items (
                            name
                        )
                    )
                )
            `)
            .eq('rider_id', riderId)
            .eq('status', 'completed')
            .gte('updated_at', startIso)
            .lte('updated_at', endIso)
            .order('updated_at', { ascending: true });

        if (deliveriesError) throw deliveriesError;

        // 2. Fetch cash collections in date range
        const { data: cashCollections, error: cashError } = await supabase
            .from('rider_cash_collections')
            .select('amount')
            .eq('rider_id', riderId)
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        if (cashError) throw cashError;

        // 3. Fetch payouts in date range
        const { data: payouts, error: payoutsError } = await supabase
            .from('rider_payouts')
            .select('amount')
            .eq('rider_id', riderId)
            .gte('created_at', startIso)
            .lte('created_at', endIso);

        if (payoutsError) throw payoutsError;

        // Prepare rows for Excel
        const excelRows: any[] = [];
        let grandTotalOrderValue = 0;
        let grandTotalDeliveryFee = 0;

        (deliveries || []).forEach((delivery: any) => {
            const order = delivery.orders;
            if (!order) return;

            const orderDate = new Date(order.created_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            const restaurantName = order.restaurants?.name || 'Unknown';
            const paymentMethod = order.payment_method === 'cash' ? 'Cash in Hand (COD)' : 'Online (Pending Balance)';
            const totalValue = Number(order.total || 0);
            const deliveryFee = Number(delivery.delivery_fee || 0);

            grandTotalOrderValue += totalValue;
            grandTotalDeliveryFee += deliveryFee;

            const itemsList = (order.order_items || []).map((item: any) => {
                const itemName = item.menu_items?.name || 'Unknown Item';
                return `${item.quantity}x ${itemName}`;
            }).join(' | ');

            excelRows.push({
                'Order Date': orderDate,
                'Restaurant Name': restaurantName,
                'Items': itemsList,
                'Total Order Value (₹)': totalValue,
                'Delivery Fee/Charge (₹)': deliveryFee,
                'Payment Method': paymentMethod
            });
        });

        const totalAlreadyCollected = (cashCollections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
        const totalAlreadyPaid = (payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Append empty spacer row
        excelRows.push({
            'Order Date': '',
            'Restaurant Name': '',
            'Items': '',
            'Total Order Value (₹)': '',
            'Delivery Fee/Charge (₹)': '',
            'Payment Method': ''
        });

        // Append Grand Totals
        excelRows.push({
            'Order Date': 'GRAND TOTALS',
            'Restaurant Name': '',
            'Items': '',
            'Total Order Value (₹)': grandTotalOrderValue,
            'Delivery Fee/Charge (₹)': grandTotalDeliveryFee,
            'Payment Method': ''
        });

        excelRows.push({
            'Order Date': 'Already Collected Cash',
            'Restaurant Name': '',
            'Items': '',
            'Total Order Value (₹)': '',
            'Delivery Fee/Charge (₹)': totalAlreadyCollected,
            'Payment Method': '(Deduct from admin)'
        });

        excelRows.push({
            'Order Date': 'Already Paid Payouts',
            'Restaurant Name': '',
            'Items': '',
            'Total Order Value (₹)': '',
            'Delivery Fee/Charge (₹)': totalAlreadyPaid,
            'Payment Method': '(Transferred to rider)'
        });

        // Generate Excel Workbook
        const worksheet = xlsx.utils.json_to_sheet(excelRows);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Rider Earnings');

        // Autofit columns (rough estimate based on header lengths)
        worksheet['!cols'] = [
            { wch: 22 }, // Order Date
            { wch: 25 }, // Restaurant Name
            { wch: 50 }, // Items
            { wch: 20 }, // Total Value
            { wch: 22 }, // Delivery Fee
            { wch: 25 }  // Payment Method
        ];

        // Write to buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="rider_earnings_${riderId}.xlsx"`,
            }
        });

    } catch (error: any) {
        console.error('Export Excel error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
