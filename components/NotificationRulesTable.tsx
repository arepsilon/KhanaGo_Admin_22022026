'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    Bell, Plus, X, Send, ToggleLeft, ToggleRight,
    ChevronDown, ChevronUp, Clock, Users, Loader2,
    Trash2, Edit2, Zap, History
} from 'lucide-react';

type NotificationRule = {
    id: string;
    name: string;
    description: string | null;
    rule_type: string;
    is_active: boolean;
    title_template: string;
    body_template: string;
    cooldown_hours: number;
    custom_query: string | null;
    created_at: string;
    updated_at: string;
};

type NotificationLogEntry = {
    id: string;
    rule_id: string;
    user_id: string;
    title: string;
    body: string;
    status: string;
    sent_at: string;
};

const RULE_TYPE_LABELS: Record<string, string> = {
    no_order_today: '📱 No Order Today',
    inactive_user: '😴 Lapsed Users',
    post_delivery: '⭐ Post-Delivery Feedback',
    custom_sql: '🎯 Target Specific Users',
};

const RULE_TYPE_DESCRIPTIONS: Record<string, string> = {
    no_order_today: 'Users who logged in today but have not placed an order',
    inactive_user: 'Users who have not ordered in 7+ days',
    post_delivery: 'Users who received a delivery recently but haven\'t rated',
    custom_sql: 'Enter specific user IDs to target (comma-separated UUIDs)',
};

