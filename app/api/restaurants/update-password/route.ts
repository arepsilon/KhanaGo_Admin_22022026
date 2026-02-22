import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { restaurantId, newPassword } = body;

        if (!restaurantId || !newPassword) {
            return NextResponse.json({ error: 'Restaurant ID and New Password are required' }, { status: 400 });
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // 1. Fetch the user_id for this restaurant from restaurant_owners table
        const { data: ownerData, error: ownerError } = await supabaseAdmin
            .from('restaurant_owners')
            .select('user_id')
            .eq('restaurant_id', restaurantId)
            .single();

        if (ownerError || !ownerData) {
            console.error('Owner Fetch Error:', ownerError);
            return NextResponse.json({ error: 'Could not find owner for this restaurant' }, { status: 404 });
        }

        const userId = ownerData.user_id;

        // 2. Update the user's password directly using Admin API
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        );

        if (updateError) {
            console.error('Password Update Error:', updateError);
            return NextResponse.json({ error: 'Failed to update password: ' + updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error: any) {
        console.error('Server Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
