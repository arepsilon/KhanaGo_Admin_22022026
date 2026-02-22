'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trash2, Image as ImageIcon, Plus, Pencil, Tag } from 'lucide-react';

export default function AdsManager() {
    const [ads, setAds] = useState<any[]>([]);
    const [restaurants, setRestaurants] = useState<any[]>([]); // New state
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const supabase = createClient();

    // Form State
    const [adTitle, setAdTitle] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [selectedRestaurant, setSelectedRestaurant] = useState(''); // New state

    // Integrated Coupon State
    const [includeCoupon, setIncludeCoupon] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [maxDiscountValue, setMaxDiscountValue] = useState('');

    useEffect(() => {
        fetchAds();
        fetchRestaurants(); // Fetch restaurants
    }, []);

    const fetchRestaurants = async () => {
        const { data, error } = await supabase.from('restaurants').select('id, name');
        if (!error && data) setRestaurants(data);
    };

    const fetchAds = async () => {
        // Fetch ads joined with coupon details (if any)
        const { data, error } = await supabase
            .from('ads')
            .select('*, coupon_code, coupons(*)')
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        setAds(data || []);
        setLoading(false);
    };

    const handleEditAd = (ad: any) => {
        setAdTitle(ad.title);
        setEditingId(ad.id);
        setImageFile(null);
        setSelectedRestaurant(ad.restaurant_id || ''); // Set restaurant

        // Pre-fill coupon data if exists
        if (ad.coupons) {
            setIncludeCoupon(true);
            setCouponCode(ad.coupons.code);
            setDiscountType(ad.coupons.discount_type);
            setDiscountValue(ad.coupons.discount_value.toString());
            setMinOrderValue(ad.coupons.min_order_value?.toString() || '');
            setMaxDiscountValue(ad.coupons.max_discount_value?.toString() || '');
        } else {
            setIncludeCoupon(false);
            resetCouponForm();
        }

        setIsModalOpen(true);
    };

    const resetCouponForm = () => {
        setCouponCode('');
        setDiscountType('percentage');
        setDiscountValue('');
        setMinOrderValue('');
        setMaxDiscountValue('');
    };

    const resetForms = () => {
        setAdTitle('');
        setSelectedRestaurant(''); // Clear restaurant
        setImageFile(null);
        setEditingId(null);
        setIsModalOpen(false);
        setIncludeCoupon(false);
        resetCouponForm();
    };

    const handleSave = async () => {
        if (!adTitle) return alert('Title is required');
        if (!editingId && !imageFile) return alert('Image is required');

        if (includeCoupon) {
            if (!couponCode || !discountValue) return alert('Coupon Code and Value are required');
        }

        setSubmitting(true);

        try {
            // 1. Handle Image Upload
            let imageUrl = null;
            if (editingId) {
                const existing = ads.find(a => a.id === editingId);
                imageUrl = existing.image_url;
            }

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `ads/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('ads')
                    .upload(filePath, imageFile);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('ads').getPublicUrl(filePath);
                imageUrl = data.publicUrl;
            }

            // 2. Handle Coupon (Upsert)
            let finalCouponCode = null;
            if (includeCoupon) {
                const couponPayload = {
                    code: couponCode.toUpperCase(),
                    discount_type: discountType,
                    discount_value: parseFloat(discountValue),
                    min_order_value: minOrderValue ? parseFloat(minOrderValue) : 0,
                    max_discount_value: maxDiscountValue ? parseFloat(maxDiscountValue) : null,
                    is_active: true
                };

                const { error: couponError } = await supabase
                    .from('coupons')
                    .upsert(couponPayload, { onConflict: 'code' });

                if (couponError) throw couponError;
                finalCouponCode = couponCode.toUpperCase();
            }

            // 3. Handle Ad (Insert/Update)
            const adPayload = {
                title: adTitle,
                image_url: imageUrl,
                restaurant_id: selectedRestaurant || null, // Add restaurant_id
                coupon_code: finalCouponCode
            };

            const { error: dbError } = editingId
                ? await supabase.from('ads').update(adPayload).eq('id', editingId)
                : await supabase.from('ads').insert(adPayload);

            if (dbError) throw dbError;

            alert(editingId ? 'Promotion Updated!' : 'Promotion Created!');
            resetForms();
            fetchAds();
        } catch (error: any) {
            console.error(error);
            alert('Error saving promotion: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteAd = async (id: string) => {
        if (!confirm('Delete this promotion?')) return;
        await supabase.from('ads').delete().eq('id', id);
        fetchAds();
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading Promotions...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Active Promotions</h2>
                <button
                    onClick={() => { resetForms(); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium"
                >
                    <Plus size={20} />
                    New Promo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ads.map(ad => (
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
                        </div>
                        <div className="p-4">
                            <h3 className="font-bold text-gray-800">{ad.title}</h3>
                            {ad.coupons && (
                                <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
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

                            {/* Coupon Section */}
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer mb-4">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                                        checked={includeCoupon}
                                        onChange={e => setIncludeCoupon(e.target.checked)}
                                    />
                                    <span className="font-bold text-gray-700">Attach Coupon Code</span>
                                </label>

                                {includeCoupon && (
                                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                                            <input
                                                className="w-full p-2 border rounded-lg uppercase"
                                                value={couponCode}
                                                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                                                placeholder="e.g., SAVE20"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Unique code for this discount</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                                <select
                                                    className="w-full p-2 border rounded-lg bg-white"
                                                    value={discountType}
                                                    onChange={e => setDiscountType(e.target.value as any)}
                                                >
                                                    <option value="percentage">Percentage (%)</option>
                                                    <option value="fixed">Fixed Amount (₹)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                                                <input
                                                    className="w-full p-2 border rounded-lg"
                                                    type="number"
                                                    value={discountValue}
                                                    onChange={e => setDiscountValue(e.target.value)}
                                                    placeholder="20"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (₹)</label>
                                                <input
                                                    className="w-full p-2 border rounded-lg"
                                                    type="number"
                                                    value={minOrderValue}
                                                    onChange={e => setMinOrderValue(e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount (₹)</label>
                                                <input
                                                    className="w-full p-2 border rounded-lg"
                                                    type="number"
                                                    value={maxDiscountValue}
                                                    onChange={e => setMaxDiscountValue(e.target.value)}
                                                    placeholder="Optional"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
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
