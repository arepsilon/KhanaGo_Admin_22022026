'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Loader2, Plus, Trash2, Receipt, ChevronDown, ChevronUp, Tag,
} from 'lucide-react';

interface DateRange {
    start: string;
    end: string;
}

interface OverheadExpense {
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    category: string;
    notes?: string;
    created_at: string;
}

const CATEGORIES = [
    'Salaries',
    'Rent & Utilities',
    'Marketing',
    'Technology',
    'Logistics',
    'Legal & Compliance',
    'Miscellaneous',
];

const CATEGORY_COLORS: Record<string, string> = {
    'Salaries':           'bg-blue-100 text-blue-700',
    'Rent & Utilities':   'bg-purple-100 text-purple-700',
    'Marketing':          'bg-pink-100 text-pink-700',
    'Technology':         'bg-cyan-100 text-cyan-700',
    'Logistics':          'bg-amber-100 text-amber-700',
    'Legal & Compliance': 'bg-rose-100 text-rose-700',
    'Miscellaneous':      'bg-slate-100 text-slate-700',
};

export default function ReconciliationOverheadTab({ dateRange }: { dateRange: DateRange }) {
    const supabase = createClient();

    const [expenses, setExpenses]       = useState<OverheadExpense[]>([]);
    const [loading, setLoading]         = useState(true);
    const [saving, setSaving]           = useState(false);
    const [showForm, setShowForm]       = useState(false);
    const [deletingId, setDeletingId]   = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState({
        description:  '',
        amount:       '',
        expense_date: dateRange.start,
        category:     'Miscellaneous',
        notes:        '',
    });

    useEffect(() => { fetchExpenses(); }, [dateRange]);

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('overhead_expenses')
                .select('*')
                .gte('expense_date', dateRange.start)
                .lte('expense_date', dateRange.end)
                .order('expense_date', { ascending: false });

            if (error) throw error;
            setExpenses(data ?? []);
        } catch (err) {
            console.error('Error fetching overhead expenses:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.description.trim() || !form.amount || !form.expense_date) return;
        const amount = parseFloat(form.amount);
        if (isNaN(amount) || amount <= 0) return;

        setSaving(true);
        try {
            const { error } = await supabase.from('overhead_expenses').insert({
                description:  form.description.trim(),
                amount,
                expense_date: form.expense_date,
                category:     form.category,
                notes:        form.notes.trim() || null,
            });
            if (error) throw error;

            setForm({ description: '', amount: '', expense_date: dateRange.start, category: 'Miscellaneous', notes: '' });
            setShowForm(false);
            await fetchExpenses();
        } catch (err) {
            console.error('Error saving overhead expense:', err);
            alert('Failed to save expense. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this expense entry?')) return;
        setDeletingId(id);
        try {
            const { error } = await supabase.from('overhead_expenses').delete().eq('id', id);
            if (error) throw error;
            await fetchExpenses();
        } catch (err) {
            console.error('Error deleting overhead expense:', err);
            alert('Failed to delete. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    const totalOverhead = expenses.reduce((s, e) => s + e.amount, 0);

    const fmt = (n: number) =>
        `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const fmtDate = (d: string) =>
        new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    // Group by category for summary
    const byCat: Record<string, number> = {};
    expenses.forEach(e => { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; });

    return (
        <div className="space-y-6">

            {/* Summary card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Overhead — Period</p>
                    <p className="text-3xl font-bold text-red-600">{fmt(totalOverhead)}</p>
                    <p className="text-xs text-slate-400 mt-1">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} recorded</p>
                </div>

                {/* Category breakdown pills */}
                {Object.keys(byCat).length > 0 && (
                    <div className="flex flex-wrap gap-2 flex-1">
                        {Object.entries(byCat).map(([cat, amt]) => (
                            <div key={cat} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-700'}`}>
                                <Tag size={11} />
                                {cat}: {fmt(amt)}
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-all shrink-0"
                >
                    {showForm ? <ChevronUp size={16} /> : <Plus size={16} />}
                    {showForm ? 'Cancel' : 'Add Expense'}
                </button>
            </div>

            {/* Add Expense Form */}
            {showForm && (
                <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Receipt size={16} className="text-orange-500" />
                        New Overhead Expense
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description *</label>
                            <input
                                type="text"
                                placeholder="e.g. Office rent for April"
                                value={form.description}
                                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Amount (₹) *</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                min="0.01"
                                step="0.01"
                                value={form.amount}
                                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date *</label>
                            <input
                                type="date"
                                value={form.expense_date}
                                onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Category</label>
                            <select
                                value={form.category}
                                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Notes (optional)</label>
                            <input
                                type="text"
                                placeholder="Any additional details..."
                                value={form.notes}
                                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving || !form.description.trim() || !form.amount || !form.expense_date}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-all"
                        >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                            Save Expense
                        </button>
                    </div>
                </div>
            )}

            {/* Expenses list */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Receipt size={16} className="text-red-500" />
                    <h3 className="font-bold text-slate-800">Expense Log</h3>
                    <span className="ml-auto text-xs text-slate-400">Period: {fmtDate(dateRange.start)} – {fmtDate(dateRange.end)}</span>
                </div>

                {loading ? (
                    <div className="flex justify-center p-10">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                        <Receipt size={28} className="mb-2 opacity-40" />
                        <p className="text-sm">No overhead expenses recorded in this period.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 border-y border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Description</th>
                                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Notes</th>
                                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Amount</th>
                                <th className="px-4 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {expenses.map((e, idx) => (
                                <tr key={e.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800">{e.description}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[e.category] ?? 'bg-slate-100 text-slate-700'}`}>
                                            {e.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{e.notes || '—'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(e.amount)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => handleDelete(e.id)}
                                            disabled={deletingId === e.id}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                                        >
                                            {deletingId === e.id
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <Trash2 size={14} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-red-50 border-t-2 border-red-100 sticky bottom-0">
                            <tr>
                                <td colSpan={4} className="px-4 py-3 font-bold text-slate-700">Total Overhead</td>
                                <td className="px-4 py-3 text-right font-bold text-red-600 text-base">{fmt(totalOverhead)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
}
