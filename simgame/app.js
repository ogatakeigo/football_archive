const pending = new Map();
let requestSeq = 1;
let dashboardCache = null;
let routeStack = [{ name: "dashboard", params: {}, state: {} }];
let currentRoute = routeStack[0];
let searchTimer = null;
const navOpenCountries = new Set();
const navOpenRegions = new Set();
const navClosedCountries = new Set();
const navClosedRegions = new Set();

const content = document.querySelector("#content");
const pageTitle = document.querySelector("#pageTitle");
const pageMeta = document.querySelector("#pageMeta");
const leagueNav = document.querySelector("#leagueNav");
const favoriteNav = document.querySelector("#favoriteNav");
const notice = document.querySelector("#notice");
const advanceButton = document.querySelector("#advanceButton");
let currentEventPositionMap = new Map();
let skipSeasonButton = document.querySelector("#skipSeasonButton");
if (!skipSeasonButton && advanceButton) {
  skipSeasonButton = document.createElement("button");
  skipSeasonButton.id = "skipSeasonButton";
  skipSeasonButton.className = "small-button";
  skipSeasonButton.textContent = "シーズン終了まで";
  advanceButton.before(skipSeasonButton);
}
let roundJumpInput = document.querySelector("#roundJumpInput");
let roundJumpButton = document.querySelector("#roundJumpButton");
if (!roundJumpInput && advanceButton) {
  const roundJump = document.createElement("div");
  roundJump.className = "round-jump";
  roundJump.innerHTML = `
    <span>第</span>
    <input id="roundJumpInput" class="round-input" type="number" min="1" inputmode="numeric">
    <span>節まで</span>
    <button id="roundJumpButton" class="small-button">進行</button>
  `;
  (skipSeasonButton || advanceButton).before(roundJump);
  roundJumpInput = document.querySelector("#roundJumpInput");
  roundJumpButton = document.querySelector("#roundJumpButton");
}
let seasonSkipSelect = document.querySelector("#seasonSkipSelect");
let seasonSkipButton = document.querySelector("#seasonSkipButton");
if (!seasonSkipSelect && advanceButton) {
  const seasonSkip = document.createElement("div");
  seasonSkip.className = "season-skip";
  seasonSkip.innerHTML = `
    <select id="seasonSkipSelect" class="season-skip-select" aria-label="スキップするシーズン数">
      ${[1, 2, 3, 5, 10].map((value) => `<option value="${value}" ${value === 10 ? "selected" : ""}>${value}</option>`).join("")}
    </select>
    <button id="seasonSkipButton" class="small-button">10シーズンスキップ</button>
  `;
  advanceButton.before(seasonSkip);
  seasonSkipSelect = document.querySelector("#seasonSkipSelect");
  seasonSkipButton = document.querySelector("#seasonSkipButton");
}
const backButton = document.querySelector("#backButton");
const searchBox = document.querySelector("#searchBox");
const searchResults = document.querySelector("#searchResults");

function api(action, payload = {}, options = {}) {
  const id = String(requestSeq++);
  const webview = window.chrome && window.chrome.webview;
  if (!webview && window.JLeagueLocalApi) {
    return window.JLeagueLocalApi.handle(action, payload, options);
  }
  if (!webview) {
    return Promise.reject(new Error("WebView2 または LocalApi で起動してください。"));
  }

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: options.onProgress });
    webview.postMessage({ id, action, payload });
  });
}

if (window.chrome && window.chrome.webview) {
  window.chrome.webview.addEventListener("message", (event) => {
    const message = event.data || {};
    const waiter = pending.get(message.id);
    if (!waiter) return;
    if (message.progress) {
      waiter.onProgress?.(message.data || {});
      return;
    }
    pending.delete(message.id);
    if (message.ok) waiter.resolve(message.data);
    else waiter.reject(new Error(message.error || "処理に失敗しました。"));
  });
}

function f(obj, key, fallback = "") {
  if (!obj) return fallback;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key] ?? fallback;
  const found = Object.keys(obj).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return found ? (obj[found] ?? fallback) : fallback;
}

function num(obj, key) {
  const value = f(obj, key, 0);
  return Number(value || 0);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const favoritesKey = "jleagueSandbox.favorites.v1";
const resultMaskKey = "jleagueSandbox.resultMask.v1";

function readFavorites() {
  try {
    const data = JSON.parse(localStorage.getItem(favoritesKey) || "{}");
    return {
      teams: Array.isArray(data.teams) ? data.teams : [],
      leagues: Array.isArray(data.leagues) ? data.leagues : [],
      cups: Array.isArray(data.cups) ? data.cups : [],
      continental: Array.isArray(data.continental) ? data.continental : [],
      national: Array.isArray(data.national) ? data.national : []
    };
  } catch {
    return { teams: [], leagues: [], cups: [], continental: [], national: [] };
  }
}

function writeFavorites(data) {
  localStorage.setItem(favoritesKey, JSON.stringify({
    teams: data.teams || [],
    leagues: data.leagues || [],
    cups: data.cups || [],
    continental: data.continental || [],
    national: data.national || []
  }));
  renderFavoriteNav();
}

function favoriteListName(type) {
  if (type === "league") return "leagues";
  if (type === "cup") return "cups";
  if (type === "continental") return "continental";
  if (type === "national") return "national";
  return "teams";
}

function isFavorite(type, id) {
  const data = readFavorites();
  return (data[favoriteListName(type)] || []).some((item) => String(item.id) === String(id));
}

function toggleFavorite(type, item) {
  const data = readFavorites();
  const listName = favoriteListName(type);
  const list = data[listName];
  const id = type === "team" || type === "league" ? Number(item.id) : String(item.id);
  const index = list.findIndex((entry) => String(entry.id) === String(id));
  if (index >= 0) list.splice(index, 1);
  else list.push({ ...item, id });
  writeFavorites(data);
  return index < 0;
}

function renderFavoriteNav() {
  if (!favoriteNav) return;
  const data = readFavorites();
  const leagues = data.leagues || [];
  const teams = data.teams || [];
  const cups = data.cups || [];
  const continental = data.continental || [];
  const national = data.national || [];
  if (leagues.length === 0 && teams.length === 0 && cups.length === 0 && continental.length === 0 && national.length === 0) {
    favoriteNav.innerHTML = "";
    return;
  }
  favoriteNav.innerHTML = `
    <div class="nav-label nav-subhead">お気に入り</div>
    ${teams.map((team) => `
      <button class="nav-button favorite-button" data-team="${esc(team.id)}">
        <span class="league-dot"></span>${esc(team.shortName || team.name)}
      </button>
    `).join("")}
    ${leagues.map((league) => `
      <button class="nav-button favorite-button" data-league="${esc(league.id)}">
        <span class="league-dot"></span>${esc(league.code || "")} ${esc(league.name)}
      </button>
    `).join("")}
    ${cups.map((cup) => `
      <button class="nav-button favorite-button" data-cup="${esc(cup.id)}">
        <span class="league-dot"></span>${esc(cup.name)}
      </button>
    `).join("")}
    ${continental.map((cup) => `
      <button class="nav-button favorite-button" data-continental="${esc(cup.id)}">
        <span class="league-dot"></span>${esc(cup.name)}
      </button>
    `).join("")}
    ${national.map((cup) => `
      <button class="nav-button favorite-button" data-national="${esc(cup.id)}">
        <span class="league-dot"></span>${esc(cup.name)}
      </button>
    `).join("")}
  `;
}

function teamCell(teamId, name, color, shortName = "", seasonId = null, statsScope = "") {
  if (!Number(teamId)) {
    return `<span class="team-cell"><span class="team-mark" style="background:${esc(color || "#78909c")}"></span><span>${esc(shortName || name || "-")}</span></span>`;
  }
  const seasonAttr = seasonId ? ` data-season="${esc(seasonId)}"` : "";
  const scopeAttr = statsScope ? ` data-stats-scope="${esc(statsScope)}"` : "";
  return `<span class="team-cell"><span class="team-mark" style="background:${esc(color || "#78909c")}"></span><span class="link" data-team="${teamId}"${seasonAttr}${scopeAttr}>${esc(shortName || name)}</span></span>`;
}

function playerLink(playerId, name) {
  return `<button class="link player-link" data-player="${playerId}" type="button">${esc(name)}</button>`;
}

function matchLink(matchId, label) {
  return `<span class="link" data-match="${matchId}">${esc(label)}</span>`;
}

function maskedMatchLink(matchId) {
  return `<span class="link masked-value" data-match="${matchId}">•••</span>`;
}

function isResultMasked() {
  return localStorage.getItem(resultMaskKey) !== "off";
}

function setResultMasked(masked) {
  localStorage.setItem(resultMaskKey, masked ? "on" : "off");
}

function renderResultMaskToggle(masked = isResultMasked()) {
  return `<button class="inline-button result-mask-toggle${masked ? " active" : ""}" data-result-mask-toggle type="button">${masked ? "マスキングON" : "マスキングOFF"}</button>`;
}

function maskedValue(value, masked = isResultMasked()) {
  return masked ? `<span class="masked-value">•••</span>` : esc(value);
}

function maskedPanel(label = "マスキング中") {
  return `<div class="masked-panel"><span>${esc(label)}</span></div>`;
}

function maskedTeamCell() {
  return `<span class="team-cell"><span class="team-mark masked-team-mark"></span><span class="masked-value">•••</span></span>`;
}

function shouldShowCupFixtureTeams(row) {
  const round = num(row, "CompetitionRound");
  const stage = f(row, "StageName", "");
  if (round === 1) return true;
  return stage.includes("Group") || stage.includes("グループ");
}

function competitionLabel(row) {
  const code = f(row, "CompetitionCode", "League");
  if (code === "Emperor") return "天皇杯";
  if (code === "Levain") return "ルヴァン杯";
  if (code === "King") return "キングスカップ";
  if (code === "ThaiFA") return "タイFAカップ";
  if (code === "ChinaFA") return "中国FAカップ";
  if (code === "Emir") return "アミールカップ";
  if (code === "UaePresident") return "UAEプレジデントカップ";
  if (code === "KoreaCup") return "コリアカップ";
  if (code === "MalaysiaFA") return "マレーシアFAカップ";
  if (code === "Hazfi") return "ハズフィーカップ";
  if (/^[A-Z]{3}Cup$/i.test(code || "")) return genericDomesticCupLabel(code);
  if (code === "ACL") return "ACL";
  if (code === "ACL2") return "ACL2";
  if (code === "CL") return "CL";
  if (code === "EL") return "EL";
  if (code === "ECL") return "ECL";
  if (code === "Libertadores") return "リベルタドーレス";
  if (code === "Sudamericana") return "スダメリカーナ";
  if (code === "ConcacafChampionsCup") return "CONCACAFチャンピオンズカップ";
  if (code === "CAFChampionsLeague") return "CAFチャンピオンズリーグ";
  if (code === "ClubWorldCup") return "クラブワールドカップ";
  if (code === "WorldCup") return "ワールドカップ";
  if (code === "U23WorldCup") return "オリンピック";
  if (code === "U20WorldCup") return "ワールドユース";
  if (code === "AsiaCup") return "アジアカップ";
  if (code === "U23AsiaCup") return "U-23アジアカップ";
  if (code === "U20AsiaCup") return "U-20アジアカップ";
  if (code === "Euro") return "EURO";
  if (code === "U23Euro") return "U-23EURO";
  if (code === "U20Euro") return "U-20EURO";
  if (code === "CopaAmerica") return "コパアメリカ";
  if (code === "U23CopaAmerica") return "U-23コパアメリカ";
  if (code === "U20CopaAmerica") return "U-20コパアメリカ";
  if (code === "GoldCup") return "ゴールドカップ";
  if (code === "U23GoldCup") return "U-23ゴールドカップ";
  if (code === "U20GoldCup") return "U-20ゴールドカップ";
  if (code === "AFCON") return "アフリカネーションズカップ";
  if (code === "U23AFCON") return "U-23アフリカネーションズカップ";
  if (code === "U20AFCON") return "U-20アフリカネーションズカップ";
  const domesticLabel = genericDomesticCupLabel(code);
  if (domesticLabel) return domesticLabel;
  return f(row, "LeagueCode", "リーグ");
}

function domesticCupCountryCode(code) {
  if (code === "Emperor" || code === "Levain") return "JPN";
  if (code === "King") return "SAU";
  if (code === "ThaiFA") return "THA";
  if (code === "ChinaFA") return "CHN";
  if (code === "Emir") return "QAT";
  if (code === "UaePresident") return "UAE";
  if (code === "KoreaCup") return "KOR";
  if (code === "MalaysiaFA") return "MAS";
  if (code === "Hazfi") return "IRN";
  if (/^[A-Z]{3}Cup$/i.test(code || "")) return code.slice(0, 3).toUpperCase();
  return "";
}

function genericDomesticCupLabel(code) {
  if (!/^[A-Z]{3}Cup$/i.test(code || "")) return "";
  const countryCode = code.slice(0, 3).toUpperCase();
  const labels = {
    ENG: "\u30a4\u30f3\u30b0\u30e9\u30f3\u30c9",
    ESP: "\u30b9\u30da\u30a4\u30f3",
    ITA: "\u30a4\u30bf\u30ea\u30a2",
    GER: "\u30c9\u30a4\u30c4",
    NED: "\u30aa\u30e9\u30f3\u30c0",
    POR: "\u30dd\u30eb\u30c8\u30ac\u30eb",
    BEL: "\u30d9\u30eb\u30ae\u30fc",
    SCO: "\u30b9\u30b3\u30c3\u30c8\u30e9\u30f3\u30c9",
    CZE: "\u30c1\u30a7\u30b3",
    TUR: "\u30c8\u30eb\u30b3",
    NOR: "\u30ce\u30eb\u30a6\u30a7\u30fc",
    GRE: "\u30ae\u30ea\u30b7\u30e3",
    AUT: "\u30aa\u30fc\u30b9\u30c8\u30ea\u30a2",
    POL: "\u30dd\u30fc\u30e9\u30f3\u30c9",
    DEN: "\u30c7\u30f3\u30de\u30fc\u30af",
    SUI: "\u30b9\u30a4\u30b9",
    FRA: "\u30d5\u30e9\u30f3\u30b9",
    SWE: "\u30b9\u30a6\u30a7\u30fc\u30c7\u30f3",
    CRO: "\u30af\u30ed\u30a2\u30c1\u30a2",
    SRB: "\u30bb\u30eb\u30d3\u30a2",
    UKR: "\u30a6\u30af\u30e9\u30a4\u30ca",
    RUS: "\u30ed\u30b7\u30a2",
    BUL: "\u30d6\u30eb\u30ac\u30ea\u30a2",
    ROU: "\u30eb\u30fc\u30de\u30cb\u30a2",
    BRA: "\u30d6\u30e9\u30b8\u30eb",
    ARG: "\u30a2\u30eb\u30bc\u30f3\u30c1\u30f3",
    PAR: "\u30d1\u30e9\u30b0\u30a2\u30a4",
    PER: "\u30da\u30eb\u30fc",
    COL: "\u30b3\u30ed\u30f3\u30d3\u30a2",
    ECU: "\u30a8\u30af\u30a2\u30c9\u30eb",
    URU: "\u30a6\u30eb\u30b0\u30a2\u30a4",
    CHI: "\u30c1\u30ea",
    MEX: "\u30e1\u30ad\u30b7\u30b3",
    USA: "\u30a2\u30e1\u30ea\u30ab",
    CRC: "\u30b3\u30b9\u30bf\u30ea\u30ab",
    CAN: "\u30ab\u30ca\u30c0",
    TUN: "\u30c1\u30e5\u30cb\u30b8\u30a2",
    EGY: "\u30a8\u30b8\u30d7\u30c8",
    MAR: "\u30e2\u30ed\u30c3\u30b3",
    RSA: "\u5357\u30a2\u30d5\u30ea\u30ab",
    NGA: "\u30ca\u30a4\u30b8\u30a7\u30ea\u30a2",
    GHA: "\u30ac\u30fc\u30ca",
    CMR: "\u30ab\u30e1\u30eb\u30fc\u30f3",
    SEN: "\u30bb\u30cd\u30ac\u30eb",
    AUS: "\u30aa\u30fc\u30b9\u30c8\u30e9\u30ea\u30a2",
    IDN: "\u30a4\u30f3\u30c9\u30cd\u30b7\u30a2",
    IND: "\u30a4\u30f3\u30c9",
    UZB: "\u30a6\u30ba\u30d9\u30ad\u30b9\u30bf\u30f3",
    VIE: "\u30d9\u30c8\u30ca\u30e0",
    HKG: "\u9999\u6e2f",
    IRQ: "\u30a4\u30e9\u30af",
    BHR: "\u30d0\u30fc\u30ec\u30fc\u30f3",
    JOR: "\u30e8\u30eb\u30c0\u30f3",
    KUW: "\u30af\u30a6\u30a7\u30fc\u30c8"
  };
  return `${labels[countryCode] || countryCode}\u30ab\u30c3\u30d7`;
}

function matchRoundLabel(row) {
  const stage = f(row, "StageName", "");
  if (stage) return stage;
  const group = f(row, "CompetitionGroup", "League");
  return group === "Cup" ? `第${f(row, "CompetitionRound", f(row, "Round"))}戦` : `第${f(row, "Round")}節`;
}

function statsScopeLabel(scope) {
  if (scope === "Continental" || scope === "continental") return "大陸大会";
  if (scope === "National" || scope === "national") return "代表";
  return scope === "Cup" || scope === "cup" ? "カップ" : "リーグ";
}

function renderStatsScopeTabs(scope, target) {
  const current = scope === "National" || scope === "national" ? "National" : scope === "Continental" || scope === "continental" ? "Continental" : scope === "Cup" || scope === "cup" ? "Cup" : "League";
  return `
    <div class="tabs scope-tabs">
      <button class="inline-button season-tab${current === "League" ? " active" : ""}" data-stats-scope="League" data-scope-target="${target}">リーグ</button>
      <button class="inline-button season-tab${current === "Cup" ? " active" : ""}" data-stats-scope="Cup" data-scope-target="${target}">カップ</button>
      <button class="inline-button season-tab${current === "Continental" ? " active" : ""}" data-stats-scope="Continental" data-scope-target="${target}">大陸大会</button>
      <button class="inline-button season-tab${current === "National" ? " active" : ""}" data-stats-scope="National" data-scope-target="${target}">代表</button>
    </div>
  `;
}

function setHeader(title, meta = "") {
  pageTitle.textContent = title;
  pageMeta.textContent = meta;
}

function showNotice(message) {
  notice.textContent = message;
  notice.classList.remove("hidden");
  window.setTimeout(() => notice.classList.add("hidden"), 4200);
}

function ensureProgressPanel() {
  let panel = document.querySelector("#progressPanel");
  if (panel) return panel;

  panel = document.createElement("section");
  panel.id = "progressPanel";
  panel.className = "progress-panel hidden";
  panel.innerHTML = `
    <div class="progress-row">
      <div>
        <div class="progress-title"></div>
        <div class="progress-meta"></div>
      </div>
      <div class="progress-percent">0%</div>
    </div>
    <div class="progress-track"><div class="progress-fill"></div></div>
  `;
  const contentAnchor = document.querySelector("#content");
  if (contentAnchor?.parentNode) {
    contentAnchor.parentNode.insertBefore(panel, contentAnchor);
  } else {
    (document.querySelector(".main") || document.body).appendChild(panel);
  }
  return panel;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function startProgress(title, totalCount = 0, unit = "試合") {
  const panel = ensureProgressPanel();
  const fill = panel.querySelector(".progress-fill");
  const percent = panel.querySelector(".progress-percent");
  const meta = panel.querySelector(".progress-meta");
  panel.querySelector(".progress-title").textContent = title;
  panel.classList.remove("hidden");
  fill.style.width = "3%";
  percent.textContent = "3%";

  const total = Number(totalCount || 0);
  const started = Date.now();
  const estimateMs = Math.min(52000, Math.max(12000, total * 24));
  const timer = window.setInterval(() => {
    const elapsed = Date.now() - started;
    const eased = 1 - Math.pow(1 - Math.min(0.98, elapsed / estimateMs), 2);
    const value = Math.min(94, Math.max(3, Math.round(eased * 94)));
    fill.style.width = `${value}%`;
    percent.textContent = `${value}%`;
    meta.textContent = total > 0
      ? `未消化 ${total.toLocaleString("ja-JP")} ${unit}を処理中`
      : `${unit}を処理中`;
  }, 220);

  return { panel, fill, percent, meta, timer, total, unit, serverDriven: false };
}

function updateProgress(progress, data) {
  if (!progress) return;
  if (!progress.serverDriven) {
    window.clearInterval(progress.timer);
    progress.serverDriven = true;
  }

  const completed = Number(f(data, "completed", 0));
  const total = Number(f(data, "total", progress.total || 0));
  const percentValue = Math.max(0, Math.min(100, Number(f(data, "percent", total > 0 ? Math.round(completed * 100 / total) : 0))));
  progress.fill.style.width = `${percentValue}%`;
  progress.percent.textContent = `${percentValue}%`;

  const round = Number(f(data, "currentRound", 0));
  const maxRound = Number(f(data, "maxRound", 0));
  const targetRound = Number(f(data, "targetRound", maxRound));
  const denominatorRound = targetRound || maxRound;
  const unit = f(data, "unit", progress.unit || "試合");
  const message = f(data, "message", "");
  progress.meta.textContent = message || (total > 0
    ? `${completed.toLocaleString("ja-JP")} / ${total.toLocaleString("ja-JP")} ${unit}完了${unit === "試合" && round && denominatorRound ? `（第${round}/${denominatorRound}節）` : ""}`
    : "処理中");
}

async function finishProgress(progress, message) {
  if (!progress) return;
  window.clearInterval(progress.timer);
  progress.fill.style.width = "100%";
  progress.percent.textContent = "100%";
  progress.meta.textContent = message;
  await new Promise((resolve) => window.setTimeout(resolve, 550));
  progress.panel.classList.add("hidden");
}

function setLoading(text = "読み込み中...") {
  content.className = "content loading";
  content.textContent = text;
}

function setContent(html) {
  content.className = "content";
  content.innerHTML = html;
}

function makeRoute(name, params = {}, state = {}) {
  return { name, params: { ...params }, state: { ...state } };
}

function currentScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function keepScrollState() {
  return { ...(currentRoute?.state || {}), scrollTop: currentScrollTop() };
}

function saveCurrentRouteState() {
  if (!currentRoute) return;
  currentRoute.state = currentRoute.state || {};
  currentRoute.state.scrollTop = currentScrollTop();

  const roster = document.querySelector(".roster-sheet");
  if (currentRoute.name === "team" && roster) {
    const rosterWrap = document.querySelector("#teamRosterSheet");
    currentRoute.state.rosterSortKey = roster.dataset.sortKey || "position";
    currentRoute.state.rosterSortDir = roster.dataset.sortDir || "asc";
    currentRoute.state.rosterView = normalizeRosterView(roster.dataset.rosterView || "normal");
    currentRoute.state.rosterStarterOnly = Boolean(document.querySelector("[data-roster-starter-filter]")?.classList.contains("active"));
    currentRoute.state.rosterScrollTop = rosterWrap?.scrollTop || 0;
    currentRoute.state.rosterScrollLeft = rosterWrap?.scrollLeft || 0;
  }
}

function restoreRouteState(route) {
  const top = Number(route?.state?.scrollTop || 0);
  requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: "auto" }));
}

function pushRoute(name, params = {}) {
  saveCurrentRouteState();
  currentRoute = makeRoute(name, params);
  routeStack.push(currentRoute);
  renderRoute(currentRoute);
}

async function replaceRoute(name, params = {}, state = {}) {
  currentRoute = makeRoute(name, params, state);
  routeStack[routeStack.length - 1] = currentRoute;
  await renderRoute(currentRoute);
}

async function renderRoute(route) {
  try {
    setLoading();
    document.querySelectorAll(".nav-button").forEach((button) => button.classList.remove("active"));
    if (dashboardCache) {
      renderLeagueNav(dashboardCache.leagues || []);
    }
    if (route.name === "dashboard") {
      document.querySelector('[data-route="dashboard"]')?.classList.add("active");
      await renderDashboard();
    } else if (route.name === "league") {
      await renderLeague(route.params.leagueId, route.params.seasonId, route.params.round);
    } else if (route.name === "detailStats") {
      await renderDetailStatsPage(route.params);
    } else if (route.name === "team") {
      await renderTeam(route.params.teamId, route.params.seasonId, route.params.statsScope);
    } else if (route.name === "player") {
      await renderPlayer(route.params.playerId, route.params.seasonId, route.params.statsScope);
    } else if (route.name === "match") {
      await renderMatch(route.params.matchId);
    } else if (route.name === "archive") {
      await renderArchive();
    } else if (route.name === "awards") {
      document.querySelector(`[data-awards="${route.params.scopeCode || "World"}"]`)?.classList.add("active");
      await renderAnnualAwardsPage(route.params.scopeCode, route.params.seasonId);
    } else if (route.name === "transfers") {
      await renderTransferArchive(route.params.seasonId);
    } else if (route.name === "cup") {
      document.querySelector(`[data-cup="${route.params.competitionCode || ""}"]`)?.classList.add("active");
      await renderCup(route.params.competitionCode, route.params.seasonId, route.params.round);
  } else if (route.name === "continental") {
    document.querySelector(`[data-continental="${route.params.competitionCode || ""}"]`)?.classList.add("active");
    await renderContinentalCompetition(route.params.competitionCode, route.params.seasonId, route.params.round);
  } else if (route.name === "national") {
    document.querySelector(`[data-national="${route.params.competitionCode || ""}"]`)?.classList.add("active");
    await renderNationalCompetition(route.params.competitionCode, route.params.seasonId, route.params.round);
  } else if (route.name === "cups") {
      await renderCup("Emperor", route.params.seasonId, route.params.round);
    } else if (route.name === "settings") {
      document.querySelector('[data-route="settings"]')?.classList.add("active");
      await renderTeamSettings();
    }
    restoreRouteState(route);
  } catch (error) {
    setHeader("エラー", "処理を完了できませんでした");
    setContent(`<div class="panel"><div class="panel-body">${esc(error.message)}</div></div>`);
  }
}

async function loadDashboardCache() {
  dashboardCache = await api("getDashboard");
  renderLeagueNav(dashboardCache.leagues || []);
  refreshAdvanceControls(dashboardCache);
  return dashboardCache;
}

function refreshAdvanceControls(data) {
  const season = data && data.season ? data.season : {};
  const complete = Boolean(f(season, "IsSeasonComplete", false));
  advanceButton.textContent = complete ? "年度更新へ" : "次の節へ";
  if (skipSeasonButton) {
    skipSeasonButton.disabled = complete;
    skipSeasonButton.textContent = "シーズン終了まで";
  }
  if (roundJumpInput) {
    roundJumpInput.min = String(f(season, "CurrentRound", 1));
    roundJumpInput.max = String(f(season, "MaxRound", 1));
    roundJumpInput.placeholder = String(f(season, "CurrentRound", 1));
    roundJumpInput.disabled = complete;
  }
  if (roundJumpButton) {
    roundJumpButton.disabled = complete;
  }
  if (seasonSkipSelect) {
    seasonSkipSelect.disabled = false;
  }
  if (seasonSkipButton) {
    seasonSkipButton.disabled = false;
    updateSeasonSkipButtonLabel();
  }
}

function selectedSeasonSkipCount() {
  return Math.max(1, Number(seasonSkipSelect?.value || 10));
}

function updateSeasonSkipButtonLabel() {
  if (seasonSkipButton) {
    seasonSkipButton.textContent = `${selectedSeasonSkipCount()}シーズンスキップ`;
  }
}

