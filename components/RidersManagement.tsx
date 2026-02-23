'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

export default function RidersManagement() {
    const [riders, setRiders] = useState<any[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({ full_name: '', phone: '' });
    const [loading, setLoading] = useState(false);
    const [createdRider, setCreatedRider] = useState<any>(null);
    const supabase = createClient();

    // Reset Password State
    const [resetRiderId, setResetRiderId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Bank Details Edit State
    const [editingBankRider, setEditingBankRider] = useState<any | null>(null);
    const [bankDetails, setBankDetails] = useState({
        bank_account_number: '',
        bank_ifsc_code: '',
        bank_account_name: ''
    });
    const [bankLoading, setBankLoading] = useState(false);

    useEffect(() => {
        fetchRiders();
    }, []);

    const fetchRiders = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'rider')
            .order('created_at', { ascending: false });

        const { data: statusData } = await supabase
            .from('rider_live_status')
            .select('*');

        const ridersWithStatus = (data || []).map(rider => {
            const status = statusData?.find(s => s.rider_id === rider.id);
            return {
                ...rider,
                is_online: status?.is_online || false,
                last_updated: status?.last_updated
            };
        });

        setRiders(ridersWithStatus);
    };

    const toggleRiderStatus = async (riderId: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;

        // Optimistic update
        setRiders(riders.map(r =>
            r.id === riderId
                ? { ...r, is_online: newStatus, last_updated: new Date().toISOString() }
                : r
        ));

        try {
            // Use upsert to handle both insert and update cases atomically
            const { error } = await supabase
                .from('rider_live_status')
                .upsert({
                    rider_id: riderId,
                    is_online: newStatus,
                    last_updated: new Date()
                }, {
                    onConflict: 'rider_id'
                });

            if (error) throw error;

        } catch (error: any) {
            console.error('Error toggling status:', error);
            alert('Failed to update status: ' + error.message);
            // Revert on error
            setRiders(riders.map(r =>
                r.id === riderId
                    ? { ...r, is_online: currentStatus } // Revert to old status
                    : r
            ));
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetRiderId || !newPassword) return;

        setResetLoading(true);
        try {
            const res = await fetch('/api/riders/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: resetRiderId, newPassword }),
            });

            const data = await res.json();
            if (data.success) {
                alert('Password updated successfully!');
                setResetRiderId(null);
                setNewPassword('');
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setResetLoading(false);
        }
    };

    const handleDeleteRider = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this rider? This action cannot be undone.')) return;

        try {
            const res = await fetch('/api/riders/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            const data = await res.json();
            if (data.success) {
                alert('Rider deleted successfully');
                fetchRiders();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error: any) {
            alert('Error: ' + error.message);
        }
    };

    const handleEditBankDetails = (rider: any) => {
        setEditingBankRider(rider);
        setBankDetails({
            bank_account_number: rider.bank_account_number || '',
            bank_ifsc_code: rider.bank_ifsc_code || '',
            bank_account_name: rider.bank_account_name || ''
        });
    };

    const handleSaveBankDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBankRider) return;

        setBankLoading(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    bank_account_number: bankDetails.bank_account_number,
                    bank_ifsc_code: bankDetails.bank_ifsc_code,
                    bank_account_name: bankDetails.bank_account_name
                })
                .eq('id', editingBankRider.id);

            if (error) throw error;

            alert('Bank details updated successfully');
            setEditingBankRider(null);
            fetchRiders();
        } catch (error: any) {
            alert('Error updating bank details: ' + error.message);
        } finally {
            setBankLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setCreatedRider(null);

        try {
            const res = await fetch('/api/riders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                setCreatedRider(data.rider);
                setFormData({ full_name: '', phone: '' });
                fetchRiders();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error: any) {
            alert('Error creating rider: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Riders Management</h1>
                    <p className="text-gray-500 mt-1 text-sm">Manage delivery riders</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Add Rider
                </button>
            </div>

            {/* Riders Table */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank Details</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Login ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username (Email)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {riders.map((rider) => (
                            <tr key={rider.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="font-medium text-gray-900">{rider.full_name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {rider.bank_account_number ? (
                                        <div className="text-gray-600">
                                            <div className="font-bold">{rider.bank_account_number}</div>
                                            <div className="text-[10px]">{rider.bank_ifsc_code}</div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 italic">Not set</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                        {rider.email ? rider.email.split('@')[0] : 'N/A'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {rider.email || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {rider.phone || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-1">
                                        <button
                                            onClick={() => toggleRiderStatus(rider.id, rider.is_online)}
                                            className={`flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${rider.is_online
                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                : 'bg-gray-100 text-gray-600 border-gray-200'
                                                }`}
                                            title="Click to toggle status"
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full ${rider.is_online ? 'bg-green-600' : 'bg-gray-400'}`}></div>
                                            {rider.is_online ? 'Online' : 'Offline'}
                                        </button>
                                        {rider.last_updated && (
                                            <span className="text-[10px] text-gray-400 pl-1">
                                                {new Date(rider.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEditBankDetails(rider)}
                                            className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                                        >
                                            Bank Details
                                        </button>
                                        <button
                                            onClick={() => setResetRiderId(rider.id)}
                                            className="text-orange-600 hover:text-orange-900 bg-orange-50 px-3 py-1 rounded border border-orange-200 hover:bg-orange-100 transition-colors"
                                        >
                                            Reset Password
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRider(rider.id)}
                                            className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded border border-red-200 hover:bg-red-100 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {riders.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No riders yet. Click "+ Add Rider" to create one.
                    </div>
                )}
            </div>

            {/* Reset Password Modal */}
            {resetRiderId && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-sm w-full mx-4 shadow-xl">
                        <h2 className="text-xl font-bold mb-4">Reset Password</h2>
                        <p className="text-sm text-gray-600 mb-4">Enter a new password for this rider.</p>
                        <form onSubmit={handleResetPassword}>
                            <input
                                type="text"
                                required
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 mb-4"
                                placeholder="New Password"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setResetRiderId(null);
                                        setNewPassword('');
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={resetLoading}
                                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded transition-colors"
                                >
                                    {resetLoading ? 'Saving...' : 'Set Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Rider Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">Add New Rider</h2>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setCreatedRider(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Success Message */}
                        {createdRider && (
                            <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-4">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                    <h3 className="text-lg font-bold text-green-800">Rider Created Successfully!</h3>
                                </div>
                                <div className="space-y-2 font-mono text-sm bg-white p-4 rounded border border-green-100 shadow-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Name:</span>
                                        <span className="font-bold">{createdRider.full_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Rider ID:</span>
                                        <span className="font-bold">{createdRider.riderId}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Email:</span>
                                        <span className="font-bold">{createdRider.email}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Password:</span>
                                        <span className="font-bold text-red-600">{createdRider.password}</span>
                                    </div>
                                    {createdRider.phone && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Phone:</span>
                                            <span className="font-bold">{createdRider.phone}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded flex gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                    <p className="text-sm text-amber-800">
                                        <strong>Important:</strong> Save these credentials now! The password won't be shown again.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setCreatedRider(null);
                                    }}
                                    className="mt-4 w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
                                >
                                    Close
                                </button>
                            </div>
                        )}

                        {/* Add Form */}
                        {!createdRider && (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.full_name}
                                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                        placeholder="Enter rider name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Phone Number (Optional)
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                        placeholder="Enter phone number"
                                    />
                                </div>

                                <div className="p-4 bg-blue-50 rounded-lg">
                                    <p className="text-sm text-blue-800">
                                        <strong>Auto-Generation:</strong>
                                    </p>
                                    <ul className="list-disc list-inside text-sm text-blue-700 mt-2 space-y-1">
                                        <li>Unique Rider ID (email) will be generated</li>
                                        <li>Secure random password will be created</li>
                                        <li>Credentials shown only once after creation</li>
                                    </ul>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 disabled:opacity-50"
                                    >
                                        {loading ? 'Creating...' : 'Create Rider'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Bank Details Modal */}
            {editingBankRider && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Edit Bank Details</h2>
                            <button onClick={() => setEditingBankRider(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">Updating details for <span className="font-bold">{editingBankRider.full_name}</span></p>

                        <form onSubmit={handleSaveBankDetails} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Account Holder Name</label>
                                <input
                                    type="text"
                                    value={bankDetails.bank_account_name}
                                    onChange={(e) => setBankDetails({ ...bankDetails, bank_account_name: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="Enter bank account name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Account Number</label>
                                <input
                                    type="text"
                                    value={bankDetails.bank_account_number}
                                    onChange={(e) => setBankDetails({ ...bankDetails, bank_account_number: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="Enter account number"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">IFSC Code</label>
                                <input
                                    type="text"
                                    value={bankDetails.bank_ifsc_code}
                                    onChange={(e) => setBankDetails({ ...bankDetails, bank_ifsc_code: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="Enter IFSC code"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingBankRider(null)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={bankLoading}
                                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-bold transition-colors disabled:opacity-50"
                                >
                                    {bankLoading ? 'Saving...' : 'Save Details'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
