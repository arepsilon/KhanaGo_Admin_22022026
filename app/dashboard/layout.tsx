import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />
            <main className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
                {children}
            </main>
        </div>
    );
}