function renderLeagueNav(leagues) {
  const nationalTeams = dashboardCache?.nationalTeams || [];
  const activeCountry = activeNavCountryCode(leagues);
  const countryRegionMap = new Map(leagues.map((league) => [f(league, "countryCode", ""), f(league, "region", "Other")]));
  const activeRegion = activeNavRegionCode(leagues, nationalTeams, countryRegionMap);
  const domesticCups = [
    { region: "Asia", countryCode: "THA", code: "ThaiFA", label: "タイFAカップ" },
    { region: "Asia", countryCode: "CHN", code: "ChinaFA", label: "中国FAカップ" },
    { region: "Asia", countryCode: "QAT", code: "Emir", label: "アミールカップ" },
    { region: "Asia", countryCode: "UAE", code: "UaePresident", label: "UAEプレジデントカップ" },
    { region: "Asia", countryCode: "KOR", code: "KoreaCup", label: "コリアカップ" },
    { region: "Asia", countryCode: "MAS", code: "MalaysiaFA", label: "マレーシアFAカップ" },
    { region: "Asia", countryCode: "IRN", code: "Hazfi", label: "ハズフィーカップ" },
    { region: "Asia", countryCode: "JPN", code: "Emperor", label: "天皇杯" },
    { region: "Asia", countryCode: "JPN", code: "Levain", label: "ルヴァン杯" },
    { region: "Asia", countryCode: "SAU", code: "King", label: "キングスカップ" }
  ];
  const regionalCompetitions = {
    World: {
      continental: [
        { code: "ClubWorldCup", label: "クラブワールドカップ" }
      ],
      national: [
        { code: "WorldCup", label: "ワールドカップ" },
        { code: "U23WorldCup", label: "オリンピック" },
        { code: "U20WorldCup", label: "ワールドユース" }
      ]
    },
    Asia: {
      continental: [
        { code: "ACL", label: "ACL" },
        { code: "ACL2", label: "ACL2" }
      ],
      national: [
        { code: "AsiaCup", label: "アジアカップ" },
        { code: "U23AsiaCup", label: "U-23アジアカップ" },
        { code: "U20AsiaCup", label: "U-20アジアカップ" }
      ]
    },
    Europe: {
      continental: [
        { code: "CL", label: "CL" },
        { code: "EL", label: "EL" },
        { code: "ECL", label: "ECL" }
      ],
      national: [
        { code: "Euro", label: "EURO" },
        { code: "U23Euro", label: "U-23EURO" },
        { code: "U20Euro", label: "U-20EURO" }
      ]
    },
    SouthAmerica: {
      continental: [
        { code: "Libertadores", label: "リベルタドーレス" },
        { code: "Sudamericana", label: "スダメリカーナ" }
      ],
      national: [
        { code: "CopaAmerica", label: "コパアメリカ" },
        { code: "U23CopaAmerica", label: "U-23コパアメリカ" },
        { code: "U20CopaAmerica", label: "U-20コパアメリカ" }
      ]
    },
    NorthAmerica: {
      continental: [
        { code: "ConcacafChampionsCup", label: "CONCACAFチャンピオンズカップ" }
      ],
      national: [
        { code: "GoldCup", label: "ゴールドカップ" },
        { code: "U23GoldCup", label: "U-23ゴールドカップ" },
        { code: "U20GoldCup", label: "U-20ゴールドカップ" }
      ]
    },
    Africa: {
      continental: [
        { code: "CAFChampionsLeague", label: "CAFチャンピオンズリーグ" }
      ],
      national: [
        { code: "AFCON", label: "アフリカネーションズカップ" },
        { code: "U23AFCON", label: "U-23アフリカネーションズカップ" },
        { code: "U20AFCON", label: "U-20アフリカネーションズカップ" }
      ]
    }
  };
  const regionOrder = ["World", "Asia", "Europe", "SouthAmerica", "NorthAmerica", "Africa"];
  const regions = new Map(regionOrder.map((region) => [region, { countries: new Map(), continental: [], national: [], nationalTeams: [] }]));
  for (const league of leagues) {
    const region = normalizeNavRegion(f(league, "region", "Other"));
    if (!regions.has(region)) regions.set(region, { countries: new Map(), continental: [], national: [], nationalTeams: [] });
    const regionGroup = regions.get(region);
    const countryCode = f(league, "countryCode", "JPN");
    if (!regionGroup.countries.has(countryCode)) {
      regionGroup.countries.set(countryCode, { name: f(league, "countryName", countryCode), leagues: [] });
    }
    regionGroup.countries.get(countryCode).leagues.push(league);
  }
  const existingDomesticCupCodes = new Set(domesticCups.map((cup) => cup.code));
  for (const [region, group] of regions.entries()) {
    for (const [countryCode, countryGroup] of group.countries.entries()) {
      const code = `${countryCode}Cup`;
      if (existingDomesticCupCodes.has(code)) continue;
      existingDomesticCupCodes.add(code);
      domesticCups.push({ region, countryCode, code, label: `${countryGroup.name}\u30ab\u30c3\u30d7` });
    }
  }
  for (const [region, competitions] of Object.entries(regionalCompetitions)) {
    if (!regions.has(region)) regions.set(region, { countries: new Map(), continental: [], national: [], nationalTeams: [] });
    regions.get(region).continental = competitions.continental;
    regions.get(region).national = competitions.national;
  }
  for (const team of nationalTeams) {
    const region = normalizeNavRegion(f(team, "Region", countryRegionMap.get(f(team, "NationalCountryCode", "")) || "Other"));
    if (!regions.has(region)) regions.set(region, { countries: new Map(), continental: [], national: [], nationalTeams: [] });
    regions.get(region).nationalTeams.push(team);
  }
  const regionButtons = [...regions.entries()]
    .filter(([, group]) => group.countries.size > 0 || group.continental.length > 0 || group.national.length > 0 || group.nationalTeams.length > 0)
    .map(([region, group]) => {
      const isOpen = (region === activeRegion && !navClosedRegions.has(region)) || navOpenRegions.has(region);
      const countryButtons = [...group.countries.entries()].map(([countryCode, countryGroup]) => {
        const isCountryOpen = isOpen && ((countryCode === activeCountry && !navClosedCountries.has(countryCode)) || navOpenCountries.has(countryCode));
        const countryCups = domesticCups.filter((cup) => cup.countryCode === countryCode);
        return `
          <button class="nav-country-toggle${isCountryOpen ? " open" : ""}" data-country-toggle="${esc(countryCode)}" aria-expanded="${isCountryOpen ? "true" : "false"}">
            <span class="nav-chevron">${isCountryOpen ? "▾" : "▸"}</span>
            <span>${esc(countryGroup.name)}</span>
            <span class="nav-country-code">${esc(countryCode)}</span>
          </button>
          <div class="nav-country-items${isCountryOpen ? "" : " hidden"}">
            ${countryGroup.leagues.map((league) => `
              <button class="nav-button" data-league="${league.id}">
                <span class="league-dot"></span>${esc(league.code)} ${esc(league.name)}
              </button>
            `).join("")}
            ${countryCups.map((cup) => `
              <button class="nav-button" data-cup="${cup.code}">
                <span class="league-dot"></span>${esc(cup.label)}
              </button>
            `).join("")}
          </div>
        `;
      }).join("");
      return `
        <button class="nav-region-toggle${isOpen ? " open" : ""}" data-region-toggle="${esc(region)}" aria-expanded="${isOpen ? "true" : "false"}">
          <span class="nav-chevron">${isOpen ? "▾" : "▸"}</span>
          <span>${esc(regionLabel(region))}</span>
        </button>
        <div class="nav-region-items${isOpen ? "" : " hidden"}">
          <button class="nav-button" data-awards="${esc(region)}">
            <span class="league-dot"></span>年間表彰
          </button>
          ${countryButtons}
          ${group.continental.length > 0 ? `<div class="nav-label nav-subhead">大陸大会</div>` : ""}
          ${group.continental.map((cup) => `
            <button class="nav-button" data-continental="${cup.code}">
              <span class="league-dot"></span>${esc(cup.label)}
            </button>
          `).join("")}
          ${group.national.length > 0 ? `<div class="nav-label nav-subhead">代表大会</div>` : ""}
          ${group.national.map((cup) => `
            <button class="nav-button" data-national="${cup.code}">
              <span class="league-dot"></span>${esc(cup.label)}
            </button>
          `).join("")}
          ${group.nationalTeams.length > 0 ? `<div class="nav-label nav-subhead">代表チーム</div>` : ""}
          ${group.nationalTeams.map((team) => `
            <button class="nav-button" data-team="${num(team, "Id")}" data-stats-scope="National">
              <span class="league-dot"></span>${esc(f(team, "ShortName", f(team, "Name")))}
            </button>
          `).join("")}
        </div>
      `;
    }).join("");
  leagueNav.innerHTML = regionButtons + `
    <button class="nav-button hidden" data-cup="Emperor">
      <span class="league-dot"></span>天皇杯
    </button>
    <button class="nav-button hidden" data-cup="Levain">
      <span class="league-dot"></span>ルヴァン杯
    </button>
    <button class="nav-button hidden" data-cup="King">
      <span class="league-dot"></span>キングスカップ
    </button>
    <div class="nav-label nav-subhead">共通</div>
    <button class="nav-button" data-route="transfers">
      <span class="league-dot"></span>移籍履歴
    </button>
  `;
}

function normalizeNavRegion(region) {
  if (["East", "West", "Southeast", "Central"].includes(region)) return "Asia";
  return region || "Other";
}

function regionLabel(region) {
  const labels = {
    World: "世界",
    Asia: "アジア",
    Europe: "ヨーロッパ",
    SouthAmerica: "南米",
    NorthAmerica: "北中米",
    Africa: "アフリカ"
  };
  return labels[region] || region;
}

function activeNavCountryCode(leagues) {
  if (!currentRoute) return "";
  if (currentRoute.name === "league") {
    const activeLeague = leagues.find((league) => Number(f(league, "id", f(league, "Id"))) === Number(currentRoute.params.leagueId));
    return activeLeague ? f(activeLeague, "countryCode", "") : "";
  }
  if (currentRoute.name === "cup") {
    return domesticCupCountryCode(currentRoute.params.competitionCode || "");
  }
  return "";
}

function activeNavRegionCode(leagues, nationalTeams, countryRegionMap) {
  if (!currentRoute) return "";
  const activeCountry = activeNavCountryCode(leagues);
  if (activeCountry) return normalizeNavRegion(countryRegionMap.get(activeCountry) || "");
  if (currentRoute.name === "continental") {
    const code = currentRoute.params.competitionCode || "";
    if (code === "ClubWorldCup") return "World";
    if (code === "ACL" || code === "ACL2") return "Asia";
    if (code === "CL" || code === "EL" || code === "ECL") return "Europe";
    if (code === "Libertadores" || code === "Sudamericana") return "SouthAmerica";
    if (code === "ConcacafChampionsCup") return "NorthAmerica";
    if (code === "CAFChampionsLeague") return "Africa";
  }
  if (currentRoute.name === "awards") {
    return currentRoute.params.scopeCode || "World";
  }
  if (currentRoute.name === "national") {
    const code = currentRoute.params.competitionCode || "";
    if (code === "WorldCup" || code === "U23WorldCup" || code === "U20WorldCup") return "World";
    if (code === "AsiaCup" || code === "U23AsiaCup" || code === "U20AsiaCup") return "Asia";
    if (code === "Euro" || code === "U23Euro" || code === "U20Euro") return "Europe";
    if (code === "CopaAmerica" || code === "U23CopaAmerica" || code === "U20CopaAmerica") return "SouthAmerica";
    if (code === "GoldCup" || code === "U23GoldCup" || code === "U20GoldCup") return "NorthAmerica";
    if (code === "AFCON" || code === "U23AFCON" || code === "U20AFCON") return "Africa";
  }
  if (currentRoute.name === "team") {
    const teamId = Number(currentRoute.params.teamId);
    const nationalTeam = nationalTeams.find((team) => Number(num(team, "Id")) === teamId);
    if (nationalTeam) return normalizeNavRegion(f(nationalTeam, "Region", ""));
  }
  return "";
}

async function renderDashboard() {
  const data = await loadDashboardCache();
  const season = data.season;
  const masked = isResultMasked();
  setHeader("ホーム", `${season.year}シーズン 第${season.currentRound}節`);
  const totals = data.totals || {};
  setContent(`
    <div class="tabs">${renderResultMaskToggle(masked)}</div>
    <div class="stat-row">
      <div class="stat"><div class="stat-value">${esc(season.year)}</div><div class="stat-label">現在シーズン</div></div>
      <div class="stat"><div class="stat-value">${esc(season.currentRound)}</div><div class="stat-label">次に進行する節</div></div>
      <div class="stat"><div class="stat-value">${esc(f(totals, "teams"))}</div><div class="stat-label">クラブ数</div></div>
      <div class="stat"><div class="stat-value">${esc(f(totals, "players"))}</div><div class="stat-label">現役選手数</div></div>
    </div>
    <div class="grid-2" style="margin-top:12px;">
      <div class="panel">
        <div class="panel-head">次節カード</div>
        <div class="table-wrap">${renderMatchTable(data.nextMatches || [], false, null, null, { masked })}</div>
      </div>
      <div class="panel">
        <div class="panel-head">直近結果</div>
        <div class="table-wrap">${renderMatchTable(data.recentMatches || [], true, null, null, { masked })}</div>
      </div>
    </div>
    <div class="grid-4" style="margin-top:12px;">
      ${(data.leagues || []).map((league) => renderLeagueSummary(league, masked)).join("")}
    </div>
  `);
}

async function renderTeamSettings() {
  const data = await api("getTeamSettings");
  const teams = data.teams || [];
  const countries = data.countries || [];
  const leagues = data.leagues || [];
  const matchSimulation = data.matchSimulation || {};
  const scoreExpectationDivisor = clampScoreExpectationDivisor(f(matchSimulation, "scoreExpectationDivisor", 15));
  const activeScoreExpectationDivisor = clampScoreExpectationDivisor(f(matchSimulation, "activeScoreExpectationDivisor", scoreExpectationDivisor));
  const homeScoreExpectationBase = clampScoreExpectationBase(f(matchSimulation, "homeScoreExpectationBase", 1.42), 1.42);
  const activeHomeScoreExpectationBase = clampScoreExpectationBase(f(matchSimulation, "activeHomeScoreExpectationBase", homeScoreExpectationBase), homeScoreExpectationBase);
  const awayScoreExpectationBase = clampScoreExpectationBase(f(matchSimulation, "awayScoreExpectationBase", 1.34), 1.34);
  const activeAwayScoreExpectationBase = clampScoreExpectationBase(f(matchSimulation, "activeAwayScoreExpectationBase", awayScoreExpectationBase), awayScoreExpectationBase);
  const homeScoreExpectationMinimum = clampScoreExpectationMinimum(f(matchSimulation, "homeScoreExpectationMinimum", 0.2), 0.2);
  const activeHomeScoreExpectationMinimum = clampScoreExpectationMinimum(f(matchSimulation, "activeHomeScoreExpectationMinimum", homeScoreExpectationMinimum), homeScoreExpectationMinimum);
  const awayScoreExpectationMinimum = clampScoreExpectationMinimum(f(matchSimulation, "awayScoreExpectationMinimum", 0.18), 0.18);
  const activeAwayScoreExpectationMinimum = clampScoreExpectationMinimum(f(matchSimulation, "activeAwayScoreExpectationMinimum", awayScoreExpectationMinimum), awayScoreExpectationMinimum);
  const homeScoreExpectationMaximum = clampScoreExpectationMaximum(f(matchSimulation, "homeScoreExpectationMaximum", 2.6), 2.6);
  const activeHomeScoreExpectationMaximum = clampScoreExpectationMaximum(f(matchSimulation, "activeHomeScoreExpectationMaximum", homeScoreExpectationMaximum), homeScoreExpectationMaximum);
  const awayScoreExpectationMaximum = clampScoreExpectationMaximum(f(matchSimulation, "awayScoreExpectationMaximum", 2.5), 2.5);
  const activeAwayScoreExpectationMaximum = clampScoreExpectationMaximum(f(matchSimulation, "activeAwayScoreExpectationMaximum", awayScoreExpectationMaximum), awayScoreExpectationMaximum);
  const restartRequired = Boolean(f(matchSimulation, "restartRequired", false));
  setHeader("設定", "試合・育成・ユース・スポンサー基礎能力");
  const groups = teams.reduce((map, team) => {
    const key = f(team, "leagueCode", "-");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(team);
    return map;
  }, new Map());

  const sections = [...groups.entries()].map(([leagueCode, rows]) => `
    <div class="panel">
      <div class="panel-head">${esc(leagueCode)}</div>
      <div class="table-wrap">
        <table class="settings-table">
          <thead>
            <tr>
              <th>クラブ</th>
              <th class="num">育成</th>
              <th class="num">ユース</th>
              <th class="num">スポンサー</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((team) => `
              <tr data-setting-team="${num(team, "id")}">
                <td>${esc(f(team, "shortName") || f(team, "name"))}</td>
                <td class="num"><input class="setting-input" type="number" min="1" max="200" value="${esc(f(team, "developmentPower", 100))}" data-setting-field="developmentPower"></td>
                <td class="num"><input class="setting-input" type="number" min="1" max="200" value="${esc(f(team, "youthPower", 100))}" data-setting-field="youthPower"></td>
                <td class="num"><input class="setting-input" type="number" min="1" max="300" value="${esc(f(team, "sponsorPower", 100))}" data-setting-field="sponsorPower"></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("");
  const countrySection = `
    <div class="panel settings-runtime">
      <div class="panel-head">国設定</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>国</th><th>国籍</th><th class="num">育成</th><th class="num">ユース</th><th class="num">スポンサー</th><th class="num">生成下限</th><th class="num">生成上限</th></tr></thead>
          <tbody>${countries.map((country) => `
            <tr>
              <td>${esc(f(country, "Code"))} ${esc(f(country, "Name"))}</td>
              <td>${esc(f(country, "DomesticNationality"))}</td>
              <td class="num">${esc(f(country, "DevelopmentPower"))}</td>
              <td class="num">${esc(f(country, "YouthPower"))}</td>
              <td class="num">${esc(f(country, "SponsorPower"))}</td>
              <td class="num">${esc(f(country, "DomesticPlayerBaseMin"))}</td>
              <td class="num">${esc(f(country, "DomesticPlayerBaseMax"))}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
  const leagueSection = `
    <div class="panel settings-runtime">
      <div class="panel-head">リーグ規定</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>国</th><th>リーグ</th><th class="num">リーグランク</th><th class="num">昇格</th><th class="num">降格</th><th class="num">先発外国人</th><th class="num">ベンチ含む</th><th class="num">獲得上限</th></tr></thead>
          <tbody>${leagues.map((league) => `
            <tr data-setting-league="${num(league, "Id")}">
              <td>${esc(f(league, "CountryCode"))}</td>
              <td>${esc(f(league, "Code"))} ${esc(f(league, "Name"))}</td>
              <td class="num"><input class="setting-input" type="number" min="1" max="99" value="${esc(f(league, "Level", 1))}" data-league-level></td>
              <td class="num">${esc(f(league, "PromotionSlots"))}</td>
              <td class="num">${esc(f(league, "RelegationSlots"))}</td>
              <td class="num"><input class="setting-input" type="number" min="0" max="25" value="${esc(settingLimitValue(f(league, "ForeignStarterLimit", "")))}" data-league-limit-field="foreignStarterLimit" placeholder="無制限"></td>
              <td class="num"><input class="setting-input" type="number" min="0" max="25" value="${esc(settingLimitValue(f(league, "ForeignMatchSquadLimit", "")))}" data-league-limit-field="foreignMatchSquadLimit" placeholder="無制限"></td>
              <td class="num"><input class="setting-input" type="number" min="0" max="25" value="${esc(settingLimitValue(f(league, "ForeignAcquisitionSeasonLimit", "")))}" data-league-limit-field="foreignAcquisitionSeasonLimit" placeholder="無制限"></td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;

  setContent(`
    <div class="panel csv-import-panel">
      <div class="panel-head">CSVインポート</div>
      <div class="panel-body csv-import-body">
        <label>Countries <input id="countriesCsvInput" type="file" accept=".csv,text/csv"></label>
        <label>Leagues <input id="leaguesCsvInput" type="file" accept=".csv,text/csv"></label>
        <label>Teams <input id="teamsCsvInput" type="file" accept=".csv,text/csv"></label>
        <button id="importWorldCsvButton" class="danger-button">CSVでDB再生成</button>
      </div>
    </div>
    <div class="settings-actions">
      <button id="saveTeamSettingsButton" class="primary-button">保存</button>
      <span class="muted">試合設定は再起動後、クラブ設定は今後のシーズン更新・選手生成・次シーズン予算から反映されます。</span>
    </div>
    <div class="panel settings-runtime">
      <div class="panel-head">試合設定</div>
      <div class="setting-row">
        <label class="setting-label" for="homeScoreExpectationBaseInput">ホーム基礎期待値</label>
        <input id="homeScoreExpectationBaseInput" class="setting-input" type="number" min="0.1" max="5" step="0.01" value="${esc(homeScoreExpectationBase)}">
        <span class="muted">現在反映中: ${esc(activeHomeScoreExpectationBase)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="awayScoreExpectationBaseInput">アウェイ基礎期待値</label>
        <input id="awayScoreExpectationBaseInput" class="setting-input" type="number" min="0.1" max="5" step="0.01" value="${esc(awayScoreExpectationBase)}">
        <span class="muted">現在反映中: ${esc(activeAwayScoreExpectationBase)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="homeScoreExpectationMinimumInput">ホーム期待値下限</label>
        <input id="homeScoreExpectationMinimumInput" class="setting-input" type="number" min="0.01" max="2" step="0.01" value="${esc(homeScoreExpectationMinimum)}">
        <span class="muted">現在反映中: ${esc(activeHomeScoreExpectationMinimum)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="awayScoreExpectationMinimumInput">アウェイ期待値下限</label>
        <input id="awayScoreExpectationMinimumInput" class="setting-input" type="number" min="0.01" max="2" step="0.01" value="${esc(awayScoreExpectationMinimum)}">
        <span class="muted">現在反映中: ${esc(activeAwayScoreExpectationMinimum)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="homeScoreExpectationMaximumInput">ホーム期待値上限</label>
        <input id="homeScoreExpectationMaximumInput" class="setting-input" type="number" min="0.1" max="5" step="0.01" value="${esc(homeScoreExpectationMaximum)}">
        <span class="muted">現在反映中: ${esc(activeHomeScoreExpectationMaximum)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="awayScoreExpectationMaximumInput">アウェイ期待値上限</label>
        <input id="awayScoreExpectationMaximumInput" class="setting-input" type="number" min="0.1" max="5" step="0.01" value="${esc(awayScoreExpectationMaximum)}">
        <span class="muted">現在反映中: ${esc(activeAwayScoreExpectationMaximum)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
      <div class="setting-row">
        <label class="setting-label" for="scoreExpectationDivisorInput">得点期待値 差分除数</label>
        <input id="scoreExpectationDivisorInput" class="setting-input" type="number" min="1" max="100" value="${esc(scoreExpectationDivisor)}">
        <span class="muted">現在反映中: ${esc(activeScoreExpectationDivisor)}${restartRequired ? " / 再起動待ち" : ""}</span>
      </div>
    </div>
    ${countrySection}
    ${leagueSection}
    <div class="settings-grid">${sections}</div>
  `);

  document.querySelector("#saveTeamSettingsButton")?.addEventListener("click", saveTeamSettings);
  document.querySelector("#importWorldCsvButton")?.addEventListener("click", importWorldCsv);
}

function clampSettingValue(value) {
  const number = Number(value || 100);
  return Math.max(1, Math.min(200, Math.round(Number.isFinite(number) ? number : 100)));
}

function clampLeagueLevel(value) {
  const number = Number(value || 1);
  return Math.max(1, Math.min(99, Math.round(Number.isFinite(number) ? number : 1)));
}

function regulationLimit(value) {
  return value === "" || value === null || value === undefined ? "無制限" : value;
}

function settingLimitValue(value) {
  return value === "" || value === null || value === undefined ? "" : value;
}

function clampOptionalLimit(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Math.max(0, Math.min(25, Math.round(Number.isFinite(number) ? number : 0)));
}

function clampScoreExpectationDivisor(value) {
  const number = Number(value || 15);
  return Math.max(1, Math.min(100, Math.round(Number.isFinite(number) ? number : 15)));
}

function clampDecimalSetting(value, fallback, min, max) {
  const number = Number(value);
  const finite = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, Math.round(finite * 1000) / 1000));
}

function clampScoreExpectationBase(value, fallback = 1.42) {
  return clampDecimalSetting(value, fallback, 0.1, 5);
}

function clampScoreExpectationMinimum(value, fallback = 0.2) {
  return clampDecimalSetting(value, fallback, 0.01, 2);
}

function clampScoreExpectationMaximum(value, fallback = 2.6) {
  return clampDecimalSetting(value, fallback, 0.1, 5);
}

async function readRequiredCsv(inputId, label) {
  const input = document.querySelector(inputId);
  const file = input && input.files ? input.files[0] : null;
  if (!file) throw new Error(`${label} CSVを選択してください。`);
  return await file.text();
}

async function importWorldCsv() {
  if (!window.confirm("CSVの内容でDBを再生成します。現在のセーブデータは削除されます。実行しますか？")) {
    return;
  }

  const button = document.querySelector("#importWorldCsvButton");
  if (button) {
    button.disabled = true;
    button.textContent = "インポート中...";
  }
  const progress = startProgress("CSVインポート中", 0);
  try {
    await waitForPaint();
    const countriesCsv = await readRequiredCsv("#countriesCsvInput", "Countries");
    const leaguesCsv = await readRequiredCsv("#leaguesCsvInput", "Leagues");
    const teamsCsv = await readRequiredCsv("#teamsCsvInput", "Teams");
    await api("importWorldCsv", { countriesCsv, leaguesCsv, teamsCsv });
    await finishProgress(progress, "CSVインポートが完了しました");
    routeStack = [makeRoute("dashboard", {})];
    currentRoute = routeStack[0];
    await loadDashboardCache();
    await renderRoute(currentRoute);
    showNotice("CSVから国・リーグ・チームを再生成しました。");
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    if (button) {
      button.disabled = false;
      button.textContent = "CSVでDB再生成";
    }
  }
}

async function saveTeamSettings() {
  const button = document.querySelector("#saveTeamSettingsButton");
  const scoreExpectationDivisorInput = document.querySelector("#scoreExpectationDivisorInput");
  const homeScoreExpectationBaseInput = document.querySelector("#homeScoreExpectationBaseInput");
  const awayScoreExpectationBaseInput = document.querySelector("#awayScoreExpectationBaseInput");
  const homeScoreExpectationMinimumInput = document.querySelector("#homeScoreExpectationMinimumInput");
  const awayScoreExpectationMinimumInput = document.querySelector("#awayScoreExpectationMinimumInput");
  const homeScoreExpectationMaximumInput = document.querySelector("#homeScoreExpectationMaximumInput");
  const awayScoreExpectationMaximumInput = document.querySelector("#awayScoreExpectationMaximumInput");
  const scoreExpectationDivisor = clampScoreExpectationDivisor(scoreExpectationDivisorInput?.value);
  const homeScoreExpectationBase = clampScoreExpectationBase(homeScoreExpectationBaseInput?.value, 1.42);
  const awayScoreExpectationBase = clampScoreExpectationBase(awayScoreExpectationBaseInput?.value, 1.34);
  const homeScoreExpectationMinimum = clampScoreExpectationMinimum(homeScoreExpectationMinimumInput?.value, 0.2);
  const awayScoreExpectationMinimum = clampScoreExpectationMinimum(awayScoreExpectationMinimumInput?.value, 0.18);
  const homeScoreExpectationMaximum = clampScoreExpectationMaximum(homeScoreExpectationMaximumInput?.value, 2.6);
  const awayScoreExpectationMaximum = clampScoreExpectationMaximum(awayScoreExpectationMaximumInput?.value, 2.5);
  if (scoreExpectationDivisorInput) scoreExpectationDivisorInput.value = String(scoreExpectationDivisor);
  if (homeScoreExpectationBaseInput) homeScoreExpectationBaseInput.value = String(homeScoreExpectationBase);
  if (awayScoreExpectationBaseInput) awayScoreExpectationBaseInput.value = String(awayScoreExpectationBase);
  if (homeScoreExpectationMinimumInput) homeScoreExpectationMinimumInput.value = String(homeScoreExpectationMinimum);
  if (awayScoreExpectationMinimumInput) awayScoreExpectationMinimumInput.value = String(awayScoreExpectationMinimum);
  if (homeScoreExpectationMaximumInput) homeScoreExpectationMaximumInput.value = String(homeScoreExpectationMaximum);
  if (awayScoreExpectationMaximumInput) awayScoreExpectationMaximumInput.value = String(awayScoreExpectationMaximum);
  const teams = [...document.querySelectorAll("[data-setting-team]")].map((row) => {
    const entry = { teamId: Number(row.dataset.settingTeam) };
    row.querySelectorAll("[data-setting-field]").forEach((input) => {
      entry[input.dataset.settingField] = clampSettingValue(input.value);
      input.value = String(entry[input.dataset.settingField]);
    });
    return entry;
  });
  const leagues = [...document.querySelectorAll("[data-setting-league]")].map((row) => {
    const levelInput = row.querySelector("[data-league-level]");
    const entry = { leagueId: Number(row.dataset.settingLeague), level: clampLeagueLevel(levelInput?.value) };
    if (levelInput) levelInput.value = String(entry.level);
    row.querySelectorAll("[data-league-limit-field]").forEach((input) => {
      entry[input.dataset.leagueLimitField] = clampOptionalLimit(input.value);
      input.value = entry[input.dataset.leagueLimitField] === null ? "" : String(entry[input.dataset.leagueLimitField]);
    });
    if (entry.foreignStarterLimit !== null && entry.foreignMatchSquadLimit !== null && entry.foreignStarterLimit > entry.foreignMatchSquadLimit) {
      entry.foreignStarterLimit = entry.foreignMatchSquadLimit;
      const starterInput = row.querySelector('[data-league-limit-field="foreignStarterLimit"]');
      if (starterInput) starterInput.value = String(entry.foreignStarterLimit);
    }
    return entry;
  });

  if (button) {
    button.disabled = true;
    button.textContent = "保存中...";
  }

  try {
    await api("saveTeamSettings", {
      teams,
      leagues,
      scoreExpectationDivisor,
      homeScoreExpectationBase,
      awayScoreExpectationBase,
      homeScoreExpectationMinimum,
      awayScoreExpectationMinimum,
      homeScoreExpectationMaximum,
      awayScoreExpectationMaximum
    });
    showNotice("設定を保存しました。試合設定は再起動後に反映されます。");
    await renderTeamSettings();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "保存";
    }
  }
}

