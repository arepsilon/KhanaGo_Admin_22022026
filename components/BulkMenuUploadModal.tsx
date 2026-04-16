'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Papa from 'papaparse';
import { Upload, Download, AlertCircle, CheckCircle, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface BulkMenuUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ParsedItem {
    'Restaurant Name': string;
    'Name': string;
    'Price': string;
    'Category': string;
    'Description'?: string;
    'Veg'?: string; // Yes/No/True/False
    'Vegan'?: string;
    'Prep Time'?: string;
    'Available'?: string;
    'Image URL'?: string;
}

export default function BulkMenuUploadModal({ isOpen, onClose }: BulkMenuUploadModalProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'processing' | 'result'>('upload');
    const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
    const [restaurantsMap, setRestaurantsMap] = useState<Record<string, string>>({}); // Name -> ID
    interface RestaurantResult {
        name: string;
        status: 'Found' | 'Not Found';
        added: number;
        skipped: { name: string; reason: string }[];
        failed: { name: string; reason: string }[];
    }

    const [results, setResults] = useState<Record<string, RestaurantResult>>({});
    const [expandedRes, setExpandedRes] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<ParsedItem>) => {
                if (results.errors.length > 0) {
                    setError(`CSV Parsing Error: ${results.errors[0].message}`);
                    return;
                }
                const items = results.data;
                // Basic validation of required columns
                if (!items[0] || !items[0]['Restaurant Name'] || !items[0]['Name'] || !items[0]['Price']) {
                    setError('Missing required columns: Restaurant Name, Name, Price');
                    return;
                }
                setParsedItems(items);
                setStep('preview');
            },
            error: (err: Error) => {
                setError(`File Error: ${err.message}`);
            }
        });
    };

    const fetchRestaurants = async () => {
        const { data, error } = await supabase.from('restaurants').select('id, name');
        if (error) {
            setError(error.message);
            return null;
        }
        const map: Record<string, string> = {};
        data?.forEach(r => {
            map[r.name.trim().toLowerCase()] = r.id;
        });
        setRestaurantsMap(map);
        return map;
    };

    const processUpload = async () => {
        setStep('processing');
        const map = await fetchRestaurants();
        if (!map) {
            setStep('preview');
            return;
        }

        const currentResults: Record<string, RestaurantResult> = {};

        // Helper to init result
        const getOrCreateResult = (name: string): RestaurantResult => {
            if (!currentResults[name]) {
                currentResults[name] = {
                    name,
                    status: 'Found', // Default, will update if not found in map
                    added: 0,
                    skipped: [],
                    failed: []
                };
            }
            return currentResults[name];
        };

        // 0. Fetch Existing Items to prevent duplicates
        // We need to fetch items for ALL restaurants involved in this upload to be efficient.
        // Or per restaurant. Given the number of items might be small, let's fetch all items for the restaurants in the map.
        const restaurantIds = Object.values(map);
        const { data: existingItemsData } = await supabase
            .from('menu_items')
            .select('restaurant_id, name')
            .in('restaurant_id', restaurantIds);

        const existingSet = new Set<string>();
        existingItemsData?.forEach(item => {
            existingSet.add(`${item.restaurant_id}-${item.name.toLowerCase().trim()}`);
        });

        for (const item of parsedItems) {
            const restName = item['Restaurant Name']?.trim();
            if (!restName) continue;

            const resResult = getOrCreateResult(restName);
            const restaurantId = map[restName.toLowerCase()];

            if (!restaurantId) {
                resResult.status = 'Not Found'; // Update status if not found
                resResult.failed.push({ name: item['Name'], reason: 'Restaurant not found' });
                continue;
            }

            // Check for Duplicate
            const duplicateKey = `${restaurantId}-${item['Name'].trim().toLowerCase()}`;
            if (existingSet.has(duplicateKey)) {
                resResult.skipped.push({ name: item['Name'], reason: 'Duplicate item' });
                continue;
            }

            try {
                // 1. Resolve Category
                let categoryId = null;
                const catName = item['Category']?.trim() || 'General';

                // Check if likely category exists (globally or per restaurant? Schema says categories are global? No, let's check schema... 
                // Wait, based on previous `RestaurantMenuModal`, categories seemed to be fetched generally `from('categories')` without restaurant_id filter?
                // Let's assume categories are global for now based on typical setup or check if they have restaurant_id.
                // Re-reading `RestaurantMenuModal.tsx`: `const { data: catData } = await supabase.from('categories').select('*').order('name');` 
                // It seems categories are GLOBAL. Good.

                const { data: catData } = await supabase.from('categories').select('id').ilike('name', catName).single();

                if (catData) {
                    categoryId = catData.id;
                } else {
                    // Create Category
                    // We need a sort_order.
                    const { data: maxOrder } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
                    const nextOrder = (maxOrder?.sort_order || 0) + 10;

                    const { data: newCat, error: catError } = await supabase.from('categories').insert({ name: catName, sort_order: nextOrder }).select().single();
                    if (catError) throw new Error(`Category creation failed: ${catError.message}`);
                    categoryId = newCat.id;
                }

                // 2. Insert Item
                const price = parseFloat(item['Price'].replace(/[^0-9.]/g, ''));
                const isVeg = ['yes', 'true', '1'].includes(item['Veg']?.toLowerCase() || '');
                const isVegan = ['yes', 'true', '1'].includes(item['Vegan']?.toLowerCase() || '');
                const isAvail = !(['no', 'false', '0'].includes(item['Available']?.toLowerCase() || '')); // Default true

                const { error: insertError } = await supabase.from('menu_items').insert({
                    restaurant_id: restaurantId,
                    name: item['Name'],
                    description: item['Description'] || '',
                    price: isNaN(price) ? 0 : price,
                    category_id: categoryId,
                    is_vegetarian: isVeg,
                    is_vegan: isVegan,
                    preparation_time: parseInt(item['Prep Time'] || '15'),
                    is_available: isAvail,
                    image_url: item['Image URL'] || null
                });

                if (insertError) throw insertError;

                // Add to set so we don't add it again if the CSV has duplicates
                existingSet.add(duplicateKey);
                resResult.added++;

            } catch (err: any) {
                resResult.failed.push({ name: item['Name'], reason: err.message });
            }
        }

        setResults(currentResults);
        setStep('result');
    };

    const downloadTemplate = () => {
        const headers = ['Restaurant Name', 'Name', 'Price', 'Category', 'Description', 'Veg', 'Vegan', 'Prep Time', 'Available', 'Image URL'];
        const sample = ['Burger King,Whopper,250,Burgers,Flame grilled patty,No,No,15,Yes,'];
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...sample].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "menu_bulk_upload_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <h2 className="text-xl font-bold text-slate-900">Bulk Menu Upload</h2>
                    <button onClick={onClose}><X className="text-slate-500 hover:text-black" /></button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {step === 'upload' && (
                        <div className="space-y-6 text-center">
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:border-orange-500 transition-colors">
                                <Upload className="mx-auto h-12 w-12 text-slate-500 mb-4" />
                                <p className="mb-4 text-slate-700">Drag and drop your CSV file here, or click to browse</p>
                                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
                                <label htmlFor="csv-upload" className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold cursor-pointer hover:bg-orange-700">
                                    Select CSV File
                                </label>
                            </div>
                            <button onClick={downloadTemplate} className="text-orange-600 font-bold flex items-center justify-center gap-2 mx-auto hover:underline">
                                <Download size={18} /> Download Template
                            </button>
                            {error && <p className="text-red-500 font-medium bg-red-50 p-3 rounded-lg">{error}</p>}
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold">Preview ({parsedItems.length} items)</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => {
                                            setStep('processing');
                                            const newItems = [...parsedItems];
                                            let filled = 0;

                                            // Process items with missing images
                                            for (let i = 0; i < newItems.length; i++) {
                                                if (!newItems[i]['Image URL']) {
                                                    try {
                                                        const res = await fetch('/api/images/auto-fill', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                query: newItems[i]['Name'],
                                                                itemName: newItems[i]['Name']
                                                            })
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            newItems[i]['Image URL'] = data.url;
                                                            filled++;
                                                        } else {
                                                            console.error('API Error:', data.error);
                                                            // Alert on the first error to help debug
                                                            if (filled === 0 && i === 0) alert(`Auto-fill failed: ${data.error}`);
                                                        }
                                                    } catch (e: any) {
                                                        console.error('Auto-fill error', e);
                                                        alert(`Network/Server Error: ${e.message}`);
                                                    }
                                                }
                                            }
                                            setParsedItems(newItems);
                                            setStep('preview');
                                            alert(`Auto-filled ${filled} images!`);
                                        }}
                                        className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-bold hover:bg-blue-100"
                                    >
                                        🪄 Auto-Fill Images
                                    </button>
                                    <button onClick={() => setStep('upload')} className="text-sm text-slate-600 underline">Change File</button>
                                </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-700 sticky top-0">
                                        <tr>
                                            <th className="p-2">Restaurant</th>
                                            <th className="p-2">Name</th>
                                            <th className="p-2">Price</th>
                                            <th className="p-2">Image</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {parsedItems.slice(0, 50).map((item, i) => (
                                            <tr key={i}>
                                                <td className="p-2 font-medium text-orange-600">{item['Restaurant Name']}</td>
                                                <td className="p-2">{item['Name']}</td>
                                                <td className="p-2">₹{item['Price']}</td>
                                                <td className="p-2 text-xs text-gray-600 truncate max-w-[150px]">
                                                    {item['Image URL'] ? (
                                                        <span className="text-green-600 flex items-center gap-1">
                                                            <CheckCircle size={12} /> Present
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-500 font-medium">Missing</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {parsedItems.length > 50 && <div className="p-2 text-center text-xs text-slate-600">...and {parsedItems.length - 50} more</div>}
                            </div>
                            <button onClick={processUpload} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700">
                                Confirm & Upload
                            </button>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="text-center py-12">
                            <div className="animate-spin h-12 w-12 border-4 border-orange-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <p className="text-lg font-medium animate-pulse text-slate-900">Processing your menu...</p>
                            <p className="text-slate-600 text-sm">Please do not close this window.</p>
                        </div>
                    )}

                    {step === 'result' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                                <h3 className="text-lg font-bold text-slate-900">Upload Completed</h3>
                            </div>

                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-900 border-b">
                                        <tr>
                                            <th className="p-3 text-left">Restaurant</th>
                                            <th className="p-3 text-center">Status</th>
                                            <th className="p-3 text-center text-green-600">Added</th>
                                            <th className="p-3 text-center text-yellow-600">Skipped</th>
                                            <th className="p-3 text-center text-red-600">Failed</th>
                                            <th className="p-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {Object.values(results).map((res) => (
                                            <React.Fragment key={res.name}>
                                                <tr className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 font-medium text-slate-900">{res.name}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${res.status === 'Found' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                            }`}>
                                                            {res.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center font-bold text-green-600">{res.added}</td>
                                                    <td
                                                        className={`p-3 text-center font-bold ${res.skipped.length > 0 ? 'text-yellow-600 cursor-pointer underline decoration-dotted' : 'text-slate-400'}`}
                                                        onClick={() => res.skipped.length > 0 && setExpandedRes(expandedRes === res.name + 'skipped' ? null : res.name + 'skipped')}
                                                    >
                                                        {res.skipped.length}
                                                    </td>
                                                    <td
                                                        className={`p-3 text-center font-bold ${res.failed.length > 0 ? 'text-red-600 cursor-pointer underline decoration-dotted' : 'text-slate-400'}`}
                                                        onClick={() => res.failed.length > 0 && setExpandedRes(expandedRes === res.name + 'failed' ? null : res.name + 'failed')}
                                                    >
                                                        {res.failed.length}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {(res.skipped.length > 0 || res.failed.length > 0) && (
                                                            <button
                                                                onClick={() => {
                                                                    // Toggle priority: Failed > Skipped
                                                                    const key = res.failed.length > 0 ? res.name + 'failed' : res.name + 'skipped';
                                                                    setExpandedRes(expandedRes === key ? null : key);
                                                                }}
                                                                className="text-slate-500 hover:text-slate-700"
                                                            >
                                                                {expandedRes?.startsWith(res.name) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                                {/* Expanded Details Row */}
                                                {expandedRes === res.name + 'skipped' && res.skipped.length > 0 && (
                                                    <tr className="bg-yellow-50">
                                                        <td colSpan={6} className="p-4">
                                                            <h4 className="font-bold text-yellow-800 flex items-center gap-2 mb-2">
                                                                <AlertTriangle size={14} /> Skipped Items ({res.skipped.length})
                                                            </h4>
                                                            <ul className="list-disc list-inside text-xs text-yellow-700 grid grid-cols-2 gap-x-4">
                                                                {res.skipped.map((item, idx) => (
                                                                    <li key={idx}>
                                                                        <span className="font-medium">{item.name}</span>: {item.reason}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                )}
                                                {expandedRes === res.name + 'failed' && res.failed.length > 0 && (
                                                    <tr className="bg-red-50">
                                                        <td colSpan={6} className="p-4">
                                                            <h4 className="font-bold text-red-800 flex items-center gap-2 mb-2">
                                                                <AlertCircle size={14} /> Failed Items ({res.failed.length})
                                                            </h4>
                                                            <ul className="list-disc list-inside text-xs text-red-700 grid grid-cols-2 gap-x-4">
                                                                {res.failed.map((item, idx) => (
                                                                    <li key={idx}>
                                                                        <span className="font-medium">{item.name}</span>: {item.reason}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <button onClick={onClose} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900">
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
