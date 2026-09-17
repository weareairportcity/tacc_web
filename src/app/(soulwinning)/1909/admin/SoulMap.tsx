"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
 * Esri's Light Gray canvas, which ships the terrain and the labels as two
 * separate tile layers. Taking the base plus only the reference layer gives a
 * quiet map carrying country, city and major landmark names and little else —
 * standard OpenStreetMap tiles are far too busy for a wall display, and their
 * labels cannot be filtered out because raster tiles bake them in.
 *
 * Free, no API key, no account (CARTO now wants one).
 *
 * Pins carry fellowship, member and time only — sw_map_points does not return
 * the soul's name or phone, so a shared screen cannot leak them.
 */

const BLUE_EDGE = "#3398e1";
const INK = "#0c0a09";
const ACCRA: [number, number] = [5.6037, -0.187];

/** An open ring rather than a filled dot: on a pale map every soul reads as its
 *  own mark, and overlapping rings stay countable instead of merging into a
 *  blob the way solid pins do. */
const pin = L.divIcon({
  className: "",
  html: `<span style="display:block;width:15px;height:15px;border-radius:9999px;background:rgba(255,255,255,.55);border:2px solid ${BLUE_EDGE};box-shadow:0 1px 3px rgba(12,10,9,.18)"></span>`,
  iconSize: [15, 15],
  iconAnchor: [7, 7],
});

function clusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 40 : 52;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:rgba(255,255,255,.72);border:2px solid ${BLUE_EDGE};color:${INK};font:500 ${
      count < 100 ? 13 : 12
    }px/1 ui-sans-serif,system-ui;box-shadow:0 1px 4px rgba(12,10,9,.18)">${count}</div>`,
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

  // Reframes on load and again whenever a filter narrows the set, so the
  // remaining souls always fill the view.
  useEffect(() => {
    if (points.length === 0) return;
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
  const [fellowship, setFellowship] = useState("all");
  const [pfcc, setPfcc] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetchMapPoints(campaignId)
      .then((rows) => !cancelled && setPoints(rows))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load map points"));
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const fellowships = useMemo(
    () => [...new Set((points ?? []).map((p) => p.fellowship))].sort(),
    [points]
  );
  const pfccs = useMemo(
    () => [...new Set((points ?? []).map((p) => p.pfcc ?? "Not given"))].sort(),
    [points]
  );

  const visible = useMemo(() => {
    return (points ?? []).filter(
      (point) =>
        (fellowship === "all" || point.fellowship === fellowship) &&
        (pfcc === "all" || (point.pfcc ?? "Not given") === pfcc)
    );
  }, [points, fellowship, pfcc]);

  const center = useMemo<[number, number]>(() => {
    if (!visible.length) return ACCRA;
    return [
      visible.reduce((sum, p) => sum + p.latitude, 0) / visible.length,
      visible.reduce((sum, p) => sum + p.longitude, 0) / visible.length,
    ];
  }, [visible]);

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
        {/* Esri's Light Gray canvas as it ships: terrain and water with no
            labels baked in, so the map stays quiet under the pins. */}
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        {/* Its matching reference layer: countries, cities and major landmarks
            only — no street names. */}
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
        <MarkerClusterGroup
          key={`${fellowship}|${pfcc}`}
          chunkedLoading
          maxClusterRadius={34}
          disableClusteringAtZoom={17}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={clusterIcon}
        >
          {visible.map((point) => (
            <Marker key={point.id} position={[point.latitude, point.longitude]} icon={pin}>
              <Popup>
                <span className="block text-sm font-medium text-[#0c0a09]">{point.fellowship}</span>
                {point.pfcc && <span className="block text-xs text-[#78716c]">{point.pfcc}</span>}
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
        <MapController points={visible} target={target} />
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

        <div className="pointer-events-auto flex flex-wrap gap-2">
          <select
            value={fellowship}
            onChange={(event) => setFellowship(event.target.value)}
            className="rounded-full border border-[#e8e6e5] bg-white/95 px-3 py-1.5 text-xs text-[#0c0a09] shadow-sm outline-none"
          >
            <option value="all">All fellowships</option>
            {fellowships.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={pfcc}
            onChange={(event) => setPfcc(event.target.value)}
            className="rounded-full border border-[#e8e6e5] bg-white/95 px-3 py-1.5 text-xs text-[#0c0a09] shadow-sm outline-none"
          >
            <option value="all">All PFCCs</option>
            {pfccs.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          {(fellowship !== "all" || pfcc !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFellowship("all");
                setPfcc("all");
              }}
              className="rounded-full bg-[#0c0a09] px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            >
              Clear
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
        {visible.length.toLocaleString()} of {points.length.toLocaleString()} located
        {fellowship !== "all" || pfcc !== "all" ? " (filtered)" : ""} · pins show fellowship, PFCC,
        member and time only
      </p>
    </div>
  );
}
