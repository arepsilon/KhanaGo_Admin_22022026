'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import CategoryList from '@/components/categories/CategoryList';
import AddCategoryModal from '@/components/categories/AddCategoryModal';

export default function CategoriesClient() {
    const supabase = createClient();
    const [categories, setCategories] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchCategories = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching categories:', error);
        } else {
            setCategories(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleAdd = () => {
        setSelectedCategory(null);
        setIsEditing(false);
        setIsModalOpen(true);
    };

    const handleEdit = (category: any) => {
        setSelectedCategory(category);
        setIsEditing(true);
        setIsModalOpen(true);
    };

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Categories</h1>
                    <p className="text-slate-500 mt-1">Manage food categories and their display order.</p>
                </div>
                <button
                    onClick={handleAdd}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 group"
                >
                    <Plus size={20} className="group-hover:rotate-90 transition-transform" />
                    <span>Add Category</span>
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                </div>
            ) : (
                <CategoryList
                    categories={categories}
                    onEdit={handleEdit}
                    onRefresh={fetchCategories}
                />
            )}

            <AddCategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchCategories}
                category={selectedCategory}
            />
        </div>
    );
}
