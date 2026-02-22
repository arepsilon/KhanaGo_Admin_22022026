'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { X, Save, GripVertical } from 'lucide-react';

interface Restaurant {
    id: string;
    name: string;
    image_url: string | null;
    is_active: boolean;
    sort_order: number;
}

interface RestaurantReorderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RestaurantReorderModal({ isOpen, onClose, onSuccess }: RestaurantReorderModalProps) {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        if (isOpen) {
            fetchRestaurants();
        }
    }, [isOpen]);

    const fetchRestaurants = async () => {
        setLoading(true);
        // Only fetch active restaurants for sorting, or maybe all? 
        // Typically only active ones matter for the customer app main list.
        // But let's fetch all and show them, maybe visually distinguish inactive.
        const { data, error } = await supabase
            .from('restaurants')
            .select('id, name, image_url, is_active, sort_order')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('Error fetching restaurants:', error);
        } else {
            setRestaurants(data || []);
        }
        setLoading(false);
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(restaurants);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        setRestaurants(items);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Create updates array
            const updates = restaurants.map((r, index) => ({
                id: r.id,
                sort_order: index + 1, // 1-based index
                // We must include other non-null fields if we were upserting, 
                // but for update we can just match ID? No, Supabase bulk update is tricky via JS client usually requires UPSERT.
                // However, 'upsert' works if we provide primary key.
                // But we don't want to overwrite other fields if they changed in background.
                // Ideally, we make a stored procedure or just loop updates (slower but safe for small list).
                // Given typical restaurant count (< 100), loop is fine, or Promise.all.
            }));

            // Using Promise.all for parallel updates 
            // Optimally: create an RPC or use upsert with minimal fields if table constraint allows partial update (it doesn't naturally for upsert).
            // Actually, we can just cycle through them.

            const promises = updates.map(u =>
                supabase.from('restaurants').update({ sort_order: u.sort_order }).eq('id', u.id)
            );

            await Promise.all(promises);

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving sort order:', error);
            alert('Failed to save order.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Reorder Restaurants</h2>
                        <p className="text-sm text-gray-500">Drag to change display order</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {loading ? (
                        <div className="text-center py-10">Loading...</div>
                    ) : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="restaurants">
                                {(provided: any) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-3"
                                    >
                                        {restaurants.map((restaurant, index) => (
                                            <Draggable key={restaurant.id} draggableId={restaurant.id} index={index}>
                                                {(provided: any, snapshot: any) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}

                                                        className={`bg-white p-4 rounded-xl border flex items-center gap-4 transition-all ${snapshot.isDragging ? 'shadow-lg ring-2 ring-orange-500 border-transparent z-50 scale-105' : 'border-gray-200 shadow-sm hover:border-gray-300'
                                                            }`}
                                                        style={provided.draggableProps.style}
                                                    >
                                                        <div className="text-gray-400 cursor-grab active:cursor-grabbing">
                                                            <GripVertical size={20} />
                                                        </div>
                                                        <div className="flex-1 flex items-center gap-3">
                                                            {restaurant.image_url ? (
                                                                <img src={restaurant.image_url} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-100" />
                                                            ) : (
                                                                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                                                                    {restaurant.name.substring(0, 1)}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <h4 className="font-semibold text-gray-900">{restaurant.name}</h4>
                                                                {!restaurant.is_active && (
                                                                    <span className="text-xs text-red-500 font-medium">Inactive</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-sm font-mono font-bold text-gray-300">
                                                            #{index + 1}
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-white rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition-colors"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Save Order
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