function renderLeagueSummary(league, masked = isResultMasked()) {
  return `
    <div class="panel">
      <div class="panel-head">
        <span>${esc(league.code)}</span>
        <button class="inline-button" data-league="${league.id}">開く</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>順位</th><th>クラブ</th><th class="num">勝点</th><th class="num">得失</th></tr></thead>
          <tbody>
            ${(league.standings || []).map((row) => `
              <tr>
                <td class="num">${maskedValue(row.rank, masked)}</td>
                <td>${teamCell(row.teamId, row.teamName, row.color, row.shortName)}</td>
                <td class="num">${maskedValue(row.points, masked)}</td>
                <td class="num">${maskedValue(row.goalDifference, masked)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderLeague(leagueId, seasonId = null, round = null) {
  const data = await api("getLeague", { leagueId, seasonId });
  const league = data.league;
  const season = data.season;
  setHeader(`${esc(f(league, "Name"))}`, `${season.year}シーズン 第${season.currentRound}節`);
  markLeagueNav(leagueId);
  const fixtures = data.fixtures || [];
  const rounds = [...new Set(fixtures.map((row) => num(row, "Round")))].sort((a, b) => a - b);
  const maxRound = rounds.length ? Math.max(...rounds) : 1;
  const firstUnplayedRound = fixtures.find((row) => num(row, "Played") === 0);
  const defaultRound = firstUnplayedRound ? num(firstUnplayedRound, "Round") : Math.min(Math.max(1, Number(season.currentRound || 1)), maxRound);
  const selectedRound = rounds.includes(Number(round)) ? Number(round) : defaultRound;
  const roundFixtures = fixtures.filter((row) => num(row, "Round") === selectedRound);
  const roundTabs = rounds.map((value) => `<button class="inline-button season-tab${value === selectedRound ? " active" : ""}" data-league-round="${value}">第${value}節</button>`).join("");

  const seasonOptions = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    return `<option value="${id}" ${id === season.id ? "selected" : ""}>${esc(f(row, "Year"))}シーズン</option>`;
  }).join("");

  setContent(`
    <div class="tabs">
      <select id="seasonSelect">${seasonOptions}</select>
      <span class="pill">クラブ数 ${data.standings.length}</span>
      <span class="pill">試合数 ${fixtures.length}</span>
    </div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head">順位表</div>
        <div class="table-wrap">${renderStandings(data.standings || [], season.id)}</div>
      </div>
      <div class="panel">
        <div class="panel-head">ランキング</div>
        <div class="panel-body">
          <div class="grid-2">
            <div>${renderScorerTable(data.topScorers || [])}</div>
            <div>${renderRatingTable(data.topRatings || [])}</div>
          </div>
        </div>
      </div>
    </div>
    ${renderBestElevenPanel(data.bestEleven)}
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">日程・結果</div>
      <div class="panel-body"><div class="tabs round-tabs">${roundTabs}</div></div>
      <div class="table-wrap">${renderMatchTable(roundFixtures, true, null, season.id)}</div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">クラブ一覧</div>
      <div class="table-wrap">${renderTeamList(data.teams || [])}</div>
    </div>
  `);

  document.querySelector("#seasonSelect")?.addEventListener("change", (event) => {
    replaceRoute("league", { leagueId, seasonId: Number(event.target.value) });
  });
  document.querySelectorAll("[data-league-round]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("league", { leagueId, seasonId: season.id, round: Number(button.dataset.leagueRound) });
    });
  });
}

function markLeagueNav(leagueId) {
  document.querySelectorAll("[data-league]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.league) === Number(leagueId));
  });
}

function renderStandings(rows, seasonId = null, masked = isResultMasked()) {
  return `
    <table>
      <thead><tr><th>順位</th><th>クラブ</th><th class="num">試</th><th class="num">勝</th><th class="num">分</th><th class="num">敗</th><th class="num">得</th><th class="num">失</th><th class="num">得失</th><th class="num">勝点</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td class="num">${maskedValue(row.rank, masked)}</td>
            <td>${masked ? maskedTeamCell() : teamCell(row.teamId, row.teamName, row.color, row.shortName, seasonId)}</td>
            <td class="num">${maskedValue(row.played, masked)}</td>
            <td class="num">${maskedValue(row.wins, masked)}</td>
            <td class="num">${maskedValue(row.draws, masked)}</td>
            <td class="num">${maskedValue(row.losses, masked)}</td>
            <td class="num">${maskedValue(row.goalsFor, masked)}</td>
            <td class="num">${maskedValue(row.goalsAgainst, masked)}</td>
            <td class="num">${maskedValue(row.goalDifference, masked)}</td>
            <td class="num"><b>${maskedValue(row.points, masked)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderScorerTable(rows) {
  return `
    <table>
      <thead><tr><th colspan="5">得点ランキング</th></tr><tr><th>選手</th><th>所属</th><th>Pos</th><th class="num">得点</th><th class="num">A</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${playerLink(num(row, "Id"), f(row, "Name"))}</td><td>${esc(f(row, "Team"))}</td><td>${esc(f(row, "PrimaryPosition"))}</td><td class="num">${f(row, "Goals")}</td><td class="num">${f(row, "Assists")}</td></tr>
      `).join("") || `<tr><td colspan="5" class="muted">まだ得点記録がありません。</td></tr>`}</tbody>
    </table>
  `;
}

function renderRatingTable(rows) {
  return `
    <table>
      <thead><tr><th colspan="5">平均評価点</th></tr><tr><th>選手</th><th>所属</th><th>Pos</th><th class="num">評価</th><th class="num">対象</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${playerLink(num(row, "Id"), f(row, "Name"))}</td><td>${esc(f(row, "Team"))}</td><td>${esc(f(row, "PrimaryPosition"))}</td><td class="num"><b>${Number(f(row, "AvgRating")).toFixed(2)}</b></td><td class="num">${f(row, "RatingMatches")}</td></tr>
      `).join("") || `<tr><td colspan="5" class="muted">対象試合数に達した選手がいません。</td></tr>`}</tbody>
    </table>
  `;
}

const detailStatDefs = [
  ["Passes", "Pass/90", "per90"],
  ["Shots", "Shots/90", "per90"],
  ["ShotsOnTarget", "SOT/90", "per90"],
  ["KeyPasses", "KeyPass/90", "per90"],
  ["Dribbles", "Dribble/90", "per90"],
  ["Crosses", "Cross/90", "per90"],
  ["Tackles", "Tackle/90", "per90"],
  ["TackleSuccessRate", "Tackle%", "rate"],
  ["Interceptions", "Int/90", "per90"],
  ["AerialsWon", "Aerial/90", "per90"],
  ["AerialWinRate", "Aerial%", "rate"],
  ["Fouls", "Foul/90", "per90"],
  ["Saves", "Save/90", "per90"],
  ["SaveRate", "Save%", "rate"],
  ["PassSuccessRate", "Pass%", "rate"]
];

const detailRankingPositionDefs = [
  ["ALL", "All"],
  ["FW", "FW"],
  ["WG", "WG"],
  ["AMF", "AMF"],
  ["CMFDMF", "CMF/DMF"],
  ["SB", "SB"],
  ["CB", "CB"],
  ["GK", "GK"]
];

function per90(row, key) {
  const minutes = num(row, "Minutes");
  return minutes > 0 ? Number(num(row, key) * 90 / minutes) : 0;
}

function successRate(row, madeKey, attemptKey) {
  const attempts = num(row, attemptKey);
  return attempts > 0 ? Number(num(row, madeKey) * 100 / attempts) : 0;
}

function goalkeeperSaveRate(row) {
  const attempts = num(row, "SaveAttempts") || (num(row, "Saves") + num(row, "GoalsAgainst"));
  return attempts > 0 ? Number(num(row, "Saves") * 100 / attempts) : 0;
}

function detailStatMetricValue(row, stat) {
  switch (stat) {
    case "Passes": return per90(row, "PassAttempts");
    case "Shots": return per90(row, "Shots");
    case "ShotsOnTarget": return per90(row, "ShotsOnTarget");
    case "KeyPasses": return per90(row, "KeyPasses");
    case "Dribbles": return per90(row, "Dribbles");
    case "Crosses": return per90(row, "Crosses");
    case "Tackles": return per90(row, "Tackles");
    case "TackleSuccessRate": return successRate(row, "Tackles", "TackleAttempts");
    case "Interceptions": return per90(row, "Interceptions");
    case "AerialsWon": return per90(row, "AerialsWon");
    case "AerialWinRate": return successRate(row, "AerialsWon", "AerialAttempts");
    case "Fouls": return per90(row, "Fouls");
    case "Saves": return per90(row, "Saves");
    case "SaveRate": return goalkeeperSaveRate(row);
    case "PassSuccessRate": return successRate(row, "PassesCompleted", "PassAttempts");
    default: return 0;
  }
}

function buildDetailHighlightMap(highlights) {
  const map = new Map();
  (highlights || []).forEach((row) => {
    const positionGroup = f(row, "PositionGroup");
    const stat = f(row, "Stat");
    if (!positionGroup || !stat) return;
    map.set(`${positionGroup}:${stat}`, {
      top: Number(f(row, "TopThreshold", 0)),
      bottom: Number(f(row, "BottomThreshold", 0)),
      lowerIsBetter: Boolean(f(row, "LowerIsBetter", false))
    });
  });
  return map;
}

function renderDetailStatCell(row, highlightMap, stat, decimals = 2, suffix = "") {
  const value = detailStatMetricValue(row, stat);
  const positionGroup = detailRankingPositionGroup(f(row, "UsedPosition", f(row, "PrimaryPosition")));
  const highlight = highlightMap.get(`${positionGroup}:${stat}`);
  const rank = num(row, `${stat}Rank`);
  const sampleSize = num(row, "PositionRankSampleSize");
  const rankText = rank > 0 ? `<span class="detail-stat-rank">#${rank}${sampleSize > 0 ? `/${sampleSize}` : ""}</span>` : "";
  let className = "num";
  if (highlight) {
    if (highlight.lowerIsBetter) {
      if (value <= highlight.top) className += " detail-stat-top";
      else if (value >= highlight.bottom) className += " detail-stat-bottom";
    } else if (value >= highlight.top) {
      className += " detail-stat-top";
    } else if (value <= highlight.bottom) {
      className += " detail-stat-bottom";
    }
  }
  return `<td class="${className}"><span>${value.toFixed(decimals)}${suffix}</span>${rankText}</td>`;
}

function formatDetailValue(value, kind = "per90") {
  const numberValue = Number(value || 0);
  return kind === "rate" ? `${numberValue.toFixed(1)}%` : numberValue.toFixed(2);
}

function normalizeDetailRankingPosition(position) {
  const value = String(position || "ALL").toUpperCase();
  return detailRankingPositionDefs.some(([key]) => key === value) ? value : "ALL";
}

function normalizeDetailRankingMode(mode) {
  return mode === "all" ? "all" : "top20";
}

function normalizeDetailRankingStat(stat) {
  return detailStatDefs.some(([key]) => key === stat) ? stat : "Passes";
}

function normalizeDetailMinimumMinutes(minutes) {
  return Number(minutes) === 2000 ? 2000 : 1000;
}

function hasEnoughDetailRateAttempts(row, stat) {
  if (stat === "PassSuccessRate") return num(row, "PassAttempts") >= 300;
  return true;
}

function detailRankingPositionGroup(position) {
  switch (String(position || "").toUpperCase()) {
    case "GK": return "GK";
    case "CB": return "CB";
    case "RB":
    case "LB":
    case "RWB":
    case "LWB": return "SB";
    case "CM":
    case "DM": return "CMFDMF";
    case "AM": return "AMF";
    case "RW":
    case "LW":
    case "RM":
    case "LM": return "WG";
    case "CF":
    case "ST":
    case "SS": return "FW";
    default: return "CMFDMF";
  }
}

function detailStatsRouteButton(params = {}) {
  return `<button class="inline-button" data-detail-stats-route="${esc(params.source || "league")}" data-detail-league-id="${esc(params.leagueId || "")}" data-detail-competition-code="${esc(params.competitionCode || "")}" data-detail-mode="${esc(params.mode || "")}" data-detail-season-id="${esc(params.seasonId || "")}" type="button">Detail Stats</button>`;
}

function renderDetailRankingControls(mode, stat, position, minimumMinutes) {
  const currentMode = normalizeDetailRankingMode(mode);
  const currentStat = normalizeDetailRankingStat(stat);
  const currentPosition = normalizeDetailRankingPosition(position);
  const currentMinimum = normalizeDetailMinimumMinutes(minimumMinutes);
  return `
    <div class="tabs detail-ranking-mode-tabs">
      <button class="inline-button detail-ranking-mode-tab${currentMode === "top20" ? " active" : ""}" data-detail-ranking-mode="top20" type="button">Top20</button>
      <button class="inline-button detail-ranking-mode-tab${currentMode === "all" ? " active" : ""}" data-detail-ranking-mode="all" type="button">All Players</button>
    </div>
    <div class="tabs detail-ranking-minimum-tabs">
      <button class="inline-button detail-ranking-minimum-tab${currentMinimum === 1000 ? " active" : ""}" data-detail-ranking-minimum="1000" type="button">1000min+</button>
      <button class="inline-button detail-ranking-minimum-tab${currentMinimum === 2000 ? " active" : ""}" data-detail-ranking-minimum="2000" type="button">2000min+</button>
    </div>
    <div class="tabs detail-ranking-position-tabs">
      ${detailRankingPositionDefs.map(([key, label]) => `
        <button class="inline-button detail-ranking-position-tab${currentPosition === key ? " active" : ""}" data-detail-ranking-position="${key}" type="button">${esc(label)}</button>
      `).join("")}
    </div>
    ${currentMode === "all" ? `
      <div class="tabs detail-ranking-stat-tabs">
        ${detailStatDefs.map(([key, label]) => `
          <button class="inline-button detail-ranking-stat-tab${currentStat === key ? " active" : ""}" data-detail-ranking-stat="${key}" type="button">${esc(label)}</button>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function renderDetailStatRankings(rankings, minimumMinutesLabel = "1000min+") {
  const source = rankings || {};
  const currentPosition = normalizeDetailRankingPosition(currentRoute?.state?.detailRankingPosition || "ALL");
  return `
    <div class="ranking-grid detail-ranking-grid">
      ${detailStatDefs.map(([key, label, kind]) => {
        const sourceKey = currentPosition === "ALL" ? key : `${key}:${currentPosition}`;
        const rows = source[sourceKey] || [];
        return `
          <div class="table-wrap">
            <table>
              <thead><tr><th colspan="4">${esc(label)} <span class="muted">${esc(minimumMinutesLabel)}</span></th></tr></thead>
              <tbody>${rows.map((row, index) => `
                <tr>
                  <td class="num">${index + 1}</td>
                  <td>${playerLink(num(row, "Id"), f(row, "Name"))}</td>
                  <td>${esc(f(row, "Team"))}</td>
                  <td class="num"><b>${formatDetailValue(f(row, "Value", 0), kind)}</b></td>
                </tr>
              `).join("") || `<tr><td colspan="4" class="muted">No data</td></tr>`}</tbody>
            </table>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDetailStatAllRanking(rows, stat, position) {
  const currentStat = normalizeDetailRankingStat(stat);
  const currentPosition = normalizeDetailRankingPosition(position);
  const def = detailStatDefs.find(([key]) => key === currentStat) || detailStatDefs[0];
  const [, label, kind] = def;
  const filteredRows = (rows || [])
    .filter((row) => currentPosition === "ALL" || detailRankingPositionGroup(f(row, "UsedPosition", f(row, "PrimaryPosition"))) === currentPosition)
    .filter((row) => hasEnoughDetailRateAttempts(row, currentStat))
    .filter((row) => Number(f(row, currentStat, 0)) > 0)
    .sort((a, b) => {
      const valueDiff = Number(f(b, currentStat, 0)) - Number(f(a, currentStat, 0));
      if (valueDiff) return valueDiff;
      const minuteDiff = num(b, "Minutes") - num(a, "Minutes");
      if (minuteDiff) return minuteDiff;
      return Number(f(b, "AvgRating", 0)) - Number(f(a, "AvgRating", 0));
    });
  return `
    <div class="table-wrap">
      <table class="sheet-table">
        <thead><tr>
          <th class="num">#</th>
          <th>Player</th>
          <th>Team</th>
          <th>Used Pos</th>
          <th class="num">${esc(label)}</th>
          <th class="num">Min</th>
          <th class="num">Rating</th>
        </tr></thead>
        <tbody>${filteredRows.map((row, index) => `
          <tr>
            <td class="num">${index + 1}</td>
            <td>${playerLink(num(row, "Id"), f(row, "Name"))}</td>
            <td>${esc(f(row, "Team"))}</td>
            <td>${esc(f(row, "UsedPosition", f(row, "PrimaryPosition")))}</td>
            <td class="num"><b>${formatDetailValue(f(row, currentStat, 0), kind)}</b></td>
            <td class="num">${esc(f(row, "Minutes"))}</td>
            <td class="num">${Number(f(row, "AvgRating", 0)).toFixed(2)}</td>
          </tr>
        `).join("") || `<tr><td colspan="7" class="muted">No data</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderDetailStatsContent(rankings, rows, minimumMinutesLabel = "1000min+", minimumMinutes = 1000) {
  const mode = normalizeDetailRankingMode(currentRoute?.state?.detailRankingMode || "top20");
  const stat = normalizeDetailRankingStat(currentRoute?.state?.detailRankingStat || "Passes");
  const position = normalizeDetailRankingPosition(currentRoute?.state?.detailRankingPosition || "ALL");
  return `
    ${renderDetailRankingControls(mode, stat, position, minimumMinutes)}
    ${mode === "all" ? renderDetailStatAllRanking(rows || [], stat, position) : renderDetailStatRankings(rankings || {}, minimumMinutesLabel)}
  `;
}

function mergeDetailSeasonStats(rows, detailRows) {
  const detailMap = new Map((detailRows || []).map((row) => [`${num(row, "SeasonId")}:${num(row, "TeamId")}`, row]));
  return (rows || []).map((row) => Object.assign({}, detailMap.get(`${num(row, "SeasonId")}:${num(row, "TeamId")}`) || {}, row));
}

function applyCurrentPlayerAttributes(rows, player) {
  const attrs = ["Shooting", "Passing", "Dribbling", "Defense", "Saving", "Speed", "Stamina", "Physical", "Decision", "Mental"];
  const currentAttrs = Object.fromEntries(attrs.map((key) => [key, num(player, key)]));
  return (rows || []).map((row) => Object.assign({}, row, currentAttrs));
}

function playerTypeFromTotalDetailStats(rows, primaryPosition = "") {
  const positionMinutes = new Map();
  const totals = (rows || []).reduce((acc, row) => {
    const minutes = num(row, "Minutes");
    const usedPosition = f(row, "UsedPosition", f(row, "PrimaryPosition", primaryPosition));
    if (usedPosition) {
      positionMinutes.set(usedPosition, (positionMinutes.get(usedPosition) || 0) + minutes);
    }
    acc.minutes += num(row, "Minutes");
    acc.goals += num(row, "Goals");
    acc.assists += num(row, "Assists");
    acc.shots += num(row, "Shots");
    acc.shotsOnTarget += num(row, "ShotsOnTarget");
    acc.keyPasses += num(row, "KeyPasses");
    acc.dribbles += num(row, "Dribbles");
    acc.tackles += num(row, "Tackles");
    acc.interceptions += num(row, "Interceptions");
    acc.aerialsWon += num(row, "AerialsWon");
    acc.fouls += num(row, "Fouls");
    acc.saves += num(row, "Saves");
    acc.goalsAgainst += num(row, "GoalsAgainst");
    acc.passAttempts += num(row, "PassAttempts");
    acc.passesCompleted += num(row, "PassesCompleted");
    return acc;
  }, {
    minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, keyPasses: 0,
    dribbles: 0, tackles: 0, interceptions: 0, aerialsWon: 0, fouls: 0, saves: 0, goalsAgainst: 0,
    passAttempts: 0, passesCompleted: 0
  });
  if (totals.minutes <= 0) {
    return { label: "-", weak: true };
  }
  const dominantPosition = Array.from(positionMinutes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || primaryPosition;
  const attrSource = (rows || [])[0] || {};
  const label = playerTrait({
    PrimaryPosition: primaryPosition,
    UsedPosition: dominantPosition,
    Shooting: num(attrSource, "Shooting"),
    Passing: num(attrSource, "Passing"),
    Dribbling: num(attrSource, "Dribbling"),
    Defense: num(attrSource, "Defense"),
    Saving: num(attrSource, "Saving"),
    Speed: num(attrSource, "Speed"),
    Stamina: num(attrSource, "Stamina"),
    Physical: num(attrSource, "Physical"),
    Decision: num(attrSource, "Decision"),
    Mental: num(attrSource, "Mental"),
    Minutes: totals.minutes,
    Goals: totals.goals,
    Assists: totals.assists,
    Shots: totals.shots,
    ShotsOnTarget: totals.shotsOnTarget,
    KeyPasses: totals.keyPasses,
    Dribbles: totals.dribbles,
    Tackles: totals.tackles,
    Interceptions: totals.interceptions,
    AerialsWon: totals.aerialsWon,
    Fouls: totals.fouls,
    Saves: totals.saves,
    GoalsAgainst: totals.goalsAgainst,
    PassAttempts: totals.passAttempts,
    PassesCompleted: totals.passesCompleted
  });
  return { label, weak: label === "-" };
}

function renderPlayerTypeBadge(rows, primaryPosition) {
  const type = playerTypeFromTotalDetailStats(rows, primaryPosition);
  return `
    <div class="player-type-card${type.weak ? " weak" : ""}">
      <span class="player-type-label">${esc(type.label)}</span>
    </div>
  `;
}

function renderBestElevenPanel(bestEleven) {
  const players = bestEleven && (bestEleven.players || []);
  if (!bestEleven || !bestEleven.completed || players.length === 0) {
    return "";
  }

  return `
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">シーズンベストイレブン <span class="muted">${esc(bestEleven.formation || "4-3-3")}</span></div>
      <div class="panel-body">
        <div class="pitch-grid single">
          ${renderPitch(players, "ベストイレブン")}
        </div>
      </div>
    </div>
  `;
}

function renderTeamList(rows) {
  return `
    <table>
      <thead><tr><th>クラブ</th><th>略称</th><th>都道府県</th><th>基本布陣</th><th>戦術</th><th class="num">戦力</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${teamCell(num(row, "Id"), f(row, "Name"), f(row, "PrimaryColor"), f(row, "Name"))}</td>
          <td>${esc(f(row, "ShortName"))}</td>
          <td>${esc(f(row, "Prefecture"))}</td>
          <td>${esc(f(row, "Formation"))}</td>
          <td>${esc(f(row, "Tactic"))}</td>
          <td class="num">${esc(f(row, "Rating"))}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

async function renderTeam(teamId, seasonId = null, statsScope = "League") {
  const data = await api("getTeam", { teamId, seasonId, statsScope });
  const team = data.team;
  const season = data.season;
  const scope = f(data, "statsScope", statsScope || "League");
  const isNationalTeam = num(team, "IsNationalTeam") === 1;
  const leagueTeams = data.leagueTeams || [];
  const teamIndex = leagueTeams.findIndex((row) => num(row, "Id") === Number(teamId));
  const prevTeam = teamIndex >= 0 ? leagueTeams[(teamIndex + leagueTeams.length - 1) % leagueTeams.length] : null;
  const nextTeam = teamIndex >= 0 ? leagueTeams[(teamIndex + 1) % leagueTeams.length] : null;
  const favoriteActive = isFavorite("team", teamId);
  const routeState = currentRoute?.name === "team" && Number(currentRoute.params.teamId) === Number(teamId)
    ? (currentRoute.state || {})
    : {};
  const rosterSortKey = routeState.rosterSortKey || "position";
  const rosterSortDir = routeState.rosterSortDir || "asc";
  const rosterView = normalizeRosterView(routeState.rosterView || "normal");
  const rosterStarterOnly = routeState.rosterStarterOnly === true || routeState.rosterStarterOnly === "true";
  const rosterRows = filterRosterRows(data.roster || [], rosterStarterOnly);
  const transferInSortKey = routeState.transferInSortKey || "id";
  const transferInSortDir = routeState.transferInSortDir || "desc";
  const transferOutSortKey = routeState.transferOutSortKey || "id";
  const transferOutSortDir = routeState.transferOutSortDir || "desc";
  const transferInRows = (data.transfers || []).filter((row) => num(row, "ToTeamId") === Number(teamId));
  const transferOutRows = (data.transfers || []).filter((row) => num(row, "FromTeamId") === Number(teamId));
  const masked = isResultMasked();
  setHeader(f(team, "Name"), `${esc(f(team, "LeagueName"))} / ${season.year}シーズン / ${statsScopeLabel(scope)}`);
  const seasonTabs = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    const selected = id === season.id ? " active" : "";
    return `<button class="inline-button season-tab${selected}" data-team-season="${id}">${esc(f(row, "Year"))}</button>`;
  }).join("");

  setContent(`
    <div class="tabs team-switcher">
      ${!isNationalTeam && prevTeam ? `<button class="inline-button" data-team-switch="${num(prevTeam, "Id")}">← ${esc(f(prevTeam, "ShortName", f(prevTeam, "Name")))}</button>` : ""}
      ${!isNationalTeam && leagueTeams.length ? `<span class="pill">${teamIndex + 1} / ${leagueTeams.length}</span>` : ""}
      ${!isNationalTeam && nextTeam ? `<button class="inline-button" data-team-switch="${num(nextTeam, "Id")}">${esc(f(nextTeam, "ShortName", f(nextTeam, "Name")))} →</button>` : ""}
      <button class="inline-button favorite-toggle${favoriteActive ? " active" : ""}" data-favorite-toggle="team">${favoriteActive ? "★ お気に入り解除" : "☆ お気に入り"}</button>
      ${renderResultMaskToggle(masked)}
    </div>
    <div class="tabs">${seasonTabs}</div>
    <div class="stat-row">
      <div class="stat"><div class="stat-value">${esc(f(team, "ShortName"))}</div><div class="stat-label">略称</div></div>
      <div class="stat"><div class="stat-value">${esc(f(team, "Formation"))}</div><div class="stat-label">基本布陣</div></div>
      <div class="stat"><div class="stat-value">${esc(f(team, "Tactic"))}</div><div class="stat-label">戦術</div></div>
      <div class="stat"><div class="stat-value">${esc(f(team, "Rating"))}</div><div class="stat-label">戦力評価</div></div>
    </div>
    ${isNationalTeam ? "" : renderTeamBudget(data.budget, data.seasonStanding, masked)}
    ${renderTeamBestLineup(data.bestLineup)}
    ${renderStatsScopeTabs(scope, "team")}
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">${isNationalTeam ? "代表メンバー" : "所属選手"} <span class="muted">${statsScopeLabel(scope)}成績</span></div>
      <div class="tabs roster-view-tabs">
        ${renderRosterViewTab("normal", "通常", rosterView)}
        ${renderRosterViewTab("simple", "シンプル", rosterView)}
        ${renderRosterViewTab("detail", "詳細", rosterView)}
        <button class="inline-button roster-filter-toggle${rosterStarterOnly ? " active" : ""}" data-roster-starter-filter="15" type="button">先発15+</button>
      </div>
      <div class="roster-scroll-top${isNationalTeam ? " roster-scroll-top-national" : ""} roster-scroll-top-${rosterView}" id="teamRosterScrollTop"><div></div></div>
      <div class="table-wrap" id="teamRosterSheet">${renderRoster(rosterRows, rosterSortKey, rosterSortDir, isNationalTeam, rosterView)}</div>
      <div class="roster-scroll-bottom${isNationalTeam ? " roster-scroll-top-national" : ""} roster-scroll-top-${rosterView}" id="teamRosterScrollBottom"><div></div></div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">試合日程・結果</div>
      <div class="table-wrap">${renderMatchTable(data.fixtures || [], true, Number(teamId), season.id, { masked })}</div>
    </div>
    ${isNationalTeam ? "" : `<div class="grid-2" style="margin-top:12px;">
      <div class="panel">
        <div class="panel-head">移籍IN</div>
        <div class="table-wrap" id="teamTransferInSheet">${renderTeamTransfersTable(transferInRows, transferInSortKey, transferInSortDir, "in", "このシーズンの加入はありません。")}</div>
      </div>
      <div class="panel">
        <div class="panel-head">移籍OUT</div>
        <div class="table-wrap" id="teamTransferOutSheet">${renderTeamTransfersTable(transferOutRows, transferOutSortKey, transferOutSortDir, "out", "このシーズンの退団はありません。")}</div>
      </div>
    </div>`}
  `);

  document.querySelectorAll("[data-team-season]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("team", { teamId, seasonId: Number(button.dataset.teamSeason), statsScope: scope });
    });
  });
  document.querySelectorAll('[data-scope-target="team"]').forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("team", { teamId, seasonId: season.id, statsScope: button.dataset.statsScope }, keepScrollState());
    });
  });
  document.querySelectorAll("[data-team-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("team", { teamId: Number(button.dataset.teamSwitch), seasonId: season.id, statsScope: scope });
    });
  });
  document.querySelector('[data-favorite-toggle="team"]')?.addEventListener("click", (event) => {
    const active = toggleFavorite("team", {
      id: teamId,
      name: f(team, "Name"),
      shortName: f(team, "ShortName"),
      leagueCode: f(team, "LeagueCode")
    });
    event.currentTarget.classList.toggle("active", active);
    event.currentTarget.textContent = active ? "★ お気に入り解除" : "☆ お気に入り";
  });
  document.querySelectorAll("[data-roster-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextView = normalizeRosterView(button.dataset.rosterView || "normal");
      if (currentRoute?.name === "team") {
        currentRoute.state = currentRoute.state || {};
        currentRoute.state.rosterView = nextView;
      }
      const container = document.querySelector("#teamRosterSheet");
      const table = container?.querySelector(".roster-sheet");
      const sortKey = table?.dataset.sortKey || rosterSortKey;
      const sortDir = table?.dataset.sortDir || rosterSortDir;
      const topScroll = document.querySelector("#teamRosterScrollTop");
      const bottomScroll = document.querySelector("#teamRosterScrollBottom");
      document.querySelectorAll("[data-roster-view]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.rosterView === nextView);
      });
      if (topScroll) {
        topScroll.classList.remove("roster-scroll-top-normal", "roster-scroll-top-simple", "roster-scroll-top-detail");
        topScroll.classList.add(`roster-scroll-top-${nextView}`);
      }
      if (bottomScroll) {
        bottomScroll.classList.remove("roster-scroll-top-normal", "roster-scroll-top-simple", "roster-scroll-top-detail");
        bottomScroll.classList.add(`roster-scroll-top-${nextView}`);
      }
      if (container) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
        const starterOnly = currentRoute?.state?.rosterStarterOnly === true || currentRoute?.state?.rosterStarterOnly === "true";
        const rows = filterRosterRows(data.roster || [], starterOnly);
        container.innerHTML = renderRoster(rows, sortKey, sortDir, isNationalTeam, nextView);
      }
      const starterOnly = currentRoute?.state?.rosterStarterOnly === true || currentRoute?.state?.rosterStarterOnly === "true";
      const rows = filterRosterRows(data.roster || [], starterOnly);
      wireRosterSorting(rows, sortKey, sortDir, isNationalTeam, nextView);
      wireRosterScrollSync();
    });
  });
  document.querySelector("[data-roster-starter-filter]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const nextStarterOnly = !button.classList.contains("active");
    if (currentRoute?.name === "team") {
      currentRoute.state = currentRoute.state || {};
      currentRoute.state.rosterStarterOnly = nextStarterOnly;
    }
    button.classList.toggle("active", nextStarterOnly);
    const container = document.querySelector("#teamRosterSheet");
    const table = container?.querySelector(".roster-sheet");
    const sortKey = table?.dataset.sortKey || rosterSortKey;
    const sortDir = table?.dataset.sortDir || rosterSortDir;
    const view = normalizeRosterView(table?.dataset.rosterView || currentRoute?.state?.rosterView || rosterView);
    const rows = filterRosterRows(data.roster || [], nextStarterOnly);
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
      container.innerHTML = renderRoster(rows, sortKey, sortDir, isNationalTeam, view);
    }
    wireRosterSorting(rows, sortKey, sortDir, isNationalTeam, view);
    wireRosterScrollSync();
  });
  wireRosterSorting(rosterRows, rosterSortKey, rosterSortDir, isNationalTeam, rosterView);
  wireRosterScrollSync();
  if (!isNationalTeam) {
    wireTeamTransferSorting("teamTransferInSheet", transferInRows, transferInSortKey, transferInSortDir, "in");
    wireTeamTransferSorting("teamTransferOutSheet", transferOutRows, transferOutSortKey, transferOutSortDir, "out");
  }
}

