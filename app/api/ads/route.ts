import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const supabase = createAdminClient();

export async function POST(req: NextRequest) {
    const { adPayload, editingId } = await req.json();
    const { error } = editingId
        ? await supabase.from('ads').update(adPayload).eq('id', editingId)
        : await supabase.from('ads').insert(adPayload);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const { id } = await req.json();
    const { error } = await supabase.from('ads').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
