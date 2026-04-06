'use client';

import { MapContainer, TileLayer, Polygon, Circle, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface BoundaryPoint {
    lat: number;
    lng: number;
}

interface Props {
    center: { lat: number; lng: number };
    boundaryPoints: BoundaryPoint[];
    onPointsChange: (points: BoundaryPoint[]) => void;
    radiusKm?: number;
}

function ClickHandler({ onAdd }: { onAdd: (p: BoundaryPoint) => void }) {
    useMapEvents({
        click(e) {
            onAdd({
                lat: Math.round(e.latlng.lat * 1000000) / 1000000,
                lng: Math.round(e.latlng.lng * 1000000) / 1000000,
            });
        },
    });
    return null;
}

const centerIcon = L.divIcon({
    className: '',
    html: '<div style="background:#f97316;border-radius:50%;width:14px;height:14px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

function numberIcon(n: number) {
    return L.divIcon({
        className: '',
        html: `<div style="background:#2563eb;color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;user-select:none">${n}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

export default function MapBoundaryEditor({ center, boundaryPoints, onPointsChange, radiusKm }: Props) {
    const handleDragEnd = (index: number, e: any) => {
        const { lat, lng } = e.target.getLatLng();
        onPointsChange(
            boundaryPoints.map((p, i) =>
                i === index
                    ? { lat: Math.round(lat * 1000000) / 1000000, lng: Math.round(lng * 1000000) / 1000000 }
                    : p
            )
        );
    };

    const positions = boundaryPoints.map(p => [p.lat, p.lng] as [number, number]);

    return (
        <MapContainer
            center={[center.lat, center.lng]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickHandler onAdd={(p) => onPointsChange([...boundaryPoints, p])} />

            {/* City center marker */}
            <Marker position={[center.lat, center.lng]} icon={centerIcon} />

            {/* Radius circle — shown when no polygon boundary is defined */}
            {positions.length < 3 && radiusKm && radiusKm > 0 && (
                <Circle
                    center={[center.lat, center.lng]}
                    radius={radiusKm * 1000}
                    pathOptions={{
                        color: '#f97316',
                        fillColor: '#fb923c',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '6 4',
                    }}
                />
            )}

            {/* Polygon preview */}
            {positions.length >= 3 && (
                <Polygon
                    positions={positions}
                    pathOptions={{
                        color: '#2563eb',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.15,
                        weight: 2,
                        dashArray: '6 4',
                    }}
                />
            )}

            {/* Boundary point markers */}
            {boundaryPoints.map((point, i) => (
                <Marker
                    key={i}
                    position={[point.lat, point.lng]}
                    icon={numberIcon(i + 1)}
                    draggable
                    eventHandlers={{
                        dragend: (e) => handleDragEnd(i, e),
                        click: () => onPointsChange(boundaryPoints.filter((_, j) => j !== i)),
                    }}
                />
            ))}
        </MapContainer>
    );
}
