import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const supabase = createAdminClient();

export async function GET() {
    const { data, error } = await supabase
        .from('coupons')
        .select('*, city:cities(id, name), user:profiles(id, full_name, phone)')
        .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
    const payload = await req.json();
    const { error } = await supabase.from('coupons').upsert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const { code } = await req.json();
    const { error } = await supabase.from('coupons').delete().eq('code', code);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
