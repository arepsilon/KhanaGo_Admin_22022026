'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trash2, Plus, Pencil, Tag, User, X } from 'lucide-react';

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
    const [firstOrderOnly, setFirstOrderOnly] = useState(false);

    // User assignment state
    const [assignedUser, setAssignedUser] = useState<{ id: string; full_name: string; phone: string } | null>(null);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        fetchCoupons();
        fetchCities();
    }, []);

    const fetchCities = async () => {
        const { data } = await supabase.from('cities').select('id, name').eq('is_active', true).order('name');
        if (data) setCities(data);
    };

    const fetchCoupons = async () => {
        const res = await fetch('/api/coupons');
        const data = await res.json();
        if (Array.isArray(data)) setCoupons(data);
        setLoading(false);
    };

    const searchUsers = async (query: string) => {
        if (!query.trim()) { setUserSearchResults([]); return; }
        setUserSearchLoading(true);
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, phone')
            .eq('role', 'customer')
            .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(8);
        setUserSearchResults(data || []);
        setUserSearchLoading(false);
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
        setFirstOrderOnly(coupon.first_order_only || false);
        setAssignedUser(coupon.user || null);
        setUserSearchQuery('');
        setUserSearchResults([]);
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
        setFirstOrderOnly(false);
        setAssignedUser(null);
        setUserSearchQuery('');
        setUserSearchResults([]);
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
                city_id: selectedCityId || null,
                user_id: assignedUser?.id || null,
                first_order_only: firstOrderOnly,
            };

            // If editing and code changed (not possible with PK, so we usually delete old or just block PK edit)
            // Here PK is code. So if editing, we actully just upsert. 
            // BUT if user changes code, strict upsert creates NEW.
            // For simplicity, we disable editing CODE if in edit mode.

            const res = await fetch('/api/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

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
        await fetch('/api/coupons', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        fetchCoupons();
    };

    const [selectedUserFilter, setSelectedUserFilter] = useState<'all' | 'public' | 'user'>('all');

    if (loading) return <div className="p-8">Loading...</div>;

    const filteredCoupons = (selectedCityFilter === 'all'
        ? coupons
        : coupons.filter(c => c.city_id === selectedCityFilter))
        .filter(c => selectedUserFilter === 'all'
            ? true
            : selectedUserFilter === 'user' ? !!c.user_id : !c.user_id);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <h2 className="text-xl font-bold">Coupons
                    <span className="ml-2 text-sm font-normal text-slate-500">({filteredCoupons.length})</span>
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                    <select
                        value={selectedUserFilter}
                        onChange={e => setSelectedUserFilter(e.target.value as any)}
                        className="bg-white border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                    >
                        <option value="all">All Types</option>
                        <option value="public">Public only</option>
                        <option value="user">User-specific only</option>
                    </select>
                    <select
                        value={selectedCityFilter}
                        onChange={e => setSelectedCityFilter(e.target.value)}
                        className="bg-white border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 max-w-[200px]"
                    >
                        <option value="all">All Cities</option>
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
                                {coupon.first_order_only && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                                        🎉 First Order
                                    </span>
                                )}
                                {coupon.user ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-800 flex items-center gap-1">
                                        <User size={10} /> {coupon.user.full_name || coupon.user.phone}
                                    </span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-800">
                                        Public
                                    </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coupon.city ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                                    {coupon.city ? coupon.city.name : 'All Cities'}
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

                            {/* User Assignment */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Assign to Specific User <span className="text-gray-400 font-normal">(optional — leave blank for public)</span>
                                </label>
                                {assignedUser ? (
                                    <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <User size={16} className="text-violet-600" />
                                            <span className="font-medium text-violet-900">{assignedUser.full_name || 'Unknown'}</span>
                                            <span className="text-violet-500 text-sm">{assignedUser.phone}</span>
                                        </div>
                                        <button onClick={() => { setAssignedUser(null); setUserSearchQuery(''); }} className="text-violet-400 hover:text-violet-700">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded-lg"
                                            placeholder="Search by name or phone..."
                                            value={userSearchQuery}
                                            onChange={e => {
                                                setUserSearchQuery(e.target.value);
                                                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                                                searchTimeout.current = setTimeout(() => searchUsers(e.target.value), 300);
                                            }}
                                        />
                                        {userSearchLoading && (
                                            <div className="absolute right-3 top-2.5 text-gray-400 text-xs">Searching...</div>
                                        )}
                                        {userSearchResults.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                                {userSearchResults.map(u => (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setAssignedUser(u);
                                                            setUserSearchQuery('');
                                                            setUserSearchResults([]);
                                                        }}
                                                        className="w-full text-left px-3 py-2 hover:bg-violet-50 flex items-center justify-between text-sm"
                                                    >
                                                        <span className="font-medium">{u.full_name || 'No name'}</span>
                                                        <span className="text-gray-400">{u.phone}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={e => setIsActive(e.target.checked)}
                                        className="w-5 h-5 rounded text-green-600"
                                    />
                                    <span className="text-gray-900 font-medium">Is Active</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={firstOrderOnly}
                                        onChange={e => setFirstOrderOnly(e.target.checked)}
                                        className="w-5 h-5 rounded text-violet-600"
                                    />
                                    <span className="text-gray-900 font-medium">First Order Only</span>
                                </label>
                            </div>
                            {firstOrderOnly && (
                                <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
                                    This coupon will only be visible to customers who have never placed an order. It will automatically disappear after their first order.
                                </p>
                            )}

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
