'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trash2, Image as ImageIcon, Plus, Pencil, Tag } from 'lucide-react';

export default function AdsManager() {
    const [ads, setAds] = useState<any[]>([]);
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [coupons, setCoupons] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [cities, setCities] = useState<any[]>([]);
    const [selectedCityFilter, setSelectedCityFilter] = useState('all');

    const supabase = createClient();

    // Form State
    const [adTitle, setAdTitle] = useState('');
    const [adCategory, setAdCategory] = useState<'restaurant' | 'grocery'>('restaurant');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [selectedRestaurant, setSelectedRestaurant] = useState('');
    const [linkTarget, setLinkTarget] = useState('');
    const [selectedCityId, setSelectedCityId] = useState<string>('');

    // Coupon attachment — pick from existing coupons
    const [selectedCouponCode, setSelectedCouponCode] = useState<string>('');

    useEffect(() => {
        fetchAds();
        fetchRestaurants();
        fetchCities();
        fetchCoupons();
    }, []);

    const fetchCities = async () => {
        const { data } = await supabase.from('cities').select('id, name').eq('is_active', true).order('name');
        if (data) setCities(data);
    };

    const fetchRestaurants = async () => {
        const { data, error } = await supabase.from('restaurants').select('id, name');
        if (!error && data) setRestaurants(data);
    };

    const fetchCoupons = async () => {
        const res = await fetch('/api/coupons');
        const data = await res.json();
        if (Array.isArray(data)) setCoupons(data.filter((c: any) => c.is_active));
    };

    const fetchAds = async () => {
        // Fetch ads joined with coupon details (if any) and city details
        const { data, error } = await supabase
            .from('ads')
            .select('*, city:cities(id, name), coupon_code, coupons(*)')
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        setAds(data || []);
        setLoading(false);
    };

    const handleEditAd = (ad: any) => {
        setAdTitle(ad.title);
        setAdCategory(ad.category || 'restaurant');
        setEditingId(ad.id);
        setImageFile(null);
        setSelectedRestaurant(ad.restaurant_id || '');
        setLinkTarget(ad.link_target || '');
        setSelectedCityId(ad.city_id || '');

        // Pre-fill coupon data if exists
        setSelectedCouponCode(ad.coupon_code || '');

        setIsModalOpen(true);
    };

    const resetForms = () => {
        setAdTitle('');
        setAdCategory('restaurant');
        setSelectedRestaurant('');
        setLinkTarget('');
        setImageFile(null);
        setEditingId(null);
        setSelectedCityId('');
        setSelectedCouponCode('');
        setIsModalOpen(false);
    };

    const handleSave = async () => {
        if (!adTitle) return alert('Title is required');
        if (!editingId && !imageFile) return alert('Image is required');
        setSubmitting(true);

        try {
            // 1. Upload image if provided
            let imageUrl = editingId ? ads.find(a => a.id === editingId)?.image_url : null;
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const filePath = `ads/${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('ads').upload(filePath, imageFile);
                if (uploadError) throw uploadError;
                imageUrl = supabase.storage.from('ads').getPublicUrl(filePath).data.publicUrl;
            }

            // 2. Save ad via API (service role bypasses RLS)
            const adPayload = {
                title: adTitle,
                category: adCategory,
                image_url: imageUrl,
                restaurant_id: adCategory === 'restaurant' ? (selectedRestaurant || null) : null,
                link_target: adCategory === 'grocery' ? (linkTarget || null) : null,
                coupon_code: selectedCouponCode || null,
                city_id: selectedCityId || null,
            };

            const res = await fetch('/api/ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adPayload, editingId }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

            alert(editingId ? 'Promotion Updated!' : 'Promotion Created!');
            resetForms();
            fetchAds();
        } catch (error: any) {
            alert('Error saving promotion: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteAd = async (id: string) => {
        if (!confirm('Delete this promotion?')) return;
        const res = await fetch('/api/ads', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        if (res.ok) fetchAds();
        else alert('Failed to delete promotion');
    };

    const filteredAds = selectedCityFilter === 'all'
        ? ads
        : ads.filter(ad => ad.city_id === selectedCityFilter);

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Promotions...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Active Promotions</h2>
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
                        className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium"
                    >
                        <Plus size={20} />
                        New Promo
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAds.map(ad => (
                    <div key={ad.id} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 group">
                        <div className="h-48 relative">
                            <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    onClick={() => handleEditAd(ad)}
                                    className="bg-white/20 hover:bg-orange-500 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                                >
                                    <Pencil size={24} />
                                </button>
                                <button
                                    onClick={() => deleteAd(ad.id)}
                                    className="bg-white/20 hover:bg-red-500 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                                >
                                    <Trash2 size={24} />
                                </button>
                            </div>
                            {ad.coupon_code && (
                                <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                                    {ad.coupon_code}
                                </div>
                            )}
                            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm uppercase tracking-wider">
                                {ad.category || 'Restaurant'}
                            </div>
                        </div>
                        <div className="p-4">
                            <h3 className="font-bold text-gray-800">{ad.title}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ad.city ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {ad.city ? ad.city.name : 'Global / All Cities'}
                                </span>
                            </div>
                            {ad.coupons && (
                                <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                                    <Tag size={16} />
                                    <span className="font-medium">
                                        {ad.coupons.discount_type === 'percentage'
                                            ? `${ad.coupons.discount_value}% OFF`
                                            : `₹${ad.coupons.discount_value} OFF`}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Combined Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4">{editingId ? 'Edit Promotion' : 'New Promotion'}</h3>

                        <div className="space-y-6">
                            {/* Ad Section */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                    <input
                                        className="w-full p-2 border rounded-lg"
                                        value={adTitle}
                                        onChange={e => setAdTitle(e.target.value)}
                                        placeholder="e.g., Summer Sale"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Section</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white"
                                        value={adCategory}
                                        onChange={e => setAdCategory(e.target.value as 'restaurant' | 'grocery')}
                                    >
                                        <option value="restaurant">Restaurant App (Food Delivery)</option>
                                        <option value="grocery">Grocery Section (KhanaGo Fresh)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Link to Restaurant (Optional)</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white"
                                        value={selectedRestaurant}
                                        onChange={e => setSelectedRestaurant(e.target.value)}
                                    >
                                        <option value="">-- No Restaurant Linked --</option>
                                        {restaurants.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Clicking the ad will open this restaurant's page</p>
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
                                    <p className="text-xs text-gray-500 mt-1">This promo will only appear for users in this city.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Banner Image</label>
                                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl h-32 cursor-pointer hover:bg-gray-50">
                                        {imageFile ? (
                                            <div className="text-green-600 font-medium text-sm">{imageFile.name}</div>
                                        ) : (
                                            <>
                                                <ImageIcon className="text-gray-400 mb-2" />
                                                <span className="text-sm text-gray-500">Click to upload</span>
                                            </>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={e => {
                                            if (e.target.files) setImageFile(e.target.files[0]);
                                        }} />
                                    </label>
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Coupon Attachment */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Attach Coupon <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <select
                                    className="w-full p-2 border rounded-lg bg-white"
                                    value={selectedCouponCode}
                                    onChange={e => setSelectedCouponCode(e.target.value)}
                                >
                                    <option value="">— No Coupon —</option>
                                    {coupons.map(c => (
                                        <option key={c.code} value={c.code}>
                                            {c.code} — {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                                            {c.user ? ` (${c.user.full_name || c.user.phone})` : ''}
                                            {c.first_order_only ? ' · First Order' : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedCouponCode && (() => {
                                    const c = coupons.find(x => x.code === selectedCouponCode);
                                    if (!c) return null;
                                    return (
                                        <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-green-800">
                                            <Tag size={14} />
                                            <span className="font-bold">{c.code}</span>
                                            <span>·</span>
                                            <span>{c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}</span>
                                            {c.min_order_value > 0 && <span className="text-green-600">· Min ₹{c.min_order_value}</span>}
                                            {c.first_order_only && <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-medium">First Order</span>}
                                            {c.user && <span className="bg-violet-100 text-violet-700 text-xs px-1.5 py-0.5 rounded-full font-medium">{c.user.full_name || c.user.phone}</span>}
                                        </div>
                                    );
                                })()}
                                <p className="text-xs text-gray-400 mt-1">
                                    Manage coupons in the Coupons tab. Only active coupons are shown.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={resetForms} className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button onClick={handleSave} disabled={submitting} className="flex-1 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50">
                                    {submitting ? 'Saving...' : (editingId ? 'Update Promo' : 'Create Promo')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
