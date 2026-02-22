import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
);

function generateRiderId() {
    return `rider${Math.floor(100000 + Math.random() * 900000)}`;
}

function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export async function POST(request: NextRequest) {
    try {
        const { full_name, phone } = await request.json();

        if (!full_name) {
            return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
        }

        // Generate rider credentials
        const riderId = generateRiderId();
        const email = `${riderId}@rider.local`;
        const password = generatePassword();

        // Create Supabase auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (authError) {
            console.error('Auth error:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        // Create profile
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                full_name,
                email: email,
                phone: phone || null,
                role: 'rider',
            });

        if (profileError) {
            console.error('Profile error:', profileError);
            // Rollback auth user if profile creation fails
            await supabase.auth.admin.deleteUser(authData.user.id);
            return NextResponse.json({ error: profileError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            rider: {
                id: authData.user.id,
                riderId,
                email,
                password, // Return generated password only once
                full_name,
                phone,
            },
        });
    } catch (error: any) {
        console.error('Error creating rider:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
