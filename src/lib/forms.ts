// Skins whose look changes during a match (Elementalist Lux's elements, Gun Goddess
// Miss Fortune's weapons, Revenant Reign Viego's forms...). The client triggers those
// changes through match state the server keeps, and to the server a player using Zushi
// wears the default skin, so a form never switches in game. LeagueSkins publishes each
// form as its own package instead, mostly nested under the skin with an id that isn't a
// real skin id (skins/99/99007/99991/99991.fantome). Picking one before the match plays
// that form for the whole game, as Rose does.
//
// Names come from src/data/forms.json, generated from Riot's and the packages' own data
// by scripts/gen-forms.mjs. Forms no data names are numbered after the base skin (Form 1).

import formsData from "../data/forms.json";

export interface FormInfo {
  id: string;
  parentId: string;
  en: string; // label of the form alone, e.g. "Fire"
  pt: string;
}

type Name = { en: string | null; pt: string | null };
type FormsData = Record<string, { base: Name | null; forms: Record<string, Name> }>;
const DATA = formsData as FormsData;

/** What the base skin is called among its forms ("Indie", "Default", "Form 1"). */
export function baseFormLabel(parentId: string, lang: "en" | "pt"): string {
  const entry = DATA[parentId];
  const base = entry?.base;
  if (base?.en) return lang === "pt" ? (base.pt ?? base.en) : base.en;
  // Next to named forms a number would read oddly: call it the default one.
  const anyNamed = entry && Object.values(entry.forms).some((f) => f.en);
  if (anyNamed) return lang === "pt" ? "Padrão" : "Default";
  return lang === "pt" ? "Forma 1" : "Form 1";
}

/**
 * Finds the form packages in the repo tree: those nested under a skin
 * (skins/<champ>/<skin>/<id>/) with an id skin_ids.json doesn't know (chromas are
 * nested the same way but are real ids), plus the ones forms.json lists elsewhere.
 */
export function buildForms(
  repoPaths: Map<string, string>,
  skinIds: Record<string, string>
): Map<string, FormInfo> {
  const byParent = new Map<string, Set<string>>();
  const add = (parentId: string, id: string) => {
    const set = byParent.get(parentId) ?? new Set<string>();
    set.add(id);
    byParent.set(parentId, set);
  };

  for (const [id, path] of repoPaths) {
    if (id in skinIds) continue;
    const parts = path.split("/");
    if (parts.length !== 5) continue; // skins/<champ>/<parent>/<id>/<file>
    const parentId = parts[2];
    if (parentId in skinIds && parts[3] === id) add(parentId, id);
  }
  for (const [parentId, entry] of Object.entries(DATA)) {
    if (!(parentId in skinIds)) continue;
    for (const id of Object.keys(entry.forms)) if (repoPaths.has(id)) add(parentId, id);
  }

  const forms = new Map<string, FormInfo>();
  for (const [parentId, set] of byParent) {
    const ids = [...set].sort((a, b) => Number(a) - Number(b));
    const names = DATA[parentId]?.forms ?? {};
    ids.forEach((id, i) => {
      const named = names[id];
      const n = i + 2; // by position: the base skin is form 1
      forms.set(
        id,
        named?.en
          ? { id, parentId, en: named.en, pt: named.pt ?? named.en }
          : { id, parentId, en: `Form ${n}`, pt: `Forma ${n}` }
      );
    });
  }
  return forms;
}
