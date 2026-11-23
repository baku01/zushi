#!/usr/bin/env node
// Generates src/data/forms.json (names of skin forms) and src/assets/forms/*.png
// (a picture of each form). See src/lib/forms.ts.
//
//   node scripts/gen-forms.mjs
//
// LeagueSkins publishes each form of a skin that transforms in game as its own
// package. The app finds those packages in the repo tree at runtime; this script
// names them from data, never by hand. For each form, the first source that names it:
//
//   1. What the package shows. A form's skin bin lists the parts it hides
//      (Viego's "Mage_Sword Tank_Sword ..."), so comparing the forms of a skin gives
//      the parts each one shows. Those name the form when they are:
//        - a stage, "Form_2" / "Pistols_Form3": named by the game's own text for that
//          stage (transform_meter_<champion>_<n>_form<N>: "Chosen Ahri");
//        - a class weapon, "Assassin_Sword": named by the game's text for the class;
//        - a feature Riot lists for the skin ("PowderBody" -> "Powder").
//   2. The name in the package's META/info.json ("Lux Elementalist Air").
//   3. Rose's name for it (its FormsWheel plugin), when it isn't generic.
//   4. Riot's tiers for the skin (Community Dragon skins.json questSkinInfo).
//
// Portuguese names come from the same game text (pt_BR), from Riot's feature names, or
// a small glossary. Forms nothing names stay unnamed and the app numbers them, showing
// their picture. Pictures are Rose's form buttons (MIT, (c) Alban and Florent),
// resized with macOS `sips`; without it the committed pictures are kept.
//
// Analyzed packages are cached in scripts/forms-cache.json by git blob sha, so a run
// only downloads the packages that changed.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import zlib from "node:zlib";

const REPO_RAW = "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/";
const TREE = "https://api.github.com/repos/Alban1911/LeagueSkins/git/trees/main?recursive=1";
const SKIN_IDS = REPO_RAW + "resources/en/skin_ids.json";
const CDRAGON = "https://raw.communitydragon.org/latest";
const SKINS = (locale) => `${CDRAGON}/plugins/rcp-be-lol-game-data/global/${locale}/v1/skins.json`;
// The game's text. The pt_BR table is published under an en_us file name.
const STRINGS_EN = `${CDRAGON}/game/en_us/data/menu/en_us/lol.stringtable.json`;
const STRINGS_PT = `${CDRAGON}/game/pt_br/data/menu/en_us/lol.stringtable.json`;
const ROSE_RAW = "https://raw.githubusercontent.com/Alban1911/Rose/main/";
const ROSE_TREE = "https://api.github.com/repos/Alban1911/Rose/git/trees/main?recursive=1";
const ROSE_FORMS = ROSE_RAW + "Pengu%20Loader/plugins/ROSE-FormsWheel/index.js";

const OUT = new URL("../src/data/forms.json", import.meta.url);
const ICONS = new URL("../src/assets/forms/", import.meta.url);
const CACHE = new URL("./forms-cache.json", import.meta.url);
const ICON_SIZE = 96; // px, longest side

// Plain words in package names, which are English only.
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

const CLASSES = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];

// --- fetching ----------------------------------------------------------------

async function get(url, as = "json") {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "zushi-gen-forms" } });
    if (res.ok) {
      if (as === "json") return res.json();
      if (as === "text") return res.text();
      return Buffer.from(await res.arrayBuffer());
    }
    // GitHub's tree API answers 5xx now and then on large repos.
    if (attempt >= 4 || res.status < 500) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

// --- zip / wad / bin -----------------------------------------------------------

function* zipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const loff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString();
    p += 46 + nlen + xlen + clen;
    const start = loff + 30 + buf.readUInt16LE(loff + 26) + buf.readUInt16LE(loff + 28);
    const data = buf.subarray(start, start + csize);
    yield { name, read: () => (method === 8 ? zlib.inflateRawSync(data) : data) };
  }
}

