import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AttendanceManager from '@/components/AttendanceManager';

export default async function AttendancePage() {
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

    if (profile?.role !== 'admin') {
        redirect('/dashboard');
    }

    return (
        <div className="max-w-7xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Rider Attendance</h1>
            <AttendanceManager />
        </div>
    );
}
