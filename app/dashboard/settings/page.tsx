import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsManager from '@/components/SettingsManager';

export default async function SettingsPage() {
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
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Settings</h1>
            <SettingsManager />
        </div>
    );
}
