'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Edit2, Trash2, Save, X, Image as ImageIcon, Search, AlertCircle } from 'lucide-react';

type MenuItem = {
    id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    is_available: boolean;
    is_vegetarian: boolean;
    category_id: string;
    categories?: { name: string };
};

type Category = {
    id: string;
    name: string;
};

export default function GroceryManager() {
    const supabase = createClient();
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [groceryStoreId, setGroceryStoreId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal/Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        image_url: '',
        category_id: '',
        is_vegetarian: true,
        is_available: true
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        initializeManager();
    }, []);

    const initializeManager = async () => {
        try {
            // 1. Get Store ID
            const { data: store } = await supabase
                .from('restaurants')
                .select('id')
                .eq('name', 'KhanaGo Fresh')
                .single();

            if (!store) {
                setError('Grocery store "KhanaGo Fresh" not found. Please run setup script.');
                setLoading(false);
                return;
            }
            setGroceryStoreId(store.id);

            // 2. Get Categories
            const { data: cats } = await supabase
                .from('categories')
                .select('id, name')
                .order('name');
            setCategories(cats || []);

            // 3. Load Items
            loadItems(store.id);

        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const loadItems = async (storeId: string) => {
        const { data, error } = await supabase
            .from('menu_items')
            .select('*, categories(name)')
            .eq('restaurant_id', storeId)
            .order('name');

        if (error) console.error(error);
        setItems(data || []);
        setLoading(false);
    };

    const handleSave = async () => {
        if (!groceryStoreId) return;
        if (!formData.name || !formData.price || !formData.category_id) {
            alert('Please fill all required fields');
            return;
        }

        try {
            const payload = {
                restaurant_id: groceryStoreId,
                name: formData.name,
                description: formData.description,
                price: parseFloat(formData.price),
                image_url: formData.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800',
                category_id: formData.category_id,
                is_vegetarian: formData.is_vegetarian,
                is_available: formData.is_available,
                updated_at: new Date().toISOString()
            };

            let error;
            if (editingItem) {
                const { error: updateError } = await supabase
                    .from('menu_items')
                    .update(payload)
                    .eq('id', editingItem.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('menu_items')
                    .insert(payload);
                error = insertError;
            }

            if (error) throw error;

            setIsModalOpen(false);
            setEditingItem(null);
            loadItems(groceryStoreId);
            resetForm();

        } catch (err: any) {
            alert('Error saving item: ' + err.message);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('menu_items')
                .delete()
                .eq('id', id);

            if (error) throw error;
            if (groceryStoreId) loadItems(groceryStoreId);

        } catch (err: any) {
            alert('Error deleting item: ' + err.message);
        }
    };

    const openEditModal = (item: MenuItem) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            description: item.description || '',
            price: item.price.toString(),
            image_url: item.image_url || '',
            category_id: item.category_id || '',
            is_vegetarian: item.is_vegetarian,
            is_available: item.is_available
        });
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            image_url: '',
            category_id: categories.find(c => c.name === 'Vegetables')?.id || '',
            is_vegetarian: true,
            is_available: true
        });
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categories?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return <div className="p-8"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>;

    if (error) return (
        <div className="p-8 bg-red-50 text-red-700 rounded-xl flex items-center gap-3">
            <AlertCircle size={24} />
            <p>{error}</p>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

            {/* Header Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300"
                    />
                </div>
                <button
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <Plus size={20} />
                    Add New Item
                </button>
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                    <div key={item.id} className="border border-slate-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
                        <div className="h-48 overflow-hidden relative bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.image_url || 'https://via.placeholder.com/400x300?text=No+Image'}
                                alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {!item.is_available && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Out of Stock</span>
                                </div>
                            )}
                            <div className="absolute top-2 right-2 flex gap-2">
                                <button onClick={() => openEditModal(item)} className="p-2 bg-white/90 rounded-full hover:bg-white text-slate-700 shadow-sm transition-colors">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(item.id, item.name)} className="p-2 bg-white/90 rounded-full hover:bg-white text-red-600 shadow-sm transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold text-slate-900 group-hover:text-orange-600 transition-colors">{item.name}</h3>
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                        {item.categories?.name || 'Uncategorized'}
                                    </span>
                                </div>
                                <span className="font-bold text-slate-900">₹{item.price}</span>
                            </div>
                            <p className="text-sm text-slate-500 line-clamp-2">{item.description}</p>
                        </div>
                    </div>
                ))}

                {filteredItems.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p>No items found.</p>
                    </div>
                )}
            </div>

            {/* Edit/Add Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-900">
                                {editingItem ? 'Edit Grocery Item' : 'Add New Product'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Item Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                                        placeholder="e.g. Fresh Apples"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹) *</label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                                    placeholder="Product details..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                                    <select
                                        value={formData.category_id}
                                        onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none bg-white"
                                    >
                                        <option value="">Select Category</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Image</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;

                                                    try {
                                                        const fileExt = file.name.split('.').pop();
                                                        const fileName = `${Math.random()}.${fileExt}`;
                                                        const filePath = `${fileName}`;

                                                        // Upload to Supabase
                                                        const { error: uploadError } = await supabase.storage
                                                            .from('menu_images')
                                                            .upload(filePath, file);

                                                        if (uploadError) throw uploadError;

                                                        // Get Public URL
                                                        const { data } = supabase.storage
                                                            .from('menu_images')
                                                            .getPublicUrl(filePath);

                                                        setFormData({ ...formData, image_url: data.publicUrl });
                                                    } catch (err: any) {
                                                        alert('Error uploading image: ' + err.message);
                                                    }
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <div className="px-4 py-2 border border-slate-200 rounded-lg flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-50 transition-colors">
                                                <ImageIcon size={18} />
                                                <span>{formData.image_url ? 'Change Image' : 'Upload Image'}</span>
                                            </div>
                                        </div>
                                        {formData.image_url && (
                                            <img
                                                src={formData.image_url}
                                                className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                                alt="preview"
                                            />
                                        )}
                                    </div>
                                    {formData.image_url && <p className="text-xs text-slate-400 mt-1 truncate">{formData.image_url}</p>}
                                </div>
                            </div>

                            <div className="flex gap-6 pt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_available}
                                        onChange={e => setFormData({ ...formData, is_available: e.target.checked })}
                                        className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">In Stock</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_vegetarian}
                                        onChange={e => setFormData({ ...formData, is_vegetarian: e.target.checked })}
                                        className="w-5 h-5 text-green-500 rounded focus:ring-green-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">Vegetarian (Green Dot)</span>
                                </label>
                            </div>

                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 shadow-md shadow-orange-100 transition-all flex items-center gap-2"
                            >
                                <Save size={18} />
                                Save Product
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
