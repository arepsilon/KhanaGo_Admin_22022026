import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CouponsManager from '@/components/CouponsManager';

export default async function CouponsPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const superAdmins = ['8003270534@khanago.admin', '9867109138@khanago.admin'];
    if (profile?.role !== 'admin' || !superAdmins.includes(user.email)) {
        redirect('/dashboard');
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Coupons</h1>
                <p className="text-slate-500">Manage discount codes and offers</p>
            </div>
            <CouponsManager />
        </div>
    );
}
