'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Minus, Trash2, Search, Save, AlertCircle } from 'lucide-react';

interface EditOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    order: any;
}

export default function EditOrderModal({ isOpen, onClose, onSuccess, order }: EditOrderModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [editedItems, setEditedItems] = useState<any[]>([]);

    // Fee settings
    const [fees, setFees] = useState({
        baseDelivery: 30,
        perKm: 10,
        platform: 5
    });

    useEffect(() => {
        if (isOpen && order) {
            setEditedItems(order.order_items.map((item: any) => ({
                id: item.id,
                menu_item_id: item.menu_item_id,
                name: item.menu_item?.name,
                price: item.unit_price,
                quantity: item.quantity,
                subtotal: item.subtotal
            })));
            fetchMenu();
            fetchFees();
        }
    }, [isOpen, order]);

    const fetchMenu = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', order.restaurant_id)
            .eq('is_available', true);
        if (data) setMenuItems(data);
        setLoading(false);
    };

    const fetchFees = async () => {
        const { data } = await supabase
            .from('app_settings')
            .select('key, value');
        if (data) {
            const newFees = { ...fees };
            data.forEach((s: any) => {
                if (s.key === 'base_delivery_fee') newFees.baseDelivery = Number(s.value);
                if (s.key === 'per_km_fee') newFees.perKm = Number(s.value);
                if (s.key === 'platform_fee') newFees.platform = Number(s.value);
            });
            setFees(newFees);
        }
    };

    const updateQuantity = (menuItemId: string, delta: number) => {
        setEditedItems(prev => prev.map(item => {
            if (item.menu_item_id === menuItemId) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty, subtotal: newQty * item.price };
            }
            return item;
        }));
    };

    const removeItem = (menuItemId: string) => {
        setEditedItems(prev => prev.filter(item => item.menu_item_id !== menuItemId));
    };

    const addItem = (menuItem: any) => {
        const existing = editedItems.find(i => i.menu_item_id === menuItem.id);
        if (existing) {
            updateQuantity(menuItem.id, 1);
        } else {
            setEditedItems(prev => [...prev, {
                menu_item_id: menuItem.id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: 1,
                subtotal: menuItem.price
            }]);
        }
    };

    // Recalculate Totals
    const subtotal = editedItems.reduce((sum, i) => sum + i.subtotal, 0);

    // For now, I'll keep the delivery fee from the order unless items are empty.
    const deliveryFee = subtotal > 0 ? order.delivery_fee : 0;
    const platformFee = subtotal > 0 ? order.platform_fee : 0;

    // Keep the original discount_amount
    const discountAmount = order.discount_amount || 0;

    const finalTotal = subtotal + deliveryFee + platformFee - discountAmount;

    const handleSave = async () => {
        if (editedItems.length === 0) {
            alert('Cannot save an empty order. Please cancel the order instead.');
            return;
        }

        setSaving(true);
        try {
            // 1. Delete existing items
            await supabase.from('order_items').delete().eq('order_id', order.id);

            // 2. Insert new items
            const newOrderItems = editedItems.map(item => ({
                order_id: order.id,
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                unit_price: item.price,
                subtotal: item.subtotal
            }));

            const { error: itemsError } = await supabase.from('order_items').insert(newOrderItems);
            if (itemsError) throw itemsError;

            // 3. Update order totals
            const { error: orderError } = await supabase
                .from('orders')
                .update({
                    subtotal: subtotal,
                    discount_amount: discountAmount,
                    total: finalTotal
                })
                .eq('id', order.id);

            if (orderError) throw orderError;

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving order:', error);
            alert('Failed to save order changes.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const filteredMenu = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !editedItems.some(ei => ei.menu_item_id === item.id)
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Edit Order #{order.order_number}</h2>
                        <p className="text-sm text-slate-500">{order.restaurant?.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Left: Current Items */}
                    <div className="flex-1 p-6 overflow-y-auto border-r border-slate-100 bg-white">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Current Items</h3>
                        <div className="space-y-3">
                            {editedItems.map((item) => (
                                <div key={item.menu_item_id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                                    <div className="flex-1 mr-4">
                                        <p className="font-bold text-slate-900">{item.name}</p>
                                        <p className="text-sm text-slate-500">₹{item.price} per unit</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                            <button
                                                onClick={() => updateQuantity(item.menu_item_id, -1)}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-orange-500 transition-colors"
                                            >
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-8 text-center font-bold text-slate-900">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.menu_item_id, 1)}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-orange-500 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="text-right w-20">
                                            <p className="font-extrabold text-slate-900">₹{item.subtotal}</p>
                                        </div>
                                        <button
                                            onClick={() => removeItem(item.menu_item_id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Remove Item"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Add Items */}
                    <div className="w-full md:w-80 bg-slate-50/50 p-6 overflow-y-auto flex flex-col">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Add More Items</h3>

                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search menu..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all shadow-sm"
                            />
                        </div>

                        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                            {loading ? (
                                <div className="flex justify-center p-4">
                                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : filteredMenu.length > 0 ? (
                                filteredMenu.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => addItem(item)}
                                        className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-orange-200 hover:bg-orange-50 transition-all group shadow-sm text-left"
                                    >
                                        <div className="flex-1 mr-2">
                                            <p className="font-bold text-slate-800 text-sm group-hover:text-orange-600 transition-colors">{item.name}</p>
                                            <p className="text-xs text-slate-500 font-medium">₹{item.price}</p>
                                        </div>
                                        <div className="p-1.5 bg-slate-50 text-slate-400 rounded-lg group-hover:bg-orange-500 group-hover:text-white transition-all">
                                            <Plus className="w-4 h-4" />
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <p className="text-center text-slate-400 text-sm py-4 italic">No matching items found</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer: Summary & Actions */}
                <div className="p-6 bg-slate-900 border-t border-slate-800">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                        <div className="w-full md:w-64 space-y-1.5">
                            <div className="flex justify-between text-sm text-slate-400 font-medium">
                                <span>Subtotal</span>
                                <span>₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-400 font-medium">
                                <span>Delivery Fee</span>
                                <span>₹{deliveryFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-400 font-medium">
                                <span>Platform Fee</span>
                                <span>₹{platformFee.toFixed(2)}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-sm text-emerald-400 font-bold">
                                    <span>Discount</span>
                                    <span>-₹{discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-black text-white pt-2 border-t border-slate-800 mt-2">
                                <span>Grand Total</span>
                                <span>₹{finalTotal.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="flex gap-4 w-full md:w-auto">
                            <button
                                onClick={onClose}
                                className="flex-1 md:flex-none px-6 py-3 border border-slate-700 text-slate-400 font-bold rounded-xl hover:bg-slate-800 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 md:flex-none px-8 py-3 bg-orange-600 text-white font-black rounded-xl hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    {editedItems.length > 0 && subtotal === 0 && (
                        <div className="mt-4 p-3 bg-amber-900/40 border border-amber-800 rounded-xl flex items-center gap-3 text-amber-200">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p className="text-xs font-medium">Warning: The order total is ₹0. Please double-check if this is intentional.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