function renderTeamBestLineup(bestLineup) {
  const players = bestLineup && (bestLineup.players || []);
  if (!players.length) {
    return "";
  }
  const formation = f(bestLineup, "Formation", "4-2-3-1");

  return `
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">選択年ベストスタメン <span class="muted">${esc(f(bestLineup, "Formation", "4-2-3-1"))}</span></div>
      <div class="panel-body">
        <div class="pitch-grid single team-lineup-grid">
          ${renderPitch(players, "先発回数ベース", { formation, variant: "team" })}
        </div>
      </div>
    </div>
  `;
}

function normalizeRosterView(view) {
  return ["normal", "simple", "detail"].includes(view) ? view : "normal";
}

function renderRosterViewTab(view, label, currentView) {
  const active = normalizeRosterView(currentView) === view ? " active" : "";
  return `<button class="inline-button roster-view-tab${active}" data-roster-view="${view}" type="button">${esc(label)}</button>`;
}

function filterRosterRows(rows, starterOnly = false) {
  if (!starterOnly) return rows || [];
  return (rows || []).filter((row) => num(row, "Starts") >= 15);
}

function playerTrait(row) {
  if (window.computePlayerTrait140) return window.computePlayerTrait140(row);
  return "-";
}
function renderRoster(rows, sortKey = "position", sortDir = "asc", isNationalTeam = false, view = "normal") {
  const sortedRows = sortRosterRows(rows, sortKey, sortDir);
  const rosterView = normalizeRosterView(view);
  return `
    <table class="sheet-table roster-sheet roster-mode-${rosterView}${isNationalTeam ? " roster-sheet-national" : ""}" data-sort-key="${esc(sortKey)}" data-sort-dir="${esc(sortDir)}" data-roster-view="${esc(rosterView)}">
      <thead><tr>
        ${rosterSortHeader("shirtNumber", "No", sortKey, sortDir, true)}
        ${isNationalTeam ? rosterSortHeader("club", "所属", sortKey, sortDir) : ""}
        ${rosterSortHeader("name", "選手", sortKey, sortDir)}
        ${rosterSortHeader("nationality", "国籍", sortKey, sortDir)}
        ${rosterSortHeader("position", "Pos", sortKey, sortDir)}
        ${rosterSortHeader("age", "年齢", sortKey, sortDir, true)}
        <th>状態</th>
        ${rosterSortHeader("apps", "出場", sortKey, sortDir, true)}
        ${rosterSortHeader("starts", "先発", sortKey, sortDir, true)}
        ${rosterSortHeader("substituteApps", "途中", sortKey, sortDir, true)}
        ${rosterSortHeader("goals", "得点", sortKey, sortDir, true)}
        ${rosterSortHeader("assists", "A", sortKey, sortDir, true)}
        ${rosterSortHeader("rating", "評価", sortKey, sortDir, true)}
        ${rosterSortHeader("trait", "特性", sortKey, sortDir)}
        ${rosterSortHeader("passesPer90", "Pass/90", sortKey, sortDir, true)}
        ${rosterSortHeader("shotsPer90", "Sh/90", sortKey, sortDir, true)}
        ${rosterSortHeader("shotsOnTargetPer90", "SOT/90", sortKey, sortDir, true)}
        ${rosterSortHeader("keyPassesPer90", "KP/90", sortKey, sortDir, true)}
        ${rosterSortHeader("dribblesPer90", "Drb/90", sortKey, sortDir, true)}
        ${rosterSortHeader("crossesPer90", "Cross/90", sortKey, sortDir, true)}
        ${rosterSortHeader("tacklesPer90", "Tk/90", sortKey, sortDir, true)}
        ${rosterSortHeader("tackleRate", "Tk%", sortKey, sortDir, true)}
        ${rosterSortHeader("interceptionsPer90", "Int/90", sortKey, sortDir, true)}
        ${rosterSortHeader("aerialsWonPer90", "Aer/90", sortKey, sortDir, true)}
        ${rosterSortHeader("aerialRate", "Aer%", sortKey, sortDir, true)}
        ${rosterSortHeader("foulsPer90", "Foul/90", sortKey, sortDir, true)}
        ${rosterSortHeader("savesPer90", "Sv/90", sortKey, sortDir, true)}
        ${rosterSortHeader("saveRate", "Sv%", sortKey, sortDir, true)}
        ${rosterSortHeader("passRate", "Pass%", sortKey, sortDir, true)}
      </tr></thead>
      <tbody>${sortedRows.map((row) => `
        <tr>
          <td class="num">${num(row, "ShirtNumber") > 0 ? esc(f(row, "ShirtNumber")) : "-"}</td>
          ${isNationalTeam ? `<td>${esc(f(row, "ClubShortName", f(row, "ClubName", "-")))}</td>` : ""}
          <td>${playerLink(num(row, "Id"), f(row, "Name"))}</td>
          <td>${nationalityCell(row)}</td>
          <td>${esc(f(row, "PrimaryPosition"))}</td>
          <td class="num">${esc(f(row, "Age"))}</td>
          <td>${conditionLabel(num(row, "Fatigue"))}</td>
          <td class="num">${esc(f(row, "Apps"))}</td>
          <td class="num">${esc(f(row, "Starts"))}</td>
          <td class="num">${esc(f(row, "SubstituteApps", Math.max(0, num(row, "Apps") - num(row, "Starts"))))}</td>
          <td class="num">${esc(f(row, "Goals"))}</td>
          <td class="num">${esc(f(row, "Assists"))}</td>
          <td class="num">${Number(f(row, "AvgRating", 0)).toFixed(2)}</td>
          <td class="trait-cell">${esc(playerTrait(row))}</td>
          <td class="num">${per90(row, "PassAttempts").toFixed(1)}</td>
          <td class="num">${per90(row, "Shots").toFixed(2)}</td>
          <td class="num">${per90(row, "ShotsOnTarget").toFixed(2)}</td>
          <td class="num">${per90(row, "KeyPasses").toFixed(2)}</td>
          <td class="num">${per90(row, "Dribbles").toFixed(2)}</td>
          <td class="num">${per90(row, "Crosses").toFixed(2)}</td>
          <td class="num">${per90(row, "Tackles").toFixed(2)}</td>
          <td class="num">${successRate(row, "Tackles", "TackleAttempts").toFixed(1)}%</td>
          <td class="num">${per90(row, "Interceptions").toFixed(2)}</td>
          <td class="num">${per90(row, "AerialsWon").toFixed(2)}</td>
          <td class="num">${successRate(row, "AerialsWon", "AerialAttempts").toFixed(1)}%</td>
          <td class="num">${per90(row, "Fouls").toFixed(2)}</td>
          <td class="num">${per90(row, "Saves").toFixed(2)}</td>
          <td class="num">${goalkeeperSaveRate(row).toFixed(1)}%</td>
          <td class="num">${successRate(row, "PassesCompleted", "PassAttempts").toFixed(1)}%</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function rosterSortHeader(key, label, currentKey, currentDir, numeric = false) {
  const active = key === currentKey;
  const marker = active ? (currentDir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="${numeric ? "num " : ""}sortable-head"><button class="sheet-sort" data-roster-sort="${key}" type="button">${esc(label)}${marker}</button></th>`;
}

function wireRosterSorting(rows, initialSortKey = "position", initialSortDir = "asc", isNationalTeam = false, view = "normal") {
  let sortKey = initialSortKey;
  let sortDir = initialSortDir;
  const container = document.querySelector("#teamRosterSheet");
  const bind = () => {
    container?.querySelectorAll("[data-roster-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextKey = button.dataset.rosterSort || "position";
        sortDir = sortKey === nextKey ? (sortDir === "desc" ? "asc" : "desc") : "desc";
        sortKey = nextKey;
        if (currentRoute?.name === "team") {
          currentRoute.state = currentRoute.state || {};
          currentRoute.state.rosterSortKey = sortKey;
          currentRoute.state.rosterSortDir = sortDir;
        }
        if (container) {
          container.innerHTML = renderRoster(rows, sortKey, sortDir, isNationalTeam, view);
          bind();
          wireRosterScrollSync();
        }
      });
    });
  };
  bind();
}

function wireRosterScrollSync() {
  const tableWrap = document.querySelector("#teamRosterSheet");
  const topScroll = document.querySelector("#teamRosterScrollTop");
  const bottomScroll = document.querySelector("#teamRosterScrollBottom");
  const topInner = topScroll?.firstElementChild;
  const bottomInner = bottomScroll?.firstElementChild;
  const table = tableWrap?.querySelector("table");
  if (!tableWrap || !topScroll || !topInner || !table) return;

  const fixedOffset = topScroll.classList.contains("roster-scroll-top-simple")
    ? 0
    : topScroll.classList.contains("roster-scroll-top-detail")
      ? (topScroll.classList.contains("roster-scroll-top-national") ? 302 : 216)
      : (topScroll.classList.contains("roster-scroll-top-national") ? 780 : 694);
  const scrollWidth = `${Math.max(0, table.scrollWidth - fixedOffset)}px`;
  topInner.style.width = scrollWidth;
  if (bottomInner) bottomInner.style.width = scrollWidth;
  let syncing = false;
  const sync = (source, targets) => {
    if (syncing) return;
    syncing = true;
    targets.forEach((target) => {
      if (target) target.scrollLeft = source.scrollLeft;
    });
    syncing = false;
  };
  topScroll.onscroll = () => sync(topScroll, [tableWrap, bottomScroll]);
  if (bottomScroll) bottomScroll.onscroll = () => sync(bottomScroll, [tableWrap, topScroll]);
  tableWrap.onscroll = () => sync(tableWrap, [topScroll, bottomScroll]);
  const routeState = currentRoute?.name === "team" ? (currentRoute.state || {}) : {};
  tableWrap.scrollTop = Number(routeState.rosterScrollTop || 0);
  tableWrap.scrollLeft = Number(routeState.rosterScrollLeft || tableWrap.scrollLeft || 0);
  topScroll.scrollLeft = tableWrap.scrollLeft;
  if (bottomScroll) bottomScroll.scrollLeft = tableWrap.scrollLeft;
}

function sortRosterRows(rows, sortKey, sortDir) {
  const direction = sortDir === "desc" ? -1 : 1;
  const sorted = [...rows].sort((a, b) => {
    const av = rosterSortValue(a, sortKey);
    const bv = rosterSortValue(b, sortKey);
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * direction;
    }

    return String(av).localeCompare(String(bv), "ja-JP") * direction;
  });

  if (sortKey === "position" && sortDir === "asc") {
    return sorted.sort((a, b) => positionOrder(f(a, "PrimaryPosition")) - positionOrder(f(b, "PrimaryPosition")) || String(f(a, "Name")).localeCompare(String(f(b, "Name")), "ja-JP"));
  }

  return sorted;
}

function rosterSortValue(row, sortKey) {
  switch (sortKey) {
    case "shirtNumber": return num(row, "ShirtNumber");
    case "name": return f(row, "Name");
    case "club": return f(row, "ClubShortName", f(row, "ClubName", ""));
    case "nationality": return f(row, "Nationality", "日本");
    case "age": return num(row, "Age");
    case "apps": return num(row, "Apps");
    case "starts": return num(row, "Starts");
    case "substituteApps": return Number(f(row, "SubstituteApps", Math.max(0, num(row, "Apps") - num(row, "Starts"))) || 0);
    case "goals": return num(row, "Goals");
    case "assists": return num(row, "Assists");
    case "trait": return playerTrait(row);
    case "passesPer90": return per90(row, "PassAttempts");
    case "shotsPer90": return per90(row, "Shots");
    case "shotsOnTargetPer90": return per90(row, "ShotsOnTarget");
    case "keyPassesPer90": return per90(row, "KeyPasses");
    case "keyPassesPer90": return per90(row, "KeyPasses");
    case "dribblesPer90": return per90(row, "Dribbles");
    case "crossesPer90": return per90(row, "Crosses");
    case "aerialsWonPer90": return per90(row, "AerialsWon");
    case "aerialRate": return successRate(row, "AerialsWon", "AerialAttempts");
    case "tacklesPer90": return per90(row, "Tackles");
    case "tackleRate": return successRate(row, "Tackles", "TackleAttempts");
    case "interceptionsPer90": return per90(row, "Interceptions");
    case "foulsPer90": return per90(row, "Fouls");
    case "savesPer90": return per90(row, "Saves");
    case "passRate": return successRate(row, "PassesCompleted", "PassAttempts");
    case "saveRate": return goalkeeperSaveRate(row);
    case "rating": return Number(f(row, "AvgRating", 0));
    case "position":
    default: return positionOrder(f(row, "PrimaryPosition"));
  }
}

function nationalityCell(row) {
  const nationality = esc(f(row, "Nationality", "日本"));
  return num(row, "IsForeign") === 1
    ? `<span class="foreign-badge">外国籍</span> ${nationality}`
    : nationality;
}

function renderTeamBudget(budget, seasonStanding = null, masked = isResultMasked()) {
  if (!budget) return "";
  const rank = num(seasonStanding, "Rank");
  const teamCount = num(seasonStanding, "TeamCount");
  const leagueRank = seasonStanding
    ? `${esc(f(seasonStanding, "LeagueCode", "-"))} ${rank ? `${rank}位${teamCount ? ` / ${teamCount}` : ""}` : "-"}`
    : "-";
  return `
    <div class="stat-row" style="margin-top:8px;">
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "Budget", 0))}</div><div class="stat-label">移籍予算残</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "Income", 0))}</div><div class="stat-label">移籍収入</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "Spending", 0))}</div><div class="stat-label">移籍支出</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "Balance", 0))}</div><div class="stat-label">収支</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "InitialBudget", 0))}</div><div class="stat-label">開幕時予算</div></div>
      <div class="stat"><div class="stat-value">${esc(f(budget, "Strategy", "再建"))}</div><div class="stat-label">補強方針</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "BaseBudget", 0))}</div><div class="stat-label">スポンサー予算</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "PerformanceBudget", 0))}</div><div class="stat-label">前年成績</div></div>
      <div class="stat"><div class="stat-value">${formatFee(f(budget, "CarryoverBudget", 0))}</div><div class="stat-label">繰越</div></div>
      <div class="stat"><div class="stat-value">${masked ? maskedValue(leagueRank, true) : leagueRank}</div><div class="stat-label">選択シーズン</div></div>
    </div>
  `;
}

function renderTransfers(rows) {
  return `
    <table>
      <thead><tr><th>種別</th><th>選手</th><th>移籍元</th><th>移籍先</th><th>メモ</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${esc(f(row, "Type"))}</td><td>${esc(f(row, "PlayerName"))}</td><td>${esc(f(row, "FromTeam", "-"))}</td><td>${esc(f(row, "ToTeam", "-"))}</td><td>${esc(f(row, "Note"))}</td></tr>
      `).join("") || `<tr><td colspan="5" class="muted">このシーズンの移籍履歴はまだありません。</td></tr>`}</tbody>
    </table>
  `;
}

async function renderPlayer(playerId, seasonId = null) {
  const data = await api("getPlayer", { playerId, seasonId });
  const player = data.player;
  const season = data.season;
  setHeader(f(player, "Name"), `${esc(f(player, "TeamName"))} / ${esc(f(player, "PrimaryPosition"))}`);
  const seasonTabs = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    const selected = id === season.id ? " active" : "";
    return `<button class="inline-button season-tab${selected}" data-player-season="${id}">${esc(f(row, "Year"))}</button>`;
  }).join("");

  setContent(`
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head">選手概要・能力ランク</div>
        <div class="panel-body">
          <div class="tabs">
            <span class="pill">年齢 ${esc(f(player, "Age"))}</span>
            <span class="pill">所属 ${teamCell(num(player, "DisplayTeamId"), f(player, "TeamName"), f(player, "PrimaryColor"), f(player, "TeamShort"), season.id, scope === "National" ? "National" : "")}</span>
            <span class="pill">主Pos ${esc(f(player, "PrimaryPosition"))}</span>
            <span class="pill">国籍 ${esc(f(player, "Nationality"))}</span>
            ${num(player, "IsForeign") === 1 ? `<span class="pill foreign-pill">外国籍枠</span>` : ""}
            <span class="pill">疲労 ${conditionLabel(num(player, "Fatigue"))}</span>
          </div>
          <div class="attrs">${renderAttributes(player)}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">ポジション適性</div>
        <div class="panel-body">${(data.fits || []).map((row) => `<span class="pill">${esc(f(row, "Position"))} ${esc(f(row, "Fit"))}</span>`).join(" ")}</div>
      </div>
    </div>
    <div class="grid-2" style="margin-top:12px;">
      <div class="panel">
        <div class="panel-head">シーズン成績</div>
        <div class="table-wrap">${renderPlayerSeasons(mergeDetailSeasonStats(data.seasonStats || [], data.detailSeasonStats || []), scope)}</div>
        <div class="table-wrap">${renderPlayerDetailSeasonStats(mergeDetailSeasonStats(data.seasonStats || [], data.detailSeasonStats || []), data.detailStatHighlights || [])}</div>
        <div class="table-wrap">${renderPlayerDetailSeasonStats(mergeDetailSeasonStats(data.seasonStats || [], data.detailSeasonStats || []), data.detailStatHighlights || [])}</div>
      </div>
      <div class="panel">
        <div class="panel-head">試合別評価点</div>
        <div class="panel-body compact-tabs"><div class="tabs">${seasonTabs}</div></div>
        <div class="table-wrap">${renderPlayerRatings(data.matchRatings || [])}</div>
      </div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">所属履歴</div>
      <div class="table-wrap">${renderTransfers(data.transfers || [])}</div>
    </div>
  `);

  document.querySelectorAll("[data-player-season]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("player", { playerId, seasonId: Number(button.dataset.playerSeason) });
    });
  });
}

function renderAttributes(player) {
  const attrs = [
    ["シュート", "Shooting"], ["パス", "Passing"], ["ドリブル", "Dribbling"], ["守備", "Defense"], ["セービング", "Saving"],
    ["スピード", "Speed"], ["スタミナ", "Stamina"], ["フィジカル", "Physical"], ["判断", "Decision"], ["メンタル", "Mental"]
  ];
  return attrs.map(([label, key]) => `
    <div class="attr"><div class="attr-name">${label}</div><div class="attr-value">${maskAbility(num(player, key))}</div></div>
  `).join("");
}

function maskAbility(value) {
  if (value >= 85) return "S";
  if (value >= 75) return "A";
  if (value >= 65) return "B";
  if (value >= 55) return "C";
  if (value >= 45) return "D";
  return "E";
}

function conditionLabel(fatigue) {
  if (fatigue >= 70) return "重い";
  if (fatigue >= 45) return "注意";
  if (fatigue >= 20) return "普通";
  return "良好";
}

function renderPlayerSeasons(rows, statsScope = "League", maskedLatestYear = null) {
  return `
    <table>
      <thead><tr><th>年</th><th>リーグ</th><th>所属</th><th class="num">出場</th><th class="num">先発</th><th class="num">途中</th><th class="num">得点</th><th class="num">A</th><th class="num">分</th><th class="num">評価</th><th>特性</th></tr></thead>
      <tbody>${rows.map((row) => {
        const rowMasked = maskedLatestYear !== null && num(row, "Year") === Number(maskedLatestYear);
        const cell = (value) => rowMasked ? maskedValue(value, true) : esc(value);
        const rating = rowMasked ? maskedValue(Number(f(row, "AvgRating", 0)).toFixed(2), true) : Number(f(row, "AvgRating", 0)).toFixed(2);
        const trait = rowMasked ? maskedValue(playerTrait(row), true) : esc(playerTrait(row));
        return `
        <tr><td>${esc(f(row, "Year"))}</td><td>${esc(f(row, "LeagueCode"))}</td><td>${teamCell(num(row, "TeamId"), f(row, "Team"), f(row, "TeamColor"), f(row, "Team"), num(row, "SeasonId"), statsScope === "National" ? "National" : "")}${num(row, "IsLoan") === 1 ? "（R）" : ""}</td><td class="num">${cell(f(row, "Apps"))}</td><td class="num">${cell(f(row, "Starts"))}</td><td class="num">${cell(f(row, "SubstituteApps", Math.max(0, num(row, "Apps") - num(row, "Starts"))))}</td><td class="num">${cell(f(row, "Goals"))}</td><td class="num">${cell(f(row, "Assists"))}</td><td class="num">${cell(f(row, "Minutes"))}</td><td class="num">${rating}</td><td class="trait-cell">${trait}</td></tr>
      `;
      }).join("") || `<tr><td colspan="11" class="muted">まだ公式戦出場がありません。</td></tr>`}</tbody>
    </table>
  `;
}

