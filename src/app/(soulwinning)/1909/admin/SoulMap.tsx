"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchMapPoints, type MapPoint } from "@/lib/soulwinning/admin";

/**
 * OpenStreetMap tiles via Leaflet — no API key, no usage cap (plan §10).
 *
 * Popups deliberately carry fellowship, entrant and time only. The soul's name
 * and phone never reach this component: sw_map_points does not return them, so
 * a shared admin screen cannot leak them.
 */

// Leaflet's default marker icons resolve to paths that don't exist under a
// bundler, so the icon is defined here instead.
const pin = L.divIcon({
  className: "",
  html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#3398e1;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(12,10,9,.35)"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const ACCRA: [number, number] = [5.6037, -0.187];

interface Props {
  campaignId: string;
}

export function SoulMap({ campaignId }: Props) {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMapPoints(campaignId)
      .then((rows) => {
        if (!cancelled) setPoints(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load map points");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (error) {
    return <p className="p-5 text-sm text-[#f54911]">{error}</p>;
  }

  if (!points) {
    return <p className="p-5 text-sm text-[#a8a29e]">Loading map…</p>;
  }

  const center: [number, number] = points.length
    ? [
        points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
        points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      ]
    : ACCRA;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#a8a29e]">
        {points.length.toLocaleString()} {points.length === 1 ? "soul" : "souls"} with a location.
        Pins show fellowship, entrant and time only.
      </p>
      <div className="h-[460px] w-full overflow-hidden rounded-xl border border-[#e8e6e5]">
        <MapContainer center={center} zoom={points.length ? 14 : 12} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Clustering matters past a few hundred points: thousands of separate
              pins are unreadable and slow to render. */}
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
            {points.map((point) => (
              <Marker key={point.id} position={[point.latitude, point.longitude]} icon={pin}>
                <Popup>
                  <span className="block text-sm font-medium text-[#0c0a09]">{point.fellowship}</span>
                  <span className="block text-xs text-[#78716c]">Logged by {point.entrant_name}</span>
                  <span className="block text-xs text-[#a8a29e]">
                    {new Date(point.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  );
}
