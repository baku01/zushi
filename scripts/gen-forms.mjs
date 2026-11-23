#!/usr/bin/env node
// Generates src/data/forms.json: the names of skin forms (see src/lib/forms.ts).
//
//   node scripts/gen-forms.mjs
//
// LeagueSkins publishes each form of a skin that transforms in game as its own
// package. The app finds those packages in the repo tree at runtime; this script
// collects names for them from data, in order of trust:
//   1. Riot's tiers (Community Dragon skins.json questSkinInfo), in English and pt_BR.
//      They also reveal forms that aren't nested under their skin (Tristana 18080).
//   2. The name in each package's META/info.json ("Lux Elementalist Air").
//   3. Rose's form names (its FormsWheel plugin), when they aren't generic.
// Forms none of them name stay unnamed and the app numbers them (Form 2, Form 3...).
// Only META/info.json is read from each package, with HTTP range requests.

import { writeFileSync, mkdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const REPO_RAW = "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/";
const TREE = "https://api.github.com/repos/Alban1911/LeagueSkins/git/trees/main?recursive=1";
const SKIN_IDS = REPO_RAW + "resources/en/skin_ids.json";
const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global";
const ROSE_FORMS =
  "https://raw.githubusercontent.com/Alban1911/Rose/main/Pengu%20Loader/plugins/ROSE-FormsWheel/index.js";
const OUT = new URL("../src/data/forms.json", import.meta.url);

// Translations of plain words in package names, which are English only. Product
// names (Zero Hour, Starswarm...) have no known official pt_BR name and stay English.
const GLOSSARY_PT = {
  air: "Ar",
  dark: "Trevas",
  ice: "Gelo",
  magma: "Magma",
  mystic: "Mística",
  nature: "Natureza",
  storm: "Tempestade",
  water: "Água",
  fire: "Fogo",
  light: "Luz",
};

const json = async (url) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "zushi-gen-forms" } });
    if (res.ok) return res.json();
    // GitHub's tree API answers 5xx now and then on this large repo.
    if (attempt >= 4 || res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
};

async function range(url, start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206 && res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** META/info.json of a remote zip, reading only its central directory and that entry. */
async function packageInfo(url) {
  const head = await fetch(url, { method: "HEAD" });
  const size = Number(head.headers.get("content-length"));
  const tail = await range(url, Math.max(0, size - 65558), size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOff = tail.readUInt32LE(eocd + 16);
  const cd = await range(url, cdOff, cdOff + cdSize - 1);
  for (let p = 0; p < cd.length; ) {
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const nlen = cd.readUInt16LE(p + 28);
    const xlen = cd.readUInt16LE(p + 30);
    const clen = cd.readUInt16LE(p + 32);
    const loff = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nlen).toString();
    p += 46 + nlen + xlen + clen;
    if (name.toLowerCase() !== "meta/info.json") continue;
    const local = await range(url, loff, loff + 29);
    const start = loff + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const data = await range(url, start, start + csize - 1);
    const raw = method === 8 ? inflateRawSync(data) : data;
    return JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  }
  return null;
}

const words = (s) => s.split(/\s+/).filter(Boolean);
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}/]/gu, "");
const isGeneric = (label) => !label || /^(default|base|form\s*\d+|skin\s*\d+)$/i.test(label);

/** The words of `name` that aren't the champion's name, minus a shared prefix (2+ words) with the parent. */
function tierLabel(name, parentName, champName) {
  const champ = new Set(words(champName).map(norm));
  const strip = (s) => words(s).filter((w) => !champ.has(norm(w)));
  const a = strip(name);
  const b = strip(parentName);
  let k = 0;
  while (k < a.length && k < b.length && norm(a[k]) === norm(b[k])) k++;
  const rest = k >= 2 && k < a.length ? a.slice(k) : a;
  return rest.join(" ").trim() || null;
}

/** "Lux Elementalist Air" (parent "Elementalist Lux") -> "Air"; "... - ZeroHour" -> "Zero Hour". */
function packageLabel(name, parentName) {
  if (!name || /\.wad$/i.test(name)) return null;
  const parent = new Set(words(parentName).map(norm));
  const rest = words(name)
    .filter((w) => !parent.has(norm(w)))
    .join(" ")
    .replace(/[()[\]]/g, "")
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return isGeneric(rest) ? null : rest;
}

const translate = (en) => GLOSSARY_PT[en.toLowerCase()] ?? null;