function renderPlayerDetailSeasonStats(rows, highlights = [], maskedLatestYear = null) {
  const highlightMap = buildDetailHighlightMap(highlights);
  return `
    <table>
      <thead><tr><th>Year</th><th>Team</th><th class="num">Pass/90</th><th class="num">Sh/90</th><th class="num">SOT/90</th><th class="num">KP/90</th><th class="num">Dr/90</th><th class="num">Cross/90</th><th class="num">Tk/90</th><th class="num">Tk%</th><th class="num">Int/90</th><th class="num">Aer/90</th><th class="num">Aer%</th><th class="num">Foul/90</th><th class="num">Sv/90</th><th class="num">Sv%</th><th class="num">Pass%</th></tr></thead>
      <tbody>${rows.map((row) => {
        const rowMasked = maskedLatestYear !== null && num(row, "Year") === Number(maskedLatestYear);
        if (rowMasked) {
          return `
        <tr>
          <td>${esc(f(row, "Year"))}</td>
          <td>${esc(f(row, "Team"))}</td>
          ${Array.from({ length: 15 }, () => `<td class="num">${maskedValue("", true)}</td>`).join("")}
        </tr>
      `;
        }
        return `
        <tr>
          <td>${esc(f(row, "Year"))}</td>
          <td>${esc(f(row, "Team"))}</td>
          ${renderDetailStatCell(row, highlightMap, "Passes", 1)}
          ${renderDetailStatCell(row, highlightMap, "Shots")}
          ${renderDetailStatCell(row, highlightMap, "ShotsOnTarget")}
          ${renderDetailStatCell(row, highlightMap, "KeyPasses")}
          ${renderDetailStatCell(row, highlightMap, "Dribbles")}
          ${renderDetailStatCell(row, highlightMap, "Crosses")}
          ${renderDetailStatCell(row, highlightMap, "Tackles")}
          ${renderDetailStatCell(row, highlightMap, "TackleSuccessRate", 1, "%")}
          ${renderDetailStatCell(row, highlightMap, "Interceptions")}
          ${renderDetailStatCell(row, highlightMap, "AerialsWon")}
          ${renderDetailStatCell(row, highlightMap, "AerialWinRate", 1, "%")}
          ${renderDetailStatCell(row, highlightMap, "Fouls")}
          ${renderDetailStatCell(row, highlightMap, "Saves")}
          ${renderDetailStatCell(row, highlightMap, "SaveRate", 1, "%")}
          ${renderDetailStatCell(row, highlightMap, "PassSuccessRate", 1, "%")}
        </tr>
      `;
      }).join("") || `<tr><td colspan="17" class="muted">No data</td></tr>`}</tbody>
    </table>
  `;
}

function renderPlayerRatings(rows) {
  return `
    <table>
      <thead><tr><th>年</th><th>節</th><th>試合</th><th>Pos</th><th class="num">分</th><th class="num">評価</th></tr></thead>
      <tbody>${rows.map((row) => {
        const score = f(row, "HomeGoals", "") === "" ? "-" : `${f(row, "HomeGoals")} - ${f(row, "AwayGoals")}`;
        return `<tr><td>${esc(f(row, "Year"))}</td><td class="num">${esc(f(row, "Round"))}</td><td>${matchLink(num(row, "MatchId"), `${f(row, "HomeTeam")} ${score} ${f(row, "AwayTeam")}`)}</td><td>${esc(f(row, "Position"))}</td><td class="num">${esc(f(row, "Minutes"))}</td><td class="num"><b>${Number(f(row, "Rating", 0)).toFixed(1)}</b></td></tr>`;
      }).join("") || `<tr><td colspan="6" class="muted">評価点はまだありません。</td></tr>`}</tbody>
    </table>
  `;
}

function renderPlayerRatingsWithGa(rows) {
  return `
    <table>
      <thead><tr><th>年</th><th>大会</th><th>節</th><th>試合</th><th>Pos</th><th class="num">分</th><th class="num">G</th><th class="num">A</th><th class="num">評価</th></tr></thead>
      <tbody>${rows.map((row) => {
        const score = f(row, "HomeGoals", "") === "" ? "-" : `${f(row, "HomeGoals")} - ${f(row, "AwayGoals")}`;
        return `<tr><td>${esc(f(row, "Year"))}</td><td>${esc(competitionLabel(row))}</td><td class="num">${esc(matchRoundLabel(row))}</td><td>${matchLink(num(row, "MatchId"), `${f(row, "HomeTeam")} ${score} ${f(row, "AwayTeam")}`)}</td><td>${esc(f(row, "Position"))}</td><td class="num">${esc(f(row, "Minutes"))}</td><td class="num">${esc(f(row, "Goals", 0))}</td><td class="num">${esc(f(row, "Assists", 0))}</td><td class="num"><b>${Number(f(row, "Rating", 0)).toFixed(1)}</b></td></tr>`;
      }).join("") || `<tr><td colspan="9" class="muted">評価点はまだありません。</td></tr>`}</tbody>
    </table>
  `;
}

renderPlayerRatings = renderPlayerRatingsWithGa;

function pkWinnerName(row) {
  if (f(row, "DecidedBy", "") !== "PK") return "";
  const winnerTeamId = num(row, "WinnerTeamId");
  if (!winnerTeamId) return "";
  if (winnerTeamId === num(row, "HomeTeamId")) return f(row, "HomeShort", f(row, "HomeTeam", ""));
  if (winnerTeamId === num(row, "AwayTeamId")) return f(row, "AwayShort", f(row, "AwayTeam", ""));
  return "";
}

function matchScoreText(row, options = {}) {
  const played = num(row, "Played") === 1;
  if (!played) return options.unplayed || "vs";
  const focusTeamId = Number(options.focusTeamId || 0);
  const homeGoals = f(row, "HomeGoals");
  const awayGoals = f(row, "AwayGoals");
  let score = "";
  if (focusTeamId && focusTeamId === num(row, "AwayTeamId")) {
    score = `${awayGoals} - ${homeGoals}`;
  } else {
    score = `${homeGoals} - ${awayGoals}`;
  }
  const pkWinner = pkWinnerName(row);
  return pkWinner ? `${score} (PK: ${pkWinner})` : score;
}

async function renderMatch(matchId) {
  const data = await api("getMatch", { matchId });
  const match = data.match;
  const played = num(match, "Played") === 1;
  const homeId = num(match, "HomeTeamId");
  const awayId = num(match, "AwayTeamId");
  const homeLineups = (data.lineups || []).filter((row) => num(row, "TeamId") === homeId);
  const awayLineups = (data.lineups || []).filter((row) => num(row, "TeamId") === awayId);
  const homeMatchNavigation = data.homeMatchNavigation || data.HomeMatchNavigation || {};
  const awayMatchNavigation = data.awayMatchNavigation || data.AwayMatchNavigation || {};
  const decided = played && f(match, "DecidedBy", "") === "PK" ? " PK" : "";
  const score = played ? `${f(match, "HomeGoals")} - ${f(match, "AwayGoals")}${decided}` : "未消化";
  const competitionName = f(match, "CompetitionGroup", "League") === "League" ? f(match, "LeagueName") : competitionLabel(match);
  const scoreLabel = matchScoreText(match, { unplayed: score });
  const scoreHtml = played
    ? `<div class="match-score is-hidden">
        <div class="match-score-value hidden">${esc(scoreLabel)}</div>
        <button class="inline-button match-score-reveal" type="button" data-reveal-match-score>結果を見る</button>
      </div>`
    : `<div class="match-score">${esc(scoreLabel)}</div>`;
  setHeader(`${f(match, "HomeShort")} vs ${f(match, "AwayShort")}`, `${esc(f(match, "Year"))}シーズン ${esc(matchRoundLabel(match))} / ${esc(competitionName)}`);

  setContent(`
    <div class="match-title">
      <div class="match-team">
        <div class="muted">ホーム</div>
        ${renderMatchTeamNameWithNavigation(homeMatchNavigation, teamCell(homeId, f(match, "HomeTeam"), f(match, "HomeColor"), f(match, "HomeTeam")))}
        <div class="muted">${esc(f(match, "HomeFormation"))} / ${esc(f(match, "HomeTactic"))}</div>
      </div>
      ${scoreHtml}
      <div class="match-team away">
        <div class="muted">アウェイ</div>
        ${renderMatchTeamNameWithNavigation(awayMatchNavigation, teamCell(awayId, f(match, "AwayTeam"), f(match, "AwayColor"), f(match, "AwayTeam")))}
        <div class="muted">${esc(f(match, "AwayFormation"))} / ${esc(f(match, "AwayTactic"))}</div>
      </div>
    </div>
    ${renderMatchStartingLineups(homeLineups, awayLineups, f(match, "HomeShort"), f(match, "AwayShort"), f(match, "HomeFormation"), f(match, "AwayFormation"))}
    ${played ? `
      <div class="panel match-detail-panel match-commentary-panel">
        <div class="panel-head">試合経過</div>
        <div class="table-wrap">${renderEvents(data.events || [], data.lineups || [])}</div>
      </div>
      <div class="panel match-detail-panel match-team-stats-panel">
        <div class="panel-head">チームスタッツ</div>
        <div class="table-wrap">${renderMatchTeamStats(match, data.events || [], data.ratings || [])}</div>
      </div>
    ` : `<div class="panel"><div class="panel-body">この試合はまだ行われていません。ホーム画面の「次の節へ」で進行できます。</div></div>`}
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">メンバー表</div>
      <div class="grid-2 panel-body">
        <div>${renderLineups(homeLineups, "ホーム")}</div>
        <div>${renderLineups(awayLineups, "アウェイ")}</div>
      </div>
    </div>
  `);
  content.querySelectorAll(".pitch-grid").forEach((grid) => {
    if (!grid.children.length) grid.closest(".panel")?.remove();
  });
}

