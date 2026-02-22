import CouponsManager from '@/components/CouponsManager';

export default function CouponsPage() {
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
