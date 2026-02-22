import { ShoppingBag, DollarSign, Users, Store } from 'lucide-react';

export default function DashboardStats({ stats }: { stats: any }) {
    const cards = [
        {
            title: 'Delivered Orders',
            value: stats.totalOrders, // this is now deliveredOrdersResult
            bgColor: 'bg-white',
            textColor: 'text-slate-500',
            valueColor: 'text-slate-900',
            icon: ShoppingBag,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50',
        },
        {
            title: 'Pending Orders',
            value: stats.pendingOrders,
            bgColor: 'bg-white',
            textColor: 'text-slate-500',
            valueColor: 'text-orange-600',
            icon: ShoppingBag,
            iconColor: 'text-orange-600',
            iconBg: 'bg-orange-50',
        },
        {
            title: 'Total Revenue',
            value: `₹${stats.totalRevenue.toFixed(2)}`,
            bgColor: 'bg-white',
            textColor: 'text-slate-500',
            valueColor: 'text-emerald-600',
            icon: DollarSign,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50',
        },
        {
            title: 'Customers',
            value: stats.totalCustomers,
            bgColor: 'bg-white',
            textColor: 'text-slate-500',
            valueColor: 'text-slate-900',
            icon: Users,
            iconColor: 'text-violet-600',
            iconBg: 'bg-violet-50',
        },
        {
            title: 'Restaurants',
            value: stats.totalRestaurants,
            bgColor: 'bg-white',
            textColor: 'text-slate-500',
            valueColor: 'text-slate-900',
            icon: Store,
            iconColor: 'text-orange-600',
            iconBg: 'bg-orange-50',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
            {cards.map((card, index) => {
                const Icon = card.icon;
                return (
                    <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-lg ${card.iconBg}`}>
                                <Icon className={`w-6 h-6 ${card.iconColor}`} />
                            </div>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mb-1">{card.title}</p>
                        <p className={`text-2xl font-bold ${card.valueColor}`}>{card.value}</p>
                    </div>
                );
            })}
        </div>
    );
}