function zstd(data) {
  if (zlib.zstdDecompressSync) return zlib.zstdDecompressSync(data);
  const r = spawnSync("zstd", ["-dc"], { input: data, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error("zstd failed");
  return r.stdout;
}

function* wadEntries(wad) {
  if (wad.toString("latin1", 0, 2) !== "RW") return;
  const major = wad[2];
  const hdr = major >= 3 ? 4 + 256 + 8 : major === 2 ? 4 + 84 + 8 : 4 + 8;
  const count = wad.readUInt32LE(hdr);
  let p = hdr + 4;
  for (let i = 0; i < count; i++) {
    const off = wad.readUInt32LE(p + 8);
    const csize = wad.readUInt32LE(p + 12);
    const kind = wad[p + 20] & 0x0f;
    p += major >= 3 ? 32 : 24;
    const data = wad.subarray(off, off + csize);
    try {
      if (kind === 0) yield data;
      else if (kind === 1) yield zlib.gunzipSync(data);
      else if (kind === 3 || kind === 4) yield zstd(data);
    } catch {
      // unreadable entry: skip
    }
  }
}

const PART_LIST = /^[A-Za-z0-9_]+(?: [A-Za-z0-9_]+)+$/;

/** Space-separated part lists ("Hood Hood_Hair Body") in a bin's length-prefixed strings. */
function partLists(bin, out) {
  for (let i = 0; i + 2 < bin.length; i++) {
    const len = bin.readUInt16LE(i);
    if (len < 8 || len > 4000 || i + 2 + len > bin.length) continue;
    let ok = true;
    for (let j = i + 2; j < i + 2 + len; j++) {
      const c = bin[j];
      if (c < 0x20 || c > 0x7e) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const s = bin.toString("latin1", i + 2, i + 2 + len);
    if (PART_LIST.test(s)) out.add([...new Set(s.split(" "))].sort().join(" "));
    i += 1 + len;
  }
}

/** The part lists in a package's property bins (in WADs and loose files). */
function packageParts(zipBuf) {
  const lists = new Set();
  for (const e of zipEntries(zipBuf)) {
    if (e.name.endsWith("/")) continue;
    const raw = e.read();
    const blobs = e.name.endsWith(".wad.client") ? wadEntries(raw) : [raw];
    for (const b of blobs) {
      const magic = b.toString("latin1", 0, 4);
      if (magic === "PROP" || magic === "PTCH") partLists(b, lists);
    }
  }
  return [...lists].sort();
}

function packageMetaName(zipBuf) {
  for (const e of zipEntries(zipBuf)) {
    if (e.name.toLowerCase() !== "meta/info.json") continue;
    try {
      return (
        JSON.parse(
          e
            .read()
            .toString("utf8")
            .replace(/^\uFEFF/, "")
        ).Name ?? null
      );
    } catch {
      return null;
    }
  }
  return null;
}

// --- naming ------------------------------------------------------------------

const words = (s) => s.split(/\s+/).filter(Boolean);
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const isGeneric = (label) => !label || /^(default|base|form\s*\d+|skin\s*\d+)$/i.test(label);
const stripTags = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** `name` without the champion's name words: "Chosen Kai'Sa" -> "Chosen". */
function withoutChampion(name, champName) {
  const champ = new Set(words(champName).map(norm));
  return (
    words(name)
      .filter((w) => !champ.has(norm(w)))
      .join(" ")
      .trim() || null
  );
}

/** The words of a tier name that aren't the champion's, minus a 2+ word prefix shared with the base tier. */
function tierLabel(name, otherName, champName) {
  const a = words(withoutChampion(name, champName) ?? "");
  const b = words(withoutChampion(otherName, champName) ?? "");
  let k = 0;
  while (k < a.length && k < b.length && norm(a[k]) === norm(b[k])) k++;
  return (k >= 2 && k < a.length ? a.slice(k) : a).join(" ") || null;
}

/** "Lux Elementalist Air" (base "Elementalist Lux") -> "Air"; "... - ZeroHour" -> "Zero Hour". */
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

/** Stage number a set of visible parts shows (Form_2, Pistols_Form3), if one stands out. */
function stageOf(parts) {
  const counts = new Map();
  for (const p of parts) {
    if (/_and_/i.test(p)) continue;
    const m = /form_?(\d)/i.exec(p);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) return null;
  return Number(sorted[0][0]);
}

async function main() {
  const [tree, skinIds, skinsEn, skinsPt, strEn, strPt, roseJs, roseTree] = await Promise.all([
    get(TREE),
    get(SKIN_IDS),
    get(SKINS("default")),
    get(SKINS("pt_br")),
    get(STRINGS_EN).then((d) => d.entries),
    get(STRINGS_PT).then((d) => d.entries),
    get(ROSE_FORMS, "text").catch(() => ""),
    get(ROSE_TREE).catch(() => ({ tree: [] })),
  ]);
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

  // Packages in the repo: id -> { path, sha }.
  const pkgs = new Map();
  for (const e of tree.tree) {
    const m = /^skins\/\d+\/(?:.*\/)?(\d+)\.(fantome|zip)$/.exec(e.path);
    if (m && e.type === "blob") pkgs.set(m[1], { path: e.path, sha: e.sha });
  }
  const champKey = (id) => Math.floor(Number(id) / 1000);
  const champEn = (id) => skinIds[String(champKey(id) * 1000)] ?? "";
  const champPt = (id) => skinsPt[String(champKey(id) * 1000)]?.name ?? champEn(id);
  // "Kaisa": the champion's asset folder, as the game's text keys use it.
  const champAlias = (id) =>
    /Characters\/([^/]+)\//i.exec(skinsEn[String(champKey(id) * 1000)]?.splashPath ?? "")?.[1] ??
    "";

  // Families: parent -> form ids. Nested packages with an unknown id, plus Riot tiers.
  const families = new Map();
  const addForm = (parent, id) => {
    const set = families.get(parent) ?? new Set();
    set.add(id);
    families.set(parent, set);
  };
  for (const [id, { path }] of pkgs) {
    if (id in skinIds) continue;
    const parts = path.split("/");
    if (parts.length === 5 && parts[3] === id && parts[2] in skinIds) addForm(parts[2], id);
  }
  const tiersOf = new Map(); // parent -> sorted tiers (en)
  for (const skin of Object.values(skinsEn)) {
    const tiers = skin.questSkinInfo?.tiers;
    if (!tiers || tiers.length < 2) continue;
    const sorted = [...tiers].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
    const parent = String(sorted[0].id);
    if (!(parent in skinIds)) continue;
    tiersOf.set(parent, sorted);
    for (const t of sorted.slice(1)) if (pkgs.has(String(t.id))) addForm(parent, String(t.id));
  }

  // --- analyze packages (parts shown, META name), cached by sha
  const ids = [...families].flatMap(([p, set]) => [p, ...set]).filter((id) => pkgs.has(id));
  const analysis = {};
  await Promise.all(
    ids.map(async (id) => {
      const { path, sha } = pkgs.get(id);
      if (cache[id]?.sha === sha) return void (analysis[id] = cache[id]);
      try {
        const buf = await get(REPO_RAW + path, "buffer");
        analysis[id] = { sha, meta: packageMetaName(buf), lists: packageParts(buf) };
        console.log(`analyzed ${id} (${(buf.length / 1e6).toFixed(1)} MB)`);
      } catch (err) {
        console.warn(`warn: ${id}: ${err.message}`);
        if (cache[id]) analysis[id] = cache[id];
      }
    })
  );
  writeFileSync(CACHE, JSON.stringify(analysis, null, 1) + "\n");

  // --- game text lookups
  const strEntries = Object.entries(strEn);
  /** pt_BR of an English label: the skin's feature names, then the game's text, then the glossary. */
  function ptOf(label, parent) {
    const n = norm(label);
    const feats = skinsEn[parent]?.skinFeaturePreviewData ?? [];
    const featsPt = skinsPt[parent]?.skinFeaturePreviewData ?? [];
    const fi = feats.findIndex((f) => norm(f.description) === n);
    if (fi >= 0 && featsPt[fi]) return featsPt[fi].description;
    const tier = tierPairs(parent).find((p) => norm(p.en) === n);
    if (tier?.pt) return tier.pt;
    const alias = champAlias(parent).toLowerCase();
    const hits = strEntries.filter(([, v]) => typeof v === "string" && norm(stripTags(v)) === n);
    const own = hits.filter(([k]) => alias && k.toLowerCase().includes(alias));
    for (const pool of [own, hits]) {
      const pts = new Set(pool.map(([k]) => stripTags(strPt[k])).filter(Boolean));
      if (pts.size === 1) return [...pts][0];
    }
    return GLOSSARY_PT[label.toLowerCase()] ?? null;
  }
  /** Riot's tier labels of a skin, in English and pt_BR ("Rising Star" / "Rumo ao Estrelato"). */
  function tierPairs(parent) {
    const tiers = tiersOf.get(parent);
    if (!tiers) return [];
    const ptTiers = skinsPt[parent]?.questSkinInfo?.tiers ?? [];
    const ptName = (x) => ptTiers.find((y) => y.id === x.id)?.name;
    return tiers.map((t, i) => {
      const other = tiers[i === 0 ? 1 : 0];
      const en = tierLabel(t.name, other.name, champEn(parent));
      const pt =
        ptName(t) && ptName(other) ? tierLabel(ptName(t), ptName(other), champPt(parent)) : null;
      return { id: String(t.id), en, pt };
    });
  }

  /** Title of a stage in the game's text: "Chosen Kai'Sa" / "Kai'Sa Escolhida". */
  function stageTitle(parent, stage) {
    const alias = champAlias(parent).toLowerCase();
    const re = new RegExp(`transform_meter_${alias}_\\d+_form${stage}$`, "i");
    const keys = Object.keys(strEn).filter((k) => re.test(k));
    if (keys.length !== 1) return null;
    const title = (s) => /<titleLeft>(.*?)<\/titleLeft>/i.exec(String(s ?? ""))?.[1]?.trim();
    const en = title(strEn[keys[0]]);
    const pt = title(strPt[keys[0]]);
    return en
      ? {
          en: withoutChampion(en, champEn(parent)),
          pt: pt ? withoutChampion(pt, champPt(parent)) : null,
        }
      : null;
  }
  /** A class weapon's class in the game's text ("Assassin" -> "Assassino"). */
  function classTitle(parent, cls) {
    return { en: cls, pt: ptOf(cls, parent) };
  }

  // Rose's names: `formIds: [base, ...]` with `formNames: [...]`.
  const roseNames = new Map();
  const roseFolders = new Map(); // parent -> button folder
  for (const m of roseJs.matchAll(
    /buttonFolder:\s*"([a-z_]+)",[^\]]*?formIds:\s*\[([\d,\s]+)\][^\n]*\n\s*formNames:\s*\[([^\]]*)\]/g
  )) {
    const fids = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    roseFolders.set(fids[0], m[1]);
    roseNames.set(
      fids[0],
      new Map(fids.map((id, i) => [id, [...m[3].matchAll(/"([^"]*)"/g)][i]?.[1]]))
    );
  }
  // Folders not in that table name a base skin id in the code that handles them.
  const roseAssets = new Map(); // folder -> file names
  for (const e of roseTree.tree) {
    const m = /^assets\/([a-z_]+_buttons)\/([^/]+\.png)$/.exec(e.path);
    if (m) roseAssets.set(m[1], [...(roseAssets.get(m[1]) ?? []), m[2]]);
  }
  for (const folder of roseAssets.keys()) {
    if ([...roseFolders.values()].includes(folder)) continue;
    const files = roseAssets.get(folder);
    const byId = [...families.keys()].find((p) => files.includes(`${p}.png`));
    if (byId) {
      roseFolders.set(byId, folder);
      continue;
    }
    const at = roseJs.indexOf(folder);
    const before = at >= 0 ? roseJs.slice(Math.max(0, at - 800), at) : "";
    const parent = [...families.keys()].find((p) => before.includes(p));
    if (parent) roseFolders.set(parent, folder);
  }

  // --- name every family
  const out = {};
  const iconJobs = [];
  for (const [parent, set] of [...families].sort(([a], [b]) => Number(a) - Number(b))) {
    const forms = [...set].sort((a, b) => Number(a) - Number(b));
    const members = [parent, ...forms];

    // Parts each member shows: lists all members share are skipped, the rest are hidden.
    const shown = new Map();
    const lists = members.map((id) => analysis[id]?.lists);
    if (lists.every((l) => l && l.length)) {
      const common = lists.reduce((acc, l) => acc.filter((x) => l.includes(x)));
      const hidden = lists.map(
        (l) => new Set(l.filter((x) => !common.includes(x)).flatMap((x) => x.split(" ")))
      );
      const all = new Set(hidden.flatMap((h) => [...h]));
      members.forEach((id, i) =>
        shown.set(
          id,
          [...all].filter((p) => !hidden[i].has(p))
        )
      );
    }

    const feats = (skinsEn[parent]?.skinFeaturePreviewData ?? []).map((f) => f.description);
    const nameFromParts = (id) => {
      const parts = shown.get(id);
      if (!parts?.length) return null;
      const stage = stageOf(parts);
      if (stage) return { ...stageTitle(parent, stage), how: `stage ${stage}` };
      const cls = CLASSES.filter((c) =>
        parts.some((p) => p === `${c}_Sword` || p === `${c}_Weapon`)
      );
      if (cls.length === 1) return { ...classTitle(parent, cls[0]), how: "class" };
      const feat = feats.filter(
        (f) =>
          words(f).length === 1 &&
          parts.some((p) => norm(p).startsWith(norm(f)) && norm(f).length >= 4)
      );
      if (feat.length === 1) return { en: feat[0], pt: ptOf(feat[0], parent), how: "feature" };
      return null;
    };

    const hasStages = members.some((id) => shown.get(id)?.length && stageOf(shown.get(id)));
    const rose = roseNames.get(parent);
    const label = (id) => {
      const fromParts = nameFromParts(id);
      if (fromParts?.en) return fromParts;
      // The base skin is the first stage when its forms are later ones.
      if (id === parent && forms.some((f) => shown.get(f) && stageOf(shown.get(f)))) {
        const first = stageTitle(parent, 1);
        if (first?.en) return { ...first, how: "stage 1" };
      }
      const meta = id === parent ? null : packageLabel(analysis[id]?.meta, skinIds[parent]);
      if (meta) return { en: meta, pt: ptOf(meta, parent), how: "package" };
      const r = rose?.get(id);
      if (!isGeneric(r)) return { en: r, pt: ptOf(r, parent), how: "rose" };
      // Riot's tiers name packages by product id, which can disagree with what the
      // package shows (145071 shows the Chosen stage): skip them when stages are visible.
      const t = hasStages ? null : tierPairs(parent).find((x) => x.id === id);
      if (t?.en) return { en: t.en, pt: t.pt, how: "tier" };
      return { en: null, pt: null, how: "-" };
    };

    const names = new Map(members.map((id) => [id, label(id)]));
    // Two members with one name means the source can't tell them apart: drop it.
    const seen = new Map();
    for (const [id, n] of names)
      if (n.en) seen.set(norm(n.en), [...(seen.get(norm(n.en)) ?? []), id]);
    for (const dup of seen.values())
      if (dup.length > 1) for (const id of dup) names.set(id, { en: null, pt: null, how: "dup" });

    // Pictures: Rose names its button files by skin id or numbers them in id order.
    const folder = roseFolders.get(parent);
    const files = folder ? (roseAssets.get(folder) ?? []) : [];
    members.forEach((id, i) => {
      const file = files.includes(`${id}.png`)
        ? `${id}.png`
        : files.includes(`${i + 1}.png`)
          ? `${i + 1}.png`
          : null;
      if (file) iconJobs.push({ id, url: `${ROSE_RAW}assets/${folder}/${file}` });
    });

    const entry = (id) => {
      const n = names.get(id);
      return { en: n.en, pt: n.en ? (n.pt ?? null) : null };
    };
    out[parent] = {
      base: entry(parent),
      forms: Object.fromEntries(forms.map((id) => [id, entry(id)])),
    };
    console.log(
      `${parent} ${skinIds[parent]} [${folder ?? "no pictures"}]: ` +
        members
          .map(
            (id) =>
              `${id}=${names.get(id).en ?? "?"}/${names.get(id).pt ?? "?"} (${names.get(id).how})`
          )
          .join(", ")
    );
  }

  // --- pictures
  const haveSips = spawnSync("sips", ["--version"]).status === 0;
  if (!iconJobs.length) {
    console.warn("warn: no form pictures found (Rose unreachable?), keeping the committed ones");
  } else if (haveSips) {
    mkdirSync(ICONS, { recursive: true });
    const keep = new Set(iconJobs.map((j) => `${j.id}.png`));
    for (const f of readdirSync(ICONS)) if (!keep.has(f)) rmSync(new URL(f, ICONS));
    await Promise.all(
      iconJobs.map(async ({ id, url }) => {
        try {
          const file = new URL(`${id}.png`, ICONS).pathname;
          writeFileSync(file, await get(url, "buffer"));
          execFileSync(
            "sips",
            ["-Z", String(ICON_SIZE), "-s", "format", "png", file, "--out", file],
            { stdio: "ignore" }
          );
        } catch (err) {
          console.warn(`warn: picture ${id}: ${err.message}`);
        }
      })
    );
  } else {
    console.warn("warn: no sips (macOS), keeping the committed pictures");
  }

  mkdirSync(new URL(".", OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
