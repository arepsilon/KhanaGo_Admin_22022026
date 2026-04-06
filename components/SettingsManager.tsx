'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Save, AlertCircle, CheckCircle2, MapPin } from 'lucide-react';

export default function SettingsManager() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // City state
    const [cities, setCities] = useState<any[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

    // Settings State
    const [minVersion, setMinVersion] = useState('1.0.0');
    const [deliveryRadius, setDeliveryRadius] = useState('10');
    const [enableGrocery, setEnableGrocery] = useState(true);
    const [baseDeliveryFee, setBaseDeliveryFee] = useState('30');
    const [perKmFee, setPerKmFee] = useState('10');
    const [platformFee, setPlatformFee] = useState('5');
    const [whatsappNumber, setWhatsappNumber] = useState('918149875162');
    const [showMenuImages, setShowMenuImages] = useState(true);

    // Surge Pricing State
    const [isSurgeActive, setIsSurgeActive] = useState(false);
    const [surgeFee, setSurgeFee] = useState('0');
    const [surgeReason, setSurgeReason] = useState('High Demand');

    // Grocery Specific State
    const [groceryDeliveryCharge, setGroceryDeliveryCharge] = useState('15');
    const [groceryMinimumOrder, setGroceryMinimumOrder] = useState('50');
    const [groceryFreeDeliveryAbove, setGroceryFreeDeliveryAbove] = useState('150');

    // Razorpay State
    const [razorpayEnabled, setRazorpayEnabled] = useState(false);
    const [razorpayKeyId, setRazorpayKeyId] = useState('');
    const [razorpayKeySecret, setRazorpayKeySecret] = useState('');

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadCities();
    }, []);

    useEffect(() => {
        if (selectedCityId !== undefined) {
            loadSettings();
        }
    }, [selectedCityId]);

    const loadCities = async () => {
        const { data } = await supabase
            .from('cities')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

        if (data && data.length > 0) {
            setCities(data);
            setSelectedCityId(data[0].id); // Default to first city
        } else {
            // No cities — load global settings
            setSelectedCityId(null);
            loadSettings();
        }
    };

    const loadSettings = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('app_settings')
                .select('*');

            if (selectedCityId) {
                query = query.eq('city_id', selectedCityId);
            } else {
                query = query.is('city_id', null);
            }

            const { data, error } = await query;

            if (error) throw error;

            if (data) {
                const version = data.find(s => s.key === 'min_supported_version')?.value;
                const radius = data.find(s => s.key === 'delivery_radius_km')?.value;
                const grocery = data.find(s => s.key === 'enable_grocery')?.value;
                const baseFee = data.find(s => s.key === 'base_delivery_fee')?.value;
                const kmFee = data.find(s => s.key === 'per_km_fee')?.value;
                const platFee = data.find(s => s.key === 'platform_fee')?.value;

                const rpEnabled = data.find(s => s.key === 'razorpay_enabled')?.value;
                const rpKeyId = data.find(s => s.key === 'razorpay_key_id')?.value;
                const rpSecret = data.find(s => s.key === 'razorpay_key_secret')?.value;
                const menuImages = data.find(s => s.key === 'show_menu_images')?.value;
                const waNumber = data.find(s => s.key === 'whatsapp_support_url')?.value;

                const grocCharge = data.find(s => s.key === 'grocery_delivery_charge')?.value;
                const grocMin = data.find(s => s.key === 'grocery_minimum_order')?.value;
                const grocFree = data.find(s => s.key === 'grocery_free_delivery_above')?.value;

                const sActive = data.find(s => s.key === 'is_surge_active')?.value;
                const sFee = data.find(s => s.key === 'surge_fee')?.value;
                const sReason = data.find(s => s.key === 'surge_reason')?.value;

                if (version !== undefined) setMinVersion(String(version).replace(/"/g, ''));
                if (radius !== undefined) setDeliveryRadius(String(radius));
                if (grocery !== undefined) setEnableGrocery(Boolean(grocery));
                if (baseFee !== undefined) setBaseDeliveryFee(String(baseFee));
                if (kmFee !== undefined) setPerKmFee(String(kmFee));
                if (platFee !== undefined) setPlatformFee(String(platFee));
                if (menuImages !== undefined) setShowMenuImages(Boolean(menuImages));
                if (waNumber !== undefined) setWhatsappNumber(String(waNumber).replace(/"/g, ''));

                if (grocCharge !== undefined) setGroceryDeliveryCharge(String(grocCharge));
                if (grocMin !== undefined) setGroceryMinimumOrder(String(grocMin));
                if (grocFree !== undefined) setGroceryFreeDeliveryAbove(String(grocFree));

                if (rpEnabled !== undefined) setRazorpayEnabled(Boolean(rpEnabled));
                if (rpKeyId !== undefined) setRazorpayKeyId(String(rpKeyId).replace(/"/g, ''));
                if (rpSecret !== undefined) setRazorpayKeySecret(String(rpSecret).replace(/"/g, ''));

                if (sActive !== undefined) setIsSurgeActive(Boolean(sActive));
                if (sFee !== undefined) setSurgeFee(String(sFee));
                if (sReason !== undefined) setSurgeReason(String(sReason).replace(/"/g, ''));
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const updates = [
                { key: 'min_supported_version', value: JSON.stringify(minVersion), description: 'Minimum supported version', city_id: selectedCityId },
                { key: 'delivery_radius_km', value: parseFloat(deliveryRadius), description: 'Max delivery radius in KM', city_id: selectedCityId },
                { key: 'enable_grocery', value: enableGrocery, description: 'Enable Grocery Module', city_id: selectedCityId },
                { key: 'base_delivery_fee', value: parseFloat(baseDeliveryFee), description: 'Base delivery fee (up to 2km)', city_id: selectedCityId },
                { key: 'per_km_fee', value: parseFloat(perKmFee), description: 'Fee per km after base distance', city_id: selectedCityId },
                { key: 'platform_fee', value: parseFloat(platformFee), description: 'Platform fee per order', city_id: selectedCityId },
                { key: 'whatsapp_support_url', value: JSON.stringify(whatsappNumber), description: 'WhatsApp support number for customers', city_id: selectedCityId },

                // Grocery specific
                { key: 'grocery_delivery_charge', value: parseFloat(groceryDeliveryCharge) || 0, description: 'Delivery fee for grocery orders', city_id: selectedCityId },
                { key: 'grocery_minimum_order', value: parseFloat(groceryMinimumOrder) || 0, description: 'Minimum order amount for grocery', city_id: selectedCityId },
                { key: 'grocery_free_delivery_above', value: parseFloat(groceryFreeDeliveryAbove) || 0, description: 'Free delivery threshold for grocery', city_id: selectedCityId },

                // Razorpay updates
                { key: 'razorpay_enabled', value: razorpayEnabled, description: 'Enable Razorpay payment gateway', city_id: selectedCityId },
                { key: 'razorpay_key_id', value: JSON.stringify(razorpayKeyId), description: 'Razorpay Key ID', city_id: selectedCityId },
                { key: 'razorpay_key_secret', value: JSON.stringify(razorpayKeySecret), description: 'Razorpay Key Secret', city_id: selectedCityId },

                // Menu Image update
                { key: 'show_menu_images', value: showMenuImages, description: 'Toggle visibility of menu item images in the customer app', city_id: selectedCityId },

                // Surge Pricing
                { key: 'is_surge_active', value: isSurgeActive, description: 'Enable/Disable surge pricing for this city', city_id: selectedCityId },
                { key: 'surge_fee', value: parseFloat(surgeFee) || 0, description: 'Flat surge fee amount', city_id: selectedCityId },
                { key: 'surge_reason', value: JSON.stringify(surgeReason), description: 'Reason for surge shown to customers', city_id: selectedCityId }
            ];

            for (const update of updates) {
                const { error } = await supabase
                    .from('app_settings')
                    .upsert(update, { onConflict: 'key,city_id' });
                if (error) throw error;
            }

            setMessage({ type: 'success', text: `Settings saved for ${cities.find(c => c.id === selectedCityId)?.name || 'Global'}` });
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: error.message || 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 max-w-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-6">App Configuration</h2>

            {/* City Selector */}
            {cities.length > 0 && (
                <div className="mb-6 p-4 rounded-xl border border-orange-200 bg-orange-50">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin size={16} className="text-orange-600" />
                        <label className="text-sm font-semibold text-slate-900">Configure settings for:</label>
                    </div>
                    <select
                        value={selectedCityId || ''}
                        onChange={(e) => setSelectedCityId(e.target.value || null)}
                        className="w-full px-4 py-3 rounded-xl border border-orange-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-semibold bg-white"
                    >
                        {cities.map(city => (
                            <option key={city.id} value={city.id}>{city.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-orange-600 mt-1">Each city has its own fees, delivery settings, and configuration.</p>
                </div>
            )}

            {message && (
                <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <span className="font-medium">{message.text}</span>
                </div>
            )}

            <div className="space-y-6">
                {/* Min Version */}
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">Minimum Supported App Version</label>
                    <input
                        type="text"
                        value={minVersion}
                        onChange={(e) => setMinVersion(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                        placeholder="e.g. 1.0.0"
                    />
                    <p className="text-xs text-slate-400">Force users to update if they are below this version.</p>
                </div>

                {/* Delivery Radius */}
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">Delivery Radius (KM)</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={deliveryRadius}
                            onChange={(e) => setDeliveryRadius(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                            placeholder="10"
                        />
                        <div className="absolute right-4 top-3 text-slate-500 font-medium">km</div>
                    </div>
                    <p className="text-xs text-slate-400">Restaurants outside this radius will not be shown to customers.</p>
                </div>

                {/* Fees Section */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-900">Base Delivery Fee</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={baseDeliveryFee}
                                onChange={(e) => setBaseDeliveryFee(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                placeholder="30"
                            />
                            <div className="absolute right-4 top-3 text-slate-500 font-medium">₹</div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-900">Fee Per KM</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={perKmFee}
                                onChange={(e) => setPerKmFee(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                placeholder="10"
                            />
                            <div className="absolute right-4 top-3 text-slate-500 font-medium">₹</div>
                        </div>
                    </div>
                </div>
                
                {/* Surge Pricing Section */}
                <div className="p-6 rounded-xl border border-orange-100 bg-orange-50/30 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-900">Surge Pricing</h3>
                            <p className="text-sm text-slate-500">Enable additional fees for high demand or rain</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isSurgeActive}
                                onChange={(e) => setIsSurgeActive(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                    </div>

                    {isSurgeActive && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Surge Fee (Flat)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={surgeFee}
                                        onChange={(e) => setSurgeFee(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-orange-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium bg-white"
                                        placeholder="20"
                                    />
                                    <div className="absolute right-4 top-2 text-slate-500 font-medium">₹</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Surge Reason</label>
                                <input
                                    type="text"
                                    value={surgeReason}
                                    onChange={(e) => setSurgeReason(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-orange-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium bg-white"
                                    placeholder="e.g. High Demand"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">Platform Fee</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={platformFee}
                            onChange={(e) => setPlatformFee(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                            placeholder="5"
                        />
                        <div className="absolute right-4 top-3 text-slate-500 font-medium">₹</div>
                    </div>
                </div>

                {/* WhatsApp Support Section */}
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">WhatsApp Support Number</label>
                    <input
                        type="text"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                        placeholder="e.g. 918149875162"
                    />
                    <p className="text-xs text-slate-400">Include country code (e.g., 91 for India). This updates the "Help & Support" links in the customer app.</p>
                </div>

                {/* Enable Grocery */}
                <div className="flex flex-col p-6 rounded-xl border border-slate-100 bg-slate-50 gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-slate-900">Enable Grocery</h3>
                            <p className="text-sm text-slate-500">Show grocery tab in customer app</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={enableGrocery}
                                onChange={(e) => setEnableGrocery(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                    </div>

                    {enableGrocery && (
                        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Delivery Charge</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={groceryDeliveryCharge}
                                        onChange={(e) => setGroceryDeliveryCharge(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium bg-white"
                                        placeholder="15"
                                    />
                                    <div className="absolute right-4 top-2 text-slate-500 font-medium">₹</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Min. Order</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={groceryMinimumOrder}
                                        onChange={(e) => setGroceryMinimumOrder(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium bg-white"
                                        placeholder="50"
                                    />
                                    <div className="absolute right-4 top-2 text-slate-500 font-medium">₹</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Free Delivery Above</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={groceryFreeDeliveryAbove}
                                        onChange={(e) => setGroceryFreeDeliveryAbove(e.target.value)}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium bg-white"
                                        placeholder="150"
                                    />
                                    <div className="absolute right-4 top-2 text-slate-500 font-medium">₹</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Show Menu Images */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div>
                        <h3 className="font-semibold text-slate-900">Show Menu Images</h3>
                        <p className="text-sm text-slate-500">Display item images in the restaurant menu</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showMenuImages}
                            onChange={(e) => setShowMenuImages(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                </div>

                {/* Razorpay Settings */}
                <div className="mt-6 border-t border-slate-100 pt-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Payment Configuration</h3>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 mb-4">
                        <div>
                            <h3 className="font-semibold text-slate-900">Enable Razorpay</h3>
                            <p className="text-sm text-slate-500">Allow customers to pay online via Razorpay</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={razorpayEnabled}
                                onChange={(e) => setRazorpayEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                    </div>

                    {razorpayEnabled && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Razorpay Key ID</label>
                                <input
                                    type="text"
                                    value={razorpayKeyId}
                                    onChange={(e) => setRazorpayKeyId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                    placeholder="rzp_test_..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-900">Razorpay Key Secret</label>
                                <input
                                    type="password"
                                    value={razorpayKeySecret}
                                    onChange={(e) => setRazorpayKeySecret(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                    placeholder="Enter key secret"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                        {saving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save size={20} />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
