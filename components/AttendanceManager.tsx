'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { createClient } from '@/lib/supabase/client';
import { Clock, CheckCircle2, UserCheck, Search, Loader2 } from 'lucide-react';

interface AttendanceRecord {
    id: string;
    rider_id: string;
    date: string;
    punch_in_time: string;
    punch_out_time: string | null;
    profiles?: {
        full_name: string;
        phone: string;
    };
}

export default function AttendanceManager() {
    const [qrPayload, setQrPayload] = useState('');
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const supabase = createClient();

    // Get today's IST date string 'YYYY-MM-DD'
    const getTodayIST = () => {
        const now = new Date();
        const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
        return new Date(istMs).toISOString().split('T')[0];
    };

    // Rotate QR code every 5 seconds
    useEffect(() => {
        const generatePayload = () => {
            const date = getTodayIST();
            const timestamp = Date.now();
            setQrPayload(`khanago_attendance|${date}|${timestamp}`);
        };

        generatePayload();
        const interval = setInterval(generatePayload, 5000);
        return () => clearInterval(interval);
    }, []);

    // Fetch attendance data and subscribe
    useEffect(() => {
        fetchAttendance();

        const channel = supabase
            .channel('attendance_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'rider_attendance' },
                () => {
                    fetchAttendance();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchAttendance = async () => {
        const today = getTodayIST();
        const { data, error } = await supabase
            .from('rider_attendance')
            .select(`
                id, rider_id, date, punch_in_time, punch_out_time,
                profiles (full_name, phone)
            `)
            .eq('date', today)
            .order('punch_in_time', { ascending: false });

        if (error) {
            console.error('Error fetching attendance:', error);
        } else {
            setAttendance(data as any);
        }
        setLoading(false);
    };

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
        });
    };

    const filtered = attendance.filter(a => {
        const name = a.profiles?.full_name || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* QR Code Section */}
            <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center text-center sticky top-24">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
                        <UserCheck size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Daily Attendance QR</h2>
                    <p className="text-sm text-slate-500 mb-8">
                        Riders must scan this code using their app to punch in and punch out.
                    </p>
                    
                    <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm mb-6">
                        <QRCode
                            value={qrPayload}
                            size={200}
                            level="H"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-4 py-2 rounded-full font-medium">
                        <Clock size={16} className="text-blue-500 animate-pulse" />
                        Code updates automatically
                    </div>
                </div>
            </div>

            {/* Attendance List Section */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Today's Attendance</h2>
                        <p className="text-sm text-slate-500 mt-1">{attendance.length} riders have punched in today</p>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search rider..."
                            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Rider</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Punch In</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Punch Out</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading attendance...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No attendance records found.
                                    </td>
                                </tr>
                            ) : filtered.map(record => (
                                <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-900">{record.profiles?.full_name}</p>
                                        <p className="text-xs text-slate-400">{record.profiles?.phone}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 font-medium text-slate-700">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            {formatTime(record.punch_in_time)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {record.punch_out_time ? (
                                            <div className="flex items-center gap-2 font-medium text-slate-700">
                                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                                {formatTime(record.punch_out_time)}
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {record.punch_out_time ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                                <CheckCircle2 size={12} /> Shift Ended
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                Active
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
