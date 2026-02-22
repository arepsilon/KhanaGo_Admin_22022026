import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { restaurantId } = await req.json();

        if (!restaurantId) {
            return NextResponse.json({ error: 'Restaurant ID is required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
              }
            }
        );

        // 1. Get all Order IDs for this restaurant to clean up order-related tables
        const { data: orders } = await supabase
            .from('orders')
            .select('id')
            .eq('restaurant_id', restaurantId);
        
        const orderIds = orders?.map(o => o.id) || [];

        if (orderIds.length > 0) {
            // Delete Order Dependencies
            await supabase.from('order_items').delete().in('order_id', orderIds);
            await supabase.from('order_assignments').delete().in('order_id', orderIds);
            await supabase.from('deliveries').delete().in('order_id', orderIds);
            await supabase.from('ratings').delete().in('order_id', orderIds); // Ratings often link to order
        }

        // 2. Delete Direct Dependencies
        const { error: ordersError } = await supabase.from('orders').delete().eq('restaurant_id', restaurantId);
        if (ordersError) throw new Error(`Orders Delete Error: ${ordersError.message}`);

        await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
        await supabase.from('coupons').delete().eq('restaurant_id', restaurantId);
        await supabase.from('payouts').delete().eq('restaurant_id', restaurantId);
        // Add other direct tables here if they exist (e.g. variants, addons)

        // 3. Delete Restaurant
        const { error: deleteError } = await supabase
            .from('restaurants')
            .delete()
            .eq('id', restaurantId);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({ success: true, message: 'Restaurant and related data deleted successfully' });

    } catch (error: any) {
        console.error('Delete Restaurant Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
