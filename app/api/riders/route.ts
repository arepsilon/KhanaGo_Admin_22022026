import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { full_name, phone, email, vehicle_type, vehicle_number, aadhar_number } = body;

        // Validate required fields
        if (!full_name || !phone) {
            return NextResponse.json(
                { error: 'Name and phone are required' },
                { status: 400 }
            );
        }

        // Create Supabase Admin client (uses service role key for admin operations)
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Create auth user with phone number
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            phone,
            email: email || undefined,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
                full_name,
                role: 'rider'
            }
        });

        if (authError) {
            console.error('Auth error:', authError);
            return NextResponse.json(
                { error: authError.message },
                { status: 400 }
            );
        }

        // Create profile entry
        const { data: profileData, error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert([{
                id: authData.user.id,
                full_name,
                phone,
                email: email || null,
                vehicle_type: vehicle_type || null,
                vehicle_number: vehicle_number || null,
                aadhar_number: aadhar_number || null,
                role: 'rider'
            }])
            .select()
            .single();

        if (profileError) {
            // If profile creation fails, try to delete the auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            console.error('Profile error:', profileError);
            return NextResponse.json(
                { error: profileError.message },
                { status: 400 }
            );
        }

        return NextResponse.json({ data: profileData }, { status: 201 });

    } catch (error: any) {
        console.error('Server error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
