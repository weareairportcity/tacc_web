"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Search, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { fetchMapPoints, collapseMapPoints, type MapPoint } from "@/lib/soulwinning/admin";
import { useSoulPhoto } from "@/lib/soulwinning/use-soul-photo";

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
 * Clicking a pin opens the same print as the Wall: photo, name, phone, who
 * won them, fellowship and PFCC. Admin-only.
 */

const BLUE_EDGE = "#3398e1";
const INK = "#0c0a09";
const ACCRA: [number, number] = [5.6037, -0.187];

declare global {
  interface Window {
    __swLeafletMap?: L.Map;
    __swLeafletFitAll?: () => void;
  }
}

/** An open ring rather than a filled dot: on a pale map every soul reads as its
 *  own mark, and overlapping rings stay countable instead of merging into a
 *  blob the way solid pins do. */
function countBadge(count: number) {
  if (count <= 1) return "";
  return `<span style="position:absolute;top:-7px;right:-7px;z-index:2;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#3ba6f1;color:#fff;font:700 10px/20px ui-sans-serif,system-ui;text-align:center;border:2px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(12,10,9,.28)">${count}</span>`;
}

function ringIcon(count = 1) {
  return L.divIcon({
    className: "sw-map-pin",
    html: `<span style="position:relative;display:block;width:15px;height:15px"><span style="display:block;width:15px;height:15px;border-radius:9999px;background:rgba(255,255,255,.55);border:2px solid ${BLUE_EDGE};box-shadow:0 1px 3px rgba(12,10,9,.18)"></span>${countBadge(count)}</span>`,
    iconSize: [15, 15],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

type ClusterLeaf = { options: { souls?: number } };

/** A group is one pin with N souls — clusters must add those N, not the pin. */
function clusterSoulCount(cluster: { getAllChildMarkers: () => ClusterLeaf[] }) {
  return cluster.getAllChildMarkers().reduce((sum, marker) => sum + (marker.options.souls ?? 1), 0);
}

function clusterIcon(cluster: { getAllChildMarkers: () => ClusterLeaf[] }) {
  const count = clusterSoulCount(cluster);
  const size = count < 10 ? 32 : count < 100 ? 40 : 52;
  return L.divIcon({
    className: "sw-map-cluster",
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
  const ids = points.map((point) => point.id).join();

  // Reframes on load and again whenever a filter changes the set — never
  // while the viewer is just zooming — so the default view always contains
  // every remaining pin.
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    if (!bounds.isValid()) return;

    const frameAll = () => {
      map.invalidateSize();
      map.fitBounds(bounds, {
        padding: [120, 120],
        maxZoom: 12,
        animate: false,
      });
    };

    frameAll();
    const frame = requestAnimationFrame(frameAll);
    const timer = window.setTimeout(frameAll, 350);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [map, ids]);

  useEffect(() => {
    window.__swLeafletMap = map;
    window.__swLeafletFitAll = () => {
      if (points.length === 0) return;
      const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
      if (!bounds.isValid()) return;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [120, 120], maxZoom: 12, animate: true, duration: 0.9 });
    };
    return () => {
      if (window.__swLeafletMap === map) delete window.__swLeafletMap;
      delete window.__swLeafletFitAll;
    };
  }, [map, ids, points]);

  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.1 });
  }, [map, target]);

  return null;
}

type SearchHit = { label: string; sublabel: string; lat: number; lng: number; zoom: number };

