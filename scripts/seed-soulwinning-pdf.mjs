import { writeFileSync } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Same layout as src/lib/soulwinning/export.ts — a seeded "All souls won" PDF
 * so we can see the admin download without going through the dashboard.
 */

const HEADERS = [
  "Name",
  "Phone",
  "Spoke in tongues",
  "Coming to church",
  "Won by",
  "Fellowship",
  "PFCC",
];

const MEMBERS = [
  { name: "Kofi Mensah", fellowship: "Airport City", pfcc: "PFCC 2" },
  { name: "Ama Boateng", fellowship: "Spintex", pfcc: "PFCC 1" },
  { name: "Yaw Asante", fellowship: "Tema Community 25", pfcc: "PFCC 3" },
  { name: "Akosua Darko", fellowship: "Ashaiman", pfcc: "PFCC 2" },
  { name: "Kwaku Owusu", fellowship: "East Legon", pfcc: "PFCC 1" },
  { name: "Efua Nyarko", fellowship: "Airport City", pfcc: "PFCC 1" },
  { name: "Kojo Appiah", fellowship: "Spintex", pfcc: "PFCC 3" },
  { name: "Abena Sarpong", fellowship: "Tema Community 25", pfcc: "PFCC 2" },
];

const SOULS = [
  "Kwame Mensah",
  "Ama Serwaa",
  "Yaw Boateng",
  "Akosua Tetteh",
  "Kofi Adjei",
  "Efua Asante",
  "Kojo Owusu",
  "Abena Darko",
  "Kwaku Appiah",
  "Akua Nyarko",
  "Yaw Sarpong",
  "Adwoa Mensah",
  "Kwabena Tetteh",
  "Afia Boateng",
  "Nana Yaw",
  "Esi Ofori",
  "Kwesi Addo",
  "Ama Gyamfi",
  "Yaw Nkrumah",
  "Akosua Frimpong",
  "Kofi Baffour",
  "Abena Osei",
  "Kojo Amoah",
  "Efua Lamptey",
  "Kwame Asiedu",
  "Ama Quaye",
  "Yaw Danso",
  "Akua Poku",
  "Kwabena Sarpong",
  "Adwoa Kumi",
  "Nana Ama",
  "Kojo Tetteh",
  "Abena Mensah",
  "Kwesi Boateng",
  "Esi Asante",
  "Kofi Nyarko",
  "Akosua Owusu",
  "Yaw Appiah",
  "Afia Darko",
  "Kwaku Ofori",
  "Ama Addo",
  "Kojo Gyamfi",
  "Efua Nkrumah",
  "Kwame Frimpong",
  "Abena Baffour",
  "Yaw Osei",
  "Akua Amoah",
  "Kofi Lamptey",
];

const PHONES = [
  "0244001122",
  "0209988776",
  "0277008899",
  "0244123456",
  "0203344556",
  "0550076503",
  "0248112233",
  "0205566778",
  "0271234567",
  "0242334455",
];

const rows = SOULS.map((soul_name, index) => {
  const member = MEMBERS[index % MEMBERS.length];
  return {
    soul_name,
    phone: PHONES[index % PHONES.length],
    spoke_in_tongues: index % 4 !== 2,
    coming_to_church: index % 5 !== 1,
    ...member,
  };
});

const campaign = { name: "1909 Outreach", slug: "1909" };
const title = "All souls won";

const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

doc.setFontSize(16);
doc.text(title, 40, 44);
doc.setFontSize(10);
doc.setTextColor(120);
doc.text(
  `${campaign.name} · ${rows.length} souls · ${new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`,
  40,
  62
);

const tongues = rows.filter((row) => row.spoke_in_tongues).length;
const church = rows.filter((row) => row.coming_to_church).length;
doc.text(`Spoke in tongues: ${tongues} · Coming to church: ${church}`, 40, 78);

autoTable(doc, {
  head: [HEADERS],
  body: rows.map((row) => [
    row.soul_name,
    row.phone,
    row.spoke_in_tongues ? "Yes" : "No",
    row.coming_to_church ? "Yes" : "No",
    row.name,
    row.fellowship,
    row.pfcc,
  ]),
  startY: 94,
  styles: { fontSize: 9, cellPadding: 5 },
  headStyles: { fillColor: [51, 152, 225], textColor: 255 },
  alternateRowStyles: { fillColor: [250, 250, 249] },
});

const out = path.join(process.cwd(), "docs/soulwinning/1909-all-souls.pdf");
writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log(`Wrote ${rows.length} souls to ${out}`);