function renderMatchTeamStats(match, events, ratings = []) {
  const homeId = num(match, "HomeTeamId");
  const awayId = num(match, "AwayTeamId");
  const home = newMatchTeamStats(homeId, f(match, "HomeShort", "HOME"));
  const away = newMatchTeamStats(awayId, f(match, "AwayShort", "AWAY"));
  const byTeam = new Map([[homeId, home], [awayId, away]]);
  let homePossessionSum = 0;
  let possessionCount = 0;

  home.goals = num(match, "HomeGoals");
  away.goals = num(match, "AwayGoals");

  const actions = groupMatchActions(events || []);
  actions.forEach((action) => {
    const goal = (action.events || []).find((row) => f(row, "EventType") === "Goal");
    const save = (action.events || []).find((row) => isActualSaveEvent(row));
    const miss = (action.events || []).find((row) => isMissEvent(row));
    if (goal) {
      const team = byTeam.get(num(goal, "TeamId"));
      if (team) {
        team.shots += 1;
        team.shotsOnTarget += 1;
      }
      return;
    }
    if (save) {
      const keeperTeamId = num(save, "TeamId");
      const shooterTeam = byTeam.get(keeperTeamId === homeId ? awayId : homeId);
      const keeperTeam = byTeam.get(keeperTeamId);
      if (shooterTeam) {
        shooterTeam.shots += 1;
        shooterTeam.shotsOnTarget += 1;
      }
      if (keeperTeam) keeperTeam.saves += 1;
      return;
    }
    if (miss) {
      const team = byTeam.get(num(miss, "TeamId"));
      if (team) team.shots += 1;
    }
  });

  (events || []).forEach((event) => {
    const eventType = f(event, "EventType");
    const teamId = num(event, "TeamId");
    const team = byTeam.get(teamId);
    if (!team) return;

    const detail = f(event, "Detail", "");
    if (eventType === "Info" && detail.includes("|")) {
      const parts = detail.split("|");
      const share = Number(parts[2]);
      if (Number.isFinite(share)) {
        homePossessionSum += teamId === homeId ? share : 100 - share;
        possessionCount += 1;
      }
    }

    if (eventType === "Turnover") {
      team.turnovers += 1;
    } else if (eventType === "SetPiece") {
      if (detail.includes("CK")) {
        team.corners += 1;
      } else if (detail.includes("PK")) {
        team.penalties += 1;
        const fouler = byTeam.get(teamId === homeId ? awayId : homeId);
        if (fouler) fouler.fouls += 1;
      } else if (detail.includes("FK")) {
        team.freeKicks += 1;
        const fouler = byTeam.get(teamId === homeId ? awayId : homeId);
        if (fouler) fouler.fouls += 1;
      }
    }
  });

  if (possessionCount > 0) {
    home.possession = Math.round((homePossessionSum / possessionCount) * 10) / 10;
    away.possession = Math.round((100 - home.possession) * 10) / 10;
  }

  const rows = [
    ["支配率", `${home.possession.toFixed(1)}%`, `${away.possession.toFixed(1)}%`],
    ["得点", home.goals, away.goals],
    ["シュート", home.shots, away.shots],
    ["枠内シュート", home.shotsOnTarget, away.shotsOnTarget],
    ["枠外シュート", Math.max(0, home.shots - home.shotsOnTarget), Math.max(0, away.shots - away.shotsOnTarget)],
    ["CK", home.corners, away.corners],
    ["FK", home.freeKicks, away.freeKicks],
    ["PK獲得", home.penalties, away.penalties],
    ["セーブ", home.saves, away.saves],
    ["ファウル", home.fouls, away.fouls],
    ["守備成功", home.turnovers, away.turnovers]
  ];

  return `
    <table class="match-team-stats-table">
      <thead>
        <tr>
          <th class="num">${esc(home.label)}</th>
          <th class="match-team-stat-label">項目</th>
          <th class="num">${esc(away.label)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, homeValue, awayValue]) => `
          <tr>
            <td class="num"><b>${esc(homeValue)}</b></td>
            <td class="match-team-stat-label">${esc(label)}</td>
            <td class="num"><b>${esc(awayValue)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function newMatchTeamStats(teamId, label) {
  return {
    teamId,
    label,
    possession: 50,
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    freeKicks: 0,
    penalties: 0,
    saves: 0,
    fouls: 0,
    turnovers: 0
  };
}

function renderMatchTeamNameWithNavigation(navigation, teamHtml) {
  const previousMatchId = num(navigation, "PreviousMatchId") || num(navigation, "previousMatchId");
  const nextMatchId = num(navigation, "NextMatchId") || num(navigation, "nextMatchId");
  return `
    <div class="match-team-nav">
      ${matchNavigationButton(previousMatchId, "up", "前の試合")}
      <div class="match-team-name">${teamHtml}</div>
      ${matchNavigationButton(nextMatchId, "down", "次の試合")}
    </div>
  `;
}

function matchNavigationButton(matchId, direction, label) {
  if (!matchId) {
    return `<button class="match-nav-button ${direction}" type="button" disabled aria-label="${esc(label)}"></button>`;
  }
  return `<button class="match-nav-button ${direction}" type="button" data-match-nav="${matchId}" aria-label="${esc(label)}" title="${esc(label)}"></button>`;
}

function renderMatchStartingLineups(homeLineups, awayLineups, homeLabel, awayLabel, homeFormation, awayFormation) {
  const homeStarters = (homeLineups || []).filter((row) => num(row, "IsStarter") === 1);
  const awayStarters = (awayLineups || []).filter((row) => num(row, "IsStarter") === 1);
  if (!homeStarters.length && !awayStarters.length) {
    return "";
  }

  return `
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">スタメンフォーメーション <span class="muted">${esc(homeFormation || "")} / ${esc(awayFormation || "")}</span></div>
      <div class="panel-body">
        <div class="pitch-grid">
          ${renderPitch(homeStarters, `${homeLabel} Starting XI`)}
          ${renderPitch(awayStarters, `${awayLabel} Starting XI`)}
        </div>
      </div>
    </div>
  `;
}

function renderEvents(rows, lineups = []) {
  const eventRows = buildMatchLogRows(rows || [], lineups || []);
  if (!eventRows.length) {
    return `<div class="match-commentary empty">試合経過ログはありません。</div>`;
  }
  const previousPositionMap = currentEventPositionMap;
  currentEventPositionMap = buildEventPositionMap(lineups);
  const actions = groupMatchActions(eventRows);
  const html = `
    <div class="match-commentary">
      ${actions.map((action) => `
        <div class="${esc(commentaryRowClass(action))}">
          <div class="commentary-minute">${esc(f(action.start, "Minute"))}'</div>
          <div class="commentary-body">
            <div class="commentary-text">${buildActionCommentary(action)}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  currentEventPositionMap = previousPositionMap;
  return html;
}

function buildMatchLogRows(rows, lineups) {
  const matchRows = [...(rows || []), ...buildSubstitutionEvents(lineups || [], rows || [])];
  return matchRows.sort((a, b) => {
    const minuteDiff = num(a, "Minute") - num(b, "Minute");
    if (minuteDiff !== 0) return minuteDiff;
    return eventSortOrder(a) - eventSortOrder(b);
  });
}

function eventSortOrder(row) {
  const type = f(row, "EventType");
  if (type === "Substitution") return 20;
  if (type === "Goal") return 10;
  return 0;
}

function buildSubstitutionEvents(lineups, eventRows = []) {
  const rows = lineups || [];
  const teamShortById = new Map();
  (eventRows || []).forEach((row) => {
    const teamId = num(row, "TeamId");
    const teamShort = f(row, "TeamShort", "");
    if (teamId && teamShort && !teamShortById.has(teamId)) teamShortById.set(teamId, teamShort);
  });
  const substituteRows = rows
    .filter((row) => num(row, "IsStarter") !== 1 && f(row, "MinuteOn", "") !== "")
    .sort((a, b) => num(a, "TeamId") - num(b, "TeamId") || num(a, "MinuteOn") - num(b, "MinuteOn") || positionOrder(f(a, "Position")) - positionOrder(f(b, "Position")));

  return substituteRows.map((subIn, index) => {
    const minute = Number(f(subIn, "MinuteOn", 0));
    const outPlayer = findSubstitutedPlayer(subIn, rows, substituteRows);
    const teamShort = teamShortById.get(num(subIn, "TeamId")) || f(subIn, "TeamShort", f(subIn, "Team", ""));
    return {
      Id: `sub-${num(subIn, "TeamId")}-${minute}-${num(subIn, "PlayerId")}-${index}`,
      Minute: minute,
      EventType: "Substitution",
      TeamId: num(subIn, "TeamId"),
      TeamShort: teamShort,
      PlayerId: num(subIn, "PlayerId"),
      PlayerName: f(subIn, "PlayerName"),
      RelatedPlayerId: outPlayer ? num(outPlayer, "PlayerId") : null,
      RelatedPlayerName: outPlayer ? f(outPlayer, "PlayerName") : "",
      Detail: "Substitution"
    };
  });
}

function findSubstitutedPlayer(subIn, rows, substituteRows = []) {
  const minute = Number(f(subIn, "MinuteOn", 0));
  const teamId = num(subIn, "TeamId");
  const sameMinuteSubIndex = (substituteRows || [])
    .filter((candidate) => num(candidate, "TeamId") === teamId && Number(f(candidate, "MinuteOn", 0)) === minute)
    .findIndex((candidate) => num(candidate, "PlayerId") === num(subIn, "PlayerId"));
  return (rows || [])
    .filter((candidate) => num(candidate, "TeamId") === teamId && num(candidate, "IsStarter") === 1 && Number(f(candidate, "MinuteOff", 90)) === minute)
    .sort((a, b) => {
      const posMatchA = f(a, "Position") === f(subIn, "Position") ? 0 : 1;
      const posMatchB = f(b, "Position") === f(subIn, "Position") ? 0 : 1;
      return posMatchA - posMatchB || positionOrder(f(a, "Position")) - positionOrder(f(b, "Position"));
    })[Math.max(0, sameMinuteSubIndex)];
}
function buildEventPositionMap(lineups) {
  const map = new Map();
  (lineups || []).forEach((row) => {
    const playerId = num(row, "PlayerId");
    const position = f(row, "Position");
    if (playerId && position) map.set(playerId, position);
  });
  return map;
}

function commentaryRowClass(action) {
  const classes = ["commentary-row", `commentary-${action.kind}`];
  if ((action.events || []).some((row) => f(row, "EventType") === "Goal")) {
    classes.push("commentary-goal");
  } else if ((action.events || []).some((row) => isActualSaveEvent(row))) {
    classes.push("commentary-shot-on-target");
  } else if ((action.events || []).some((row) => isMissEvent(row))) {
    classes.push("commentary-shot-off-target");
  }
  return classes.join(" ");
}

function groupMatchActions(rows) {
  const actions = [];
  let current = null;
  const pushCurrent = () => {
    if (current) actions.push(current);
    current = null;
  };

  (rows || []).forEach((row) => {
    if (f(row, "EventType") === "Substitution") {
      pushCurrent();
      actions.push({ kind: "substitution", start: row, events: [row] });
      return;
    }

    if (isAttackStartEvent(row)) {
      pushCurrent();
      current = { kind: "attack", start: row, events: [row] };
      return;
    }

    if (isSetPieceStartEvent(row)) {
      if (current) {
        current.nextSetPiece = row;
        pushCurrent();
      }
      current = { kind: setPieceKind(row), start: row, events: [row] };
      return;
    }

    if (!current) {
      actions.push({ kind: "single", start: row, events: [row] });
      return;
    }

    current.events.push(row);
    if (isActionTerminalEvent(row)) {
      pushCurrent();
    }
  });

  pushCurrent();
  return actions;
}

function isAttackStartEvent(row) {
  return f(row, "EventType") === "Info" && f(row, "Detail", "").includes("|");
}

function isSetPieceStartEvent(row) {
  const detail = f(row, "Detail", "");
  return f(row, "EventType") === "SetPiece" && (detail.includes("CK") || detail.includes("FK") || detail.includes("PK"));
}

function setPieceKind(row) {
  const detail = f(row, "Detail", "");
  if (detail.includes("CK")) return "corner";
  if (detail.includes("PK")) return "penalty";
  if (detail.includes("FK")) return "freekick";
  return "setpiece";
}

function isActionTerminalEvent(row) {
  const type = f(row, "EventType");
  return type === "Goal" || type === "Save" || type === "Miss" || type === "Turnover";
}

function isActualSaveEvent(row) {
  return f(row, "EventType") === "Save" && !f(row, "Detail", "").includes("処理");
}

function isMissEvent(row) {
  return f(row, "EventType") === "Miss" || (f(row, "EventType") === "Save" && f(row, "Detail", "").includes("処理"));
}

function buildActionCommentary(action) {
  switch (action.kind) {
    case "substitution": return buildSubstitutionCommentary(action);
    case "attack": return buildOpenPlayCommentary(action);
    case "corner": return buildCornerCommentary(action);
    case "freekick": return buildFreeKickCommentary(action);
    case "penalty": return buildPenaltyCommentary(action);
    default: return eventCommentaryText(action.start);
  }
}

function buildSubstitutionCommentary(action) {
  const row = action.start;
  const team = esc(f(row, "TeamShort", ""));
  const playerIn = eventPlayer(row, "PlayerId", "PlayerName") || "交代選手";
  const playerOut = eventPlayer(row, "RelatedPlayerId", "RelatedPlayerName");
  return playerOut
    ? `${team}は選手交代。${playerOut}に代えて${playerIn}を投入。`
    : `${team}は選手交代。${playerIn}を投入。`;
}
function buildOpenPlayCommentary(action) {
  const start = action.start;
  const parts = f(start, "Detail", "").split("|");
  const pattern = normalizePatternName(parts[0] || "");
  const space = normalizeSpaceName(parts[1] || "");
  const share = Number(parts[2] || 0);
  const tempo = share >= 56 ? "押し込む流れ" : share <= 44 ? "スペースがある流れ" : "拮抗した流れ";
  const spacePrefix = space === "拮抗した中盤" ? "" : `${esc(space || tempo)}で`;
  const team = esc(f(start, "TeamShort"));
  const giver = eventPlayer(start, "PlayerId", "PlayerName") || "起点の選手";
  const receiver = eventPlayer(start, "RelatedPlayerId", "RelatedPlayerName");
  const hasReceiver = Boolean(receiver);
  const prefix = attackPatternPrefix(pattern, team, giver, receiver, spacePrefix);
  const shot = action.events.find((row) => f(row, "EventType") === "Info" && f(row, "Detail", "").includes("のシュート"));
  const turnover = action.events.find((row) => f(row, "EventType") === "Turnover");
  const goal = action.events.find((row) => f(row, "EventType") === "Goal");
  const save = action.events.find((row) => isActualSaveEvent(row));
  const miss = action.events.find((row) => isMissEvent(row));
  const nextSetPiece = action.nextSetPiece;

  if (nextSetPiece) {
    const setPieceType = setPieceLabel(nextSetPiece);
    const fouled = eventPlayer(nextSetPiece, "PlayerId", "PlayerName") || receiver || giver;
    const defender = eventPlayerWithTeam(nextSetPiece, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
    return `${prefix}。${fouled}に入ったところで${defender || "相手守備"}が止めに入り、${setPieceType}の判定。`;
  }

  if (turnover) {
    const defender = eventPlayerWithTeam(turnover, "PlayerId", "PlayerName", "TeamShort");
    const stopped = eventPlayer(turnover, "RelatedPlayerId", "RelatedPlayerName") || receiver || giver;
    const defenseText = turnoverDefenseText(turnover, defender || "相手守備", stopped);
    return hasReceiver
      ? `${prefix}が、${defenseText}`
      : `${prefix}。${defenseText}`;
  }

  if (goal) {
    const shooter = eventPlayer(goal, "PlayerId", "PlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : "") || receiver || giver;
    const keeper = eventPlayerWithTeam(goal, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
    return `${prefix}。${attackPatternGoalText(pattern, giver, receiver, shooter, keeper)}`;
  }

  if (save) {
    const shooter = eventPlayer(save, "RelatedPlayerId", "RelatedPlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : "") || receiver || giver;
    const keeper = eventPlayerWithTeam(save, "PlayerId", "PlayerName", "TeamShort");
    const corner = f(save, "Detail", "").includes("CK") ? "弾き出してCK。" : "落ち着いて防ぐ。";
    return `${prefix}。${attackPatternSaveText(pattern, shooter, keeper || "GK", corner)}`;
  }

  if (miss) {
    const shooter = eventPlayer(miss, "PlayerId", "PlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : "") || receiver || giver;
    return `${prefix}。${attackPatternMissText(pattern, shooter)}`;
  }

  if (shot) {
    const shooter = eventPlayer(shot, "PlayerId", "PlayerName") || receiver || giver;
    return `${prefix}。${attackPatternShotText(pattern, shooter)}`;
  }

  return `${prefix}。`;
}

function attackPatternPrefix(pattern, team, giver, receiver, spacePrefix) {
  const p = normalizePatternName(pattern);
  switch (p) {
    case "スルーパス":
      return `${team}の${giver}は${spacePrefix}スルーパス。${receiver || "前線"}を裏へ走らせる`;
    case "クロス":
      return `${team}の${giver}は${spacePrefix}クロス。${receiver || "ゴール前"}がゴール前へ入る`;
    case "ロングシュート":
      return `${team}の${giver}が${spacePrefix}自らロングシュート`;
    case "ドリブル":
      return `${team}の${giver}が${spacePrefix}自らドリブル`;
    case "ロングボール":
      return `${team}の${giver}は${spacePrefix}ロングボール。${receiver || "前線"}が競りに行く`;
    case "連携":
      return `${team}の${giver}は${spacePrefix}連携。${receiver || "味方"}とのワンツーを狙う`;
    default:
      return receiver
        ? `${team}の${giver}は${spacePrefix}${esc(p)}。${receiver}を狙う`
        : `${team}の${giver}が${spacePrefix}自ら${esc(p)}`;
  }
}

function attackPatternGoalText(pattern, giver, receiver, shooter, keeper) {
  const p = normalizePatternName(pattern);
  switch (p) {
    case "スルーパス":
      return `${shooter || receiver}が抜け出し、${keeper ? `${keeper}の届かないコースへ流し込む。` : "冷静に流し込む。"}ゴール。`;
    case "クロス":
      return `${shooter || receiver}がゴール前で合わせ、ネットを揺らす。ゴール。`;
    case "ロングシュート":
      return `${shooter || giver}のミドルが突き刺さる。ゴール。`;
    case "ドリブル":
      return `${shooter || giver}が持ち込んで決め切る。ゴール。`;
    case "ロングボール":
      return `${shooter || receiver}が収めて一気に仕留める。ゴール。`;
    case "連携":
      return `${giver}と${receiver || shooter}の連携から崩し、最後は${shooter || receiver || giver}が決める。ゴール。`;
    default:
      return keeper
        ? `${shooter}がシュート。${keeper}も反応したが届かず、ゴール。`
        : `${shooter}が決め切り、ゴール。`;
  }
}

function attackPatternSaveText(pattern, shooter, keeper, saveText) {
  const p = normalizePatternName(pattern);
  switch (p) {
    case "スルーパス":
      return `${shooter}が抜け出して打つが、${keeper}が${saveText}`;
    case "クロス":
      return `${shooter}が合わせるが、${keeper}が${saveText}`;
    case "ロングシュート":
      return `${shooter}が振り抜くが、${keeper}が${saveText}`;
    case "ドリブル":
      return `${shooter}が持ち込んで打つが、${keeper}が${saveText}`;
    case "ロングボール":
      return `${shooter}が収めて打つが、${keeper}が${saveText}`;
    case "連携":
      return `${shooter}が崩しから打つが、${keeper}が${saveText}`;
    default:
      return `${shooter}がシュートに持ち込むが、${keeper}が${saveText}`;
  }
}

function attackPatternMissText(pattern, shooter) {
  const p = normalizePatternName(pattern);
  switch (p) {
    case "スルーパス": return `${shooter}が抜け出して狙うが、枠を外れる。`;
    case "クロス": return `${shooter}が合わせるが、シュートは枠外。`;
    case "ロングシュート": return `${shooter}が思い切って狙うが、枠を外れる。`;
    case "ドリブル": return `${shooter}が持ち込んで打つが、枠を捉えない。`;
    case "ロングボール": return `${shooter}が収めて狙うが、枠外。`;
    case "連携": return `${shooter}が崩しから狙うが、枠を外れる。`;
    default: return `${shooter}がシュートに持ち込むが、枠を外れる。`;
  }
}

function attackPatternShotText(pattern, shooter) {
  const p = normalizePatternName(pattern);
  switch (p) {
    case "スルーパス": return `${shooter}が抜け出してシュートまで持ち込む。`;
    case "クロス": return `${shooter}がゴール前で合わせる。`;
    case "ロングシュート": return `${shooter}がそのまま振り抜く。`;
    case "ドリブル": return `${shooter}が持ち込んでシュートまで行く。`;
    case "ロングボール": return `${shooter}が収めてシュートまで持ち込む。`;
    case "連携": return `${shooter}が崩しからシュートまで持ち込む。`;
    default: return `${shooter}がシュートまで持ち込む。`;
  }
}

function buildCornerCommentary(action) {
  const start = action.start;
  const team = esc(f(start, "TeamShort"));
  const kicker = eventPlayer(start, "PlayerId", "PlayerName") || "キッカー";
  const receiver = eventPlayer(start, "RelatedPlayerId", "RelatedPlayerName") || "ゴール前";
  const shot = action.events.find((row) => f(row, "EventType") === "Info" && f(row, "Detail", "").includes("のシュート"));
  const goal = action.events.find((row) => f(row, "EventType") === "Goal");
  const save = action.events.find((row) => isActualSaveEvent(row));
  const miss = action.events.find((row) => isMissEvent(row));
  const turnover = action.events.find((row) => f(row, "EventType") === "Turnover");
  const base = `${team}はCK。${kicker}が蹴り込み、${receiver}を狙う`;

  if (turnover) {
    const defender = eventPlayerWithTeam(turnover, "PlayerId", "PlayerName", "TeamShort");
    return `${base}が、${defender || "相手守備"}が競り勝ってクリア。`;
  }
  if (goal) {
    const scorer = eventPlayer(goal, "PlayerId", "PlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : receiver);
    const keeper = eventPlayerWithTeam(goal, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
    return keeper
      ? `${base}。${scorer}が合わせ、${keeper}の守るゴールを破る。`
      : `${base}。${scorer}が合わせてゴール。`;
  }
  if (save) {
    const shooter = eventPlayer(save, "RelatedPlayerId", "RelatedPlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : receiver);
    const keeper = eventPlayerWithTeam(save, "PlayerId", "PlayerName", "TeamShort");
    const corner = f(save, "Detail", "").includes("CK") ? "弾いて再びCK。" : "防ぐ。";
    return `${base}。${shooter}がシュートするが、${keeper || "GK"}が${corner}`;
  }
  if (miss) {
    const shooter = eventPlayer(miss, "PlayerId", "PlayerName") || (shot ? eventPlayer(shot, "PlayerId", "PlayerName") : receiver);
    return `${base}。${shooter}が合わせるが、枠を外れる。`;
  }
  return `${base}。`;
}

function turnoverDefenseText(row, defender, stopped) {
  const detail = f(row, "Detail", "");
  if (detail.includes("INT")) return `${defender}がインターセプト。`;
  if (detail.includes("TKL")) return `${defender}が${stopped}へタックル。`;
  if (detail.includes("AER")) return `${defender}が${stopped}との空中戦に勝つ。`;
  return `${defender}が${stopped}へタックル。`;
}

function buildFreeKickCommentary(action) {
  const start = action.start;
  const team = esc(f(start, "TeamShort"));
  const fouled = eventPlayer(start, "PlayerId", "PlayerName") || "攻撃側の選手";
  const defender = eventPlayerWithTeam(start, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
  const cross = action.events.find((row) => f(row, "EventType") === "Info" && f(row, "Detail", "").includes("FK cross"));
  const goal = action.events.find((row) => f(row, "EventType") === "Goal");
  const save = action.events.find((row) => isActualSaveEvent(row));
  const miss = action.events.find((row) => isMissEvent(row));
  const turnover = action.events.find((row) => f(row, "EventType") === "Turnover");
  const nextSetPiece = action.nextSetPiece;
  const base = `${team}は${fouled}が${defender || "相手守備"}に止められてFKを獲得`;

  if (cross) {
    const kicker = eventPlayer(cross, "PlayerId", "PlayerName") || "キッカー";
    const receiver = eventPlayer(cross, "RelatedPlayerId", "RelatedPlayerName") || "ゴール前";
    const crossBase = `${base}。${kicker}がゴール前へ入れ、${receiver}を狙う`;
    if (turnover) {
      const clearer = eventPlayerWithTeam(turnover, "PlayerId", "PlayerName", "TeamShort");
      return `${crossBase}が、${clearer || "相手守備"}が競り勝ってクリア。`;
    }
    if (goal) {
      const scorer = eventPlayer(goal, "PlayerId", "PlayerName") || receiver;
      const keeper = eventPlayerWithTeam(goal, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
      return keeper
        ? `${crossBase}。${scorer}が合わせ、${keeper}の守るゴールを破る。`
        : `${crossBase}。${scorer}が合わせてゴール。`;
    }
    if (save) {
      const shooter = eventPlayer(save, "RelatedPlayerId", "RelatedPlayerName") || receiver;
      const keeper = eventPlayerWithTeam(save, "PlayerId", "PlayerName", "TeamShort");
      const saveText = f(save, "Detail", "").includes("CK") ? "弾いてCK。" : "防ぐ。";
      return `${crossBase}。${shooter}がシュートするが、${keeper || "GK"}が${saveText}`;
    }
    if (miss) {
      const shooter = eventPlayer(miss, "PlayerId", "PlayerName") || receiver;
      return `${crossBase}。${shooter}が合わせるが、枠を外れる。`;
    }
    return `${crossBase}。`;
  }

  if (goal) {
    const kicker = eventPlayer(goal, "PlayerId", "PlayerName") || fouled;
    return `${base}。${kicker}が直接狙い、セットプレーからゴール。`;
  }
  if (save) {
    const kicker = eventPlayer(save, "RelatedPlayerId", "RelatedPlayerName") || fouled;
    const keeper = eventPlayerWithTeam(save, "PlayerId", "PlayerName", "TeamShort");
    const saveText = f(save, "Detail", "").includes("CK") ? "弾いてCK。" : "キャッチして防ぐ。";
    return `${base}。${kicker}が直接狙うが、${keeper || "GK"}が${saveText}`;
  }
  if (miss) {
    const kicker = eventPlayer(miss, "PlayerId", "PlayerName") || fouled;
    return `${base}。${kicker}が直接狙うが、枠を外れる。`;
  }
  if (nextSetPiece && setPieceKind(nextSetPiece) === "corner") {
    return `${base}。ゴール前へ入れたボールからCKにつなげる。`;
  }
  return `${base}。キックは得点にはつながらない。`;
}

function buildPenaltyCommentary(action) {
  const start = action.start;
  const team = esc(f(start, "TeamShort"));
  const fouled = eventPlayer(start, "PlayerId", "PlayerName") || "攻撃側の選手";
  const defender = eventPlayerWithTeam(start, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
  const goal = action.events.find((row) => f(row, "EventType") === "Goal");
  const save = action.events.find((row) => isActualSaveEvent(row));
  const base = `${team}は${fouled}が${defender || "相手守備"}に倒されてPKを獲得`;

  if (goal) {
    const kicker = eventPlayer(goal, "PlayerId", "PlayerName") || fouled;
    return `${base}。${kicker}が落ち着いて決め、ゴール。`;
  }
  if (save) {
    const kicker = eventPlayer(save, "RelatedPlayerId", "RelatedPlayerName") || fouled;
    const keeper = eventPlayerWithTeam(save, "PlayerId", "PlayerName", "TeamShort");
    return `${base}。${kicker}が蹴るが、${keeper || "GK"}がPKストップ。`;
  }
  return `${base}。`;
}

function setPieceLabel(row) {
  const kind = setPieceKind(row);
  if (kind === "corner") return "CK";
  if (kind === "penalty") return "PK";
  if (kind === "freekick") return "FK";
  return "セットプレー";
}

function eventTypeLabel(type) {
  switch (type) {
    case "Goal": return "ゴール";
    case "Save": return "セーブ";
    case "Miss": return "枠外";
    case "SetPiece": return "セットプレー";
    case "Turnover": return "奪取";
    case "Info": return "情報";
    default: return type || "-";
  }
}

function renderEventRelatedPlayer(row) {
  if (f(row, "AssistName")) return playerLink(num(row, "AssistPlayerId"), f(row, "AssistName"));
  if (f(row, "RelatedPlayerName")) return playerLink(num(row, "RelatedPlayerId"), f(row, "RelatedPlayerName"));
  return "-";
}

function eventPlayer(row, idKey, nameKey) {
  const name = f(row, nameKey);
  if (!name) return "";
  const playerId = num(row, idKey);
  const position = currentEventPositionMap.get(playerId);
  const positionLabel = position ? ` <span class="event-player-position">(${esc(position)})</span>` : "";
  return `${playerLink(playerId, name)}${positionLabel}`;
}

function eventPlayerWithTeam(row, idKey, nameKey, teamKey) {
  const linked = eventPlayer(row, idKey, nameKey);
  if (!linked) return "";
  const team = f(row, teamKey);
  return team ? `${esc(team)}の${linked}` : linked;
}

function eventCommentaryText(row) {
  const type = f(row, "EventType");
  const team = esc(f(row, "TeamShort"));
  const player = eventPlayer(row, "PlayerId", "PlayerName");
  const assist = eventPlayer(row, "AssistPlayerId", "AssistName");
  const related = eventPlayerWithTeam(row, "RelatedPlayerId", "RelatedPlayerName", "RelatedTeamShort");
  const detail = esc(f(row, "Detail", ""));
  const variant = commentaryVariant(row, 4);
  switch (type) {
    case "Goal":
      if (assist && related) return pickComment(row, [
        `${team}、${assist}のラストパスから${player}。${related}の届かないコースへ流し込み、ゴール。`,
        `${team}が崩した。${assist}が丁寧に預け、最後は${player}。${related}も反応したが止められない。`,
        `${assist}が一瞬の隙を突く。${player}が受けて右足、${related}の手先を抜けてネットへ。`,
        `${team}の決定機。${assist}から${player}へ渡り、冷静なフィニッシュでゴール。`
      ]);
      if (assist) return pickComment(row, [
        `${team}、${assist}が決定機を作り、${player}がきっちり仕留める。`,
        `${assist}のパスが通った。${player}が迷わず振り抜き、${team}にゴール。`,
        `${team}は${assist}を起点に前進。最後は${player}が押し込む。`,
        `${assist}の供給から${player}。狙い澄ました一撃が決まる。`
      ]);
      if (related) return pickComment(row, [
        `${team}の${player}が迷わず振り抜く。${related}も反応したが止めきれず、ゴール。`,
        `${player}がシュートコースを作った。${related}の逆を突いてネットを揺らす。`,
        `${team}、${player}が個の力で決め切った。${related}は届かない。`,
        `${player}がペナルティエリア付近から一閃。${related}の守るゴールを破る。`
      ]);
      return `${team}、${player || "フィニッシャー"}が決めた。`;
    case "Save":
      if (player && related) return pickComment(row, [
        `${related}がシュートを放つ。だが${team}の${player}が正面に入り、落ち着いてセーブ。`,
        `${related}が狙ったが、${player}が反応。${team}は守護神のプレーで失点を逃れる。`,
        `${related}の一撃。${player}が横っ飛びで弾き出し、${team}がしのぐ。`,
        `${related}がゴール前でフィニッシュ。${player}が体を大きく使って止めた。`
      ]);
      if (player) return `${team}の${player}が好反応でピンチを防ぐ。`;
      return `${team}がシュートを防いだ。`;
    case "Miss":
      if (player) return `${team}の${player}が狙うが、枠を外れる。`;
      return `${team}のシュートは枠を外れる。`;
    case "Turnover":
      if (player && related) return pickComment(row, [
        `${related}が前を向いて仕掛けるが、${team}の${player}がインターセプト。`,
        `${related}の運び出しに対して、${player}が距離を詰める。${team}がここで奪回。`,
        `${related}が縦へ入ろうとしたところ、${player}がタックル。`,
        `${team}の${player}が鋭い寄せ。${related}に自由を与えず、攻撃を断ち切った。`
      ]);
      if (player) return `${team}の${player}がタックル。`;
      return `${team}が攻撃を断ち切った。`;
    case "SetPiece":
      if (player && related) return pickComment(row, [
        `${team}の${player}が体を入れて前を向く。たまらず${related}が止め、セットプレーの判定。`,
        `${player}が仕掛けたところで${related}がファウル。${team}に良い位置のセットプレー。`,
        `${team}は${player}を起点に前進。${related}が遅れて入り、笛が鳴る。`,
        `${player}が倒される。${related}のファウルで、${team}がセットプレーを得た。`
      ]);
      if (player) return `${team}の${player}がセットプレーを任される。ゴール前に緊張が走る。`;
      if (related) return `${related}のファウルでプレーが止まる。${team}にセットプレー。`;
      return `${team}にセットプレーのチャンス。`;
    case "Info":
      return renderInfoCommentary(row, team, player, related, variant);
    default:
      if (player && related) return `${team}の${player}と${related}がプレーに関与。`;
      return `${team}がプレーを進める。`;
  }
}

function commentaryVariant(row, count) {
  const seed = num(row, "Id") + num(row, "Minute") * 7 + String(f(row, "EventType")).length * 13;
  return Math.abs(seed) % count;
}

function pickComment(row, options) {
  return options[commentaryVariant(row, options.length)];
}

function renderInfoCommentary(row, team, player, related, variant) {
  const raw = f(row, "Detail", "");
  const parts = raw.includes("|") ? raw.split("|") : [];
  const pattern = normalizePatternName(parts[0] || raw);
  const space = normalizeSpaceName(parts[1] || "");
  const share = parts[2] ? Number(parts[2]) : 0;
  const tempo = share >= 56 ? "押し込む流れ" : share <= 44 ? "スペースがある流れ" : "拮抗した流れ";
  if (player && related) {
    return [
      `${team}は${tempo}から、${player}が顔を上げる。${related}へ${pattern}を狙った。`,
      `${team}の攻撃。${player}がボールを持ち、${related}の動き出しに合わせて${pattern}。`,
      `${player}が起点になる。${team}は${space || tempo}を見て、${related}へ展開する。`,
      `${team}、${player}から${related}へ。${pattern}で守備ラインのずれを突きにいく。`
    ][variant];
  }
  if (player) {
    return [
      `${team}は${player}に預ける。${pattern}で局面を動かしにいく。`,
      `${player}が前を向く。${team}は${tempo}の中で${pattern}を選択。`,
      `${team}の${player}、ここは自ら仕掛ける構え。`,
      `${player}がボールを引き出し、${team}が攻撃のテンポを上げる。`
    ][variant];
  }
  return `${team}が${tempo}から攻撃を組み立てる。`;
}

function normalizePatternName(value) {
  const text = String(value || "");
  const key = text.split("/")[0].trim();
  const patternMap = {
    ThroughPass: "スルーパス",
    Cross: "クロス",
    LongShot: "ロングシュート",
    Dribble: "ドリブル",
    LongBall: "ロングボール",
    Combination: "連携"
  };
  if (patternMap[key]) return patternMap[key];
  if (text.includes("スルー")) return "スルーパス";
  if (text.includes("クロス")) return "クロス";
  if (text.includes("ロングシュート")) return "ロングシュート";
  if (text.includes("ドリブル")) return "ドリブル";
  if (text.includes("ロングボール")) return "ロングボール";
  if (text.includes("連携")) return "連携";
  const cleaned = key;
  return cleaned.replace(/^\S+\s+/, "").trim() || "攻撃";
}

function normalizeSpaceName(value) {
  if (value === "Dense") return "密集地帯";
  if (value === "Open") return "オープンスペース";
  if (value === "Mid") return "拮抗した中盤";
  if (value.includes("密集")) return "密集地帯";
  if (value.includes("オープン")) return "オープンスペース";
  if (value.includes("拮抗")) return "拮抗した中盤";
  return value;
}

function renderMatchRatings(rows) {
  return `
    <table>
      <thead><tr><th>所属</th><th>選手</th><th>Pos</th><th class="num">分</th><th class="num">評価</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${esc(f(row, "TeamShort"))}</td><td>${playerLink(num(row, "PlayerId"), f(row, "PlayerName"))}</td><td>${esc(f(row, "Position"))}</td><td class="num">${esc(f(row, "Minutes"))}</td><td class="num"><b>${Number(f(row, "Rating", 0)).toFixed(1)}</b></td></tr>
      `).join("")}</tbody>
    </table>
  `;
}

function renderLineups(rows, label) {
  const orderedRows = [...rows].sort((a, b) => {
    const groupDiff = lineupGroup(a) - lineupGroup(b);
    if (groupDiff !== 0) return groupDiff;
    const posDiff = positionOrder(f(a, "Position")) - positionOrder(f(b, "Position"));
    if (posDiff !== 0) return posDiff;
    return Number(f(a, "ShirtNumber", 0)) - Number(f(b, "ShirtNumber", 0));
  });
  return `
    <table>
      <thead><tr><th colspan="6">${label}</th></tr><tr><th>No</th><th>選手</th><th>登録Pos</th><th>起用</th><th class="num">分</th><th>交代</th></tr></thead>
      <tbody>${orderedRows.map((row) => `
        <tr>
          <td class="num">${esc(f(row, "ShirtNumber"))}</td>
          <td>${playerLink(num(row, "PlayerId"), f(row, "PlayerName"))}${num(row, "IsForeign") === 1 ? ` <span class="foreign-badge">外</span>` : ""}</td>
          <td>${esc(f(row, "PrimaryPosition"))}</td>
          <td>${num(row, "IsStarter") === 1 ? esc(f(row, "Position")) : `控え/${esc(f(row, "Position"))}`}</td>
          <td class="num">${esc(f(row, "Minutes", "-"))}</td>
          <td>${substitutionLabel(row, rows)}</td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="muted">メンバーは試合後に記録されます。</td></tr>`}</tbody>
    </table>
  `;
}

function substitutionLabel(row, rows) {
  const minuteOn = f(row, "MinuteOn", "");
  const minuteOff = f(row, "MinuteOff", "");
  if (num(row, "IsStarter") === 1) {
    const off = Number(minuteOff || 90);
    return off > 0 && off < 90 ? `<span class="sub-out">${off}分 OUT</span>` : "";
  }

  if (minuteOn === "" || minuteOn === null) {
    return `<span class="muted">ベンチ</span>`;
  }

  const outPlayers = rows
    .filter((candidate) => num(candidate, "IsStarter") === 1 && Number(f(candidate, "MinuteOff", 90)) === Number(minuteOn))
    .sort((a, b) => {
      const posMatchA = f(a, "Position") === f(row, "Position") ? 0 : 1;
      const posMatchB = f(b, "Position") === f(row, "Position") ? 0 : 1;
      return posMatchA - posMatchB || positionOrder(f(a, "Position")) - positionOrder(f(b, "Position"));
    });
  const replaced = outPlayers[0];
  return replaced
    ? `<span class="sub-in">${esc(minuteOn)}分 IN</span> <span class="muted">← ${esc(f(replaced, "PlayerName"))}</span>`
    : `<span class="sub-in">${esc(minuteOn)}分 IN</span>`;
}

function lineupGroup(row) {
  if (num(row, "IsStarter") === 1) return 1;
  if (f(row, "MinuteOn", "") !== "" || num(row, "Minutes") > 0) return 2;
  return 3;
}

function positionOrder(position) {
  return {
    GK: 1, CB: 2, RB: 3, LB: 4, RWB: 5, LWB: 6, DM: 7, CM: 7,
    AM: 8, RM: 9, RW: 9, LM: 10, LW: 10, SS: 12, ST: 12, CF: 11
  }[position] || 99;
}

function renderPitch(rows, title, options = {}) {
  const formation = String(options.formation || "");
  const isTeamPitch = options.variant === "team";
  const starters = rows
    .filter((row) => num(row, "IsStarter") === 1)
    .map((row) => ({ row, lane: positionLane(f(row, "Position")) }))
    .sort((a, b) => b.lane.y - a.lane.y || a.lane.preferredX - b.lane.preferredX);
  const grouped = starters.reduce((map, item) => {
    const key = String(item.lane.y);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());

  const placed = [];
  grouped.forEach((items) => {
    items.sort((a, b) => a.lane.preferredX - b.lane.preferredX);
    const xs = rowPositions(items, { variant: options.variant });
    items.forEach((item, index) => {
      const x = xs[index];
      const pos = f(item.row, "Position");
      const y = isTeamPitch && formation === "3-5-2" && items.length >= 5 && (pos === "LWB" || pos === "RWB")
        ? item.lane.y - 17
        : item.lane.y;
      placed.push({ row: item.row, x: Math.max(8, Math.min(92, x)), y });
    });
  });

  const renderBenchDot = (row, index) => {
    const playerId = num(row, `Bench${index}PlayerId`);
    if (!playerId) return "";
    const name = f(row, `Bench${index}PlayerName`);
    const shirtNumber = f(row, `Bench${index}ShirtNumber`, "");
    const shirtBadge = shirtNumber === "" || Number(shirtNumber) <= 0 ? "" : `<span class="bench-shirt">${esc(shirtNumber)}</span>`;
    const rating = Number(f(row, `Bench${index}AvgRating`, 0));
    const ratingText = rating > 0 ? `<span class="bench-rating">${rating.toFixed(2)}</span>` : "";
    const newChip = num(row, `Bench${index}IsNewArrival`) === 1 ? `<span class="bench-new">N</span>` : "";
    return `<button class="bench-dot bench-dot-${index}" data-player="${playerId}" type="button">
      <span class="bench-head">${shirtBadge}${newChip}</span>
      <span class="bench-player">${esc(name)}</span>
      ${ratingText}
    </button>`;
  };

  const clusters = placed.map(({ row, x, y }) => {
    const pos = f(row, "Position");
    const shirtNumber = f(row, "ShirtNumber", "");
    const shirtBadge = shirtNumber === "" || Number(shirtNumber) <= 0 ? "" : `<span class="shirt-number">${esc(shirtNumber)}</span>`;
    const newArrivalChip = num(row, "IsNewArrival") === 1 ? `<span class="new-arrival-chip">N</span>` : "";
    const teamShort = f(row, "TeamShort", "");
    const teamLine = teamShort === "" ? "" : `<span class="team-name">${esc(teamShort)}</span>`;
    const rating = Number(f(row, "AvgRating", 0));
    const ratingLine = rating > 0 ? `<span class="rating">${rating.toFixed(2)}</span>` : "";
    const mvpClass = num(row, "IsMvp") === 1 ? " mvp" : "";
    const clusterY = y > 84 ? y - 2 : y < 24 ? y + 2 : y;
    return `<div class="lineup-cluster" style="left:${x}%; top:${clusterY}%;">
      <button class="player-dot${mvpClass}" data-player="${num(row, "PlayerId")}" type="button">
        <span class="pos">${shirtBadge}${esc(pos)}</span>
        <span class="pname">${esc(f(row, "PlayerName"))}</span>
        ${newArrivalChip}
        ${teamLine}
        ${ratingLine}
      </button>
      ${renderBenchDot(row, 1)}
      ${renderBenchDot(row, 2)}
    </div>`;
  }).join("");
  return `<div><div class="panel-head" style="border:0;padding-left:0;">${esc(title)}</div><div class="pitch">${clusters}</div></div>`;
}

function rowPositions(items, options = {}) {
  const assigned = new Map();
  const left = items.filter((item) => item.lane.preferredX <= 22);
  const right = items.filter((item) => item.lane.preferredX >= 78);
  const center = items.filter((item) => item.lane.preferredX > 22 && item.lane.preferredX < 78);

  spread(left, left.length > 1 ? [9, 18] : [12]).forEach((x, index) => assigned.set(left[index], x));
  spread(center, centerSlots(center.length, options)).forEach((x, index) => assigned.set(center[index], x));
  spread(right, right.length > 1 ? [82, 91] : [88]).forEach((x, index) => assigned.set(right[index], x));

  return items.map((item) => assigned.get(item) ?? item.lane.preferredX);
}

function spread(items, slots) {
  if (items.length === 0) return [];
  if (items.length === 1) return [slots[Math.floor(slots.length / 2)] ?? 50];
  if (slots.length >= items.length) return slots.slice(0, items.length);
  const first = slots[0] ?? 30;
  const last = slots[slots.length - 1] ?? 70;
  return items.map((_, index) => first + ((last - first) * index / (items.length - 1)));
}

function centerSlots(count, options = {}) {
  if (count <= 0) return [];
  if (count === 1) return [50];
  if (count === 2) return [36, 64];
  if (count === 3) return [24, 50, 76];
  if (count === 4) return [18, 39, 61, 82];
  if (options.variant === "team") return [10, 30, 50, 70, 90];
  return [14, 32, 50, 68, 86];
}

function positionLane(position) {
  return {
    GK: { preferredX: 50, y: 91 },
    RB: { preferredX: 84, y: 73 }, CB: { preferredX: 50, y: 73 }, LB: { preferredX: 16, y: 73 },
    RWB: { preferredX: 86, y: 55 }, LWB: { preferredX: 14, y: 55 }, DM: { preferredX: 50, y: 55 }, CM: { preferredX: 50, y: 55 },
    RM: { preferredX: 92, y: 37 }, AM: { preferredX: 50, y: 37 }, LM: { preferredX: 8, y: 37 }, RW: { preferredX: 92, y: 37 }, LW: { preferredX: 8, y: 37 },
    SS: { preferredX: 58, y: 19 }, CF: { preferredX: 50, y: 19 }, ST: { preferredX: 58, y: 19 }
  }[position] || { preferredX: 50, y: 48 };
}

function teamMatchResult(row, focusTeamId) {
  const teamId = Number(focusTeamId || 0);
  const homeId = num(row, "HomeTeamId");
  const awayId = num(row, "AwayTeamId");
  const isHome = teamId === homeId;
  const isAway = teamId === awayId;
  if (!teamId || (!isHome && !isAway)) return null;

  const played = num(row, "Played") === 1;
  const homeGoals = num(row, "HomeGoals");
  const awayGoals = num(row, "AwayGoals");
  const goalsFor = isHome ? homeGoals : awayGoals;
  const goalsAgainst = isHome ? awayGoals : homeGoals;
  const opponentId = isHome ? awayId : homeId;
  const opponentName = isHome ? f(row, "AwayTeam") : f(row, "HomeTeam");
  const opponentShort = isHome ? f(row, "AwayShort", opponentName) : f(row, "HomeShort", opponentName);
  const opponentColor = isHome ? f(row, "AwayColor") : f(row, "HomeColor");
  const winnerTeamId = num(row, "WinnerTeamId");
  let outcome = "upcoming";
  let label = "-";

  if (played) {
    if (winnerTeamId) {
      outcome = winnerTeamId === teamId ? "win" : "loss";
    } else if (goalsFor > goalsAgainst) {
      outcome = "win";
    } else if (goalsFor < goalsAgainst) {
      outcome = "loss";
    } else {
      outcome = "draw";
    }
    label = outcome === "win" ? "W" : outcome === "loss" ? "L" : "D";
  }

  return {
    venue: isHome ? "H" : "A",
    opponentId,
    opponentName,
    opponentShort,
    opponentColor,
    played,
    outcome,
    label,
    score: matchScoreText(row, { focusTeamId: teamId })
  };
}

function renderMatchTable(rows, allowLinks, focusTeamId = null, seasonId = null, options = {}) {
  const masked = options.masked === undefined ? isResultMasked() : Boolean(options.masked);
  const teamView = focusTeamId !== null && focusTeamId !== undefined;
  if (teamView) {
    return `
      <table class="team-fixtures">
        <thead><tr><th>Comp</th><th class="num">Round</th><th>H/A</th><th>Opponent</th><th class="num">W/D/L</th><th class="num">Score</th></tr></thead>
        <tbody>${rows.map((row) => {
          const result = teamMatchResult(row, focusTeamId);
          if (!result) return "";
          const id = num(row, "Id");
          const scoreHtml = masked && result.played ? (allowLinks ? maskedMatchLink(id) : maskedValue(result.score, true)) : (allowLinks ? matchLink(id, result.score) : esc(result.score));
          const labelHtml = masked && result.played ? maskedValue(result.label, true) : esc(result.label);
          const outcomeClass = masked && result.played ? "masked" : result.outcome;
          return `<tr class="team-match-row result-${outcomeClass}">
            <td>${esc(competitionLabel(row))}</td>
            <td class="num">${esc(matchRoundLabel(row))}</td>
            <td><span class="venue-badge venue-${result.venue.toLowerCase()}">${result.venue}</span></td>
            <td class="team-match-opponent">${teamCell(result.opponentId, result.opponentName, result.opponentColor, result.opponentShort, seasonId)}</td>
            <td class="num"><span class="result-badge result-${outcomeClass}">${labelHtml}</span></td>
            <td class="num team-score">${scoreHtml}</td>
          </tr>`;
        }).join("") || `<tr><td colspan="6" class="muted">対象の試合はありません。</td></tr>`}</tbody>
      </table>
    `;
  }

  return `
    <table>
      <thead><tr><th>大会</th><th class="num">節</th><th>ホーム</th><th class="num">結果</th><th>アウェイ</th></tr></thead>
      <tbody>${rows.map((row) => {
        const played = num(row, "Played") === 1;
        const score = matchScoreText(row);
        const id = num(row, "Id");
        const teamsMasked = typeof options.maskTeamsPredicate === "function"
          ? Boolean(options.maskTeamsPredicate(row))
          : Boolean(options.maskTeams);
        const homeCell = teamsMasked ? maskedTeamCell() : teamCell(num(row, "HomeTeamId"), f(row, "HomeTeam"), f(row, "HomeColor"), f(row, "HomeShort", f(row, "HomeTeam")), seasonId);
        const awayCell = teamsMasked ? maskedTeamCell() : teamCell(num(row, "AwayTeamId"), f(row, "AwayTeam"), f(row, "AwayColor"), f(row, "AwayShort", f(row, "AwayTeam")), seasonId);
        const scoreHtml = masked && played ? (allowLinks ? maskedMatchLink(id) : maskedValue(score, true)) : (allowLinks ? matchLink(id, score) : esc(score));
        return `<tr>
          <td>${esc(competitionLabel(row))}</td>
          <td class="num">${esc(matchRoundLabel(row))}</td>
          <td>${homeCell}</td>
          <td class="num score">${scoreHtml}</td>
          <td>${awayCell}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="muted">対象の試合はありません。</td></tr>`}</tbody>
    </table>
  `;
}

async function renderCompetition(competitionCode = "Emperor", seasonId = null, round = null, mode = "cup") {
  const isContinental = mode === "continental";
  const isNational = mode === "national";
  const action = isNational ? "getNationalCompetition" : isContinental ? "getContinentalCompetition" : "getCup";
  const routeName = isNational ? "national" : isContinental ? "continental" : "cup";
  const navSelector = isNational ? "data-national" : isContinental ? "data-continental" : "data-cup";
  const favoriteType = isNational ? "national" : isContinental ? "continental" : "cup";
  const data = await api(action, { competitionCode, seasonId });
  const season = data.season;
  const cup = data.cup || {};
  const code = f(cup, "code", competitionCode);
  const label = f(cup, "label", "カップ戦");
  const favoriteActive = isFavorite(favoriteType, code);
  const masked = isResultMasked();
  document.querySelector(`[${navSelector}="${code}"]`)?.classList.add("active");
  const fixtures = data.fixtures || [];
  const participantCount = num(data, "participantCount", (data.teams || []).length);
  const rounds = [...new Map(fixtures.map((row) => [num(row, "CompetitionRound"), f(row, "StageName", `第${f(row, "CompetitionRound")}戦`)])).entries()]
    .sort((a, b) => a[0] - b[0]);
  const firstUnplayedRound = fixtures.find((row) => num(row, "Played") === 0);
  const defaultRound = firstUnplayedRound ? num(firstUnplayedRound, "CompetitionRound") : (rounds.length ? rounds[rounds.length - 1][0] : 1);
  const selectedRound = rounds.some(([value]) => value === Number(round)) ? Number(round) : defaultRound;
  const roundFixtures = fixtures.filter((row) => num(row, "CompetitionRound") === selectedRound);
  const roundTabs = rounds.map(([value, label]) => `<button class="inline-button season-tab${value === selectedRound ? " active" : ""}" data-cup-round="${value}">${esc(label)}</button>`).join("");
  setHeader(`${esc(label)}`, `${season.year}シーズン`);
  const seasonOptions = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    return `<option value="${id}" ${id === season.id ? "selected" : ""}>${esc(f(row, "Year"))}シーズン</option>`;
  }).join("");

  setContent(`
    <div class="tabs">
      <select id="cupSeasonSelect">${seasonOptions}</select>
      <span class="pill">参加${isNational ? "代表" : "クラブ"} ${participantCount}</span>
      <span class="pill">試合数 ${fixtures.length}</span>
      <span class="pill">未消化 ${fixtures.filter((row) => num(row, "Played") === 0).length}</span>
      <button class="inline-button favorite-toggle${favoriteActive ? " active" : ""}" data-favorite-toggle="${favoriteType}">${favoriteActive ? "★ お気に入り解除" : "☆ お気に入り"}</button>
      ${renderResultMaskToggle(masked)}
      ${detailStatsRouteButton({ source: routeName, competitionCode: code, mode, seasonId: season.id })}
    </div>
    <div class="panel">
      <div class="panel-head">日程・結果</div>
      <div class="panel-body"><div class="tabs round-tabs">${roundTabs}</div></div>
      <div class="table-wrap">${renderMatchTable(roundFixtures, true, null, season.id, {
        masked,
        maskTeamsPredicate: (row) => masked && !shouldShowCupFixtureTeams(row)
      })}</div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">参加${isNational ? "代表" : "クラブ"}</div>
      <div class="panel-body">
        <div class="ranking-grid">
          <div>${renderScorerTable(data.topScorers || [])}</div>
          <div>${renderAssistTable(data.topAssists || [])}</div>
          <div>${renderRatingTable(data.topRatings || [])}</div>
        </div>
      </div>
    </div>
  `);

  const cupPanels = [...content.querySelectorAll(".panel")];
  const cupRankingPanel = cupPanels[cupPanels.length - 1];
  if (cupRankingPanel) {
    const cupBestEleven = masked ? `<div class="panel" style="margin-top:12px;"><div class="panel-head">シーズンベストイレブン</div>${maskedPanel("マスキング中")}</div>` : renderBestElevenPanel(data.bestEleven);
    if (cupBestEleven) {
      cupRankingPanel.insertAdjacentHTML("beforebegin", cupBestEleven);
    }
    cupRankingPanel.innerHTML = `
      <div class="panel-head">カップ戦統一ランキング</div>
      <div class="panel-body">
        ${masked ? maskedPanel("マスキング中") : `<div class="ranking-grid">
          <div>${renderScorerTable(data.topScorers || [])}</div>
          <div>${renderAssistTable(data.topAssists || [])}</div>
          <div>${renderRatingTable(data.topRatings || [])}</div>
        </div>`}
      </div>
    `;
  }

  document.querySelector("#cupSeasonSelect")?.addEventListener("change", (event) => {
    replaceRoute(routeName, { competitionCode: code, seasonId: Number(event.target.value) });
  });
  document.querySelectorAll("[data-cup-round]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute(routeName, { competitionCode: code, seasonId: season.id, round: Number(button.dataset.cupRound) });
    });
  });
  document.querySelector(`[data-favorite-toggle="${favoriteType}"]`)?.addEventListener("click", (event) => {
    const active = toggleFavorite(favoriteType, {
      id: code,
      name: label
    });
    event.currentTarget.classList.toggle("active", active);
    event.currentTarget.textContent = active ? "★ お気に入り解除" : "☆ お気に入り";
  });
}

async function renderCup(competitionCode = "Emperor", seasonId = null, round = null) {
  await renderCompetition(competitionCode, seasonId, round, "cup");
}

async function renderContinentalCompetition(competitionCode = "ACL", seasonId = null, round = null) {
  await renderCompetition(competitionCode, seasonId, round, "continental");
}

async function renderNationalCompetition(competitionCode = "AsiaCup", seasonId = null, round = null) {
  await renderCompetition(competitionCode, seasonId, round, "national");
}

async function renderDetailStatsPage(params = {}) {
  const source = params.source || "league";
  const isLeague = source === "league";
  const mode = params.mode || source;
  const detailMinimumMinutes = normalizeDetailMinimumMinutes(currentRoute?.state?.detailMinimumMinutes || params.detailMinimumMinutes);
  const action = isLeague
    ? "getLeague"
    : mode === "national"
      ? "getNationalCompetition"
      : mode === "continental"
        ? "getContinentalCompetition"
        : "getCup";
  const payload = isLeague
    ? { leagueId: Number(params.leagueId), seasonId: params.seasonId, detailMinimumMinutes }
    : { competitionCode: params.competitionCode, seasonId: params.seasonId, detailMinimumMinutes };
  const data = await api(action, payload);
  const season = data.season || {};
  const title = isLeague ? f(data.league, "Name", "League") : f(data.cup, "label", params.competitionCode || "Competition");
  const minimumMinutesLabel = `${detailMinimumMinutes}min+`;
  setHeader(`${esc(title)} Detail Stats`, `${f(season, "Year")}シーズン`);
  const seasonOptions = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    return `<option value="${id}" ${id === num(season, "Id") ? "selected" : ""}>${esc(f(row, "Year"))}シーズン</option>`;
  }).join("");

  setContent(`
    <div class="tabs">
      <select id="detailStatsSeasonSelect">${seasonOptions}</select>
      <span class="pill">${esc(minimumMinutesLabel)}</span>
    </div>
    <div class="panel">
      <div class="panel-head">Detail Stats Ranking</div>
      <div class="panel-body">${renderDetailStatsContent(data.detailStatRankings || {}, data.detailStatRows || [], minimumMinutesLabel, detailMinimumMinutes)}</div>
    </div>
  `);

  document.querySelector("#detailStatsSeasonSelect")?.addEventListener("change", (event) => {
    const nextParams = { ...params, seasonId: Number(event.target.value) };
    replaceRoute("detailStats", nextParams, currentRoute?.state || {});
  });
}

function renderCupTeamList(rows) {
  return `
    <table>
      <thead><tr><th>クラブ</th><th>所属</th><th>略称</th><th class="num">戦力</th><th>状況</th></tr></thead>
      <tbody>${rows.map((row) => {
        const eliminatedRound = f(row, "EliminatedRound", "");
        const status = eliminatedRound === "" ? "勝ち残り" : `敗退: ${eliminatedRound}回戦`;
        return `<tr>
          <td>${teamCell(num(row, "Id"), f(row, "Name"), f(row, "PrimaryColor"), f(row, "Name"))}</td>
          <td>${esc(f(row, "LeagueCode"))}</td>
          <td>${esc(f(row, "ShortName"))}</td>
          <td class="num">${esc(f(row, "Rating"))}</td>
          <td>${esc(status)}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="muted">参加クラブはありません。</td></tr>`}</tbody>
    </table>
  `;
}

async function renderArchive() {
  const data = await api("getSeasonArchive");
  setHeader("シーズン履歴", "過去シーズンの優勝クラブ");
  setContent(`
    <div class="panel reset-panel">
      <div class="panel-head">データ管理</div>
      <div class="panel-body">
        <button id="fullResetButton" class="danger-button">フルリセット</button>
        <span class="muted">全データを削除し、2026年の初期状態を再生成します。</span>
      </div>
    </div>
    <div class="grid-2">
      ${(data.seasons || []).map((item) => {
        const season = item.season;
        return `<div class="panel">
          <div class="panel-head">${esc(f(season, "Year"))}シーズン ${num(season, "IsCurrent") === 1 ? "（進行中）" : ""}</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>リーグ</th><th>優勝</th><th class="num">勝点</th></tr></thead>
              <tbody>${(item.champions || []).map((row) => `<tr><td>${esc(row.league)}</td><td>${row.champion ? teamCell(row.champion.teamId, row.champion.teamName, row.champion.color, row.champion.shortName) : "-"}</td><td class="num">${row.champion ? row.champion.points : "-"}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>`;
      }).join("")}
    </div>
  `);

  document.querySelector("#fullResetButton")?.addEventListener("click", fullReset);
}

async function renderAnnualAwardsPage(scopeCode = "World", seasonId = null) {
  const data = await api("getAnnualAwards", { scopeCode, seasonId });
  const season = data.season;
  const award = data.award || {};
  const code = f(award, "scopeCode", scopeCode || "World");
  document.querySelector(`[data-awards="${code}"]`)?.classList.add("active");
  setHeader(`${esc(f(award, "scopeName", regionLabel(code)))} 年間表彰`, `${season.year}シーズン`);
  const seasonTabs = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    const selected = id === season.id ? " active" : "";
    return `<button class="inline-button season-tab${selected}" data-award-season="${id}">${esc(f(row, "Year"))}</button>`;
  }).join("");
  setContent(`
    <div class="tabs">${seasonTabs}</div>
    ${renderAnnualAwards([award]) || `<div class="panel"><div class="panel-body muted">このシーズンの表彰はまだ確定していません。</div></div>`}
  `);
  document.querySelectorAll("[data-award-season]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("awards", { scopeCode: code, seasonId: Number(button.dataset.awardSeason) });
    });
  });
}

function renderAnnualAwards(awards) {
  const visibleAwards = (awards || []).filter((award) => award?.playerOfYear || (award?.bestEleven || []).length > 0);
  if (visibleAwards.length === 0) {
    return "";
  }
  return `
    <div class="award-list">
      <div class="mini-head">年次表彰</div>
      ${visibleAwards.map((award) => `
        <div class="award-block">
          <div class="award-title">${esc(f(award, "scopeName"))}</div>
          <div class="award-player">
            <span class="muted">${esc(f(award, "playerAwardName"))}</span>
            ${award.playerOfYear ? playerLink(num(award.playerOfYear, "PlayerId"), f(award.playerOfYear, "PlayerName")) : "-"}
            ${award.playerOfYear ? `<span class="muted">${esc(f(award.playerOfYear, "TeamShort"))} / ${Number(f(award.playerOfYear, "AvgRating", 0)).toFixed(2)}</span>` : ""}
          </div>
          <div class="award-xi">${renderAnnualBestEleven(award.bestEleven || [], award.playerOfYear)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAnnualBestEleven(rows, playerOfYear = null) {
  if (!rows || rows.length === 0) {
    return "";
  }
  const mvpPlayerId = playerOfYear ? num(playerOfYear, "PlayerId") : 0;
  const pitchRows = rows.map((row) => ({
    ...row,
    IsStarter: 1,
    IsMvp: mvpPlayerId > 0 && num(row, "PlayerId") === mvpPlayerId ? 1 : 0,
    ShirtNumber: f(row, "ShirtNumber", "")
  }));
  return `
    <div class="pitch-grid single award-pitch-grid">
      ${renderPitch(pitchRows, "ベストイレブン")}
    </div>
  `;
}

async function renderTransferArchive(seasonId = null) {
  const data = await api("getTransfers", { seasonId });
  const season = data.season;
  const routeState = currentRoute?.name === "transfers"
    ? currentRoute.state || {}
    : {};
  const transferSortKey = routeState.transferSortKey || "id";
  const transferSortDir = routeState.transferSortDir || "desc";
  const transferPage = Math.max(1, Number(routeState.transferPage || 1));
  const transferCountry = routeState.transferCountry || "";
  const transferRegion = routeState.transferRegion || "";
  const transferRows = data.transfers || [];
  const filteredTransferRows = filterTransferRows(transferRows, transferCountry, transferRegion);
  document.querySelector('[data-route="transfers"]')?.classList.add("active");
  setHeader("移籍履歴", `${season.year}シーズン`);
  const seasonTabs = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    const selected = id === season.id ? " active" : "";
    return `<button class="inline-button season-tab${selected}" data-transfer-season="${id}">${esc(f(row, "Year"))}</button>`;
  }).join("");

  setContent(`
    <div class="tabs">${seasonTabs}</div>
    <div class="panel">
      <div class="panel-head">移籍履歴一覧</div>
      ${renderTransferArchiveFilters(transferRows, transferCountry, transferRegion)}
      <div id="transferArchivePager">${renderTransferPager(filteredTransferRows, transferPage)}</div>
      <div class="table-wrap" id="transferArchiveSheet">${renderTransferArchiveTable(filteredTransferRows, transferSortKey, transferSortDir, transferPage)}</div>
    </div>
  `);

  document.querySelectorAll("[data-transfer-season]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("transfers", { seasonId: Number(button.dataset.transferSeason) });
    });
  });
  wireTransferArchiveSorting(filteredTransferRows, transferSortKey, transferSortDir, transferPage);
  wireTransferArchivePaging(filteredTransferRows);
  wireTransferArchiveFilters(transferRows);
}

function renderTransferArchiveFilters(rows, selectedCountry = "", selectedRegion = "") {
  const countries = [...new Set(rows.flatMap((row) => [f(row, "FromCountryCode", ""), f(row, "ToCountryCode", "")]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ja"));
  const regions = [...new Set(rows.flatMap((row) => [normalizeNavRegion(f(row, "FromRegion", "")), normalizeNavRegion(f(row, "ToRegion", ""))]).filter(Boolean))]
    .sort((a, b) => regionLabel(a).localeCompare(regionLabel(b), "ja"));
  return `
    <div class="toolbar-row" style="margin:8px 0;">
      <label class="filter-control">国
        <select data-transfer-filter="country">
          <option value="">すべて</option>
          ${countries.map((country) => `<option value="${esc(country)}"${country === selectedCountry ? " selected" : ""}>${esc(country)}</option>`).join("")}
        </select>
      </label>
      <label class="filter-control">地域
        <select data-transfer-filter="region">
          <option value="">すべて</option>
          ${regions.map((region) => `<option value="${esc(region)}"${region === selectedRegion ? " selected" : ""}>${esc(regionLabel(region))}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function filterTransferRows(rows, country = "", region = "") {
  return rows.filter((row) => {
    const fromCountry = f(row, "FromCountryCode", "");
    const toCountry = f(row, "ToCountryCode", "");
    const fromRegion = normalizeNavRegion(f(row, "FromRegion", ""));
    const toRegion = normalizeNavRegion(f(row, "ToRegion", ""));
    const countryMatches = !country || fromCountry === country || toCountry === country;
    const regionMatches = !region || fromRegion === region || toRegion === region;
    return countryMatches && regionMatches;
  });
}

function renderTransferArchiveTable(rows) {
  return `
    <table>
      <thead><tr><th>種別</th><th>選手</th><th>Pos</th><th>移籍元</th><th>移籍先</th><th>メモ</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${esc(f(row, "Type"))}</td>
          <td>${playerLink(num(row, "PlayerId"), f(row, "PlayerName"))}</td>
          <td>${esc(f(row, "PrimaryPosition"))}</td>
          <td>${num(row, "FromTeamId") ? teamCell(num(row, "FromTeamId"), f(row, "FromTeam"), "#78909c", f(row, "FromTeam")) : "-"}</td>
          <td>${num(row, "ToTeamId") ? teamCell(num(row, "ToTeamId"), f(row, "ToTeam"), "#78909c", f(row, "ToTeam")) : "-"}</td>
          <td>${esc(f(row, "Note"))}</td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="muted">このシーズンの移籍履歴はまだありません。</td></tr>`}</tbody>
    </table>
  `;
}

function formatFee(value) {
  const fee = Number(value || 0);
  return fee !== 0 ? `${fee.toLocaleString("ja-JP")}万円` : "-";
}

function renderTransfersWithFee(rows, emptyText = "このシーズンの移籍履歴はまだありません。") {
  return `
    <table>
      <thead><tr><th>種別</th><th>選手</th><th>移籍元</th><th>移籍先</th><th class="num">移籍金</th><th>国内/越境</th><th>経路</th><th>メモ</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${esc(f(row, "Type"))}</td><td>${num(row, "PlayerId") ? playerLink(num(row, "PlayerId"), f(row, "PlayerName")) : esc(f(row, "PlayerName"))}</td><td>${transferTeamLink(row, "FromTeamId", "FromTeam")}</td><td>${transferTeamLink(row, "ToTeamId", "ToTeam")}</td><td class="num">${formatFee(f(row, "Fee", 0))}</td><td>${esc(f(row, "TransferScope", "-") || "-")}</td><td>${esc(f(row, "MarketRoute", "-"))}</td><td>${esc(f(row, "Note"))}</td></tr>
      `).join("") || `<tr><td colspan="8" class="muted">${esc(emptyText)}</td></tr>`}</tbody>
    </table>
  `;
}

function renderTeamTransfersTable(rows, sortKey = "id", sortDir = "desc", tableKey = "in", emptyText = "このシーズンの移籍履歴はまだありません。") {
  const sortedRows = sortTransferRows(rows, sortKey, sortDir);
  return `
    <table class="sheet-table transfer-sheet" data-team-transfer-table="${esc(tableKey)}" data-sort-key="${esc(sortKey)}" data-sort-dir="${esc(sortDir)}">
      <thead><tr>
        ${transferSortHeader("type", "種別", sortKey, sortDir)}
        ${transferSortHeader("player", "選手", sortKey, sortDir)}
        ${transferSortHeader("from", "移籍元", sortKey, sortDir)}
        ${transferSortHeader("to", "移籍先", sortKey, sortDir)}
        ${transferSortHeader("fee", "移籍金", sortKey, sortDir, true)}
        ${transferSortHeader("scope", "国内/越境", sortKey, sortDir)}
        ${transferSortHeader("route", "経路", sortKey, sortDir)}
        ${transferSortHeader("note", "メモ", sortKey, sortDir)}
      </tr></thead>
      <tbody>${sortedRows.map((row) => `
        <tr><td>${esc(f(row, "Type"))}</td><td>${num(row, "PlayerId") ? playerLink(num(row, "PlayerId"), f(row, "PlayerName")) : esc(f(row, "PlayerName"))}</td><td>${transferTeamLink(row, "FromTeamId", "FromTeam")}</td><td>${transferTeamLink(row, "ToTeamId", "ToTeam")}</td><td class="num">${formatFee(f(row, "Fee", 0))}</td><td>${esc(f(row, "TransferScope", "-") || "-")}</td><td>${esc(f(row, "MarketRoute", "-"))}</td><td>${esc(f(row, "Note"))}</td></tr>
      `).join("") || `<tr><td colspan="8" class="muted">${esc(emptyText)}</td></tr>`}</tbody>
    </table>
  `;
}

function wireTeamTransferSorting(containerId, rows, initialSortKey = "id", initialSortDir = "desc", tableKey = "in") {
  let sortKey = initialSortKey;
  let sortDir = initialSortDir;
  const container = document.querySelector(`#${containerId}`);
  const stateKeyPrefix = tableKey === "out" ? "transferOut" : "transferIn";
  const bind = () => {
    container?.querySelectorAll("[data-transfer-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextKey = button.dataset.transferSort || "id";
        sortDir = sortKey === nextKey ? (sortDir === "desc" ? "asc" : "desc") : "desc";
        sortKey = nextKey;
        if (currentRoute?.name === "team") {
          currentRoute.state = currentRoute.state || {};
          currentRoute.state[`${stateKeyPrefix}SortKey`] = sortKey;
          currentRoute.state[`${stateKeyPrefix}SortDir`] = sortDir;
        }
        if (container) {
          container.innerHTML = renderTeamTransfersTable(rows, sortKey, sortDir, tableKey);
          bind();
        }
      });
    });
  };
  bind();
}

function transferTeamLink(row, idKey, nameKey) {
  const teamId = num(row, idKey);
  const name = f(row, nameKey, "-");
  return teamId ? teamCell(teamId, name, "#78909c", name) : esc(name || "-");
}

function renderAssistTable(rows) {
  return `
    <table>
      <thead><tr><th colspan="5">アシストランキング</th></tr><tr><th>選手</th><th>所属</th><th>Pos</th><th class="num">A</th><th class="num">G</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${playerLink(num(row, "Id"), f(row, "Name"))}</td><td>${esc(f(row, "Team"))}</td><td>${esc(f(row, "PrimaryPosition"))}</td><td class="num">${f(row, "Assists")}</td><td class="num">${f(row, "Goals")}</td></tr>
      `).join("") || `<tr><td colspan="5" class="muted">まだアシスト記録がありません。</td></tr>`}</tbody>
    </table>
  `;
}

function renderPlayerAchievements(rows) {
  const scrollClass = rows.length >= 5 ? " scroll" : "";
  return `
    <div class="achievement-list compact${scrollClass}">
      ${rows.map((row) => {
        const isNational = f(row, "Scope") === "National" || f(row, "CompetitionGroup") === "National";
        return `
        <div class="achievement-item">
          <span class="achievement-title">${esc(f(row, "Label"))}${isNational ? `<span class="achievement-chip national-achievement-chip">代表</span>` : ""}</span>
          <span class="achievement-meta">${esc(f(row, "Detail"))}</span>
        </div>
      `;
      }).join("") || `<div class="muted">表彰歴はまだありません。</div>`}
    </div>
  `;
}

function renderPlayerAchievementsLoading() {
  return `
    <div class="achievement-list compact" id="playerAchievements">
      <div class="muted">表彰歴を読み込み中...</div>
    </div>
  `;
}

async function loadPlayerAchievements(playerId, token) {
  try {
    const data = await api("getPlayerAchievements", { playerId });
    if (token !== currentRoute) return;
    const container = document.querySelector("#playerAchievements");
    if (!container) return;
    container.outerHTML = renderPlayerAchievements(data.achievements || []);
  } catch (error) {
    if (token !== currentRoute) return;
    const container = document.querySelector("#playerAchievements");
    if (container) {
      container.innerHTML = `<div class="muted">表彰歴を読み込めませんでした。</div>`;
    }
  }
}

renderLeague = async function renderLeagueV2(leagueId, seasonId = null, round = null) {
  const data = await api("getLeague", { leagueId, seasonId });
  const league = data.league;
  const season = data.season;
  const favoriteActive = isFavorite("league", leagueId);
  const masked = isResultMasked();
  setHeader(`${esc(f(league, "Name"))}`, `${season.year}シーズン 第${season.currentRound}節`);
  markLeagueNav(leagueId);
  const fixtures = data.fixtures || [];
  const rounds = [...new Set(fixtures.map((row) => num(row, "Round")))].sort((a, b) => a - b);
  const maxRound = rounds.length ? Math.max(...rounds) : 1;
  const defaultRound = Math.min(Math.max(1, Number(season.currentRound || 1)), maxRound);
  const selectedRound = rounds.includes(Number(round)) ? Number(round) : defaultRound;
  const roundFixtures = fixtures.filter((row) => num(row, "Round") === selectedRound);
  const roundTabs = rounds.map((value) => `<button class="inline-button season-tab${value === selectedRound ? " active" : ""}" data-league-round="${value}">第${value}節</button>`).join("");
  const seasonOptions = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    return `<option value="${id}" ${id === season.id ? "selected" : ""}>${esc(f(row, "Year"))}シーズン</option>`;
  }).join("");

  setContent(`
    <div class="tabs">
      <select id="seasonSelect">${seasonOptions}</select>
      <span class="pill">クラブ数 ${(data.standings || []).length}</span>
      <span class="pill">試合数 ${fixtures.length}</span>
      <button class="inline-button favorite-toggle${favoriteActive ? " active" : ""}" data-favorite-toggle="league">${favoriteActive ? "★ お気に入り解除" : "☆ お気に入り"}</button>
      ${renderResultMaskToggle(masked)}
      ${detailStatsRouteButton({ source: "league", leagueId, seasonId: season.id })}
    </div>
    <div class="panel">
      <div class="panel-head">順位表</div>
      <div class="table-wrap">${renderStandings(data.standings || [], season.id, masked)}</div>
    </div>
    ${masked ? `<div class="panel" style="margin-top:12px;"><div class="panel-head">シーズンベストイレブン</div>${maskedPanel("マスキング中")}</div>` : renderBestElevenPanel(data.bestEleven)}
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">日程・結果</div>
      <div class="panel-body"><div class="tabs round-tabs">${roundTabs}</div></div>
      <div class="table-wrap">${renderMatchTable(roundFixtures, true, null, season.id, { masked })}</div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">ランキング</div>
      <div class="panel-body">
        ${masked ? maskedPanel("マスキング中") : `<div class="ranking-grid">
          <div class="table-wrap">${renderScorerTable(data.topScorers || [])}</div>
          <div class="table-wrap">${renderAssistTable(data.topAssists || [])}</div>
          <div class="table-wrap">${renderRatingTable(data.topRatings || [])}</div>
        </div>`}
      </div>
    </div>
  `);

  document.querySelector("#seasonSelect")?.addEventListener("change", (event) => {
    replaceRoute("league", { leagueId, seasonId: Number(event.target.value) });
  });
  document.querySelectorAll("[data-league-round]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("league", { leagueId, seasonId: season.id, round: Number(button.dataset.leagueRound) });
    });
  });
  document.querySelector('[data-favorite-toggle="league"]')?.addEventListener("click", (event) => {
    const active = toggleFavorite("league", {
      id: leagueId,
      name: f(league, "Name"),
      code: f(league, "Code")
    });
    event.currentTarget.classList.toggle("active", active);
    event.currentTarget.textContent = active ? "★ お気に入り解除" : "☆ お気に入り";
  });
};

renderPlayer = async function renderPlayerV2(playerId, seasonId = null, statsScope = "League") {
  const data = await api("getPlayer", { playerId, seasonId, statsScope });
  const routeToken = currentRoute;
  const player = data.player;
  const season = data.season;
  const scope = f(data, "statsScope", statsScope || "League");
  const isLightweight = !!f(data, "isLightweight", false);
  const mergedSeasonStats = mergeDetailSeasonStats(data.seasonStats || [], data.detailSeasonStats || []);
  const traitSeasonStats = applyCurrentPlayerAttributes(mergedSeasonStats, player);
  const resultMasked = isResultMasked();
  const latestSeasonYear = mergedSeasonStats.reduce((latest, row) => Math.max(latest, num(row, "Year")), 0);
  setHeader(f(player, "Name"), `${esc(f(player, "TeamName"))} / ${esc(f(player, "PrimaryPosition"))} / ${statsScopeLabel(scope)}`);
  const seasonTabs = (data.seasons || []).map((row) => {
    const id = num(row, "Id");
    const selected = id === season.id ? " active" : "";
    return `<button class="inline-button season-tab${selected}" data-player-season="${id}">${esc(f(row, "Year"))}</button>`;
  }).join("");

  setContent(`
    <div class="tabs">${renderResultMaskToggle(resultMasked)}</div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head">選手概要・表彰歴</div>
        <div class="panel-body">
          <div class="tabs">
            <span class="pill">年齢 ${esc(f(player, "Age"))}</span>
            <span class="pill">所属 ${teamCell(num(player, "DisplayTeamId"), f(player, "TeamName"), f(player, "PrimaryColor"), f(player, "TeamShort"), season.id, scope === "National" ? "National" : "")}</span>
            <span class="pill">主Pos ${esc(f(player, "PrimaryPosition"))}</span>
            <span class="pill">国籍 ${esc(f(player, "Nationality"))}</span>
            ${num(player, "IsForeign") === 1 ? `<span class="pill foreign-pill">外国人助っ人</span>` : ""}
            ${num(player, "HasNationalTeam") === 1 ? `<span class="pill national-pill">代表</span>` : ""}
            <span class="pill">疲労 ${conditionLabel(num(player, "Fatigue"))}</span>
          </div>
          ${resultMasked ? maskedPanel("表彰歴はマスキング中") : renderPlayerAchievementsLoading()}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">ポジション適性</div>
        <div class="panel-body">
          <div>${(data.fits || []).map((row) => `<span class="pill">${esc(f(row, "Position"))} ${esc(f(row, "Fit"))}</span>`).join(" ")}</div>
          ${renderPlayerTypeBadge(traitSeasonStats, f(player, "PrimaryPosition"))}
        </div>
      </div>
    </div>
    ${renderStatsScopeTabs(scope, "player")}
    <div class="grid-2" style="margin-top:12px;">
      <div class="panel">
        <div class="panel-head">シーズン成績 <span class="muted">${statsScopeLabel(scope)}</span></div>
        <div class="table-wrap">${renderPlayerSeasons(traitSeasonStats, scope, resultMasked && latestSeasonYear ? latestSeasonYear : null)}</div>
        <div class="table-wrap">${renderPlayerDetailSeasonStats(mergedSeasonStats, data.detailStatHighlights || [], resultMasked && latestSeasonYear ? latestSeasonYear : null)}</div>
      </div>
      <div class="panel">
        <div class="panel-head">試合別評価点 <span class="muted">${statsScopeLabel(scope)}</span></div>
        <div class="panel-body compact-tabs"><div class="tabs">${seasonTabs}</div></div>
        <div class="table-wrap">${renderPlayerRatings(data.matchRatings || [])}</div>
      </div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <div class="panel-head">所属履歴</div>
      <div class="table-wrap">${renderTransfers(data.transfers || [])}</div>
    </div>
  `);
  if (isLightweight) {
    const statsGrid = content.querySelector(".scope-tabs")?.nextElementSibling;
    statsGrid?.classList.remove("grid-2");
    statsGrid?.querySelectorAll(":scope > .panel")[1]?.remove();
  }

  document.querySelectorAll("[data-player-season]").forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("player", { playerId, seasonId: Number(button.dataset.playerSeason), statsScope: scope });
    });
  });
  document.querySelectorAll('[data-scope-target="player"]').forEach((button) => {
    button.addEventListener("click", () => {
      replaceRoute("player", { playerId, seasonId: season.id, statsScope: button.dataset.statsScope }, keepScrollState());
    });
  });
  if (!resultMasked) loadPlayerAchievements(playerId, routeToken);
};

const transferArchivePageSize = 300;

function renderTransferPager(rows, currentPage = 1) {
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / transferArchivePageSize));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = totalRows === 0 ? 0 : ((page - 1) * transferArchivePageSize) + 1;
  const end = Math.min(totalRows, page * transferArchivePageSize);
  if (totalPages <= 1) {
    return `<div class="muted">${totalRows.toLocaleString("ja-JP")}件</div>`;
  }

  return `
    <div class="tabs">
      <button class="inline-button season-tab" data-transfer-page="${Math.max(1, page - 1)}"${page <= 1 ? " disabled" : ""}>前へ</button>
      <span class="muted">${start.toLocaleString("ja-JP")}-${end.toLocaleString("ja-JP")} / ${totalRows.toLocaleString("ja-JP")}件</span>
      <button class="inline-button season-tab" data-transfer-page="${Math.min(totalPages, page + 1)}"${page >= totalPages ? " disabled" : ""}>次へ</button>
    </div>
  `;
}

function renderTransferArchiveTableWithFee(rows, sortKey = "id", sortDir = "desc", page = 1) {
  const sortedRows = sortTransferRows(rows, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / transferArchivePageSize));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const visibleRows = sortedRows.slice((currentPage - 1) * transferArchivePageSize, currentPage * transferArchivePageSize);
  return `
    <table class="sheet-table transfer-sheet" data-sort-key="${esc(sortKey)}" data-sort-dir="${esc(sortDir)}">
      <thead><tr>
        ${transferSortHeader("type", "種別", sortKey, sortDir)}
        ${transferSortHeader("player", "選手", sortKey, sortDir)}
        ${transferSortHeader("position", "Pos", sortKey, sortDir)}
        ${transferSortHeader("from", "移籍元", sortKey, sortDir)}
        ${transferSortHeader("to", "移籍先", sortKey, sortDir)}
        ${transferSortHeader("fee", "移籍金", sortKey, sortDir, true)}
        ${transferSortHeader("scope", "国内/越境", sortKey, sortDir)}
        ${transferSortHeader("route", "経路", sortKey, sortDir)}
        ${transferSortHeader("note", "メモ", sortKey, sortDir)}
      </tr></thead>
      <tbody>${visibleRows.map((row) => `
        <tr>
          <td>${esc(f(row, "Type"))}</td>
          <td>${playerLink(num(row, "PlayerId"), f(row, "PlayerName"))}</td>
          <td>${esc(f(row, "PrimaryPosition"))}</td>
          <td>${num(row, "FromTeamId") ? teamCell(num(row, "FromTeamId"), f(row, "FromTeam"), "#78909c", f(row, "FromTeam")) : "-"}</td>
          <td>${num(row, "ToTeamId") ? teamCell(num(row, "ToTeamId"), f(row, "ToTeam"), "#78909c", f(row, "ToTeam")) : "-"}</td>
          <td class="num">${formatFee(f(row, "Fee", 0))}</td>
          <td>${esc(f(row, "TransferScope", "-") || "-")}</td>
          <td>${esc(f(row, "MarketRoute", "-"))}</td>
          <td>${esc(f(row, "Note"))}</td>
        </tr>
      `).join("") || `<tr><td colspan="9" class="muted">このシーズンの移籍履歴はまだありません。</td></tr>`}</tbody>
    </table>
  `;
}

function transferSortHeader(key, label, currentKey, currentDir, numeric = false) {
  const active = key === currentKey;
  const marker = active ? (currentDir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="${numeric ? "num " : ""}sortable-head"><button class="sheet-sort" data-transfer-sort="${key}" type="button">${esc(label)}${marker}</button></th>`;
}

function sortTransferRows(rows, sortKey, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = transferSortValue(a, sortKey);
    const bv = transferSortValue(b, sortKey);
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv || num(a, "Id") - num(b, "Id")) * direction;
    }
    return (String(av).localeCompare(String(bv), "ja") || num(a, "Id") - num(b, "Id")) * direction;
  });
}

function transferSortValue(row, sortKey) {
  switch (sortKey) {
    case "type": return f(row, "Type");
    case "player": return f(row, "PlayerName");
    case "position": return f(row, "PrimaryPosition");
    case "from": return f(row, "FromTeam", "");
    case "to": return f(row, "ToTeam", "");
    case "fee": return num(row, "Fee");
    case "scope": return f(row, "TransferScope", "");
    case "route": return f(row, "MarketRoute", "");
    case "note": return f(row, "Note", "");
    case "id":
    default: return num(row, "Id");
  }
}

function wireTransferArchiveSorting(rows, initialSortKey = "id", initialSortDir = "desc", initialPage = 1) {
  let sortKey = initialSortKey;
  let sortDir = initialSortDir;
  let page = initialPage;
  const container = document.querySelector("#transferArchiveSheet");
  const bind = () => {
    container?.querySelectorAll("[data-transfer-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextKey = button.dataset.transferSort || "id";
        sortDir = sortKey === nextKey ? (sortDir === "desc" ? "asc" : "desc") : "desc";
        sortKey = nextKey;
        if (currentRoute?.name === "transfers") {
          currentRoute.state = currentRoute.state || {};
          currentRoute.state.transferSortKey = sortKey;
          currentRoute.state.transferSortDir = sortDir;
          currentRoute.state.transferPage = page;
        }
        if (container) {
          container.innerHTML = renderTransferArchiveTable(rows, sortKey, sortDir, page);
          bind();
        }
      });
    });
  };
  bind();
}

function wireTransferArchivePaging(rows) {
  document.querySelectorAll("[data-transfer-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = Math.max(1, Number(button.dataset.transferPage || 1));
      if (currentRoute?.name === "transfers") {
        currentRoute.state = currentRoute.state || {};
        currentRoute.state.transferPage = page;
      }
      const pager = document.querySelector("#transferArchivePager");
      const sheet = document.querySelector("#transferArchiveSheet");
      const sortKey = currentRoute?.state?.transferSortKey || "id";
      const sortDir = currentRoute?.state?.transferSortDir || "desc";
      if (pager) pager.innerHTML = renderTransferPager(rows, page);
      if (sheet) sheet.innerHTML = renderTransferArchiveTable(rows, sortKey, sortDir, page);
      wireTransferArchiveSorting(rows, sortKey, sortDir, page);
      wireTransferArchivePaging(rows);
    });
  });
}

