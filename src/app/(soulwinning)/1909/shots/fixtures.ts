import type { HourlyRow, LeaderboardRow, DuplicateRow, MapPoint, Overview } from "@/lib/soulwinning/admin";
import type { SwCampaign, SwCounts } from "@/lib/soulwinning/types";
import { FELLOWSHIPS } from "@/lib/soulwinning/fellowships";

export const SHOT_CAMPAIGN: SwCampaign = {
  id: "shot-campaign",
  name: "1909 Outreach",
  slug: "1909",
  event_date: "2026-09-19",
  active: true,
  sms_template:
    "1909 update at {time}: {total} souls won for Christ ({tongues} spoke in tongues, {church} coming to church). Goal {goal}.",
  sms_start_hour: 8,
  sms_end_hour: 18,
  goal_total: 1909,
  created_at: "2026-09-19T07:00:00.000Z",
};

export const SAMPLE_PHOTOS = [
  "/1909/shots/soul-01.jpg",
  "/1909/shots/soul-02.jpg",
  "/1909/shots/sample-soul.jpg",
  "/1909/shots/soul-03.jpg",
  "/1909/shots/soul-04.jpg",
  "/1909/shots/soul-05.jpg",
  "/1909/shots/soul-06.jpg",
  "/1909/shots/soul-07.jpg",
];

export const SAMPLE_PHOTO = SAMPLE_PHOTOS[2];

const GIVEN = [
  "Kwame",
  "Ama",
  "Yaw",
  "Akosua",
  "Kofi",
  "Efua",
  "Kojo",
  "Abena",
  "Kwaku",
  "Akua",
  "Kwabena",
  "Adwoa",
  "Nana",
  "Esi",
  "Fiifi",
];

const FAMILY = [
  "Mensah",
  "Boateng",
  "Tetteh",
  "Adjei",
  "Asante",
  "Owusu",
  "Darko",
  "Appiah",
  "Nyarko",
  "Ofori",
  "Sarpong",
  "Addo",
  "Gyamfi",
  "Nkrumah",
  "Frimpong",
  "Baffour",
  "Osei",
  "Amoah",
  "Lamptey",
  "Quaye",
];

const MEMBER_NAMES = [
  "Kofi Mensah",
  "Ama Boateng",
  "Yaw Asante",
  "Akosua Darko",
  "Kwaku Owusu",
  "Efua Nyarko",
  "Kojo Appiah",
  "Abena Sarpong",
  "Kwabena Tetteh",
  "Adwoa Kumi",
  "Fiifi Baah",
  "Maame Yaa",
  "Nana Akua",
  "Kojo Antwi",
  "Ama Konadu",
  "Yaw Sarkodie",
  "Akosua Mansa",
  "Kwesi Addo",
  "Esi Ofori",
  "Kofi Baffour",
  "Abena Osei",
  "Kojo Amoah",
  "Efua Lamptey",
  "Kwame Asiedu",
  "Ama Quaye",
  "Yaw Danso",
  "Akua Poku",
];

const PINNED_MEMBERS: { name: string; fellowship: string }[] = [
  { name: "Kofi Mensah", fellowship: "Qadash" },
  { name: "Ama Boateng", fellowship: "Chosen" },
  { name: "Yaw Asante", fellowship: "Radah" },
  { name: "Akosua Darko", fellowship: "Royalties" },
  { name: "Kwaku Owusu", fellowship: "Ecclesia" },
];

const MEMBERS = (() => {
  const used = new Set(PINNED_MEMBERS.map((row) => row.fellowship));
  const rest = FELLOWSHIPS.filter((row) => !used.has(row.name)).map((row, index) => ({
    name: MEMBER_NAMES[index + PINNED_MEMBERS.length] ?? `Member ${index + 1}`,
    fellowship: row.name,
  }));
  return [...PINNED_MEMBERS, ...rest].map((row) => ({
    name: row.name,
    fellowship: row.fellowship,
    pfcc: FELLOWSHIPS.find((item) => item.name === row.fellowship)?.pfcc ?? "PFCC 1",
  }));
})();

const HUBS: Array<[number, number, number]> = [
  [5.6037, -0.187, 0.028],
  [5.669, -0.016, 0.022],
  [5.636, -0.064, 0.02],
  [5.597, -0.201, 0.022],
  [5.649, -0.147, 0.024],
];

function unit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function coordFor(index: number): [number, number] {
  const hub = HUBS[index % HUBS.length];
  const lat = hub[0] + (unit(index + 1) - 0.5) * hub[2];
  const lng = hub[1] + (unit(index + 51) - 0.5) * hub[2] * 1.45;
  return [lat, lng];
}

function soulName(index: number) {
  if (index === 0) return "Kwame Mensah";
  if (index === 1) return "Ama Serwaa";
  if (index === 10) return "Emmanuel Tetteh";
  if (index === 11) return "Grace Adjei";
  return `${GIVEN[index % GIVEN.length]} ${FAMILY[Math.floor(index / GIVEN.length) % FAMILY.length]}`;
}

