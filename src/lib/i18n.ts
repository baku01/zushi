import { useSyncExternalStore } from "react";

export type Lang = "en" | "pt";

const LANG_KEY = "zushi:lang";

type Plural = { one: string; other: string };
type Entry = string | Plural;

const en = {
  "nav.champions": "Champions",
  "nav.mySkins": "My Skins",
  "nav.customs": "Customs",
  "nav.settings": "Settings",
  "nav.updates": { one: "{n} skin update available", other: "{n} skin updates available" },
  "sidebar.star": "Star Zushi on GitHub",

  "grid.search": "Search champions...",
  "grid.loading": "Loading champions...",
  "grid.failed": "Failed to load champion data",
  "grid.none": "No champions found",
  "grid.all": "All",
  "detail.allSkins": "All",
  "detail.noneOfType": "No skins of this type",
  "grid.owned": { one: "{n} skin downloaded", other: "{n} skins downloaded" },
  "grid.selected": "Skin selected for the next game",
  "grid.typeHint": "Show champions with skins of this type",
  "type.forms": "Forms",
  "type.formsHint": "Skins that transform in game: pick the form before the match",
  "tag.Assassin": "Assassin",
  "tag.Fighter": "Fighter",
  "tag.Mage": "Mage",
  "tag.Marksman": "Marksman",
  "tag.Support": "Support",
  "tag.Tank": "Tank",

  "detail.back": "Back to champions",
  "detail.loading": "Loading skins...",
  "detail.failed": "Failed to load skin data",
  "detail.none": "No skins available",
  "detail.skins": { one: "{n} skin", other: "{n} skins" },
  "detail.downloaded": "{n} downloaded",
  "detail.downloadAll": "Download all",
  "detail.download": "Download",
  "detail.downloadGroup": "Download skin and its variants",
  "detail.notAvailable": "Not available",
  "detail.noPreview": "No preview",
  "detail.chromas": "Chromas",
  "detail.forms": "Forms",
  "detail.formsHint":
    "Pick the form before the match: skins applied by Zushi can't switch forms in game.",
  "detail.variantDownloaded": "{name} (downloaded)",
  "detail.variantDownload": "{name}: click to download",
  "detail.variantMissing": "{name} (not available)",

  "rarity.kNoRarity": "Standard",
  "rarity.kRare": "Rare",
  "rarity.kEpic": "Epic",
  "rarity.kLegendary": "Legendary",
  "rarity.kMythic": "Mythic",
  "rarity.kUltimate": "Ultimate",
  "rarity.kExalted": "Exalted",
  "rarity.kTranscendent": "Transcendent",
  "rarity.legacy": "Legacy",

  "my.skins": { one: "{n} skin", other: "{n} skins" },
  "my.empty": "No skins downloaded yet",
  "my.emptyHint": "Open a champion and download skins to get started",
  "my.filter": "Filter by champion",
  "my.noMatch": 'No champions match "{q}"',
  "my.update": { one: "Update {n} skin", other: "Update {n} skins" },
  "my.updating": "Updating...",
  "my.updateTip": "Republished on LeagueSkins (e.g. sound fixes) since you downloaded them",
  "my.selected": "{n} selected",
  "my.clearSelection": "Clear selection",
  "my.tipTitle": "Keep the default skin",
  "my.tipBody":
    "selected in champion select. If you pick a skin you own, it overrides the one Zushi applies.",
  "my.baseMissing": "{name} (base not downloaded)",
  "my.delete": "Delete skin",
  "my.deleteGroup": "Delete skin and its variants",
  "my.rightClickDelete": "right-click to delete",
  "my.updateAvailable": "Update available",
  "my.variantUpdates": {
    one: "Update available for {n} variant",
    other: "Update available for {n} variants",
  },
  "my.formTip": "Forms can't change during the game: pick one here before the match.",

  "status.Idle": "Ready",
  "status.Importing": "Importing mods...",
  "status.BuildingOverlay": "Building overlay...",
  "status.WaitingForGame": "Waiting for game...",
  "status.FoundGame": "Game found!",
  "status.Scanning": "Scanning game...",
  "status.Patching": "Mods applied!",
  "status.InGame": "In game",
  "status.GameExited": "Game ended, ready for the next one...",
  "status.stop": "Stop",
  "status.stopTip": "Stop patcher",
  "status.apply": "Apply",
  "status.skins": { one: "{n} skin", other: "{n} skins" },
  "status.customs": { one: "{n} custom", other: "{n} customs" },

  "download.preparing": "Preparing downloads...",
  "download.item": "Downloading {name}",

  "settings.general": "General",
  "settings.autostart": "Launch at login",
  "settings.autostartHint": "Start Zushi automatically when you log in",
  "settings.language": "Language",
  "settings.languageHint": "Interface, champion and skin names",
  "settings.gamePath": "Game path",
  "settings.notSet": "Not set",
  "settings.validating": "Validating...",
  "settings.change": "Change",
  "settings.pickGame": "Select League of Legends app",
  "settings.invalidPath": "Invalid game path: LeagueofLegends.app not found",
  "settings.dialogFailed": "Failed to open file dialog.",
  "settings.storage": "Storage",
  "settings.total": "Total usage",
  "settings.content": "Skins & custom mods",
  "settings.contentHint": "Downloaded skins and imported mods",
  "settings.work": "Patcher data",
  "settings.workHint": "Temporary overlay files, rebuilt on apply",
  "settings.clear": "Clear",
  "settings.stopFirst": "Stop the patcher before clearing data.",

  "customs.count": { one: "{n} custom", other: "{n} customs" },
  "customs.active": "{n} active",
  "customs.stopFirst": "Stop the patcher to add mods",
  "customs.adding": "Adding {name}...",
  "customs.drop": "Drop mods here",
  "customs.browse": "or click to browse (.fantome, .zip, .modpkg)",
  "customs.none": "No custom mods yet",
  "customs.remove": "Remove",

  "setup.welcome": "Welcome to Zushi",
  "setup.notFound": "League of Legends not found",
  "setup.detected": "We detected your League of Legends installation.",
  "setup.select": "Select your League of Legends game path to get started.",
  "setup.dialogTitle": "Select your League of Legends game path",
  "setup.continue": "Continue",
  "setup.validating": "Validating...",
  "setup.change": "Wrong path? Change it",
  "setup.another": "Select another path",
  "setup.browse": "Browse...",
  "setup.error": "Something went wrong while validating the path.",

  "update.available": "v{v} available",
  "update.failed": "Update failed: {e}",
  "update.install": "Update & restart",
  "update.installing": "Updating…",
  "update.download": "Download update",
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;

const pt: Record<Key, Entry> = {
  "nav.champions": "Campeões",
  "nav.mySkins": "Minhas skins",
  "nav.customs": "Mods",
  "nav.settings": "Configurações",
  "nav.updates": {
    one: "{n} atualização de skin disponível",
    other: "{n} atualizações de skin disponíveis",
  },
  "sidebar.star": "Apoie no GitHub",

  "grid.search": "Buscar campeões...",
  "grid.loading": "Carregando campeões...",
  "grid.failed": "Falha ao carregar os campeões",
  "grid.none": "Nenhum campeão encontrado",
  "grid.all": "Todos",
  "detail.allSkins": "Todas",
  "detail.noneOfType": "Nenhuma skin deste tipo",
  "grid.owned": { one: "{n} skin baixada", other: "{n} skins baixadas" },
  "grid.selected": "Skin selecionada para a próxima partida",
  "grid.typeHint": "Mostra os campeões com skins deste tipo",
  "type.forms": "Com formas",
  "type.formsHint": "Skins que se transformam no jogo: escolha a forma antes da partida",
  "tag.Assassin": "Assassino",
  "tag.Fighter": "Lutador",
  "tag.Mage": "Mago",
  "tag.Marksman": "Atirador",
  "tag.Support": "Suporte",
  "tag.Tank": "Tanque",

  "detail.back": "Voltar aos campeões",
  "detail.loading": "Carregando skins...",
  "detail.failed": "Falha ao carregar as skins",
  "detail.none": "Nenhuma skin disponível",
  "detail.skins": { one: "{n} skin", other: "{n} skins" },
  "detail.downloaded": { one: "{n} baixada", other: "{n} baixadas" },
  "detail.downloadAll": "Baixar todas",
  "detail.download": "Baixar",
  "detail.downloadGroup": "Baixar a skin e as variações",
  "detail.notAvailable": "Indisponível",
  "detail.noPreview": "Sem prévia",
  "detail.chromas": "Cromas",
  "detail.forms": "Formas",
  "detail.formsHint":
    "Escolha a forma antes da partida: skins aplicadas pelo Zushi não trocam de forma no jogo.",
  "detail.variantDownloaded": "{name} (baixada)",
  "detail.variantDownload": "{name}: clique para baixar",
  "detail.variantMissing": "{name} (indisponível)",

  "rarity.kNoRarity": "Padrão",
  "rarity.kRare": "Rara",
  "rarity.kEpic": "Épica",
  "rarity.kLegendary": "Lendária",
  "rarity.kMythic": "Mítica",
  "rarity.kUltimate": "Suprema",
  "rarity.kExalted": "Exaltada",
  "rarity.kTranscendent": "Transcendente",
  "rarity.legacy": "Legado",

  "my.skins": { one: "{n} skin", other: "{n} skins" },
  "my.empty": "Nenhuma skin baixada ainda",
  "my.emptyHint": "Abra um campeão e baixe skins para começar",
  "my.filter": "Filtrar por campeão",
  "my.noMatch": 'Nenhum campeão corresponde a "{q}"',
  "my.update": { one: "Atualizar {n} skin", other: "Atualizar {n} skins" },
  "my.updating": "Atualizando...",
  "my.updateTip":
    "Republicadas no LeagueSkins (por exemplo, correções de som) desde que você baixou",
  "my.selected": { one: "{n} selecionada", other: "{n} selecionadas" },
  "my.clearSelection": "Limpar seleção",
  "my.tipTitle": "Mantenha a skin padrão",
  "my.tipBody":
    "na seleção de campeões. Se escolher uma skin que você tem, ela substitui a que o Zushi aplica.",
  "my.baseMissing": "{name} (base não baixada)",
  "my.delete": "Excluir skin",
  "my.deleteGroup": "Excluir a skin e as variações",
  "my.rightClickDelete": "clique direito para excluir",
  "my.updateAvailable": "Atualização disponível",
  "my.variantUpdates": {
    one: "Atualização disponível para {n} variação",
    other: "Atualização disponível para {n} variações",
  },
  "my.formTip": "A forma não muda durante a partida: escolha uma aqui antes de jogar.",

  "status.Idle": "Pronto",
  "status.Importing": "Importando mods...",
  "status.BuildingOverlay": "Montando o overlay...",
  "status.WaitingForGame": "Aguardando a partida...",
  "status.FoundGame": "Partida encontrada!",
  "status.Scanning": "Analisando o jogo...",
  "status.Patching": "Mods aplicados!",
  "status.InGame": "Em partida",
  "status.GameExited": "Partida encerrada, pronto para a próxima...",
  "status.stop": "Parar",
  "status.stopTip": "Parar o patcher",
  "status.apply": "Aplicar",
  "status.skins": { one: "{n} skin", other: "{n} skins" },
  "status.customs": { one: "{n} mod", other: "{n} mods" },

  "download.preparing": "Preparando downloads...",
  "download.item": "Baixando {name}",

  "settings.general": "Geral",
  "settings.autostart": "Abrir ao iniciar a sessão",
  "settings.autostartHint": "Abre o Zushi automaticamente quando você entra no Mac",
  "settings.language": "Idioma",
  "settings.languageHint": "Interface e nomes de campeões e skins",
  "settings.gamePath": "Pasta do jogo",
  "settings.notSet": "Não definida",
  "settings.validating": "Validando...",
  "settings.change": "Alterar",
  "settings.pickGame": "Selecione o app do League of Legends",
  "settings.invalidPath": "Pasta inválida: LeagueofLegends.app não encontrado",
  "settings.dialogFailed": "Não foi possível abrir a janela de arquivos.",
  "settings.storage": "Armazenamento",
  "settings.total": "Uso total",
  "settings.content": "Skins e mods",
  "settings.contentHint": "Skins baixadas e mods importados",
  "settings.work": "Dados do patcher",
  "settings.workHint": "Arquivos temporários do overlay, recriados ao aplicar",
  "settings.clear": "Limpar",
  "settings.stopFirst": "Pare o patcher antes de limpar os dados.",

  "customs.count": { one: "{n} mod", other: "{n} mods" },
  "customs.active": { one: "{n} ativo", other: "{n} ativos" },
  "customs.stopFirst": "Pare o patcher para adicionar mods",
  "customs.adding": "Adicionando {name}...",
  "customs.drop": "Solte os mods aqui",
  "customs.browse": "ou clique para procurar (.fantome, .zip, .modpkg)",
  "customs.none": "Nenhum mod ainda",
  "customs.remove": "Remover",

  "setup.welcome": "Boas-vindas ao Zushi",
  "setup.notFound": "League of Legends não encontrado",
  "setup.detected": "Encontramos a sua instalação do League of Legends.",
  "setup.select": "Selecione a pasta do League of Legends para começar.",
  "setup.dialogTitle": "Selecione a pasta do League of Legends",
  "setup.continue": "Continuar",
  "setup.validating": "Validando...",
  "setup.change": "Pasta errada? Alterar",
  "setup.another": "Selecionar outra pasta",
  "setup.browse": "Procurar...",
  "setup.error": "Algo deu errado ao validar a pasta.",

  "update.available": "v{v} disponível",
  "update.failed": "Falha na atualização: {e}",
  "update.install": "Atualizar e reiniciar",
  "update.installing": "Atualizando…",
  "update.download": "Baixar atualização",
};

const DICTS: Record<Lang, Record<Key, Entry>> = { en, pt };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "pt") return saved;
  } catch {}
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pt")
    ? "pt"
    : "en";
}