function wireTransferArchiveFilters(allRows) {
  document.querySelectorAll("[data-transfer-filter]").forEach((control) => {
    control.addEventListener("change", () => {
      const country = document.querySelector('[data-transfer-filter="country"]')?.value || "";
      const region = document.querySelector('[data-transfer-filter="region"]')?.value || "";
      const filteredRows = filterTransferRows(allRows, country, region);
      const sortKey = currentRoute?.state?.transferSortKey || "id";
      const sortDir = currentRoute?.state?.transferSortDir || "desc";
      if (currentRoute?.name === "transfers") {
        currentRoute.state = currentRoute.state || {};
        currentRoute.state.transferCountry = country;
        currentRoute.state.transferRegion = region;
        currentRoute.state.transferPage = 1;
      }
      const pager = document.querySelector("#transferArchivePager");
      const sheet = document.querySelector("#transferArchiveSheet");
      if (pager) pager.innerHTML = renderTransferPager(filteredRows, 1);
      if (sheet) sheet.innerHTML = renderTransferArchiveTable(filteredRows, sortKey, sortDir, 1);
      wireTransferArchiveSorting(filteredRows, sortKey, sortDir, 1);
      wireTransferArchivePaging(filteredRows);
    });
  });
}

renderTransfers = renderTransfersWithFee;
renderTransferArchiveTable = renderTransferArchiveTableWithFee;