export const SHOT_ENTRIES = Array.from({ length: 300 }, (_, index) => {
  const member = MEMBERS[index % MEMBERS.length];
  const hour = 8 + (index % 10);
  const minute = (index * 3) % 60;
  const skipPhoto = index === 1 || index === 10 || index % 6 === 1;
  const name = soulName(index);
  return {
    id: `entry-${index + 1}`,
    soul_name: name,
    phone: `0244${String(100000 + index).slice(-6)}`,
    spoke_in_tongues: index % 4 !== 2,
    coming_to_church: index % 5 !== 1,
    duplicate_status: index === 10 ? "pending" : "none",
    counted: index !== 10,
    photo_path: skipPhoto ? null : name === "Kwame Mensah" ? SAMPLE_PHOTO : SAMPLE_PHOTOS[index % SAMPLE_PHOTOS.length],
    created_at: `2026-09-19T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
    sw_entrants: member,
  };
});

const COUNTED = SHOT_ENTRIES.filter((row) => row.counted);

function rank(dimension: "fellowship" | "entrant"): LeaderboardRow[] {
  const buckets = new Map<string, LeaderboardRow>();
  for (const row of COUNTED) {
    const label = dimension === "fellowship" ? row.sw_entrants.fellowship : row.sw_entrants.name;
    const sublabel =
      dimension === "entrant" ? `${row.sw_entrants.fellowship} · ${row.sw_entrants.pfcc}` : null;
    const current = buckets.get(label) ?? { label, sublabel, souls: 0, tongues: 0, church: 0 };
    current.souls += 1;
    if (row.spoke_in_tongues) current.tongues += 1;
    if (row.coming_to_church) current.church += 1;
    buckets.set(label, current);
  }
  return [...buckets.values()].sort((a, b) => b.souls - a.souls || a.label.localeCompare(b.label));
}

export const SHOT_FELLOWSHIPS = rank("fellowship");
export const SHOT_MEMBERS = rank("entrant");

export const SHOT_HOURLY: HourlyRow[] = (() => {
  let cumulative = 0;
  return Array.from({ length: 10 }, (_, offset) => {
    const hour = 8 + offset;
    const slice = COUNTED.filter((row) => row.created_at.slice(11, 13) === String(hour).padStart(2, "0"));
    cumulative += slice.length;
    return {
      hour,
      souls: slice.length,
      tongues: slice.filter((row) => row.spoke_in_tongues).length,
      church: slice.filter((row) => row.coming_to_church).length,
      cumulative,
    };
  });
})();

export const SHOT_MAP_POINTS: MapPoint[] = (() => {
  const points: MapPoint[] = COUNTED.filter((_, index) => index % 10 !== 7).map((entry, index) => {
    const [latitude, longitude] = coordFor(index);
    return {
      id: entry.id,
      latitude,
      longitude,
      soul_name: entry.soul_name,
      phone: entry.phone,
      photo_path: entry.photo_path,
      fellowship: entry.sw_entrants.fellowship,
      pfcc: entry.sw_entrants.pfcc,
      entrant_name: entry.sw_entrants.name,
      spoke_in_tongues: entry.spoke_in_tongues,
      coming_to_church: entry.coming_to_church,
      created_at: entry.created_at,
    };
  });

  const [latitude, longitude] = coordFor(0);
  points.push({
    id: "shot-group-tema",
    latitude,
    longitude,
    soul_name: "Tema class",
    phone: "0244100000",
    photo_path: SAMPLE_PHOTOS[0],
    fellowship: "Children's Church",
    pfcc: "Children's Church",
    entrant_name: "Ama Boateng",
    spoke_in_tongues: true,
    coming_to_church: true,
    created_at: "2026-09-19T11:00:00.000Z",
    group_id: "shot-group-tema",
    souls: 75,
    tongues: 40,
    church: 28,
  });

  return points;
})();

const last = COUNTED[COUNTED.length - 1];

export const SHOT_COUNTS: SwCounts = {
  campaign_id: SHOT_CAMPAIGN.id,
  total_souls: COUNTED.length,
  tongues_count: COUNTED.filter((row) => row.spoke_in_tongues).length,
  church_count: COUNTED.filter((row) => row.coming_to_church).length,
  pending_duplicates: 2,
  last_soul_name: last.soul_name.split(" ")[0],
  last_entry_id: last.id,
  recent_names: COUNTED.slice(-10)
    .reverse()
    .map((row) => row.soul_name.split(" ")[0]),
  last_photo_path: [...COUNTED].reverse().find((row) => row.photo_path)?.photo_path ?? null,
  recent_photo_paths: SAMPLE_PHOTOS,
  updated_at: "2026-09-19T17:40:00.000Z",
};

export const SHOT_OVERVIEW: Overview = {
  total_souls: COUNTED.length,
  tongues_count: SHOT_COUNTS.tongues_count,
  church_count: SHOT_COUNTS.church_count,
  pending_duplicates: 2,
  entrant_count: new Set(COUNTED.map((row) => row.sw_entrants.name)).size,
  group_count: Math.round(COUNTED.length * 0.86),
  located_count: SHOT_MAP_POINTS.length,
};

export const SHOT_DUPLICATES: DuplicateRow[] = [
  {
    id: "dup-1",
    soul_name: "Emmanuel Tetteh",
    phone: "0244001122",
    created_at: "2026-09-19T14:12:00.000Z",
    entrant_name: "Ama Boateng",
    original_id: "orig-1",
    original_created_at: "2026-09-19T10:04:00.000Z",
    original_entrant_name: "Kofi Mensah",
  },
  {
    id: "dup-2",
    soul_name: "Grace Adjei",
    phone: "0209988776",
    created_at: "2026-09-19T15:01:00.000Z",
    entrant_name: "Yaw Asante",
    original_id: "orig-2",
    original_created_at: "2026-09-19T11:40:00.000Z",
    original_entrant_name: "Akosua Darko",
  },
];
