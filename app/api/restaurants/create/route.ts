import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            name,
            email,
            password,
            phone,
            address,
            image_url,
            delivery_fee,
            minimum_order,
            estimated_delivery_time,
            commission_percent,
            platform_fee_per_order,
            transaction_charge_percent,
            latitude,
            longitude,
            show_menu_images,
        } = body;

        // Validations
        if (!name || !email || !password || !phone || !address) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: name,
                role: 'restaurant',
            },
        });

        if (authError) {
            console.error('Auth Create Error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        const userId = authData.user.id;

        // 2. Create Profile Entry (if trigger doesn't exist, which it doesn't seem to fully cover role)
        // We'll upsert to be safe, ensuring role is 'restaurant'
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userId,
                email: email,
                full_name: name,
                role: 'restaurant',
                phone: phone,
                is_active: true,
            });

        if (profileError) {
            console.error('Profile Create Error:', profileError);
            // Cleanup auth user? For now, we return error
            return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
        }

        // 3. Create Restaurant Entry
        const { data: restaurantData, error: restaurantError } = await supabaseAdmin
            .from('restaurants')
            .insert({
                name,
                email, // Contact email for restaurant
                phone,
                address,
                image_url,
                delivery_fee: delivery_fee || 0,
                minimum_order: minimum_order || 0,
                estimated_delivery_time: estimated_delivery_time || 30,
                is_active: true,
                is_open: true,
                commission_percent: commission_percent || 15, // Custom fees
                platform_fee_per_order: platform_fee_per_order || 5,
                transaction_charge_percent: transaction_charge_percent || 2.5,
                latitude: latitude || null,
                longitude: longitude || null,
                show_menu_images: show_menu_images !== undefined ? show_menu_images : true
            })
            .select()
            .single();

        if (restaurantError) {
            console.error('Restaurant Create Error:', restaurantError);
            return NextResponse.json({ error: 'Failed to create restaurant entry' }, { status: 500 });
        }

        const restaurantId = restaurantData.id;

        // 4. Link User to Restaurant (Owner)
        const { error: ownerError } = await supabaseAdmin
            .from('restaurant_owners')
            .insert({
                user_id: userId,
                restaurant_id: restaurantId,
            });

        if (ownerError) {
            console.error('Owner Link Error:', ownerError);
            return NextResponse.json({ error: 'Failed to link owner' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Restaurant created successfully',
            restaurant: restaurantData,
            user_id: userId
        });

    } catch (error: any) {
        console.error('Server Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
