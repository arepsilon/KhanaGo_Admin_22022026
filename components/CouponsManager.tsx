'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trash2, Plus, Pencil, Tag } from 'lucide-react';

export default function CouponsManager() {
    const [coupons, setCoupons] = useState<any[]>([]);
    const [cities, setCities] = useState<any[]>([]);
    const [selectedCityFilter, setSelectedCityFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingCode, setEditingCode] = useState<string | null>(null);

    const supabase = createClient();

    // Form State
    const [couponCode, setCouponCode] = useState('');
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [maxDiscountValue, setMaxDiscountValue] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [selectedCityId, setSelectedCityId] = useState<string>('');

    useEffect(() => {
        fetchCoupons();
        fetchCities();
    }, []);

    const fetchCities = async () => {
        const { data } = await supabase.from('cities').select('id, name').eq('is_active', true).order('name');
        if (data) setCities(data);
    };

    const fetchCoupons = async () => {
        const { data, error } = await supabase
            .from('coupons')
            .select('*, city:cities(id, name)')
            .order('created_at', { ascending: false });
        if (!error && data) setCoupons(data);
        setLoading(false);
    };

    const handleEdit = (coupon: any) => {
        setEditingCode(coupon.code);
        setCouponCode(coupon.code);
        setDiscountType(coupon.discount_type);
        setDiscountValue(coupon.discount_value.toString());
        setMinOrderValue(coupon.min_order_value?.toString() || '');
        setMaxDiscountValue(coupon.max_discount_value?.toString() || '');
        setIsActive(coupon.is_active);
        setSelectedCityId(coupon.city_id || '');
        setIsModalOpen(true);
    };

    const resetForms = () => {
        setEditingCode(null);
        setCouponCode('');
        setDiscountType('percentage');
        setDiscountValue('');
        setMinOrderValue('');
        setMaxDiscountValue('');
        setIsActive(true);
        setSelectedCityId('');
        setIsModalOpen(false);
    };

    const handleSave = async () => {
        if (!couponCode || !discountValue) return alert('Code and Value required');
        setSubmitting(true);

        try {
            const payload = {
                code: couponCode.toUpperCase(),
                discount_type: discountType,
                discount_value: parseFloat(discountValue),
                min_order_value: minOrderValue ? parseFloat(minOrderValue) : 0,
                max_discount_value: maxDiscountValue ? parseFloat(maxDiscountValue) : null,
                is_active: isActive,
                city_id: selectedCityId || null
            };

            // If editing and code changed (not possible with PK, so we usually delete old or just block PK edit)
            // Here PK is code. So if editing, we actully just upsert. 
            // BUT if user changes code, strict upsert creates NEW.
            // For simplicity, we disable editing CODE if in edit mode.

            const { error } = await supabase.from('coupons').upsert(payload);
            if (error) throw error;

            alert('Coupon Saved!');
            resetForms();
            fetchCoupons();
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (code: string) => {
        if (!confirm('Delete this coupon?')) return;
        await supabase.from('coupons').delete().eq('code', code);
        fetchCoupons();
    };

    if (loading) return <div className="p-8">Loading...</div>;

    const filteredCoupons = selectedCityFilter === 'all'
        ? coupons
        : coupons.filter(c => c.city_id === selectedCityFilter);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Active Coupons</h2>
                <div className="flex items-center gap-4">
                    <select
                        value={selectedCityFilter}
                        onChange={e => setSelectedCityFilter(e.target.value)}
                        className="bg-white border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 max-w-[200px]"
                    >
                        <option value="all">Global / All Cities</option>
                        {cities.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => { resetForms(); setIsModalOpen(true); }}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium"
                    >
                        <Plus size={20} />
                        Create Coupon
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCoupons.map(coupon => (
                    <div key={coupon.code} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-green-50 text-green-700 font-mono font-bold px-3 py-1 rounded text-lg border-2 border-dashed border-green-200">
                                {coupon.code}
                            </div>
                            <div className={`px-2 py-0.5 rounded text-xs font-bold ${coupon.is_active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                {coupon.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-2xl font-bold text-gray-900">
                                {coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : `₹${coupon.discount_value} OFF`}
                            </div>
                            <div className="flex items-center gap-2 pt-1 border-t border-gray-50 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coupon.city ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                    {coupon.city ? coupon.city.name : 'Global'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-2">
                                Min Order: ₹{coupon.min_order_value}
                                {coupon.max_discount_value && ` • Max Disc: ₹${coupon.max_discount_value}`}
                            </div>
                        </div>

                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(coupon)} className="p-2 bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-orange-600 rounded-full">
                                <Pencil size={18} />
                            </button>
                            <button onClick={() => handleDelete(coupon.code)} className="p-2 bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-full">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6">
                        <h3 className="text-xl font-bold mb-6">{editingCode ? 'Edit Coupon' : 'New Coupon'}</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                                <input
                                    className="w-full p-2 border rounded-lg font-mono uppercase"
                                    value={couponCode}
                                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                                    disabled={!!editingCode} // Cannot rename code
                                    placeholder="SAVE50"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white"
                                        value={discountType}
                                        onChange={e => setDiscountType(e.target.value as any)}
                                    >
                                        <option value="percentage">Percentage</option>
                                        <option value="fixed">Fixed (₹)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg"
                                        value={discountValue}
                                        onChange={e => setDiscountValue(e.target.value)}
                                        placeholder="50"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Target City</label>
                                <select
                                    className="w-full p-2 border rounded-lg bg-white"
                                    value={selectedCityId}
                                    onChange={e => setSelectedCityId(e.target.value)}
                                >
                                    <option value="">Global (All Cities)</option>
                                    {cities.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Leave global to allow usage anywhere.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Order</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg"
                                        value={minOrderValue}
                                        onChange={e => setMinOrderValue(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg"
                                        value={maxDiscountValue}
                                        onChange={e => setMaxDiscountValue(e.target.value)}
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={e => setIsActive(e.target.checked)}
                                    className="w-5 h-5 rounded text-green-600"
                                />
                                <span className="text-gray-900 font-medium">Is Active</span>
                            </label>

                            <div className="flex gap-3 pt-4">
                                <button onClick={resetForms} className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button onClick={handleSave} disabled={submitting} className="flex-1 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">
                                    {submitting ? 'Saving...' : 'Save Coupon'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
