'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SettingsManager() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Settings State
    const [minVersion, setMinVersion] = useState('1.0.0');
    const [deliveryRadius, setDeliveryRadius] = useState('10');
    const [enableGrocery, setEnableGrocery] = useState(true);
    const [baseDeliveryFee, setBaseDeliveryFee] = useState('30');
    const [perKmFee, setPerKmFee] = useState('10');
    const [platformFee, setPlatformFee] = useState('5');
    const [showMenuImages, setShowMenuImages] = useState(true);

    // Razorpay State
    const [razorpayEnabled, setRazorpayEnabled] = useState(false);
    const [razorpayKeyId, setRazorpayKeyId] = useState('');
    const [razorpayKeySecret, setRazorpayKeySecret] = useState('');

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('*');

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

                if (version !== undefined) setMinVersion(String(version).replace(/"/g, ''));
                if (radius !== undefined) setDeliveryRadius(String(radius));
                if (grocery !== undefined) setEnableGrocery(Boolean(grocery));
                if (baseFee !== undefined) setBaseDeliveryFee(String(baseFee));
                if (kmFee !== undefined) setPerKmFee(String(kmFee));
                if (platFee !== undefined) setPlatformFee(String(platFee));
                if (menuImages !== undefined) setShowMenuImages(Boolean(menuImages));

                if (rpEnabled !== undefined) setRazorpayEnabled(Boolean(rpEnabled));
                if (rpKeyId !== undefined) setRazorpayKeyId(String(rpKeyId).replace(/"/g, ''));
                if (rpSecret !== undefined) setRazorpayKeySecret(String(rpSecret).replace(/"/g, ''));
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
                { key: 'min_supported_version', value: JSON.stringify(minVersion), description: 'Minimum supported version' },
                { key: 'delivery_radius_km', value: parseFloat(deliveryRadius), description: 'Max delivery radius in KM' },
                { key: 'enable_grocery', value: enableGrocery, description: 'Enable Grocery Module' },
                { key: 'base_delivery_fee', value: parseFloat(baseDeliveryFee), description: 'Base delivery fee (up to 2km)' },
                { key: 'per_km_fee', value: parseFloat(perKmFee), description: 'Fee per km after base distance' },
                { key: 'platform_fee', value: parseFloat(platformFee), description: 'Platform fee per order' },

                // Razorpay updates
                { key: 'razorpay_enabled', value: razorpayEnabled, description: 'Enable Razorpay payment gateway' },
                { key: 'razorpay_key_id', value: JSON.stringify(razorpayKeyId), description: 'Razorpay Key ID' },
                { key: 'razorpay_key_secret', value: JSON.stringify(razorpayKeySecret), description: 'Razorpay Key Secret' },

                // Menu Image update
                { key: 'show_menu_images', value: showMenuImages, description: 'Toggle visibility of menu item images in the customer app' }
            ];

            for (const update of updates) {
                const { error } = await supabase
                    .from('app_settings')
                    .upsert(update, { onConflict: 'key' });
                if (error) throw error;
            }

            setMessage({ type: 'success', text: 'Settings saved successfully' });
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

                {/* Enable Grocery */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
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
