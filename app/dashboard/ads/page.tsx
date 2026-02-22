import Sidebar from '@/components/Sidebar';
import AdsManager from '@/components/AdsManager';

export default function AdsPage() {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">Promotions & Ads</h1>
                    <AdsManager />
                </div>
            </main>
        </div>
    );
}
