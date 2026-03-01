import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { riderId, amount, adminId } = body;

        if (!riderId || !amount || parseFloat(amount) <= 0) {
            return NextResponse.json({ error: 'Valid Rider ID and positive amount are required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase configuration');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabase
            .from('rider_cash_collections')
            .insert({
                rider_id: riderId,
                amount: parseFloat(amount),
                collected_by: adminId || null,
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, collection: data });
    } catch (error: any) {
        console.error('Collect cash error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
