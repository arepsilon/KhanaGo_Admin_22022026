'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function UsersTable() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async (query?: string) => {
        if (query) setSearching(true);
        else setLoading(true);

        let q = supabase
            .from('profiles')
            .select(`*, orders(count)`)
            .eq('role', 'customer')
            .order('created_at', { ascending: false });

        if (query) {
            q = q.or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`);
        } else {
            q = q.limit(100);
        }

        const { data, error } = await q;

        if (error) {
            console.error('Error fetching users:', error);
        } else {
            setUsers(data || []);
        }
        setLoading(false);
        setSearching(false);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchUsers(searchQuery.trim() || undefined);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        fetchUsers();
    };

    const handleToggleTesterStatus = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_tester: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchUsers();
        } catch (error: any) {
            console.error('Error updating tester status:', error.message);
            alert('Failed to update tester status');
        }
    };

    const handleToggleDefaulterStatus = async (id: string, currentStatus: boolean) => {
        const action = currentStatus ? 'remove defaulter flag from' : 'mark as defaulter';
        if (!confirm(`Are you sure you want to ${action} this user?`)) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_defaulter: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            fetchUsers();
        } catch (error: any) {
            console.error('Error updating defaulter status:', error.message);
            alert('Failed to update defaulter status');
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-gray-200 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Customer Users</h2>
                    <div className="text-sm text-gray-600">
                        {searchQuery ? 'Search results: ' : 'Showing latest '}
                        <span className="font-bold text-gray-900">{users.length}</span> users
                    </div>
                </div>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or phone..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                        type="submit"
                        disabled={searching}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                        {searching ? 'Searching...' : 'Search'}
                    </button>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </form>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tester Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Defaulter</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Orders</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold">
                                                {user.full_name?.charAt(0).toUpperCase() || 'U'}
                                            </div>
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{user.full_name || 'Unknown'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{user.phone || '-'}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                        onClick={() => handleToggleTesterStatus(user.id, user.is_tester)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${user.is_tester
                                            ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                            }`}
                                    >
                                        {user.is_tester ? '🧪 Tester' : 'Customer'}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                        onClick={() => handleToggleDefaulterStatus(user.id, user.is_defaulter)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${user.is_defaulter
                                            ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                            }`}
                                    >
                                        {user.is_defaulter ? 'Defaulter' : 'Clear'}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-bold text-gray-900">
                                        {user.orders?.[0]?.count || 0} orders
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(user.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {users.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No users found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
