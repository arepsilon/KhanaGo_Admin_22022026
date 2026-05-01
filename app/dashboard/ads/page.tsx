import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdsManager from '@/components/AdsManager';

export default async function AdsPage() {
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
        <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Promotions & Ads</h1>
            <AdsManager />
        </div>
    );
}
