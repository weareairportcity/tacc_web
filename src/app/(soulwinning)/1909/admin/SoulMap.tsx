"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Search, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { fetchMapPoints, type MapPoint } from "@/lib/soulwinning/admin";

/**
 * Full-bleed light map in the church's colours.
 *
 * OpenStreetMap raster tiles — free, no API key, no account (CARTO now wants
 * one). Raster tiles cannot be restyled per-layer, so the basemap is pulled
 * toward the church blue with a CSS filter and held back to a pale wash, which
 * leaves the pins as the only saturated thing on screen.
 *
 * Pins carry fellowship, member and time only — sw_map_points does not return
 * the soul's name or phone, so a shared screen cannot leak them.
 */

const BLUE = "#3ba6f1";
const BLUE_EDGE = "#3398e1";
const ACCRA: [number, number] = [5.6037, -0.187];

const pin = L.divIcon({
  className: "",
  html: `<span style="display:block;width:13px;height:13px;border-radius:9999px;background:${BLUE};border:2px solid #fff;box-shadow:0 0 0 1px ${BLUE_EDGE}55,0 2px 6px rgba(12,10,9,.28)"></span>`,
  iconSize: [13, 13],
  iconAnchor: [6, 6],
});

function clusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 34 : count < 100 ? 44 : 56;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:rgba(59,166,241,.9);border:2px solid #fff;color:#fff;font:500 ${
      count < 100 ? 13 : 12
    }px/1 ui-sans-serif,system-ui;box-shadow:0 2px 10px rgba(51,152,225,.45)">${count}</div>`,
    iconSize: [size, size],
  });
}

/** Frames every pin on first load, and flies wherever a search sends it. */
function MapController({
  points,
  target,
}: {
  points: MapPoint[];
  target: { lat: number; lng: number; zoom: number } | null;
}) {
  const map = useMap();
  const framedRef = useRef(false);

  useEffect(() => {
    if (framedRef.current || points.length === 0) return;
    framedRef.current = true;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), {
      padding: [70, 70],
      maxZoom: 16,
    });
  }, [map, points]);

  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.1 });
  }, [map, target]);

  return null;
}

type SearchHit = { label: string; sublabel: string; lat: number; lng: number; zoom: number };

export function SoulMap({ campaignId }: { campaignId: string }) {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [target, setTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMapPoints(campaignId)
      .then((rows) => !cancelled && setPoints(rows))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load map points"));
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const center = useMemo<[number, number]>(() => {
    if (!points?.length) return ACCRA;
    return [
      points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
      points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
    ];
  }, [points]);

  /** Souls and members first — they are why you opened the map — then places. */
  const runSearch = useCallback(async () => {
    const term = query.trim();
    if (!term) return;
    setIsSearching(true);
    setHits(null);

    try {
      const supabase = createClient();
      const results: SearchHit[] = [];

      const { data: souls } = await supabase
        .from("sw_soul_entries")
        .select("soul_name, latitude, longitude, sw_entrants(name)")
        .eq("campaign_id", campaignId)
        .not("latitude", "is", null)
        .ilike("soul_name", `%${term}%`)
        .limit(8);

      type SoulHit = { soul_name: string; latitude: number; longitude: number; sw_entrants: { name: string } | null };
      for (const row of (souls as unknown as SoulHit[]) ?? []) {
        results.push({
          label: row.soul_name,
          sublabel: `Soul · logged by ${row.sw_entrants?.name ?? "—"}`,
          lat: row.latitude,
          lng: row.longitude,
          zoom: 18,
        });
      }

      const { data: members } = await supabase
        .from("sw_entrants")
        .select("name")
        .ilike("name", `%${term}%`)
        .limit(5);
      for (const member of (members as { name: string }[]) ?? []) {
        const theirs = (points ?? []).filter((p) => p.entrant_name === member.name);
        if (theirs.length === 0) continue;
        results.push({
          label: member.name,
          sublabel: `Member · ${theirs.length} ${theirs.length === 1 ? "soul" : "souls"}`,
          lat: theirs.reduce((sum, p) => sum + p.latitude, 0) / theirs.length,
          lng: theirs.reduce((sum, p) => sum + p.longitude, 0) / theirs.length,
          zoom: 16,
        });
      }

      if (results.length === 0) {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(term)}`
        );
        if (response.ok) {
          const places = (await response.json()) as { display_name: string; lat: string; lon: string }[];
          for (const place of places) {
            results.push({
              label: place.display_name.split(",")[0],
              sublabel: place.display_name.split(",").slice(1, 3).join(",").trim() || "Place",
              lat: Number(place.lat),
              lng: Number(place.lon),
              zoom: 15,
            });
          }
        }
      }

      setHits(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [campaignId, points, query]);

  if (error) return <p className="p-5 text-sm text-[#f54911]">{error}</p>;
  if (!points) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-xl bg-[#fafaf9]">
        <Loader2 className="h-5 w-5 animate-spin text-[#3ba6f1]" />
      </div>
    );
  }

  return (
    <div className="relative -mx-4 h-[calc(100svh-150px)] overflow-hidden sm:-mx-6 lg:-mx-[max(0px,calc((100vw-72rem)/2))]">
      <MapContainer
        center={center}
        zoom={13}
        zoomControl={false}
        className="sw-map h-full w-full bg-[#fafaf9]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={55}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={clusterIcon}
        >
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
        <MapController points={points} target={target} />
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full border border-[#e8e6e5] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <Search className="h-4 w-4 shrink-0 text-[#3398e1]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void runSearch()}
            placeholder="Search a soul, a member, or a place"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#0c0a09] outline-none placeholder:text-[#a8a29e]"
          />
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-[#3398e1]" />}
          {query && !isSearching && (
            <button type="button" onClick={() => { setQuery(""); setHits(null); }} aria-label="Clear search">
              <X className="h-4 w-4 text-[#a8a29e]" />
            </button>
          )}
        </div>

        {hits && (
          <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-[#e8e6e5] bg-white shadow-sm">
            {hits.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[#a8a29e]">Nothing found.</p>
            ) : (
              hits.map((hit, index) => (
                <button
                  key={`${hit.label}-${index}`}
                  type="button"
                  onClick={() => {
                    setTarget({ lat: hit.lat, lng: hit.lng, zoom: hit.zoom });
                    setHits(null);
                  }}
                  className="block w-full border-b border-[#f2f2f2] px-3 py-2.5 text-left last:border-0 hover:bg-[#fafaf9]"
                >
                  <span className="block text-sm text-[#0c0a09]">{hit.label}</span>
                  <span className="block text-xs text-[#a8a29e]">{hit.sublabel}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <p className="pointer-events-none absolute bottom-2 left-3 z-[1000] text-[11px] text-[#78716c]">
        {points.length.toLocaleString()} {points.length === 1 ? "soul" : "souls"} located · pins show
        fellowship, member and time only
      </p>
    </div>
  );
}
