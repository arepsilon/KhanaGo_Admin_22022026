'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

import AddRestaurantModal from './AddRestaurantModal';
import RestaurantMenuModal from './RestaurantMenuModal';
import RestaurantReorderModal from './RestaurantReorderModal';
import BulkMenuUploadModal from './BulkMenuUploadModal';
import { Edit2, Upload, MapPin, Phone, DollarSign, Percent, CreditCard, Store, Image as ImageIcon, Search, Plus, Filter, FileText, Lock, Power, Trash2, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';

interface Restaurant {
    id: string;
    name: string;
    email: string;
    address: string;
    phone_number: string;
    is_active: boolean;
    is_open: boolean;
    commission_percent: number;
    platform_fee_per_order: number;
    transaction_charge_percent: number;
    image_url: string | null;
    created_at: string;
    badge_text: string | null;
    bank_account_number: string | null;
    bank_ifsc_code: string | null;
    bank_account_name: string | null;
    orders: { count: number }[];
    show_menu_images: boolean;
    is_test: boolean;
    preparation_time: number;
}

export default function RestaurantsTable() {
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [expandedRestaurants, setExpandedRestaurants] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
    const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
    const [selectedRestaurantForMenu, setSelectedRestaurantForMenu] = useState<any | null>(null);
    const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        fetchRestaurants();

        // Subscribe to real-time updates
        const channel = supabase
            .channel('admin_restaurants_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'restaurants',
                },
                (payload) => {
                    console.log('Restaurant change detected:', payload);
                    fetchRestaurants();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [filter]);

    // Background checker for operating hours
    useEffect(() => {
        const interval = setInterval(() => {
            checkOperatingHours(restaurants);
        }, 60000); // Every minute

        return () => clearInterval(interval);
    }, [restaurants]);

    const checkOperatingHours = async (currentRestaurants: any[]) => {
        // Get IST time reliably
        const now = new Date();
        const istDateStr = now.toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });

        // Handle "24:xx" or other edge cases from toLocaleString
        const [hours, minutes] = istDateStr.split(':');
        const currentTime = `${hours.trim().padStart(2, '0')}:${minutes.trim().padStart(2, '0')}`;

        for (const restaurant of currentRestaurants) {
            if (!restaurant.opening_time || !restaurant.closing_time || !restaurant.is_active) continue;

            const isOpen = currentTime >= restaurant.opening_time && currentTime <= restaurant.closing_time;

            if (isOpen !== restaurant.is_open) {
                console.log(`Auto-updating ${restaurant.name} status to ${isOpen ? 'OPEN' : 'CLOSED'} (IST: ${currentTime})`);
                await supabase
                    .from('restaurants')
                    .update({ is_open: isOpen })
                    .eq('id', restaurant.id);
            }
        }
    };

    const fetchRestaurants = async () => {
        let query = supabase
            .from('restaurants')
            .select(`
                *,
                orders:orders(count)
            `)
            .not('orders.status', 'eq', 'cancelled')
            .order('sort_order', { ascending: true });

        if (filter === 'active') {
            query = query.eq('is_active', true);
        } else if (filter === 'inactive') {
            query = query.eq('is_active', false);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching restaurants:', error);
        } else {
            setRestaurants(data || []);
        }
        setLoading(false);
    };

    const toggleExpand = (restaurantId: string) => {
        const newExpanded = new Set(expandedRestaurants);
        if (newExpanded.has(restaurantId)) {
            newExpanded.delete(restaurantId);
        } else {
            newExpanded.add(restaurantId);
        }
        setExpandedRestaurants(newExpanded);
    };

    const expandAll = () => {
        setExpandedRestaurants(new Set(restaurants.map(r => r.id)));
    };

    const collapseAll = () => {
        setExpandedRestaurants(new Set());
    };

    const toggleActiveStatus = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('restaurants')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchRestaurants();
        } catch (error: any) {
            console.error('Error updating active status:', error.message);
            alert('Failed to update status');
        }
    };

    const toggleOpenStatus = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('restaurants')
                .update({ is_open: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchRestaurants();
        } catch (error: any) {
            console.error('Error updating status:', error.message);
            alert('Failed to update status');
        }
    };

    const handleToggleTestMode = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('restaurants')
                .update({ is_test: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchRestaurants();
        } catch (error: any) {
            console.error('Error updating test mode:', error.message);
            alert('Failed to update test mode');
        }
    };

    const updateGenericField = async (restaurantId: string, field: string, value: any) => {
        if (['commission_percent', 'platform_fee_per_order', 'transaction_charge_percent'].includes(field)) {
            if (isNaN(value) || value < 0) {
                alert('Please enter a valid positive number');
                return;
            }
        }

        const { error } = await supabase
            .from('restaurants')
            .update({ [field]: value })
            .eq('id', restaurantId);

        if (error) {
            alert(`Error updating ${field} `);
            console.error(error);
        } else {
            fetchRestaurants();
        }
    };

    const handleSetPassword = async (restaurantId: string, restaurantName: string) => {
        const newPassword = prompt(`Enter new password for ${restaurantName}:`);
        if (!newPassword) return;
        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }

        setResettingPasswordId(restaurantId);
        try {
            const response = await fetch('/api/restaurants/update-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurantId, newPassword }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update password');
            }

            alert('Password updated successfully! 🔑');
        } catch (error: any) {
            console.error('Update Password Error:', error);
            alert('Failed to update password: ' + error.message);
        } finally {
            setResettingPasswordId(null);
        }
    };

    const [uploadingRestaurantId, setUploadingRestaurantId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingRestaurantId) return;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('restaurantId', uploadingRestaurantId);

            const response = await fetch('/api/restaurants/upload-image', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update image');
            }

            alert('Restaurant image updated successfully! 📸');
            fetchRestaurants();

        } catch (error: any) {
            console.error('Error updating image:', error);
            alert('Failed to update image: ' + error.message);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingRestaurantId(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleImageUpdate}
            />
            <AddRestaurantModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={() => {
                    fetchRestaurants();
                }}
            />
            <RestaurantReorderModal
                isOpen={isReorderModalOpen}
                onClose={() => setIsReorderModalOpen(false)}
                onSuccess={() => fetchRestaurants()}
            />
            <BulkMenuUploadModal
                isOpen={isBulkUploadModalOpen}
                onClose={() => setIsBulkUploadModalOpen(false)}
            />

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-700">Filter by Status</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                        >
                            <span>➕</span> Add Restaurant
                        </button>
                        <button
                            onClick={() => setIsReorderModalOpen(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                        >
                            <ArrowUpDown size={16} /> Reorder
                        </button>
                        <button
                            onClick={() => setIsBulkUploadModalOpen(true)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                        >
                            <Upload size={16} /> Bulk Upload Menu
                        </button>
                        <button
                            onClick={expandedRestaurants.size === 0 ? expandAll : collapseAll}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                        >
                            {expandedRestaurants.size === 0 ? '⬇️ Expand All' : '⬆️ Collapse All'}
                        </button>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {['all', 'active', 'inactive'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status
                                ? 'bg-orange-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {status.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Restaurants Cards */}
            <div className="space-y-4">
                {restaurants.map((restaurant) => {
                    const isExpanded = expandedRestaurants.has(restaurant.id);
                    const isActive = restaurant.is_active;

                    return (
                        <div
                            key={restaurant.id}
                            className={`rounded-xl shadow-sm border-2 transition-all ${isActive
                                ? 'bg-white border-gray-200'
                                : 'bg-gray-100 border-gray-300 opacity-60'
                                }`}
                        >
                            {/* Restaurant Header */}
                            <div
                                className={`p-6 ${isActive
                                    ? 'cursor-pointer hover:bg-gray-50'
                                    : 'cursor-not-allowed'
                                    }`}
                                onClick={() => isActive && toggleExpand(restaurant.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-orange-100 rounded-lg">
                                                    <Store className="w-5 h-5 text-orange-600" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-gray-900">{restaurant.name}</h3>
                                                    <p className="text-sm text-gray-500">{restaurant.address.split(',')[0]} (ID: {restaurant.id.slice(0, 8)})</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleActiveStatus(restaurant.id, restaurant.is_active);
                                                    }}
                                                    className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors hover:bg-opacity-80 ${restaurant.is_active
                                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                                        }`}
                                                >
                                                    {restaurant.is_active ? '✓ Active' : '✗ Inactive'}
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleTestMode(restaurant.id, restaurant.is_test);
                                                    }}
                                                    className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors hover:bg-opacity-80 ${restaurant.is_test
                                                        ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 border border-purple-300'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200'
                                                        }`}
                                                >
                                                    {restaurant.is_test ? '🧪 Test Mode ON' : '🧪 Normal Mode'}
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${restaurant.is_open
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? 'bg-green-600' : 'bg-red-600'}`}></div>
                                                    {restaurant.is_open ? 'Open' : 'Closed'}
                                                </span>
                                                {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 text-sm">
                                            <div>
                                                <p className="text-gray-500">Total Orders</p>
                                                <p className={`font-bold text-lg ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                                                    {restaurant.orders?.[0]?.count || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Rating</p>
                                                <p className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                                                    ⭐ {restaurant.rating?.toFixed(1) || '0.0'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && isActive && (
                                <div className="border-t border-gray-200 p-6 bg-gray-50">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                        {/* Left Side: Image & Description */}
                                        <div className="space-y-6">
                                            <div>
                                                {restaurant.image_url ? (
                                                    <div className="relative group">
                                                        <img src={restaurant.image_url} alt={restaurant.name} className="w-full h-64 object-cover rounded-lg" />
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setUploadingRestaurantId(restaurant.id);
                                                                fileInputRef.current?.click();
                                                            }}
                                                            className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                                                        >
                                                            <span className="text-white font-bold text-lg">✏️ Change Image</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-300 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setUploadingRestaurantId(restaurant.id);
                                                            fileInputRef.current?.click();
                                                        }}
                                                    >
                                                        <div className="text-center">
                                                            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                                                            <p className="text-gray-500 font-medium">Add Restaurant Image</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <h4 className="font-semibold text-gray-900 mb-2">📝 Description</h4>
                                                <DescriptionEditor
                                                    restaurant={restaurant}
                                                    onUpdate={(desc) => updateGenericField(restaurant.id, 'description', desc)}
                                                />
                                            </div>
                                        </div>

                                        {/* Right Side: Contact & Location */}
                                        <div className="space-y-6">
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                                <h4 className="flex items-center gap-2 font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                                                    <span className="text-gray-400"><Phone size={16} /></span>
                                                    Contact & Delivery
                                                </h4>
                                                <div className="space-y-3 text-sm text-gray-600">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400">📞</span>
                                                        <p>{restaurant.phone}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400">⏰</span>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="time"
                                                                defaultValue={restaurant.opening_time || '09:00'}
                                                                onBlur={(e) => updateGenericField(restaurant.id, 'opening_time', e.target.value)}
                                                                className="px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-orange-500 outline-none"
                                                            />
                                                            <span>to</span>
                                                            <input
                                                                type="time"
                                                                defaultValue={restaurant.closing_time || '22:00'}
                                                                onBlur={(e) => updateGenericField(restaurant.id, 'closing_time', e.target.value)}
                                                                className="px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-orange-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="pt-1">
                                                        <p className="text-[10px] text-gray-400 italic">
                                                            * Restaurant status will auto-update based on these hours (IST).
                                                        </p>
                                                    </div>
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-gray-400 mt-0.5">📍</span>
                                                        <p className="flex-1">{restaurant.address}</p>
                                                    </div>
                                                    <div className="flex gap-4 pt-2">
                                                        <div>
                                                            <p className="text-xs text-gray-400">Delivery Fee</p>
                                                            <p className="font-medium text-gray-900">₹{restaurant.delivery_fee?.toFixed(2) || '0.00'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">Min Order</p>
                                                            <p className="font-medium text-gray-900">₹{restaurant.minimum_order || 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">Prep Time (Min)</p>
                                                            <input
                                                                type="number"
                                                                defaultValue={restaurant.preparation_time || 30}
                                                                onBlur={(e) => updateGenericField(restaurant.id, 'preparation_time', parseInt(e.target.value))}
                                                                className="w-16 px-1 py-0.5 border border-gray-200 rounded text-xs font-medium text-gray-900 focus:ring-1 focus:ring-orange-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <LocationEditor
                                                restaurant={restaurant}
                                                onUpdate={(lat, lng) => {
                                                    updateGenericField(restaurant.id, 'latitude', lat);
                                                    updateGenericField(restaurant.id, 'longitude', lng);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Platform Fees & Config */}
                                    <div className="mb-8 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                            <span className="text-gray-400"><CreditCard size={18} /></span>
                                            <span>Platform Fees & Charges</span>
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Commission (%)</label>
                                                <input
                                                    type="number"
                                                    defaultValue={restaurant.commission_percent || 15}
                                                    onBlur={(e) => updateGenericField(restaurant.id, 'commission_percent', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 text-lg font-bold bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                                />
                                            </div>
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tx Charge (%)</label>
                                                <input
                                                    type="number"
                                                    defaultValue={restaurant.transaction_charge_percent || 2.5}
                                                    onBlur={(e) => updateGenericField(restaurant.id, 'transaction_charge_percent', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 text-lg font-bold bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Platform Fee (₹)</label>
                                                <input
                                                    type="number"
                                                    defaultValue={restaurant.platform_fee_per_order || 5}
                                                    onBlur={(e) => updateGenericField(restaurant.id, 'platform_fee_per_order', parseFloat(e.target.value))}
                                                    className="w-full px-3 py-2 text-lg font-bold bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Details & Payout Config */}
                                    <div className="mb-8 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                                        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                            <span className="text-gray-400"><CreditCard size={18} /></span>
                                            <span>Bank Details for Payouts (Automatic Friday Payout)</span>
                                        </h4>
                                        <BankDetailsEditor
                                            restaurant={restaurant}
                                            onUpdate={(field, value) => updateGenericField(restaurant.id, field, value)}
                                        />
                                    </div>

                                    <div className="mb-8">
                                        <BadgeTextEditor
                                            restaurant={restaurant}
                                            onUpdate={(badge) => updateGenericField(restaurant.id, 'badge_text', badge)}
                                        />
                                    </div>

                                    {/* App Config Toggle */}
                                    <div className="mb-8 p-4 bg-purple-50 border border-purple-100 rounded-xl shadow-sm">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                                    <span className="text-purple-500"><ImageIcon size={18} /></span>
                                                    <span>Menu Item Images</span>
                                                </h4>
                                                <p className="text-xs text-gray-500 mt-1">Enable or disable images for all menu items for this restaurant</p>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateGenericField(restaurant.id, 'show_menu_images', !restaurant.show_menu_images);
                                                }}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${restaurant.show_menu_images ? 'bg-purple-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${restaurant.show_menu_images ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleOpenStatus(restaurant.id, restaurant.is_open);
                                            }}
                                            className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border ${restaurant.is_open
                                                ? 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                                                : 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                                                }`}
                                        >
                                            <Power size={16} />
                                            {restaurant.is_open ? 'Close Restaurant' : 'Open Restaurant'}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedRestaurantForMenu(restaurant);
                                            }}
                                            className="flex-1 min-w-[140px] px-4 py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <FileText size={16} /> Manage Menu
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSetPassword(restaurant.id, restaurant.name);
                                            }}
                                            disabled={resettingPasswordId === restaurant.id}
                                            className="flex-1 min-w-[140px] px-4 py-3 bg-violet-50 text-violet-700 border border-violet-100 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <Lock size={16} /> {resettingPasswordId === restaurant.id ? 'Updating...' : 'Set Password'}
                                        </button>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (confirm(`Are you sure you want to PERMANENTLY DELETE "${restaurant.name}"?\n\n⚠️ This will delete:\n- All Menu Items\n- All Order History\n- All Payouts\n\nThis action cannot be undone.`)) {
                                                    try {
                                                        const res = await fetch('/api/restaurants/delete', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ restaurantId: restaurant.id })
                                                        });
                                                        const data = await res.json();
                                                        if (data.error) throw new Error(data.error);

                                                        alert('Restaurant Deleted Successfully');
                                                        fetchRestaurants();
                                                    } catch (err: any) {
                                                        alert('Failed to delete: ' + err.message);
                                                    }
                                                }
                                            }}
                                            className="flex-1 min-w-[140px] px-4 py-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 size={16} /> Delete Restaurant
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {restaurants.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <p className="text-gray-500 text-lg">No restaurants found</p>
                    </div>
                )}
            </div>

            {selectedRestaurantForMenu && (
                <RestaurantMenuModal
                    isOpen={!!selectedRestaurantForMenu}
                    onClose={() => setSelectedRestaurantForMenu(null)}
                    restaurantId={selectedRestaurantForMenu.id}
                    restaurantName={selectedRestaurantForMenu.name}
                />
            )}
        </div>
    );
}

function BankDetailsEditor({ restaurant, onUpdate }: { restaurant: any, onUpdate: (field: string, value: any) => void }) {
    const [accountNumber, setAccountNumber] = useState(restaurant.bank_account_number || '');
    const [ifsc, setIfsc] = useState(restaurant.bank_ifsc_code || '');
    const [accountName, setAccountName] = useState(restaurant.bank_account_name || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const isChanged =
            accountNumber !== (restaurant.bank_account_number || '') ||
            ifsc !== (restaurant.bank_ifsc_code || '') ||
            accountName !== (restaurant.bank_account_name || '');
        setIsDirty(isChanged);
    }, [accountNumber, ifsc, accountName, restaurant]);

    const handleSave = () => {
        if (accountNumber !== (restaurant.bank_account_number || '')) onUpdate('bank_account_number', accountNumber);
        if (ifsc !== (restaurant.bank_ifsc_code || '')) onUpdate('bank_ifsc_code', ifsc);
        if (accountName !== (restaurant.bank_account_name || '')) onUpdate('bank_account_name', accountName);
        setIsDirty(false);
        alert('Bank details updated successfully! 🏦 (Changes will affect next payout)');
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Account Holder Name</label>
                <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Account Number</label>
                <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Bank Account Number"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">IFSC Code</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={ifsc}
                        onChange={(e) => setIfsc(e.target.value)}
                        placeholder="IFSC Code"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        disabled={!isDirty}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSave();
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${isDirty
                            ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

function BadgeTextEditor({ restaurant, onUpdate }: { restaurant: any, onUpdate: (badge: string) => void }) {
    const [badge, setBadge] = useState(restaurant.badge_text || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (badge !== (restaurant.badge_text || '')) {
            setIsDirty(true);
        } else {
            setIsDirty(false);
        }
    }, [badge, restaurant]);

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
                <span className="p-1.5 bg-yellow-100 text-yellow-600 rounded-md"><Store size={16} /></span>
                <label className="text-sm font-semibold text-gray-700">Badge Label (e.g. Popular, KhanaGo Choice)</label>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Enter badge text (leave empty for none)"
                    className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all"
                />
                <button
                    disabled={!isDirty}
                    onClick={(e) => {
                        e.stopPropagation();
                        onUpdate(badge);
                        setIsDirty(false);
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${isDirty
                        ? 'bg-yellow-500 text-white hover:bg-yellow-600 shadow-yellow-200'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    Save
                </button>
            </div>
        </div>
    );
}

function LocationEditor({ restaurant, onUpdate }: { restaurant: any, onUpdate: (lat: number, lng: number) => void }) {
    const [lat, setLat] = useState(restaurant.latitude || '');
    const [lng, setLng] = useState(restaurant.longitude || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (lat !== (restaurant.latitude || '') || lng !== (restaurant.longitude || '')) {
            setIsDirty(true);
        } else {
            setIsDirty(false);
        }
    }, [lat, lng, restaurant]);

    return (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h5 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                <MapPin size={14} className="text-gray-500" />
                Update Coordinates
            </h5>
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Latitude</label>
                    <input
                        type="number"
                        step="any"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono"
                        placeholder="0.0000"
                    />
                </div>
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Longitude</label>
                    <input
                        type="number"
                        step="any"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono"
                        placeholder="0.0000"
                    />
                </div>
            </div>
            <button
                disabled={!isDirty}
                onClick={(e) => {
                    e.stopPropagation();
                    if (lat && lng) {
                        onUpdate(parseFloat(lat as string), parseFloat(lng as string));
                        setIsDirty(false);
                        alert('Location updated! 🗺️');
                    } else {
                        alert('Please provide both Latitude and Longitude');
                    }
                }}
                className={`w-full py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${isDirty
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
            >
                {isDirty ? 'Update Location' : 'Location Saved'}
            </button>
        </div>
    );
}

function DescriptionEditor({ restaurant, onUpdate }: { restaurant: any, onUpdate: (desc: string) => void }) {
    const [description, setDescription] = useState(restaurant.description || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (description !== (restaurant.description || '')) {
            setIsDirty(true);
        } else {
            setIsDirty(false);
        }
    }, [description, restaurant]);

    return (
        <div className="mt-2 text-right">
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none mb-2"
                rows={3}
                placeholder="Enter restaurant description..."
            />
            <button
                disabled={!isDirty}
                onClick={(e) => {
                    e.stopPropagation();
                    onUpdate(description);
                    setIsDirty(false);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${isDirty
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
            >
                Save Description
            </button>
        </div>
    );
}