export default function NotificationRulesTable() {
    const supabase = createClient();

    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
    const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
    const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [sendingRuleId, setSendingRuleId] = useState<string | null>(null);
    const [sendResult, setSendResult] = useState<{ ruleId: string; count: number; error?: string } | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        rule_type: 'no_order_today',
        title_template: '',
        body_template: '',
        cooldown_hours: 24,
        custom_query: '',
        is_active: true,
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('notification_rules')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching rules:', error);
        } else {
            setRules(data || []);
        }
        setLoading(false);
    };

    const fetchLogForRule = async (ruleId: string) => {
        setLogLoading(true);
        const { data, error } = await supabase
            .from('notification_log')
            .select('*')
            .eq('rule_id', ruleId)
            .order('sent_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching logs:', error);
        } else {
            // Fetch user names for log entries
            if (data && data.length > 0) {
                const userIds = [...new Set(data.map(l => l.user_id))];
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', userIds);
                const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
                const enriched = data.map(l => ({ ...l, user_name: nameMap.get(l.user_id) || l.user_id.slice(0, 8) + '...' }));
                setLogEntries(enriched);
            } else {
                setLogEntries([]);
            }
        }
        setLogLoading(false);
    };

    const toggleExpand = (ruleId: string) => {
        if (expandedRuleId === ruleId) {
            setExpandedRuleId(null);
        } else {
            setExpandedRuleId(ruleId);
            fetchLogForRule(ruleId);
        }
    };

    const handleToggleActive = async (rule: NotificationRule) => {
        const newStatus = !rule.is_active;
        // Optimistic update
        setRules(rules.map(r => r.id === rule.id ? { ...r, is_active: newStatus } : r));

        const { error } = await supabase
            .from('notification_rules')
            .update({ is_active: newStatus })
            .eq('id', rule.id);

        if (error) {
            console.error('Toggle failed:', error);
            setRules(rules.map(r => r.id === rule.id ? { ...r, is_active: rule.is_active } : r));
            alert('Failed to toggle: ' + error.message);
        }
    };

    const handleSendNow = async (rule: NotificationRule) => {
        if (!confirm(`Send "${rule.name}" notifications now?\n\nThis will find matching users and send them push notifications.`)) return;

        setSendingRuleId(rule.id);
        setSendResult(null);
        try {
            // 1. Find matching users based on rule type
            let targetUserIds: string[] = [];

            if (rule.rule_type === 'no_order_today') {
                // Users with push tokens updated today but no orders today
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayISO = todayStart.toISOString();

                const { data: activeUsers } = await supabase
                    .from('push_tokens')
                    .select('user_id')
                    .eq('app_type', 'customer')
                    .gte('updated_at', todayISO);

                if (activeUsers && activeUsers.length > 0) {
                    const userIds = [...new Set(activeUsers.map(u => u.user_id))];

                    const { data: ordersToday } = await supabase
                        .from('orders')
                        .select('customer_id')
                        .gte('created_at', todayISO);

                    const usersWithOrders = new Set((ordersToday || []).map(o => o.customer_id));
                    targetUserIds = userIds.filter(id => !usersWithOrders.has(id));
                }

            } else if (rule.rule_type === 'inactive_user') {
                // Users whose last order was 7+ days ago
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const { data: allCustomerTokens } = await supabase
                    .from('push_tokens')
                    .select('user_id')
                    .eq('app_type', 'customer');

                if (allCustomerTokens && allCustomerTokens.length > 0) {
                    const userIds = [...new Set(allCustomerTokens.map(u => u.user_id))];

                    const { data: recentOrders } = await supabase
                        .from('orders')
                        .select('customer_id')
                        .gte('created_at', sevenDaysAgo.toISOString());

                    const recentOrderUsers = new Set((recentOrders || []).map(o => o.customer_id));
                    targetUserIds = userIds.filter(id => !recentOrderUsers.has(id));
                }

            } else if (rule.rule_type === 'post_delivery') {
                // Users with delivered orders in last 2 hours without a rating
                const twoHoursAgo = new Date();
                twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

                const { data: deliveredOrders } = await supabase
                    .from('orders')
                    .select('customer_id')
                    .eq('status', 'delivered')
                    .gte('updated_at', twoHoursAgo.toISOString())
                    .is('rating', null);

                if (deliveredOrders) {
                    targetUserIds = [...new Set(deliveredOrders.map(o => o.customer_id))];
                }

            } else if (rule.rule_type === 'custom_sql') {
                // Parse user IDs from custom_query field (comma-separated UUIDs)
                if (!rule.custom_query || rule.custom_query.trim() === '') {
                    alert('No user IDs specified. Edit this rule and add user IDs in the Target Users field.');
                    setSendingRuleId(null);
                    return;
                }
                targetUserIds = rule.custom_query
                    .split(',')
                    .map(id => id.trim())
                    .filter(id => id.length > 0);
            }

            // 2. Filter by cooldown
            if (targetUserIds.length > 0 && rule.cooldown_hours > 0) {
                const cooldownSince = new Date();
                cooldownSince.setHours(cooldownSince.getHours() - rule.cooldown_hours);

                const { data: recentlySent } = await supabase
                    .from('notification_log')
                    .select('user_id')
                    .eq('rule_id', rule.id)
                    .gte('sent_at', cooldownSince.toISOString());

                const sentUserIds = new Set((recentlySent || []).map(l => l.user_id));
                targetUserIds = targetUserIds.filter(id => !sentUserIds.has(id));
            }

            if (targetUserIds.length === 0) {
                setSendResult({ ruleId: rule.id, count: 0 });
                setSendingRuleId(null);
                return;
            }

            // 3. Fetch push tokens for target users (customer app only, latest per user)
            const { data: tokens } = await supabase
                .from('push_tokens')
                .select('user_id, token')
                .eq('app_type', 'customer')
                .in('user_id', targetUserIds)
                .order('updated_at', { ascending: false });

            if (!tokens || tokens.length === 0) {
                setSendResult({ ruleId: rule.id, count: 0, error: 'No push tokens found. Make sure the targeted users have the customer app installed with notifications enabled.' });
                setSendingRuleId(null);
                return;
            }

            // 4. Keep only the latest token per user (one notification per person)
            const latestTokenPerUser = Array.from(
                new Map(tokens.map(t => [t.user_id, t])).values()
            );

            // 5. Fetch user names for personalization
            const userIdsForNames = latestTokenPerUser.map(t => t.user_id);
            const { data: userProfiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', userIdsForNames);
            const nameMap = new Map((userProfiles || []).map(p => [p.id, p.full_name || 'there']));

            // 6. Build notifications with {name} replaced
            const notifications = latestTokenPerUser.map(t => {
                const userName = nameMap.get(t.user_id) || 'there';
                return {
                    to: t.token,
                    title: rule.title_template.replace(/{name}/gi, userName),
                    body: rule.body_template.replace(/{name}/gi, userName),
                    sound: 'default',
                    data: { type: 'marketing', rule_id: rule.id },
                };
            });

            // Send via server-side API route (avoids CORS)
            const response = await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifications }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to send');
            console.log('Push result:', result);
            const sentCount = result.count || notifications.length;

            // 5. Log sent notifications
            const logEntries = [...new Set(tokens.map(t => t.user_id))].map(userId => ({
                rule_id: rule.id,
                user_id: userId,
                title: rule.title_template,
                body: rule.body_template,
                status: 'sent',
            }));

            await supabase.from('notification_log').insert(logEntries);

            setSendResult({ ruleId: rule.id, count: sentCount });
            if (expandedRuleId === rule.id) {
                fetchLogForRule(rule.id);
            }

        } catch (error: any) {
            console.error('Send failed:', error);
            setSendResult({ ruleId: rule.id, count: 0, error: error.message });
        } finally {
            setSendingRuleId(null);
        }
    };

    const handleSaveRule = async (e: React.FormEvent) => {
        e.preventDefault();

        const payload = {
            name: formData.name,
            description: formData.description || null,
            rule_type: formData.rule_type,
            title_template: formData.title_template,
            body_template: formData.body_template,
            cooldown_hours: formData.cooldown_hours,
            custom_query: formData.rule_type === 'custom_sql' ? formData.custom_query : null,
            is_active: formData.is_active,
        };

        try {
            if (editingRule) {
                const { error } = await supabase
                    .from('notification_rules')
                    .update(payload)
                    .eq('id', editingRule.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('notification_rules')
                    .insert(payload);
                if (error) throw error;
            }

            setShowAddModal(false);
            setEditingRule(null);
            resetForm();
            fetchRules();
        } catch (error: any) {
            alert('Error saving rule: ' + error.message);
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!confirm('Delete this notification rule? This will also delete all logs.')) return;

        const { error } = await supabase
            .from('notification_rules')
            .delete()
            .eq('id', ruleId);

        if (error) {
            alert('Error deleting: ' + error.message);
        } else {
            fetchRules();
        }
    };

    const openEditModal = (rule: NotificationRule) => {
        setEditingRule(rule);
        setFormData({
            name: rule.name,
            description: rule.description || '',
            rule_type: rule.rule_type,
            title_template: rule.title_template,
            body_template: rule.body_template,
            cooldown_hours: rule.cooldown_hours,
            custom_query: rule.custom_query || '',
            is_active: rule.is_active,
        });
        setShowAddModal(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            rule_type: 'no_order_today',
            title_template: '',
            body_template: '',
            cooldown_hours: 24,
            custom_query: '',
            is_active: true,
        });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notification Rules</h1>
                    <p className="text-black mt-1 text-sm">Send targeted push notifications to customers</p>
                </div>
                <button
                    onClick={() => { resetForm(); setEditingRule(null); setShowAddModal(true); }}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition-colors flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Add Rule
                </button>
            </div>

            {/* Rules List */}
            {rules.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-600 mb-2">No Notification Rules Yet</h3>
                    <p className="text-slate-400 mb-6">Create your first rule to start sending targeted notifications</p>
                    <button
                        onClick={() => { resetForm(); setShowAddModal(true); }}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg font-medium"
                    >
                        Create First Rule
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {rules.map(rule => (
                        <div key={rule.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Rule Header */}
                            <div className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-lg font-bold text-slate-800 truncate">{rule.name}</h3>
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 whitespace-nowrap">
                                                {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
                                            </span>
                                        </div>
                                        <p className="text-sm text-black">{rule.description || RULE_TYPE_DESCRIPTIONS[rule.rule_type]}</p>

                                        {/* Preview */}
                                        <div className="mt-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            <p className="text-sm font-semibold text-slate-700">{rule.title_template}</p>
                                            <p className="text-sm text-black mt-0.5">{rule.body_template}</p>
                                        </div>

                                        <div className="flex items-center gap-4 mt-3 text-xs text-black">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Cooldown: {rule.cooldown_hours}h
                                            </span>
                                            <span>Created: {formatDate(rule.created_at)}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {/* Toggle */}
                                        <button
                                            onClick={() => handleToggleActive(rule)}
                                            className={`p-2 rounded-lg transition-colors ${rule.is_active ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-slate-400 bg-slate-50 hover:bg-slate-100'}`}
                                            title={rule.is_active ? 'Active (click to disable)' : 'Inactive (click to enable)'}
                                        >
                                            {rule.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                        </button>

                                        {/* Send Now */}
                                        <button
                                            onClick={() => handleSendNow(rule)}
                                            disabled={sendingRuleId === rule.id}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
                                        >
                                            {sendingRuleId === rule.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                            {sendingRuleId === rule.id ? 'Sending...' : 'Send Now'}
                                        </button>

                                        {/* Edit */}
                                        <button
                                            onClick={() => openEditModal(rule)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => handleDeleteRule(rule.id)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>

                                        {/* Expand History */}
                                        <button
                                            onClick={() => toggleExpand(rule.id)}
                                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        >
                                            {expandedRuleId === rule.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Send Result Banner */}
                                {sendResult && sendResult.ruleId === rule.id && (
                                    <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${sendResult.error ? 'bg-red-50 text-red-700 border border-red-200' : sendResult.count > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                        {sendResult.error
                                            ? `❌ Failed: ${sendResult.error}`
                                            : sendResult.count > 0
                                                ? `✅ Successfully sent ${sendResult.count} notifications!`
                                                : '⚠️ No matching users found (all within cooldown or no eligible users)'}
                                    </div>
                                )}
                            </div>

                            {/* Expanded History */}
                            {expandedRuleId === rule.id && (
                                <div className="border-t border-slate-100 bg-slate-50 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <History className="w-4 h-4 text-slate-500" />
                                        <h4 className="font-semibold text-slate-700 text-sm">Recent Notification History</h4>
                                    </div>
                                    {logLoading ? (
                                        <div className="flex items-center justify-center py-4">
                                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                        </div>
                                    ) : logEntries.length === 0 ? (
                                        <p className="text-sm text-black py-4 text-center">No notifications sent yet for this rule.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-black text-xs uppercase">
                                                        <th className="pb-2 pr-4">User</th>
                                                        <th className="pb-2 pr-4">Status</th>
                                                        <th className="pb-2">Sent At</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200">
                                                    {logEntries.map(log => (
                                                        <tr key={log.id}>
                                                            <td className="py-2 pr-4 text-sm text-black font-medium">{(log as any).user_name || log.user_id.slice(0, 8) + '...'}</td>
                                                            <td className="py-2 pr-4">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {log.status}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 text-black text-xs">{formatDate(log.sent_at)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                    <div className="bg-white text-black rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">{editingRule ? 'Edit Rule' : 'Create Notification Rule'}</h2>
                            <button onClick={() => { setShowAddModal(false); setEditingRule(null); }} className="text-black hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveRule} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Rule Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="e.g., Lunch Time Reminder"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Description</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="Brief description of what this rule does"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Rule Type <span className="text-red-500">*</span></label>
                                <select
                                    value={formData.rule_type}
                                    onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                                >
                                    {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-black mt-1">{RULE_TYPE_DESCRIPTIONS[formData.rule_type]}</p>
                            </div>

                            {formData.rule_type === 'custom_sql' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-black">Target User IDs</label>
                                    <textarea
                                        value={formData.custom_query}
                                        onChange={(e) => setFormData({ ...formData, custom_query: e.target.value })}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                                        rows={3}
                                        placeholder="Paste user UUIDs here, separated by commas. e.g.:
a1b2c3d4-e5f6-7890-abcd-ef1234567890,
b2c3d4e5-f6a7-8901-bcde-f12345678901"
                                    />
                                    <p className="text-xs text-black mt-1">Enter one or more user UUIDs, separated by commas. Find your user ID in the Supabase Users table.</p>
                                </div>
                            )}

                            <div className="border-t pt-4">
                                <p className="text-sm font-semibold text-black mb-3">📱 Notification Content</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Title <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title_template}
                                    onChange={(e) => setFormData({ ...formData, title_template: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    placeholder="🍽️ Hey {name}, we're here for you!"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Body <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    value={formData.body_template}
                                    onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                    rows={3}
                                    placeholder="{name}, browse our restaurants and treat yourself!"
                                />
                                <p className="text-xs text-black mt-1">💡 Use <strong>{'{name}'}</strong> to personalize with the customer's name</p>
                            </div>

                            {/* Preview */}
                            {formData.title_template && (
                                <div className="bg-slate-800 text-white rounded-xl p-4 shadow-lg">
                                    <p className="text-xs text-slate-400 mb-2">📱 Preview</p>
                                    <p className="font-semibold text-sm">{formData.title_template}</p>
                                    <p className="text-sm text-slate-300 mt-1">{formData.body_template}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1 text-black">Cooldown (hours)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.cooldown_hours}
                                    onChange={(e) => setFormData({ ...formData, cooldown_hours: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                                <p className="text-xs text-black mt-1">Minimum hours between re-sends to the same user</p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowAddModal(false); setEditingRule(null); }}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-bold transition-colors"
                                >
                                    {editingRule ? 'Update Rule' : 'Create Rule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