async function main() {
  const [tree, skinIds, skinsEn, skinsPt, roseJs] = await Promise.all([
    json(TREE),
    json(SKIN_IDS),
    json(`${CDRAGON}/default/v1/skins.json`),
    json(`${CDRAGON}/pt_br/v1/skins.json`),
    fetch(ROSE_FORMS).then((r) => (r.ok ? r.text() : "")),
  ]);

  // Packages in the repo: id -> path.
  const paths = new Map();
  for (const e of tree.tree) {
    const m = /^skins\/\d+\/(?:.*\/)?(\d+)\.(fantome|zip)$/.exec(e.path);
    if (m && e.type === "blob") paths.set(m[1], e.path);
  }
  const champName = (id) => skinIds[String(Math.floor(Number(id) / 1000) * 1000)] ?? "";

  // parentId -> { base: {en, pt} | null, forms: { id: {en, pt} } }
  const out = {};
  const entry = (parent) => (out[parent] ??= { base: null, forms: {} });

  // Forms nested under a skin with an id skin_ids.json doesn't know.
  for (const [id, path] of paths) {
    if (id in skinIds) continue;
    const parts = path.split("/");
    if (parts.length === 5 && parts[3] === id && parts[2] in skinIds)
      entry(parts[2]).forms[id] = { en: null, pt: null };
  }

  // 1. Riot tiers.
  for (const skin of Object.values(skinsEn)) {
    const tiers = skin.questSkinInfo?.tiers;
    if (!tiers || tiers.length < 2) continue;
    const ptTiers = new Map((skinsPt[skin.id]?.questSkinInfo?.tiers ?? []).map((t) => [t.id, t]));
    const [first, ...rest] = [...tiers].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
    const parent = String(first.id);
    if (!(parent in skinIds)) continue;
    const champ = champName(parent);
    const champPt = skinsPt[String(Math.floor(first.id / 1000) * 1000)]?.name ?? champ;
    const ptFirst = ptTiers.get(first.id)?.name ?? first.name;
    for (const t of rest) {
      const id = String(t.id);
      if (!paths.has(id)) continue;
      const ptName = ptTiers.get(t.id)?.name;
      entry(parent).forms[id] = {
        en: tierLabel(t.name, first.name, champ),
        pt: ptName ? tierLabel(ptName, ptFirst, champPt) : null,
      };
    }
    entry(parent).base = {
      en: tierLabel(first.name, rest[0].name, champ),
      pt: tierLabel(ptFirst, ptTiers.get(rest[0].id)?.name ?? rest[0].name, champPt),
    };
  }

  // 2. Package names, for forms still unnamed.
  const pending = Object.entries(out).flatMap(([parent, e]) =>
    Object.entries(e.forms)
      .filter(([, f]) => !f.en)
      .map(([id]) => ({ parent, id }))
  );
  await Promise.all(
    pending.map(async ({ parent, id }) => {
      try {
        const info = await packageInfo(REPO_RAW + paths.get(id));
        const en = packageLabel(info?.Name, skinIds[parent]);
        if (en) out[parent].forms[id] = { en, pt: translate(en) };
      } catch (err) {
        console.warn(`warn: ${id}: ${err.message}`);
      }
    })
  );

  // 3. Rose's names: `formIds: [base, ...]` with `formNames: [...]` in the same block.
  for (const m of roseJs.matchAll(
    /formIds:\s*\[([\d,\s]+)\][^\n]*\n\s*formNames:\s*\[([^\]]*)\]/g
  )) {
    const ids = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const names = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    const [parent, ...formIds] = ids;
    if (!out[parent]) continue;
    if (!out[parent].base && !isGeneric(names[0])) {
      out[parent].base = { en: names[0], pt: translate(names[0]) };
    }
    formIds.forEach((id, i) => {
      const f = out[parent].forms[id];
      const name = names[i + 1];
      if (f && !f.en && !isGeneric(name)) out[parent].forms[id] = { en: name, pt: translate(name) };
    });
  }

  const sorted = Object.fromEntries(
    Object.entries(out)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([parent, e]) => [
        parent,
        {
          base: e.base,
          forms: Object.fromEntries(
            Object.entries(e.forms).sort(([a], [b]) => Number(a) - Number(b))
          ),
        },
      ])
  );
  mkdirSync(new URL(".", OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");

  for (const [parent, e] of Object.entries(sorted)) {
    const named = Object.values(e.forms).filter((f) => f.en).length;
    console.log(
      `${parent} ${skinIds[parent]}: base=${e.base?.en ?? "-"}/${e.base?.pt ?? "-"}, ` +
        `${named}/${Object.keys(e.forms).length} named: ` +
        Object.entries(e.forms)
          .map(([id, f]) => `${id}=${f.en ?? "?"}/${f.pt ?? "?"}`)
          .join(", ")
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