async function advanceRound() {
  const isYearUpdate = Boolean(f(dashboardCache?.season, "IsSeasonComplete", false));
  const nextMatchCount = Array.isArray(dashboardCache?.nextMatches) ? dashboardCache.nextMatches.length : 0;
  advanceButton.disabled = true;
  if (skipSeasonButton) skipSeasonButton.disabled = true;
  if (roundJumpButton) roundJumpButton.disabled = true;
  if (seasonSkipSelect) seasonSkipSelect.disabled = true;
  if (seasonSkipButton) seasonSkipButton.disabled = true;
  advanceButton.textContent = "進行中...";
  const progress = isYearUpdate
    ? startProgress("年度更新・移籍処理中", 0, "工程")
    : startProgress("次の節へ進行中", nextMatchCount);
  try {
    await waitForPaint();
    const result = await api("advanceRound", {}, { onProgress: (data) => updateProgress(progress, data) });
    await finishProgress(progress, isYearUpdate ? "年度更新が完了しました" : "次の節の進行が完了しました");
    showNotice(buildAdvanceMessage(result));
    await loadDashboardCache();
    await renderRoute(currentRoute);
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    advanceButton.disabled = false;
    refreshAdvanceControls(dashboardCache || {});
  }
}

async function advanceToSeasonEnd() {
  if (!skipSeasonButton) return;
  advanceButton.disabled = true;
  skipSeasonButton.disabled = true;
  if (roundJumpButton) roundJumpButton.disabled = true;
  if (seasonSkipSelect) seasonSkipSelect.disabled = true;
  if (seasonSkipButton) seasonSkipButton.disabled = true;
  skipSeasonButton.textContent = "進行中...";
  const remaining = num(dashboardCache?.totals, "remaining");
  const progress = startProgress("シーズン終了まで進行中", remaining);
  try {
    await waitForPaint();
    const result = await api("advanceToSeasonEnd", {}, { onProgress: (data) => updateProgress(progress, data) });
    await finishProgress(progress, `${result.simulatedCount.toLocaleString("ja-JP")} 試合を処理しました`);
    showNotice(`${result.year}シーズン最終節まで ${result.simulatedCount}試合を進行しました。年度更新は「年度更新へ」で実行できます。`);
    await loadDashboardCache();
    await renderRoute(currentRoute);
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    advanceButton.disabled = false;
    refreshAdvanceControls(dashboardCache || {});
  }
}

async function advanceToRound() {
  const season = dashboardCache?.season || {};
  const targetRound = Number(roundJumpInput?.value || 0);
  const currentRound = Number(f(season, "CurrentRound", 1));
  const maxRound = Number(f(season, "MaxRound", currentRound));
  if (!targetRound || targetRound < currentRound || targetRound > maxRound) {
    showNotice(`第${currentRound}節から第${maxRound}節の範囲で指定してください。`);
    return;
  }

  advanceButton.disabled = true;
  if (skipSeasonButton) skipSeasonButton.disabled = true;
  if (roundJumpButton) roundJumpButton.disabled = true;
  if (seasonSkipSelect) seasonSkipSelect.disabled = true;
  if (seasonSkipButton) seasonSkipButton.disabled = true;
  const progress = startProgress(`第${targetRound}節まで進行中`, 0);
  try {
    await waitForPaint();
    const result = await api("advanceToRound", { targetRound }, { onProgress: (data) => updateProgress(progress, data) });
    await finishProgress(progress, `${result.simulatedCount.toLocaleString("ja-JP")} 試合を処理しました`);
    showNotice(`${result.year}シーズン 第${result.targetRound}節まで ${result.simulatedCount}試合を進行しました。`);
    await loadDashboardCache();
    if (roundJumpInput) roundJumpInput.value = "";
    await renderAfterRoundAdvance(result);
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    advanceButton.disabled = false;
    refreshAdvanceControls(dashboardCache || {});
  }
}

async function skipSeasons() {
  if (!seasonSkipButton) return;
  const seasonCount = selectedSeasonSkipCount();
  advanceButton.disabled = true;
  if (skipSeasonButton) skipSeasonButton.disabled = true;
  if (roundJumpButton) roundJumpButton.disabled = true;
  if (seasonSkipSelect) seasonSkipSelect.disabled = true;
  seasonSkipButton.disabled = true;
  seasonSkipButton.textContent = "進行中...";
  const progress = startProgress(`${seasonCount}シーズンスキップ中`, seasonCount, "シーズン");
  try {
    await waitForPaint();
    const result = await api("skipSeasons", { seasonCount }, { onProgress: (data) => updateProgress(progress, data) });
    await finishProgress(progress, `${result.completedSeasons.toLocaleString("ja-JP")}シーズン / ${result.simulatedCount.toLocaleString("ja-JP")}試合を処理しました`);
    showNotice(`${result.fromYear}シーズンから${result.toYear}シーズンへ進みました。`);
    await loadDashboardCache();
    await renderRoute(currentRoute);
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    advanceButton.disabled = false;
    refreshAdvanceControls(dashboardCache || {});
  }
}

async function renderAfterRoundAdvance(result) {
  if (currentRoute.name === "league") {
    const params = {
      ...currentRoute.params,
      seasonId: Number(f(result, "seasonId", currentRoute.params.seasonId || 0)) || currentRoute.params.seasonId,
      round: Number(f(result, "targetRound", currentRoute.params.round || 1))
    };
    await replaceRoute("league", params);
    return;
  }

  await renderRoute(currentRoute);
}

async function fullReset() {
  if (!window.confirm("全データを削除して2026年初期状態に戻します。実行しますか？")) {
    return;
  }

  advanceButton.disabled = true;
  if (skipSeasonButton) skipSeasonButton.disabled = true;
  if (roundJumpButton) roundJumpButton.disabled = true;
  if (seasonSkipSelect) seasonSkipSelect.disabled = true;
  if (seasonSkipButton) seasonSkipButton.disabled = true;
  const progress = startProgress("フルリセット中", 0);
  try {
    await waitForPaint();
    await api("fullReset");
    await finishProgress(progress, "初期データを再生成しました");
    routeStack = [makeRoute("dashboard", {})];
    currentRoute = routeStack[0];
    await loadDashboardCache();
    await renderRoute(currentRoute);
    showNotice("フルリセットが完了しました。2026年シーズンを再開できます。");
  } finally {
    if (!progress.panel.classList.contains("hidden")) {
      await finishProgress(progress, "処理を終了しています");
    }
    advanceButton.disabled = false;
    refreshAdvanceControls(dashboardCache || {});
  }
}

function buildAdvanceMessage(result) {
  if (result.nextSeason) {
    return `${result.year}シーズンの年度更新が完了し、${result.nextSeason.year}シーズンへ進みました。`;
  }

  if (result.pendingYearUpdate || result.seasonEnded) {
    return `${result.year}シーズン最終節が終了しました。順位表とベストイレブンを確認できます。`;
  }

  return `${result.year}シーズン 第${result.round}節 ${result.simulatedCount}試合を進行しました。`;
}

async function runSearch(keyword) {
  if (keyword.trim().length < 2) {
    searchResults.innerHTML = "";
    return;
  }
  const data = await api("search", { keyword });
  const teams = (data.teams || []).map((row) => `<button class="search-item" data-team="${num(row, "Id")}">クラブ: ${esc(f(row, "Name"))}<br><span class="muted">${esc(f(row, "LeagueCode"))}</span></button>`).join("");
  const players = (data.players || []).map((row) => `<button class="search-item" data-player="${num(row, "Id")}">選手: ${esc(f(row, "Name"))}<br><span class="muted">${esc(f(row, "PrimaryPosition"))} / ${esc(f(row, "Team"))}</span></button>`).join("");
  searchResults.innerHTML = teams + players || `<div class="muted">該当なし</div>`;
}

document.addEventListener("click", (event) => {
  const player = event.target.closest("[data-player]");
  if (!player) return;
  const playerId = Number(player.dataset.player);
  if (!playerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  pushRoute("player", { playerId });
}, true);

document.addEventListener("click", (event) => {
  const league = event.target.closest("[data-league]");
  const team = event.target.closest("[data-team]");
  const player = event.target.closest("[data-player]");
  const match = event.target.closest("[data-match]");
  const cup = event.target.closest("[data-cup]");
  const continental = event.target.closest("[data-continental]");
  const national = event.target.closest("[data-national]");
  const awards = event.target.closest("[data-awards]");
  const matchNav = event.target.closest("[data-match-nav]");
  const regionToggle = event.target.closest("[data-region-toggle]");
  const countryToggle = event.target.closest("[data-country-toggle]");
  const detailStatsRoute = event.target.closest("[data-detail-stats-route]");
  const detailRankingMode = event.target.closest("[data-detail-ranking-mode]");
  const detailRankingMinimum = event.target.closest("[data-detail-ranking-minimum]");
  const detailRankingStat = event.target.closest("[data-detail-ranking-stat]");
  const detailRankingPosition = event.target.closest("[data-detail-ranking-position]");
  const resultMaskToggle = event.target.closest("[data-result-mask-toggle]");
  const revealMatchScore = event.target.closest("[data-reveal-match-score]");
  const route = event.target.closest("[data-route]");

  if (resultMaskToggle) {
    event.preventDefault();
    event.stopPropagation();
    if (currentRoute) {
      setResultMasked(!isResultMasked());
      renderRoute(currentRoute);
    }
  } else if (matchNav) {
    event.preventDefault();
    event.stopPropagation();
    replaceRoute("match", { matchId: Number(matchNav.dataset.matchNav) });
  } else if (revealMatchScore) {
    event.preventDefault();
    event.stopPropagation();
    const scoreBox = revealMatchScore.closest(".match-score");
    scoreBox?.querySelector(".match-score-value")?.classList.remove("hidden");
    scoreBox?.classList.remove("is-hidden");
    scoreBox?.classList.add("is-revealed");
    revealMatchScore.remove();
  } else if (player) {
    event.preventDefault();
    event.stopPropagation();
    pushRoute("player", { playerId: Number(player.dataset.player) });
  } else if (regionToggle) {
    const region = regionToggle.dataset.regionToggle;
    const isOpen = regionToggle.classList.contains("open");
    if (isOpen) {
      navOpenRegions.delete(region);
      navClosedRegions.add(region);
    } else {
      navOpenRegions.add(region);
      navClosedRegions.delete(region);
    }
    renderLeagueNav(dashboardCache?.leagues || []);
  } else if (countryToggle) {
    const countryCode = countryToggle.dataset.countryToggle;
    const isOpen = countryToggle.classList.contains("open");
    if (isOpen) {
      navOpenCountries.delete(countryCode);
      navClosedCountries.add(countryCode);
    } else {
      navOpenCountries.add(countryCode);
      navClosedCountries.delete(countryCode);
    }
    renderLeagueNav(dashboardCache?.leagues || []);
  } else if (detailStatsRoute) {
    event.preventDefault();
    event.stopPropagation();
    const source = detailStatsRoute.dataset.detailStatsRoute || "league";
    const params = { source };
    if (source === "league") {
      params.leagueId = Number(detailStatsRoute.dataset.detailLeagueId);
    } else {
      params.competitionCode = detailStatsRoute.dataset.detailCompetitionCode;
      params.mode = detailStatsRoute.dataset.detailMode || source;
    }
    if (detailStatsRoute.dataset.detailSeasonId) {
      params.seasonId = Number(detailStatsRoute.dataset.detailSeasonId);
    }
    pushRoute("detailStats", params);
  } else if (detailRankingMode) {
    event.preventDefault();
    event.stopPropagation();
    if (currentRoute) {
      currentRoute.state = currentRoute.state || {};
      currentRoute.state.detailRankingMode = normalizeDetailRankingMode(detailRankingMode.dataset.detailRankingMode);
      renderRoute(currentRoute);
    }
  } else if (detailRankingMinimum) {
    event.preventDefault();
    event.stopPropagation();
    if (currentRoute) {
      currentRoute.state = currentRoute.state || {};
      currentRoute.state.detailMinimumMinutes = normalizeDetailMinimumMinutes(detailRankingMinimum.dataset.detailRankingMinimum);
      renderRoute(currentRoute);
    }
  } else if (detailRankingStat) {
    event.preventDefault();
    event.stopPropagation();
    if (currentRoute) {
      currentRoute.state = currentRoute.state || {};
      currentRoute.state.detailRankingStat = normalizeDetailRankingStat(detailRankingStat.dataset.detailRankingStat);
      renderRoute(currentRoute);
    }
  } else if (detailRankingPosition) {
    event.preventDefault();
    event.stopPropagation();
    if (currentRoute) {
      currentRoute.state = currentRoute.state || {};
      currentRoute.state.detailRankingPosition = normalizeDetailRankingPosition(detailRankingPosition.dataset.detailRankingPosition);
      renderRoute(currentRoute);
    }
  } else if (league) {
    pushRoute("league", { leagueId: Number(league.dataset.league) });
  } else if (team) {
    const params = { teamId: Number(team.dataset.team), statsScope: team.dataset.statsScope };
    if (team.dataset.season) params.seasonId = Number(team.dataset.season);
    pushRoute("team", params);
  } else if (match) {
    pushRoute("match", { matchId: Number(match.dataset.match) });
  } else if (cup) {
    pushRoute("cup", { competitionCode: cup.dataset.cup });
  } else if (continental) {
    pushRoute("continental", { competitionCode: continental.dataset.continental });
  } else if (national) {
    pushRoute("national", { competitionCode: national.dataset.national });
  } else if (awards) {
    pushRoute("awards", { scopeCode: awards.dataset.awards });
  } else if (route && route.dataset.route === "dashboard") {
    pushRoute("dashboard", {});
  } else if (route && route.dataset.route === "transfers") {
    pushRoute("transfers", {});
  } else if (route && route.dataset.route === "cups") {
    pushRoute("cups", {});
  } else if (route && route.dataset.route === "settings") {
    pushRoute("settings", {});
  }
});

advanceButton.addEventListener("click", advanceRound);
skipSeasonButton?.addEventListener("click", advanceToSeasonEnd);
roundJumpButton?.addEventListener("click", advanceToRound);
seasonSkipButton?.addEventListener("click", skipSeasons);
seasonSkipSelect?.addEventListener("change", updateSeasonSkipButtonLabel);
roundJumpInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    advanceToRound();
  }
});

backButton.addEventListener("click", () => {
  if (routeStack.length <= 1) return;
  saveCurrentRouteState();
  routeStack.pop();
  currentRoute = routeStack[routeStack.length - 1];
  renderRoute(currentRoute);
});

document.querySelector("#archiveButton").addEventListener("click", () => pushRoute("archive", {}));

searchBox.addEventListener("input", (event) => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => runSearch(event.target.value), 260);
});

renderFavoriteNav();

loadDashboardCache()
  .then(() => renderRoute(currentRoute))
  .catch((error) => {
    setHeader("起動エラー", "初期化に失敗しました");
    setContent(`<div class="panel"><div class="panel-body">${esc(error.message)}</div></div>`);
  });
