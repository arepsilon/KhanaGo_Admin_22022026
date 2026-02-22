import GroceryManager from '@/components/GroceryManager';

export default function GroceryPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Grocery Inventory</h1>
                <p className="text-slate-500">Manage KhanaGo Fresh products and prices</p>
            </div>
            <GroceryManager />
        </div>
    );
}