// One small store for the language and a "data version" that bumps whenever
// localized names or skin metadata finish loading, so components re-render.
let state = { lang: initialLang(), version: 0 };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLang(): Lang {
  return state.lang;
}

const langListeners = new Set<(lang: Lang) => void>();

/** Runs `fn` now and whenever the language changes (used to load localized data). */
export function onLangChange(fn: (lang: Lang) => void): () => void {
  langListeners.add(fn);
  fn(state.lang);
  return () => langListeners.delete(fn);
}

export function setLang(lang: Lang): void {
  if (lang === state.lang) return;
  state = { ...state, lang };
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  for (const fn of langListeners) fn(lang);
  emit();
}

/** Call when data used by display helpers (names, rarity, forms) changes. */
export function bumpDataVersion(): void {
  state = { ...state, version: state.version + 1 };
  emit();
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const entry = DICTS[state.lang][key] ?? en[key];
  const text = typeof entry === "string" ? entry : vars.n === 1 ? entry.one : entry.other;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/**
 * Re-renders the caller on language or data changes. Returns `t` for convenience;
 * the display helpers in hooks/useSkinData and hooks/useChampions read the same store.
 */
export function useI18n() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return { lang: snapshot.lang, version: snapshot.version, t, setLang };
}

/** Lower-case, accent-free text for search ("Kai'Sa" ~ "kaisa", "Lâmina" ~ "lamina"). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.\s-]/g, "")
    .toLowerCase();
}
