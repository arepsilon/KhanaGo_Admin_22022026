import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // 1. Cleanup Rider Live Status
        await supabase.from('rider_live_status').delete().eq('rider_id', userId);

        // 2. Cleanup Order Assignments (or could be 'cancelled' but delete is cleaner for forced removal)
        await supabase.from('order_assignments').delete().eq('rider_id', userId);

        // 3. Unassign current deliveries (preserve the order history, just remove rider)
        // If the order is ongoing, this might leave it in limbo, but deleting a rider during active delivery is edge case.
        // Better to set rider_id to null so it doesn't break FK.
        await supabase.from('deliveries').update({ rider_id: null }).eq('rider_id', userId);
        
        // 4. Delete profile (explicitly, though cascade might handle it)
        await supabase.from('profiles').delete().eq('id', userId);

        // 5. Delete user from Auth
        const { error } = await supabase.auth.admin.deleteUser(userId);

        if (error) {
            console.error('Error deleting user:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in delete-rider:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
