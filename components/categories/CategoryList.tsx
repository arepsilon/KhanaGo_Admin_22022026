'use client';

import { useState } from 'react';
import { Pencil, Trash2, MoreVertical, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

interface Category {
    id: string;
    name: string;
    image_url?: string;
    sort_order: number;
    created_at: string;
}

interface CategoryListProps {
    categories: Category[];
    onEdit: (category: Category) => void;
    onRefresh: () => void;
}

export default function CategoryList({ categories, onEdit, onRefresh }: CategoryListProps) {
    const supabase = createClient();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this category?')) return;

        setDeletingId(id);
        try {
            const { error } = await supabase
                .from('categories')
                .delete()
                .eq('id', id);

            if (error) throw error;
            onRefresh();
        } catch (error) {
            console.error('Error deleting category:', error);
            alert('Failed to delete category');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                        <tr>
                            <th className="px-6 py-4">Image</th>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Sort Order</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {categories.map((category) => (
                            <tr key={category.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 relative overflow-hidden flex items-center justify-center">
                                        {category.image_url ? (
                                            <Image
                                                src={category.image_url}
                                                alt={category.name}
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <ImageIcon size={20} className="text-slate-400" />
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-900">
                                    {category.name}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                                        {category.sort_order}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(category)}
                                            className="p-2 hover:bg-orange-50 text-slate-400 hover:text-orange-500 rounded-lg transition-colors"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(category.id)}
                                            disabled={deletingId === category.id}
                                            className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {categories.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    No categories found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
