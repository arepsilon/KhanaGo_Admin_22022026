'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface RestaurantMenuModalProps {
    isOpen: boolean;
    onClose: () => void;
    restaurantId: string;
    restaurantName: string;
}

export default function RestaurantMenuModal({ isOpen, onClose, restaurantId, restaurantName }: RestaurantMenuModalProps) {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category_id: '',
        is_vegetarian: false,
        is_vegan: false,
        preparation_time: '15'
    });

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // New Category State
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (isOpen && restaurantId) {
            fetchMenuData();
        }
    }, [isOpen, restaurantId]);

    const fetchMenuData = async () => {
        setLoading(true);

        // Fetch Categories
        const { data: catData } = await supabase.from('categories').select('*').order('name');
        setCategories(catData || []);

        // Fetch Items
        const { data: itemData } = await supabase
            .from('menu_items')
            .select('*, categories(name)')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false });

        setItems(itemData || []);
        setLoading(false);
    };

    const handleImageUpload = async (file: File): Promise<string | null> => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `menu-items/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('menu_items') // Ensure this bucket exists!
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('menu_items').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error) {
            console.error('Image upload failed:', error);
            alert('Failed to upload image. Please ensure "menu_items" bucket exists and is public.');
            return null;
        }
    };


    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        setCreatingCategory(true);

        try {
            // Get highest sort order to append to end
            const { data: maxOrderData } = await supabase
                .from('categories')
                .select('sort_order')
                .order('sort_order', { ascending: false })
                .limit(1)
                .single();

            const nextOrder = (maxOrderData?.sort_order || 0) + 10;

            const { data, error } = await supabase
                .from('categories')
                .insert({
                    name: newCategoryName.trim(),
                    sort_order: nextOrder
                })
                .select()
                .single();

            if (error) throw error;

            if (data) {
                // Refresh categories
                const { data: catData } = await supabase.from('categories').select('*').order('name');
                setCategories(catData || []);

                // Select the new category automatically
                setFormData(prev => ({ ...prev, category_id: data.id }));

                // Reset state
                setNewCategoryName('');
                setIsAddingCategory(false);
                alert('Category Created! ✨');
            }
        } catch (error: any) {
            console.error('Error creating category:', error);
            alert('Failed to create category: ' + (error.message || JSON.stringify(error)));
        } finally {
            setCreatingCategory(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let imageUrl = editingId ? items.find(i => i.id === editingId)?.image_url : null;

            if (imageFile) {
                imageUrl = await handleImageUpload(imageFile);
                if (!imageUrl) throw new Error('Image upload failed');
            }

            const itemData = {
                restaurant_id: restaurantId,
                name: formData.name,
                description: formData.description,
                price: parseFloat(formData.price),
                category_id: formData.category_id || null,
                is_vegetarian: formData.is_vegetarian,
                is_vegan: formData.is_vegan,
                preparation_time: parseInt(formData.preparation_time),
                // Only update image_url if a new one was uploaded or if it was null
                image_url: imageUrl,
                is_available: true
            };

            const { error } = editingId
                ? await supabase.from('menu_items').update(itemData).eq('id', editingId)
                : await supabase.from('menu_items').insert({ ...itemData });

            if (error) throw error;

            alert(editingId ? 'Menu Item Updated! ✨' : 'Menu Item Added! 🍔');
            resetForm();
            setActiveTab('list');
            fetchMenuData(); // Refresh list

        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        const { error } = await supabase.from('menu_items').delete().eq('id', id);
        if (error) {
            console.error('Delete error:', error);
            alert('Failed to delete item: ' + error.message);
        }
        else fetchMenuData();
    };

    const handleEdit = (item: any) => {
        setFormData({
            name: item.name,
            description: item.description || '',
            price: item.price.toString(),
            category_id: item.category_id || '',
            is_vegetarian: item.is_vegetarian,
            is_vegan: item.is_vegan,
            preparation_time: item.preparation_time?.toString() || '15'
        });
        setEditingId(item.id);
        setActiveTab('add');
        setImageFile(null);
        setImagePreview(item.image_url || null);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            category_id: '',
            is_vegetarian: false,
            is_vegan: false,
            preparation_time: '15'
        });
        setImageFile(null);
        setImagePreview(null);
        setEditingId(null);
    };

    useEffect(() => {
        if (activeTab === 'list') {
            resetForm();
        }
    }, [activeTab]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] shadow-xl flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-black">Menu: {restaurantName}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-black text-3xl">&times;</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('list')}
                        className={`flex-1 py-4 font-semibold text-center transition-colors ${activeTab === 'list'
                            ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        📋 Menu Items ({items.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('add')}
                        className={`flex-1 py-4 font-semibold text-center transition-colors ${activeTab === 'add'
                            ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        {editingId ? '✏️ Edit Item' : '➕ Add New Item'}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {loading && activeTab === 'list' && items.length === 0 ? (
                        <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div></div>
                    ) : activeTab === 'list' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {items.map(item => (
                                <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-4">
                                    <div className="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                        {item.image_url ? (
                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-2xl">🥘</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-lg text-black">{item.name}</h3>
                                            <div className="flex">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-400 hover:text-blue-600 font-bold px-2"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-400 hover:text-red-600 font-bold px-2"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-500 line-clamp-2 mb-2">{item.description}</p>
                                        <div className="flex justify-between items-center mt-auto">
                                            <span className="font-bold text-orange-600">₹{item.price}</span>
                                            <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-black">
                                                {item.categories?.name || 'Uncategorized'}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                            {item.is_vegetarian && <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded border border-green-200">VEG</span>}
                                            {item.is_vegan && <span className="text-[10px] bg-green-50 text-green-800 px-2 py-0.5 rounded border border-green-200">VEGAN</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="col-span-2 text-center py-12 text-gray-500">
                                    No items yet. Switch to "Add New Item" to create one!
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Image Upload */}
                                <div className="flex justify-center mb-6">
                                    <div className="text-center">
                                        <label className="block w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 hover:border-orange-500 cursor-pointer flex flex-col items-center justify-center transition-colors bg-gray-50 overflow-hidden relative">
                                            {imagePreview ? (
                                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <>
                                                    <span className="text-4xl mb-2">📸</span>
                                                    <span className="text-xs text-gray-500">Upload Photo</span>
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={e => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        const file = e.target.files[0];
                                                        setImageFile(file);
                                                        setImagePreview(URL.createObjectURL(file));
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-black mb-1">Item Name</label>
                                        <input
                                            required
                                            className="w-full p-2 border rounded-lg text-black focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g. Butter Chicken"
                                        />
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-black mb-1">Description</label>
                                        <textarea
                                            className="w-full p-2 border rounded-lg text-black focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                            rows={2}
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Describe the dish..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-black mb-1">Price (₹)</label>
                                        <input
                                            required type="number" step="0.01"
                                            className="w-full p-2 border rounded-lg text-black focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-black mb-1">Category</label>
                                        {!isAddingCategory ? (
                                            <div className="flex gap-2">
                                                <select
                                                    className="w-full p-2 border rounded-lg text-black focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                                    value={formData.category_id}
                                                    onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                                                >
                                                    <option value="">Select Category</option>
                                                    {categories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddingCategory(true)}
                                                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg font-bold border border-gray-300"
                                                    title="Create New Category"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <input
                                                    className="w-full p-2 border rounded-lg text-black focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                                    placeholder="New Category Name"
                                                    value={newCategoryName}
                                                    onChange={e => setNewCategoryName(e.target.value)}
                                                    disabled={creatingCategory}
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleCreateCategory}
                                                    disabled={creatingCategory || !newCategoryName.trim()}
                                                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg font-bold disabled:opacity-50"
                                                >
                                                    {creatingCategory ? '...' : '✓'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddingCategory(false)}
                                                    className="bg-red-100 hover:bg-red-200 text-red-600 px-3 py-2 rounded-lg font-bold"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <label className="block text-sm font-semibold text-black">Dietary Type</label>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, is_vegetarian: true })}
                                            className={`flex-1 py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${formData.is_vegetarian
                                                ? 'border-green-500 bg-green-50 text-green-700'
                                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center ${formData.is_vegetarian ? 'border-green-600' : 'border-gray-400'}`}>
                                                <div className={`w-2 h-2 rounded-full ${formData.is_vegetarian ? 'bg-green-600' : 'bg-gray-400'}`} />
                                            </div>
                                            <span className="font-bold">Veg</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, is_vegetarian: false, is_vegan: false })}
                                            className={`flex-1 py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 transition-all ${!formData.is_vegetarian
                                                ? 'border-red-500 bg-red-50 text-red-700'
                                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center ${!formData.is_vegetarian ? 'border-red-600' : 'border-gray-400'}`}>
                                                <div className={`w-2 h-2 rounded-full ${!formData.is_vegetarian ? 'bg-red-600' : 'bg-gray-400'}`} />
                                            </div>
                                            <span className="font-bold">Non-Veg</span>
                                        </button>
                                    </div>

                                    {formData.is_vegetarian && (
                                        <label className="flex items-center gap-2 cursor-pointer mt-2 p-2 rounded-lg hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                                checked={formData.is_vegan}
                                                onChange={e => setFormData({ ...formData, is_vegan: e.target.checked })}
                                            />
                                            <span className="text-sm font-medium text-gray-700">Also Vegan?</span>
                                        </label>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-orange-600 text-white font-bold rounded-xl shadow-md hover:bg-orange-700 transition-colors disabled:opacity-50 mt-4"
                                >
                                    {loading ? 'Saving...' : (editingId ? 'Update Menu Item' : 'Add Menu Item')}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