export function SoulMap({
  campaignId,
  previewPoints,
}: {
  campaignId: string;
  previewPoints?: MapPoint[];
}) {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [totalSouls, setTotalSouls] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [target, setTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [fellowship, setFellowship] = useState("all");
  const [pfcc, setPfcc] = useState("all");

  useEffect(() => {
    if (previewPoints) {
      const collapsed = collapseMapPoints(previewPoints);
      setPoints(collapsed);
      setTotalSouls(collapsed.reduce((sum, point) => sum + (point.souls ?? 1), 0));
      return;
    }

    let cancelled = false;
    fetchMapPoints(campaignId)
      .then((result) => {
        if (cancelled) return;
        setPoints(result.points);
        setTotalSouls(result.totalSouls);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load map points"));
    return () => {
      cancelled = true;
    };
  }, [campaignId, previewPoints]);

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

  const locatedSouls = useMemo(
    () => (points ?? []).reduce((sum, point) => sum + (point.souls ?? 1), 0),
    [points]
  );
  const visibleSouls = useMemo(
    () => visible.reduce((sum, point) => sum + (point.souls ?? 1), 0),
    [visible]
  );
  const filtered = fellowship !== "all" || pfcc !== "all";
  const missingSouls = Math.max(0, (totalSouls ?? locatedSouls) - locatedSouls);
  const footerDenom = filtered ? locatedSouls : (totalSouls ?? locatedSouls);

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
        const theirsCount = theirs.reduce((sum, point) => sum + (point.souls ?? 1), 0);
        results.push({
          label: member.name,
          sublabel: `Member · ${theirsCount} ${theirsCount === 1 ? "soul" : "souls"}`,
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
    <div className="relative -mx-4 h-[calc(100svh-150px)] overflow-hidden sm:-mx-6 lg:-mx-[max(0px,calc((100vw-72rem)/2))]" data-soul-map>
      <MapContainer
        center={center}
        zoom={11}
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
            <SoulMarker key={point.id} point={point} />
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
        {visibleSouls.toLocaleString()} of {footerDenom.toLocaleString()} located
        {!filtered && missingSouls > 0
          ? ` · ${missingSouls.toLocaleString()} without location`
          : filtered
            ? " (filtered)"
            : ""}
      </p>
    </div>
  );
}

function photoIcon(url: string, count = 1) {
  const src = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return L.divIcon({
    className: "sw-map-pin",
    html: `<span style="position:relative;display:block;width:40px;height:40px"><span style="display:block;width:40px;height:40px;border-radius:12px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 10px rgba(12,10,9,.28);background:#eceae8"><img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover" draggable="false" /></span>${countBadge(count)}</span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

function SoulMarker({ point }: { point: MapPoint }) {
  const url = useSoulPhoto(point.photo_path);
  const count = point.souls ?? 1;
  const icon = useMemo(
    () => (url ? photoIcon(url, count) : ringIcon(count)),
    [url, count]
  );

  return (
    <Marker
      key={`${point.id}-${url ?? "ring"}-${count}`}
      position={[point.latitude, point.longitude]}
      icon={icon}
      {...({ souls: count } as L.MarkerOptions)}
    >
      <Popup
        className="sw-map-popup"
        maxWidth={240}
        minWidth={220}
        autoPan
        keepInView
        autoPanPadding={[100, 80]}
      >
        <MapPrint point={point} photoUrl={url} />
      </Popup>
    </Marker>
  );
}

function MapPrint({ point, photoUrl }: { point: MapPoint; photoUrl: string | null }) {
  const when = new Date(point.created_at).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const souls = point.souls ?? 1;
  const tongues = point.tongues ?? (point.spoke_in_tongues ? 1 : 0);
  const church = point.church ?? (point.coming_to_church ? 1 : 0);

  return (
    <article data-map-popup className="w-full min-w-[220px] bg-white">
      {photoUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" draggable={false} className="block h-36 w-full object-cover" />
          {souls > 1 && (
            <span className="absolute right-2 top-2 min-w-[1.5rem] rounded-full bg-[#3ba6f1] px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
              {souls}
            </span>
          )}
        </div>
      )}
      <div className="px-3 pb-3.5 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#a8a29e]">
          {souls > 1 ? `Group · ${souls} souls` : "Soul"}
        </p>
        <h2 className="mt-0.5 font-roobert text-[1.35rem] leading-none tracking-[-0.03em] text-[#0c0a09]">
          {point.soul_name}
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-[#57534e]">
          Won by {point.entrant_name}
          {point.fellowship ? ` · ${point.fellowship}` : ""}
          {point.pfcc ? ` · ${point.pfcc}` : ""}
        </p>
        {point.phone && <p className="mt-1 text-[13px] tabular-nums text-[#78716c]">{point.phone}</p>}
        <p className="mt-1 text-[11px] text-[#a8a29e]">{when}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {souls > 1 ? (
            <>
              <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">
                {tongues} tongues
              </span>
              <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">
                {church} church
              </span>
            </>
          ) : (
            <>
              {point.spoke_in_tongues && (
                <span className="rounded-full bg-[#c1e1f7] px-2 py-0.5 text-[10px] text-[#3398e1]">
                  Spoke in tongues
                </span>
              )}
              {point.coming_to_church && (
                <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10px] text-[#78716c]">
                  Coming to church
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
