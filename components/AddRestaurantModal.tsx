'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AddRestaurantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddRestaurantModal({ isOpen, onClose, onSuccess }: AddRestaurantModalProps) {
    const [loading, setLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        latitude: '',
        longitude: '',
        delivery_fee: '0',
        minimum_order: '0',
        estimated_delivery_time: '30',
        commission_percent: '15',
        platform_fee_per_order: '5',
        badge_text: '',
        show_menu_images: true,
        opening_time: '09:00',
        closing_time: '22:00',
        preparation_time: '30',
    });

    const supabase = createClient();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let image_url = null;

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('restaurants')
                    .upload(fileName, imageFile);

                if (uploadError) {
                    throw new Error('Error uploading image: ' + uploadError.message);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('restaurants')
                    .getPublicUrl(fileName);

                image_url = publicUrl;
            }

            const response = await fetch('/api/restaurants/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    delivery_fee: parseFloat(formData.delivery_fee),
                    minimum_order: parseFloat(formData.minimum_order),
                    estimated_delivery_time: parseInt(formData.estimated_delivery_time),
                    commission_percent: parseFloat(formData.commission_percent),
                    platform_fee_per_order: parseFloat(formData.platform_fee_per_order),
                    latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                    longitude: formData.longitude ? parseFloat(formData.longitude) : null,
                    image_url,
                    badge_text: formData.badge_text || null,
                    show_menu_images: formData.show_menu_images,
                    preparation_time: parseInt(formData.preparation_time),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create restaurant');
            }

            alert('Restaurant and Owner Account Created Successfully! 🎉');
            onSuccess();
            onClose();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10 transition-all">
                    <h2 className="text-2xl font-bold text-black">🍽️ Add New Restaurant</h2>
                    <button onClick={onClose} className="text-black hover:text-gray-600 text-2xl">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    {/* Basic Info */}
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                        <h3 className="text-lg font-semibold text-black mb-4 border-l-4 border-orange-500 pl-3">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-black mb-1">Restaurant Image</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black bg-white"
                                    onChange={e => setImageFile(e.target.files ? e.target.files[0] : null)}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-black mb-1">Restaurant Name</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                                    placeholder="e.g. Tasty Bites"
                                    value={formData.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-black mb-1">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => handleChange('description', e.target.value)}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-black mb-1">Badge Text (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                                    placeholder="e.g. Popular, KhanaGo Choice"
                                    value={formData.badge_text}
                                    onChange={e => handleChange('badge_text', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Opening Time (IST)</label>
                                <input
                                    required
                                    type="time"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black bg-white"
                                    value={formData.opening_time}
                                    onChange={e => handleChange('opening_time', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Closing Time (IST)</label>
                                <input
                                    required
                                    type="time"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black bg-white"
                                    value={formData.closing_time}
                                    onChange={e => handleChange('closing_time', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Owner Credentials */}
                    <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
                        <h3 className="text-lg font-semibold text-black mb-4 border-l-4 border-orange-500 pl-3">Owner Credentials (Login)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Email (Username)</label>
                                <input
                                    required
                                    type="email"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                                    placeholder="owner@example.com"
                                    value={formData.email}
                                    onChange={e => handleChange('email', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Password</label>
                                <input
                                    required
                                    type="password"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-black"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={e => handleChange('password', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact & Location */}
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                        <h3 className="text-lg font-semibold text-black mb-4 border-l-4 border-blue-500 pl-3">Contact & Location</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Phone Number</label>
                                <input
                                    required
                                    type="tel"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-black"
                                    placeholder="+91 98765 43210"
                                    value={formData.phone}
                                    onChange={e => handleChange('phone', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Address</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-black"
                                    placeholder="Full Address"
                                    value={formData.address}
                                    onChange={e => handleChange('address', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Latitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-black"
                                    placeholder="e.g. 12.9716"
                                    value={formData.latitude}
                                    onChange={e => handleChange('latitude', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-black mb-1">Longitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-black"
                                    placeholder="e.g. 77.5946"
                                    value={formData.longitude}
                                    onChange={e => handleChange('longitude', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Operations & Fees */}
                    <div className="bg-green-50 p-6 rounded-xl border border-green-100">
                        <h3 className="text-lg font-semibold text-black mb-4 border-l-4 border-green-500 pl-3">Operations & Fees</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-black mb-1">Delivery Fee (₹)</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm text-black"
                                    value={formData.delivery_fee}
                                    onChange={e => handleChange('delivery_fee', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black mb-1">Min Order (₹)</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm text-black"
                                    value={formData.minimum_order}
                                    onChange={e => handleChange('minimum_order', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black mb-1">Commission (%)</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm text-black"
                                    value={formData.commission_percent}
                                    onChange={e => handleChange('commission_percent', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black mb-1">Est. Time (mins)</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm text-black"
                                    value={formData.estimated_delivery_time}
                                    onChange={e => handleChange('estimated_delivery_time', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black mb-1">Prep Time (mins)</label>
                                <input
                                    type="number"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm text-black"
                                    value={formData.preparation_time}
                                    onChange={e => handleChange('preparation_time', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* App Settings */}
                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                        <h3 className="text-lg font-semibold text-black mb-4 border-l-4 border-purple-500 pl-3">App Settings</h3>
                        <div className="flex items-center gap-3 bg-white p-4 rounded-lg border border-purple-100 shadow-sm">
                            <input
                                type="checkbox"
                                id="show_menu_images"
                                checked={formData.show_menu_images}
                                onChange={e => handleChange('show_menu_images', e.target.checked)}
                                className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500 transition-all cursor-pointer"
                            />
                            <label htmlFor="show_menu_images" className="text-sm font-semibold text-gray-800 cursor-pointer">
                                Enable Menu Item Images
                                <span className="block text-xs font-normal text-gray-500 mt-0.5">Show or hide images for all items in this restaurant</span>
                            </label>
                        </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-black font-medium hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-8 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                        >
                            {loading ? 'Creating...' : 'Create Restaurant'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
