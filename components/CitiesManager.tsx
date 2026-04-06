'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { MapPin, Plus, Edit2, Trash2, CheckCircle, XCircle, Globe, X, Navigation, Hexagon, Map, Undo2 } from 'lucide-react';

const MapBoundaryEditor = dynamic(() => import('./MapBoundaryEditor'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-slate-100">
            <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Loading map...</p>
            </div>
        </div>
    ),
});

interface BoundaryPoint {
    lat: number;
    lng: number;
}

interface City {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_km: number;
    boundary: BoundaryPoint[];
    is_active: boolean;
    created_at: string;
}

const defaultForm = {
    name: '',
    latitude: '',
    longitude: '',
    radius_km: '20',
    is_active: true,
};

export default function CitiesManager() {
    const supabase = createClient();

    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingCity, setEditingCity] = useState<City | null>(null);
    const [formData, setFormData] = useState(defaultForm);
    const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPoint[]>([]);
    const [saving, setSaving] = useState(false);

    // Map editor
    const [showMapEditor, setShowMapEditor] = useState(false);
    const [mapPoints, setMapPoints] = useState<BoundaryPoint[]>([]);

    // Boundary point form
    const [newPointLat, setNewPointLat] = useState('');
    const [newPointLng, setNewPointLng] = useState('');

    useEffect(() => {
        fetchCities();
    }, []);

    const fetchCities = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('cities')
            .select('id, name, latitude, longitude, radius_km, boundary, is_active, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching cities:', error);
        } else {
            setCities(data || []);
        }
        setLoading(false);
    };

    const openAddForm = () => {
        setEditingCity(null);
        setFormData(defaultForm);
        setBoundaryPoints([]);
        setShowForm(true);
    };

    const openEditForm = (city: City) => {
        setEditingCity(city);
        setFormData({
            name: city.name,
            latitude: String(city.latitude),
            longitude: String(city.longitude),
            radius_km: String(city.radius_km),
            is_active: city.is_active,
        });
        setBoundaryPoints(city.boundary || []);
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingCity(null);
        setFormData(defaultForm);
        setBoundaryPoints([]);
    };

    const addBoundaryPoint = () => {
        const lat = parseFloat(newPointLat);
        const lng = parseFloat(newPointLng);
        if (isNaN(lat) || isNaN(lng)) return;
        setBoundaryPoints([...boundaryPoints, { lat, lng }]);
        setNewPointLat('');
        setNewPointLng('');
    };

    const removeBoundaryPoint = (index: number) => {
        setBoundaryPoints(boundaryPoints.filter((_, i) => i !== index));
    };

    const generateBoundaryFromCenter = () => {
        const lat = parseFloat(formData.latitude);
        const lng = parseFloat(formData.longitude);
        const radiusKm = parseFloat(formData.radius_km) || 10;
        if (isNaN(lat) || isNaN(lng)) {
            alert('Set center latitude and longitude first');
            return;
        }

        // Generate 8-point polygon (octagon) from center + radius
        const points: BoundaryPoint[] = [];
        const kmToLat = 1 / 111.32;
        const kmToLng = 1 / (111.32 * Math.cos(lat * Math.PI / 180));

        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) * Math.PI / 180;
            points.push({
                lat: Math.round((lat + radiusKm * kmToLat * Math.sin(angle)) * 1000000) / 1000000,
                lng: Math.round((lng + radiusKm * kmToLng * Math.cos(angle)) * 1000000) / 1000000,
            });
        }

        setBoundaryPoints(points);
    };

    const openMapEditor = () => {
        const lat = parseFloat(formData.latitude);
        const lng = parseFloat(formData.longitude);
        if (isNaN(lat) || isNaN(lng)) {
            alert('Please enter the center latitude and longitude first.');
            return;
        }
        setMapPoints([...boundaryPoints]);
        setShowMapEditor(true);
    };

    const applyMapBoundary = () => {
        setBoundaryPoints(mapPoints);
        setShowMapEditor(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const payload = {
            name: formData.name.trim(),
            latitude: parseFloat(formData.latitude),
            longitude: parseFloat(formData.longitude),
            radius_km: parseFloat(formData.radius_km) || 20,
            boundary: boundaryPoints,
            is_active: formData.is_active,
        };

        try {
            if (editingCity) {
                const { error } = await supabase
                    .from('cities')
                    .update(payload)
                    .eq('id', editingCity.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('cities')
                    .insert(payload);
                if (error) throw error;
            }

            await fetchCities();
            closeForm();
        } catch (error: any) {
            alert('Error saving city: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (city: City) => {
        if (!confirm(`Are you sure you want to delete "${city.name}"? This action cannot be undone.`)) return;

        try {
            const { error } = await supabase
                .from('cities')
                .delete()
                .eq('id', city.id);
            if (error) throw error;
            await fetchCities();
        } catch (error: any) {
            alert('Error deleting city: ' + error.message);
        }
    };

    const handleToggleActive = async (city: City) => {
        setCities(prev =>
            prev.map(c => c.id === city.id ? { ...c, is_active: !c.is_active } : c)
        );

        try {
            const { error } = await supabase
                .from('cities')
                .update({ is_active: !city.is_active })
                .eq('id', city.id);
            if (error) throw error;
        } catch (error: any) {
            setCities(prev =>
                prev.map(c => c.id === city.id ? { ...c, is_active: city.is_active } : c)
            );
            alert('Error toggling city status: ' + error.message);
        }
    };

    return (
        <>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-6 h-6 text-orange-500" />
                        <h1 className="text-2xl font-bold text-slate-900">Cities</h1>
                    </div>
                    <p className="text-slate-500 text-sm">
                        {loading ? 'Loading...' : `${cities.length} ${cities.length === 1 ? 'city' : 'cities'} configured`}
                    </p>
                </div>
                <button
                    onClick={openAddForm}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl shadow-sm font-semibold transition-colors flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add City
                </button>
            </div>

            {/* Loading State */}
            {loading ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-medium">Loading cities...</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {cities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                                <MapPin className="w-7 h-7 text-orange-400" />
                            </div>
                            <h3 className="text-slate-700 font-semibold text-base mb-1">No cities yet</h3>
                            <p className="text-slate-400 text-sm mb-6">Add a city to define delivery zones for KhanaGo.</p>
                            <button
                                onClick={openAddForm}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add First City
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Center</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Boundary</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                                        <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cities.map((city) => (
                                        <tr key={city.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />
                                                    <span className="font-semibold text-slate-900">{city.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-600 font-mono">
                                                    <div>{city.latitude.toFixed(6)}, {city.longitude.toFixed(6)}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {city.boundary && city.boundary.length > 0 ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                        <Hexagon className="w-3 h-3" />
                                                        {city.boundary.length} points
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <Navigation className="w-3 h-3" />
                                                        {city.radius_km} km radius
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {city.is_active ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openEditForm(city)}
                                                        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-orange-600 bg-slate-50 hover:bg-orange-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-orange-200 transition-colors"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleActive(city)}
                                                        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                                                            city.is_active
                                                                ? 'text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                                                : 'text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 border-green-200'
                                                        }`}
                                                    >
                                                        {city.is_active ? (
                                                            <><XCircle className="w-3.5 h-3.5" /> Deactivate</>
                                                        ) : (
                                                            <><CheckCircle className="w-3.5 h-3.5" /> Activate</>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(city)}
                                                        className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Add / Edit Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-orange-500" />
                                <h2 className="text-lg font-bold text-slate-900">
                                    {editingCity ? 'Edit City' : 'Add New City'}
                                </h2>
                            </div>
                            <button
                                onClick={closeForm}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
                            {/* City Name */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-semibold text-slate-900">
                                    City Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                    placeholder="e.g. Hata"
                                />
                            </div>

                            {/* Center Coordinates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-semibold text-slate-900">
                                        Center Latitude <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        step="0.000001"
                                        value={formData.latitude}
                                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                        placeholder="e.g. 26.7467"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-semibold text-slate-900">
                                        Center Longitude <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        step="0.000001"
                                        value={formData.longitude}
                                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                        placeholder="e.g. 83.7440"
                                    />
                                </div>
                            </div>

                            {/* Radius (fallback) */}
                            <div className="space-y-1.5">
                                <label className="block text-sm font-semibold text-slate-900">Service Radius (km)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        value={formData.radius_km}
                                        onChange={(e) => setFormData({ ...formData, radius_km: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                                        placeholder="10"
                                    />
                                    <div className="absolute right-4 top-3.5 text-slate-400 text-sm font-medium pointer-events-none">km</div>
                                </div>
                                <p className="text-xs text-slate-400">Defines the delivery coverage area from the city center. Also used by Auto-generate to create the boundary polygon.</p>
                            </div>

                            {/* Geofence Boundary */}
                            <div className="space-y-3 p-4 rounded-xl border border-blue-200 bg-blue-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Hexagon className="w-4 h-4 text-blue-600" />
                                        <h3 className="font-semibold text-slate-900 text-sm">Geofence Boundary</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={generateBoundaryFromCenter}
                                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold transition-colors border border-slate-200"
                                        >
                                            Auto-generate
                                        </button>
                                        <button
                                            type="button"
                                            onClick={openMapEditor}
                                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5"
                                        >
                                            <Map className="w-3.5 h-3.5" />
                                            Draw on Map
                                        </button>
                                    </div>
                                </div>

                                {boundaryPoints.length === 0 ? (
                                    <p className="text-xs text-blue-700">
                                        No boundary set. Click <strong>Draw on Map</strong> to visually mark the city boundary, or auto-generate an octagon from the center + fallback radius.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {boundaryPoints.map((point, index) => (
                                            <div key={index} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-100">
                                                <span className="text-xs font-bold text-blue-600 w-5">{index + 1}</span>
                                                <span className="text-xs font-mono text-slate-700 flex-1">
                                                    {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeBoundaryPoint(index)}
                                                    className="text-red-400 hover:text-red-600 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Manual add point */}
                                <div className="flex items-end gap-2 pt-1 border-t border-blue-100">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Add point manually — Latitude</label>
                                        <input
                                            type="number"
                                            step="0.000001"
                                            value={newPointLat}
                                            onChange={(e) => setNewPointLat(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                                            placeholder="26.7500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Longitude</label>
                                        <input
                                            type="number"
                                            step="0.000001"
                                            value={newPointLng}
                                            onChange={(e) => setNewPointLng(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                                            placeholder="83.7400"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addBoundaryPoint}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Is Active */}
                            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
                                <div>
                                    <p className="font-semibold text-slate-900 text-sm">Active</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Enable this city for deliveries</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-semibold transition-colors"
                                >
                                    {saving ? 'Saving...' : editingCity ? 'Save Changes' : 'Add City'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Map Boundary Editor Modal */}
            {showMapEditor && (
                <div className="fixed inset-0 bg-black/60 flex flex-col z-[60]">
                    {/* Header */}
                    <div className="bg-white flex items-center justify-between px-5 py-4 shadow-sm flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <Map className="w-5 h-5 text-blue-600" />
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Draw City Boundary</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Click map to add points &nbsp;·&nbsp; Drag a point to move it &nbsp;·&nbsp; Click a point to remove it
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowMapEditor(false)}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Map */}
                    <div className="flex-1 relative">
                        <MapBoundaryEditor
                            center={{
                                lat: parseFloat(formData.latitude),
                                lng: parseFloat(formData.longitude),
                            }}
                            boundaryPoints={mapPoints}
                            onPointsChange={setMapPoints}
                            radiusKm={parseFloat(formData.radius_km) || undefined}
                        />

                        {/* Point count badge */}
                        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-slate-200 pointer-events-none">
                            <p className="text-xs font-semibold text-slate-700">
                                {mapPoints.length === 0
                                    ? 'No points yet — click the map to start'
                                    : mapPoints.length < 3
                                    ? `${mapPoints.length} point${mapPoints.length > 1 ? 's' : ''} — need at least 3`
                                    : `${mapPoints.length} points · polygon ready`}
                            </p>
                        </div>

                        {/* Orange center legend */}
                        <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-slate-200 pointer-events-none">
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow-sm flex-shrink-0" />
                                City center
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-white border-t border-slate-200 px-5 py-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMapPoints(prev => prev.slice(0, -1))}
                                disabled={mapPoints.length === 0}
                                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Undo2 className="w-4 h-4" />
                                Undo
                            </button>
                            <button
                                onClick={() => setMapPoints([])}
                                disabled={mapPoints.length === 0}
                                className="text-sm text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg border border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Clear All
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowMapEditor(false)}
                                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={applyMapBoundary}
                                disabled={mapPoints.length < 3}
                                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl font-semibold transition-colors text-sm"
                            >
                                Apply {mapPoints.length >= 3 ? `(${mapPoints.length} points)` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
