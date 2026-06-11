(function () {
  "use strict";

  const dbName = "jleague-sandbox-lite";
  const storeName = "saves";
  const stateKey = "default";
  const saveVersion = 4;
  const positions = ["GK", "CB", "CB", "RB", "LB", "DM", "CM", "AM", "RW", "LW", "CF"];
  const firstNames = ["蓮", "蒼", "湊", "樹", "陽翔", "大和", "朝陽", "悠真", "律", "新"];
  const lastNames = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田"];
  const fallbackLeagues = [
    { countryCode: "JPN", code: "J1", name: "J1リーグ", level: 1, promotionSlots: 0, relegationSlots: 3 },
    { countryCode: "JPN", code: "J2", name: "J2リーグ", level: 2, promotionSlots: 3, relegationSlots: 0 }
  ];
  const fallbackTeams = [
    ["JPN", "J1", "鹿島アントラーズ", "鹿島", "鹿嶋", "#b81c22", 82],
    ["JPN", "J1", "浦和レッズ", "浦和", "さいたま", "#d71920", 81],
    ["JPN", "J1", "横浜F・マリノス", "横浜FM", "横浜", "#005bac", 80],
    ["JPN", "J1", "川崎フロンターレ", "川崎F", "川崎", "#00a3e0", 79],
    ["JPN", "J1", "ガンバ大阪", "G大阪", "吹田", "#003f8f", 76],
    ["JPN", "J1", "ヴィッセル神戸", "神戸", "神戸", "#8a1538", 83],
    ["JPN", "J2", "清水エスパルス", "清水", "静岡", "#f58220", 73],
    ["JPN", "J2", "ジュビロ磐田", "磐田", "磐田", "#6ec6e8", 72],
    ["JPN", "J2", "ジェフ千葉", "千葉", "千葉", "#f5c400", 68],
    ["JPN", "J2", "大宮アルディージャ", "大宮", "さいたま", "#f97316", 67],
    ["JPN", "J2", "ベガルタ仙台", "仙台", "仙台", "#f5d300", 69],
    ["JPN", "J2", "ファジアーノ岡山", "岡山", "岡山", "#b91c1c", 66]
  ].map(([countryCode, leagueCode, name, shortName, city, primaryColor, rating]) => ({
    countryCode,
    leagueCode,
    name,
    shortName,
    city,
    primaryColor,
    formation: "4-2-3-1",
    tactic: "バランス",
    rating,
    developmentPower: 100,
    youthPower: 100,
    sponsorPower: 100
  }));

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readState() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(stateKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function writeState(state) {
    state.savedAt = new Date().toISOString();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(state, stateKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadCsv(path) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) return null;
      return parseCsv(await response.text());
    } catch {
      return null;
    }
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    const header = rows.shift() || [];
    return rows.filter((values) => values.some(Boolean)).map((values) => {
      const item = {};
      header.forEach((key, index) => {
        item[key] = values[index] || "";
      });
      return item;
    });
  }

  async function loadSeedRows() {
    const [countriesCsv, leaguesCsv, teamsCsv] = await Promise.all([
      loadCsv("./Data/seed_countries.csv").then((rows) => rows || loadCsv("../Data/seed_countries.csv")),
      loadCsv("./Data/seed_leagues.csv").then((rows) => rows || loadCsv("../Data/seed_leagues.csv")),
      loadCsv("./Data/seed_teams.csv").then((rows) => rows || loadCsv("../Data/seed_teams.csv"))
    ]);
    return {
      countries: countriesCsv || [{ code: "JPN", name: "日本", shortName: "日本", region: "East" }],
      leagues: leaguesCsv || fallbackLeagues,
      teams: teamsCsv || fallbackTeams
    };
  }

  async function loadJson(path) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) return await loadJsonGzip(path) || loadJsonParts(path);
      return await response.json();
    } catch {
      return await loadJsonGzip(path) || loadJsonParts(path);
    }
  }

  function relativeUrl(basePath, fileName) {
    const lastSlash = basePath.lastIndexOf("/");
    return lastSlash >= 0 ? `${basePath.slice(0, lastSlash + 1)}${fileName}` : fileName;
  }

  async function loadJsonGzip(path) {
    try {
      if (typeof DecompressionStream === "undefined") return null;
      const response = await fetch(`${path}.gz`, { cache: "no-store" });
      if (!response.ok || !response.body) return null;
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    } catch {
      return null;
    }
  }

  async function loadJsonParts(path) {
    try {
      const manifestResponse = await fetch(`${path}.parts.json`, { cache: "no-store" });
      if (!manifestResponse.ok) return null;
      const manifest = await manifestResponse.json();
      if (!Array.isArray(manifest.parts) || !manifest.parts.length) return null;
      const buffers = await Promise.all(manifest.parts.map(async (part) => {
        const response = await fetch(relativeUrl(path, part), { cache: "no-store" });
        if (!response.ok) throw new Error(`Missing JSON part: ${part}`);
        return new Uint8Array(await response.arrayBuffer());
      }));
      const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of buffers) {
        merged.set(buffer, offset);
        offset += buffer.length;
      }
      return JSON.parse(new TextDecoder().decode(merged));
    } catch {
      return null;
    }
  }

  async function loadCSharpInitialState() {
    const raw = await loadJson("./Data/csharp_initial_state.json").then((state) => state || loadJson("../Data/csharp_initial_state.json"));
    if (!raw || !Array.isArray(raw.countries) || !Array.isArray(raw.teams) || !Array.isArray(raw.players) || !Array.isArray(raw.matches)) {
      return null;
    }
    raw.roundResults = await loadJson("./Data/csharp_round_results.json").then((state) => state || loadJson("../Data/csharp_round_results.json"));
    return hydrateCSharpInitialState(raw);
  }

  async function loadCSharpStateAfterRound(step) {
    const raw = await loadJson(`./Data/csharp_state_after_round_${step}.json`).then((state) => state || loadJson(`../Data/csharp_state_after_round_${step}.json`));
    if (!raw || !Array.isArray(raw.countries) || !Array.isArray(raw.teams) || !Array.isArray(raw.players) || !Array.isArray(raw.matches)) {
      return null;
    }
    return hydrateCSharpInitialState(raw);
  }

  async function loadCSharpRoundResult(step) {
    return loadJson(`./Data/csharp_round_results_${step}.json`).then((state) => state || loadJson(`../Data/csharp_round_results_${step}.json`));
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function sqliteTextCompare(a, b) {
    const left = new TextEncoder().encode(String(a || ""));
    const right = new TextEncoder().encode(String(b || ""));
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  }

  function random(seed) {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return () => {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  async function createInitialState() {
    const csharpState = await loadCSharpInitialState();
    if (csharpState) return csharpState;

    const seed = await loadSeedRows();
    const countries = seed.countries.map((row, index) => ({
      Id: index + 1,
      Code: row.code || row.Code,
      Name: row.name || row.Name,
      ShortName: row.shortName || row.ShortName || row.name || row.Name,
      Region: row.region || row.Region || "Other",
      DomesticNationality: row.domesticNationality || row.DomesticNationality || row.name || row.Name,
      DevelopmentPower: number(row.developmentDefault || row.DevelopmentPower, 100),
      YouthPower: number(row.youthDefault || row.YouthPower, 100),
      SponsorPower: number(row.sponsorDefault || row.SponsorPower, 100),
      DomesticPlayerBaseMin: number(row.domesticPlayerBaseMin || row.DomesticPlayerBaseMin, 20),
      DomesticPlayerBaseMax: number(row.domesticPlayerBaseMax || row.DomesticPlayerBaseMax, 60)
    }));
    const countryByCode = new Map(countries.map((country) => [country.Code, country]));
    const leagues = seed.leagues.map((row, index) => {
      const country = countryByCode.get(row.countryCode || row.CountryCode) || countries[0];
      return {
        Id: index + 1,
        CountryCode: country.Code,
        countryCode: country.Code,
        CountryName: country.Name,
        Region: country.Region,
        region: country.Region,
        Code: row.code || row.Code,
        code: row.code || row.Code,
        Name: row.name || row.Name,
        name: row.name || row.Name,
        Level: number(row.level || row.Level, 1),
        PromotionSlots: number(row.promotionSlots || row.PromotionSlots, 0),
        RelegationSlots: number(row.relegationSlots || row.RelegationSlots, 0),
        ForeignStarterLimit: row.foreignStarterLimit || row.ForeignStarterLimit || "",
        ForeignMatchSquadLimit: row.foreignMatchSquadLimit || row.ForeignMatchSquadLimit || "",
        ForeignAcquisitionSeasonLimit: row.foreignAcquisitionSeasonLimit || row.ForeignAcquisitionSeasonLimit || ""
      };
    }).filter((league) => league.Code);
    const leagueByCode = new Map(leagues.map((league) => [league.Code, league]));
    const sourceTeams = seed.teams.filter((row) => leagueByCode.has(row.leagueCode || row.LeagueCode));
    const teams = sourceTeams.map((row, index) => {
      const league = leagueByCode.get(row.leagueCode || row.LeagueCode);
      return {
        Id: index + 1,
        id: index + 1,
        CountryCode: league.CountryCode,
        LeagueId: league.Id,
        LeagueCode: league.Code,
        leagueCode: league.Code,
        LeagueName: league.Name,
        Name: row.name || row.Name,
        name: row.name || row.Name,
        ShortName: row.shortName || row.ShortName || row.name || row.Name,
        shortName: row.shortName || row.ShortName || row.name || row.Name,
        City: row.city || row.City || "",
        PrimaryColor: row.primaryColor || row.PrimaryColor || "#2563eb",
        Color: row.primaryColor || row.PrimaryColor || "#2563eb",
        Formation: row.formation || row.Formation || "4-2-3-1",
        Tactic: row.tactic || row.Tactic || "バランス",
        Rating: number(row.rating || row.Rating, 60),
        DevelopmentPower: number(row.developmentPower || row.DevelopmentPower, 100),
        YouthPower: number(row.youthPower || row.YouthPower, 100),
        SponsorPower: number(row.sponsorPower || row.SponsorPower, 100)
      };
    });
    const state = {
      version: saveVersion,
      createdAt: new Date().toISOString(),
      savedAt: null,
      nextPlayerId: 1,
      nextMatchId: 1,
      countries,
      leagues,
      teams,
      players: [],
      seasons: [{ Id: 1, id: 1, Year: 2026, year: 2026, CurrentRound: 1, currentRound: 1, MaxRound: 1, maxRound: 1, IsCurrent: 1, IsSeasonComplete: false }],
      matches: [],
      competitionDefinitions: [],
      nationalTeams: [],
      awards: [],
      transfers: [],
      settings: {
        scoreExpectationDivisor: 15,
        homeScoreExpectationBase: 1.42,
        awayScoreExpectationBase: 1.34,
        homeScoreExpectationMinimum: 0.2,
        awayScoreExpectationMinimum: 0.18,
        homeScoreExpectationMaximum: 2.6,
        awayScoreExpectationMaximum: 2.5
      }
    };
    generatePlayers(state);
    generateNationalTeams(state);
    generateSchedule(state, currentSeason(state));
    return state;
  }

  function hydrateCSharpInitialState(raw) {
    const countries = raw.countries.map((country) => ({ ...country }));
    const countryById = new Map(countries.map((country) => [country.Id, country]));
    const leagueRows = raw.leagues.filter((league) => number(league.IsActive, 1) === 1);
    const leagues = leagueRows
      .filter((league) => number(league.IsNational, 0) === 0)
      .map((league) => {
        const country = countryById.get(league.CountryId) || {};
        return {
          ...league,
          CountryCode: country.Code || "",
          countryCode: country.Code || "",
          CountryName: country.Name || "",
          Region: country.Region || "",
          region: country.Region || "",
          code: league.Code,
          name: league.Name
        };
      });
    const leagueById = new Map(leagues.map((league) => [league.Id, league]));
    const teamRows = raw.teams.map((team) => ({ ...team }));
    const teams = teamRows
      .filter((team) => number(team.IsNationalTeam, 0) === 0 && leagueById.has(team.LeagueId))
      .map((team) => {
        const league = leagueById.get(team.LeagueId) || {};
        const country = countryById.get(league.CountryId) || {};
        return {
          ...team,
          id: team.Id,
          CountryCode: country.Code || "",
          CountryName: country.Name || "",
          LeagueCode: league.Code || "",
          leagueCode: league.Code || "",
          LeagueName: league.Name || "",
          name: team.Name,
          shortName: team.ShortName,
          City: team.Prefecture || "",
          Color: team.PrimaryColor
        };
      });
    const teamById = new Map(teamRows.map((team) => [team.Id, team]));
    const countryByCode = new Map(countries.map((country) => [country.Code, country]));
    const nationalTeams = teamRows
      .filter((team) => number(team.IsNationalTeam, 0) === 1)
      .map((team) => ({
        ...team,
        id: team.Id,
        CountryCode: team.NationalCountryCode,
        LeagueCode: "NAT",
        LeagueName: "代表",
        name: team.Name,
        shortName: team.ShortName,
        Color: team.PrimaryColor
      }))
      .sort((a, b) => {
        const ca = countryByCode.get(a.NationalCountryCode) || {};
        const cb = countryByCode.get(b.NationalCountryCode) || {};
        return String(ca.Region || "").localeCompare(String(cb.Region || ""))
          || String(a.NationalCountryCode || "").localeCompare(String(b.NationalCountryCode || ""))
          || a.Id - b.Id;
      });
    const rosterByPlayer = new Map((raw.seasonTeamRoster || []).filter((row) => number(row.SeasonId, 1) === 1).map((row) => [row.PlayerId, row]));
    const statsByPlayer = new Map((raw.playerSeasonStats || []).filter((row) => number(row.SeasonId, 1) === 1 && row.CompetitionGroup === "All").map((row) => [row.PlayerId, row]));
    const players = raw.players.map((player) => {
      const roster = rosterByPlayer.get(player.Id) || {};
      const stats = statsByPlayer.get(player.Id) || {};
      const team = teamById.get(player.TeamId) || {};
      return {
        ...player,
        Team: team.ShortName || "",
        TeamName: team.Name || "",
        TeamShort: team.ShortName || "",
        Rating: number(player.Overall, 0),
        Potential: number(player.Overall, 0),
        Condition: "Good",
        UsedPosition: roster.PrimaryPosition || player.PrimaryPosition,
        ShirtNumber: number(roster.ShirtNumber, 0),
        Apps: number(stats.Apps, 0),
        Starts: number(stats.Starts, 0),
        SubstituteApps: Math.max(0, number(stats.Apps, 0) - number(stats.Starts, 0)),
        Goals: number(stats.Goals, 0),
        Assists: number(stats.Assists, 0),
        Minutes: number(stats.Minutes, 0),
        RatingMatches: number(stats.RatingMatches, 0),
        RatingTotal: number(stats.RatingTotal, 0),
        AvgRating: number(stats.AvgRating, 0),
        PassAttempts: number(stats.PassAttempts, 0),
        PassesCompleted: number(stats.PassesCompleted, 0),
        Shots: number(stats.Shots, 0),
        ShotsOnTarget: number(stats.ShotsOnTarget, 0),
        KeyPasses: number(stats.KeyPasses, 0),
        Dribbles: number(stats.Dribbles, 0),
        Crosses: number(stats.Crosses, 0),
        Tackles: number(stats.Tackles, 0),
        TackleAttempts: number(stats.TackleAttempts, 0),
        Interceptions: number(stats.Interceptions, 0),
        AerialsWon: number(stats.AerialsWon, 0),
        AerialAttempts: number(stats.AerialAttempts, 0),
        Fouls: number(stats.Fouls, 0),
        Saves: number(stats.Saves, 0),
        SaveAttempts: number(stats.Saves, 0) + number(stats.GoalsAgainst, 0),
        GoalsAgainst: number(stats.GoalsAgainst, 0)
      };
    });
    const leagueByMatchId = new Map(raw.matches.map((match) => [match.Id, leagueById.get(match.LeagueId)]));
    const matches = raw.matches.map((match) => {
      const league = leagueByMatchId.get(match.Id) || leagueById.get(match.LeagueId) || {};
      return {
        ...match,
        id: match.Id,
        Year: 2026,
        LeagueCode: league.Code || "",
        LeagueName: league.Name || "",
        GlobalRound: match.Round,
        HomeGoals: match.HomeGoals,
        AwayGoals: match.AwayGoals,
        WinnerTeamId: match.WinnerTeamId,
        DecidedBy: match.DecidedBy || ""
      };
    });
    const seasons = raw.seasons.map((season) => ({
      ...season,
      id: season.Id,
      year: season.Year,
      currentRound: season.CurrentRound,
      MaxRound: Math.max(1, ...matches.filter((match) => match.SeasonId === season.Id).map((match) => number(match.Round, 1))),
      maxRound: Math.max(1, ...matches.filter((match) => match.SeasonId === season.Id).map((match) => number(match.Round, 1))),
      IsSeasonComplete: false
    }));
    const competitionDefinitions = buildCompetitionDefinitionsFromMatches(matches, countries);
    return {
      version: saveVersion,
      createdAt: new Date().toISOString(),
      savedAt: null,
      nextPlayerId: Math.max(0, ...players.map((player) => number(player.Id))) + 1,
      nextMatchId: Math.max(0, ...matches.map((match) => number(match.Id))) + 1,
      countries,
      leagues,
      teams,
      players,
      seasons,
      matches,
      competitionDefinitions,
      nationalTeams,
      contracts: raw.contracts || [],
      nationalTeamSelections: raw.nationalTeamSelections || [],
      playerPositionFits: raw.playerPositionFits || [],
      playerPositionSeasonStats: raw.playerPositionSeasonStats || [],
      seasonShirtNumbers: raw.seasonShirtNumbers || [],
      clubBudgets: raw.clubBudgets || [],
      csharpRoundResults: raw.roundResults || null,
      awards: raw.awards || [],
      transfers: raw.transfers || [],
      settings: defaultSettings()
    };
  }

  function buildCompetitionDefinitionsFromMatches(matches, countries) {
    const seen = new Set();
    const definitions = [];
    for (const match of matches) {
      if (match.CompetitionGroup === "League") continue;
      const key = `${match.CompetitionGroup}:${match.CompetitionCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      definitions.push({
        group: match.CompetitionGroup,
        code: match.CompetitionCode,
        label: competitionLabel(match.CompetitionGroup, match.CompetitionCode, countries),
        region: "",
        countryCode: ""
      });
    }
    return definitions;
  }

  function competitionLabel(group, code, countries) {
    const domestic = domesticCupDefinitions().find((item) => item.code === code);
    if (domestic) {
      const special = {
        Emperor: "天皇杯",
        Levain: "ルヴァンカップ",
        King: "キングスカップ",
        ThaiFA: "タイFAカップ",
        ChinaFA: "中国FAカップ",
        Emir: "アミールカップ",
        UaePresident: "UAEプレジデントカップ",
        KoreaCup: "コリアカップ",
        MalaysiaFA: "マレーシアFAカップ",
        Hazfi: "ハズフィーカップ"
      };
      if (special[code]) return special[code];
      const country = countries.find((item) => item.Code === domestic.countryCode);
      const countryName = domestic.countryCode === "HKG" ? "香港" : (country?.ShortName || country?.Name || domestic.countryCode);
      return `${countryName}カップ`;
    }
    if (group === "Continental") {
      const labels = {
        Libertadores: "リベルタドーレス",
        Sudamericana: "スダメリカーナ",
        ConcacafChampionsCup: "CONCACAFチャンピオンズカップ",
        CAFChampionsLeague: "CAFチャンピオンズリーグ",
        ClubWorldCup: "クラブワールドカップ"
      };
      return labels[code] || code;
    }
    if (group === "National") return nationalCompetitionLabel(code);
    return code;
  }

  function defaultSettings() {
    return {
      scoreExpectationDivisor: 15,
      homeScoreExpectationBase: 1.42,
      awayScoreExpectationBase: 1.34,
      homeScoreExpectationMinimum: 0.2,
      awayScoreExpectationMinimum: 0.18,
      homeScoreExpectationMaximum: 2.6,
      awayScoreExpectationMaximum: 2.5
    };
  }

  function currentSeason(state) {
    return state.seasons.find((season) => season.IsCurrent || season.isCurrent) || state.seasons[state.seasons.length - 1];
  }

  function seasonDto(season) {
    return {
      id: season.Id,
      year: season.Year,
      currentRound: season.CurrentRound
    };
  }

  function dashboardSeasonDto(season) {
    return {
      id: season.Id,
      year: season.Year,
      currentRound: season.CurrentRound,
      maxRound: season.MaxRound,
      isSeasonComplete: Boolean(season.IsSeasonComplete)
    };
  }

  function seasonOptionDto(season) {
    return {
      Id: season.Id,
      Year: season.Year,
      CurrentRound: season.CurrentRound,
      IsCurrent: season.IsCurrent || (season === currentSeason({ seasons: [season] }) ? 1 : 0)
    };
  }

  function generatePlayers(state) {
    const rng = random(20260608);
    for (const team of state.teams) {
      for (let i = 0; i < 30; i += 1) {
        const position = positions[i % positions.length];
        const rating = Math.max(20, Math.round(team.Rating - 12 + rng() * 25));
        state.players.push({
          Id: state.nextPlayerId++,
          TeamId: team.Id,
          Team: team.ShortName,
          TeamName: team.Name,
          TeamShort: team.ShortName,
          Name: `${lastNames[Math.floor(rng() * lastNames.length)]} ${firstNames[Math.floor(rng() * firstNames.length)]}`,
          Nationality: team.CountryCode,
          NationalityCode: team.CountryCode,
          PrimaryPosition: position,
          UsedPosition: position,
          Age: 18 + Math.floor(rng() * 18),
          ShirtNumber: i + 1,
          Rating: rating,
          Potential: Math.min(99, rating + Math.floor(rng() * 12)),
          Condition: "Good",
          Apps: 0,
          Starts: 0,
          SubstituteApps: 0,
          Goals: 0,
          Assists: 0,
          Minutes: 0,
          RatingMatches: 0,
          AvgRating: 0,
          RatingTotal: 0,
          PassAttempts: 0,
          PassesCompleted: 0,
          Shots: 0,
          ShotsOnTarget: 0,
          KeyPasses: 0,
          Dribbles: 0,
          Crosses: 0,
          Tackles: 0,
          TackleAttempts: 0,
          Interceptions: 0,
          AerialsWon: 0,
          AerialAttempts: 0,
          Fouls: 0,
          Saves: 0,
          SaveAttempts: 0,
          GoalsAgainst: 0
        });
      }
    }
  }

  function generateSchedule(state, season) {
    state.matches = state.matches.filter((match) => match.SeasonId !== season.Id);
    state.competitionDefinitions = [];
    const byLeague = new Map();
    for (const team of state.teams) {
      if (!byLeague.has(team.LeagueId)) byLeague.set(team.LeagueId, []);
      byLeague.get(team.LeagueId).push(team);
    }
    let maxRound = 1;
    for (const [leagueId, teams] of byLeague.entries()) {
      const league = state.leagues.find((item) => item.Id === leagueId);
      const teamById = new Map(teams.map((team) => [team.Id, team]));
      const basePairings = buildRoundRobinPairings(teams.map((team) => team.Id));
      const baseRounds = Math.max(1, basePairings.length);
      const repeatCount = determineLeagueRoundRobinCycles(teams.length);
      const totalRounds = baseRounds * repeatCount;
      maxRound = Math.max(maxRound, leagueGlobalRound(totalRounds));
      for (let cycle = 0; cycle < repeatCount; cycle += 1) {
        for (const baseRound of basePairings) {
          const round = cycle * baseRounds + baseRound.round;
          for (const pairing of baseRound.matches) {
            const reverse = cycle % 2 === 1;
            const homeTeam = teamById.get(reverse ? pairing.awayTeamId : pairing.homeTeamId);
            const awayTeam = teamById.get(reverse ? pairing.homeTeamId : pairing.awayTeamId);
            if (!homeTeam || !awayTeam || homeTeam.Id === awayTeam.Id) continue;
            state.matches.push(newMatch(state, season, league, round, homeTeam, awayTeam));
          }
        }
      }
    }
    maxRound = Math.max(maxRound, generateDomesticCups(state, season, maxRound));
    maxRound = Math.max(maxRound, generateContinentalCompetitions(state, season));
    maxRound = Math.max(maxRound, generateNationalCompetitions(state, season));
    season.MaxRound = maxRound;
    season.maxRound = maxRound;
  }

  function newMatch(state, season, league, round, home, away) {
    return {
      Id: state.nextMatchId++,
      id: state.nextMatchId - 1,
      SeasonId: season.Id,
      Year: season.Year,
      LeagueId: league.Id,
      LeagueCode: league.Code,
      LeagueName: league.Name,
      Round: leagueGlobalRound(round),
      GlobalRound: leagueGlobalRound(round),
      CompetitionRound: round,
      StageName: `リーグ第${round}節`,
      CompetitionGroup: "League",
      CompetitionCode: "League",
      Played: 0,
      HomeTeamId: home.Id,
      AwayTeamId: away.Id,
      HomeGoals: null,
      AwayGoals: null,
      WinnerTeamId: null,
      DecidedBy: ""
    };
  }

  function determineLeagueRoundRobinCycles(teamCount) {
    if (teamCount < 2) return 0;
    const matchesPerCycle = teamCount - 1;
    const candidates = [];
    for (let cycles = 1; cycles <= 38; cycles += 1) {
      const matches = cycles * matchesPerCycle;
      if (matches >= 26 && matches <= 38) candidates.push({ cycles, matches });
    }
    if (candidates.length) {
      candidates.sort((a, b) => Math.abs(a.matches - 34) - Math.abs(b.matches - 34) || a.matches - b.matches);
      return candidates[0].cycles;
    }
    for (let cycles = 1; cycles <= 38; cycles += 1) {
      if (cycles * matchesPerCycle >= 26) return cycles;
    }
    return 1;
  }

  function newCompetitionMatch(state, season, definition, round, competitionRound, stageName, home, away) {
    if (!home || !away) return null;
    return {
      Id: state.nextMatchId++,
      id: state.nextMatchId - 1,
      SeasonId: season.Id,
      Year: season.Year,
      LeagueId: home.LeagueId || 0,
      LeagueCode: home.LeagueCode || "NAT",
      LeagueName: home.LeagueName || definition.label,
      Round: round,
      GlobalRound: round,
      CompetitionRound: competitionRound,
      StageName: stageName,
      CompetitionGroup: definition.group,
      CompetitionCode: definition.code,
      Played: 0,
      HomeTeamId: home.Id,
      AwayTeamId: away.Id,
      HomeGoals: null,
      AwayGoals: null,
      WinnerTeamId: null,
      DecidedBy: ""
    };
  }

  function addCompetitionDefinition(state, definition) {
    if (!state.competitionDefinitions.some((item) => item.code === definition.code && item.group === definition.group)) {
      state.competitionDefinitions.push(definition);
    }
  }

  function pushMatch(state, match) {
    if (match) state.matches.push(match);
  }

  function generateDomesticCups(state, season, startRound) {
    const byCountry = new Map();
    for (const team of state.teams) {
      if (!byCountry.has(team.CountryCode)) byCountry.set(team.CountryCode, []);
      byCountry.get(team.CountryCode).push(team);
    }
    let maxRound = startRound;
    for (const cup of domesticCupDefinitions()) {
      const teams = (byCountry.get(cup.countryCode) || [])
        .filter((team) => cup.code !== "Levain" || leagueLevel(state, team.LeagueId) <= 3)
        .slice()
        .sort((a, b) => number(a.Level, leagueLevel(state, a.LeagueId)) - number(b.Level, leagueLevel(state, b.LeagueId)) || number(b.Rating) - number(a.Rating) || a.Id - b.Id);
      const country = state.countries.find((item) => item.Code === cup.countryCode) || {};
      const definition = { code: cup.code, label: domesticCupLabel(state, cup), group: "Cup", countryCode: cup.countryCode, region: country.Region || "Other" };
      addCompetitionDefinition(state, definition);
      const targetSize = cup.targetSize > 0 ? cup.targetSize : largestPowerOfTwoAtMost(teams.length);
      if (teams.length < 2 || targetSize < 2) continue;
      const globalRound = cup.code === "Levain" ? 3 : 1;
      const overflow = Math.max(0, teams.length - targetSize);
      const preliminaryCount = overflow * 2;
      const byeCount = Math.max(0, teams.length - preliminaryCount);
      const seeded = teams.slice().sort((a, b) => leagueLevel(state, a.LeagueId) - leagueLevel(state, b.LeagueId) || number(b.Rating) - number(a.Rating) || a.Id - b.Id);
      const byes = new Set(seeded.slice(0, byeCount).map((team) => team.Id));
      const entrants = overflow === 0 ? shuffleByHash(teams, `cup-opening-${season.Id}-${cup.code}`) : shuffleByHash(teams.filter((team) => !byes.has(team.Id)), `cup-opening-${season.Id}-${cup.code}`);
      const stage = cupStageName(cup.code, 1, entrants.length, overflow > 0);
      for (let i = 0; i + 1 < entrants.length; i += 2) {
        pushMatch(state, newCompetitionMatch(state, season, definition, globalRound, 1, stage, entrants[i], entrants[i + 1]));
      }
      maxRound = Math.max(maxRound, globalRound);
    }
    return maxRound;
  }

  function domesticCupDefinitions() {
    const legacy = [
      ["JPN", "Emperor", 64],
      ["JPN", "Levain", 32],
      ["SAU", "King", 32],
      ["THA", "ThaiFA", 32],
      ["CHN", "ChinaFA", 32],
      ["QAT", "Emir", 32],
      ["UAE", "UaePresident", 32],
      ["KOR", "KoreaCup", 32],
      ["MAS", "MalaysiaFA", 32],
      ["IRN", "Hazfi", 32]
    ];
    const generic = [
      "ENG", "ESP", "ITA", "GER", "NED", "POR", "BEL", "SCO", "CZE", "TUR",
      "NOR", "GRE", "AUT", "POL", "DEN", "SUI", "FRA", "SWE", "CRO", "SRB",
      "UKR", "RUS", "BUL", "ROU", "BRA", "ARG", "URU", "CHI", "PAR", "PER",
      "COL", "ECU", "MEX", "USA", "CRC", "CAN", "TUN", "EGY", "MAR", "RSA",
      "NGA", "GHA", "CMR", "SEN", "AUS", "IDN", "IND", "UZB", "VIE", "HKG",
      "IRQ", "BHR", "JOR", "KUW"
    ].map((countryCode) => [countryCode, domesticCupCode(countryCode), 0]);
    return legacy.concat(generic).map(([countryCode, code, targetSize]) => ({ countryCode, code, targetSize }));
  }

  function domesticCupCode(countryCode) {
    return `${countryCode}Cup`;
  }

  function domesticCupLabel(state, cup) {
    const special = {
      Emperor: "天皇杯",
      Levain: "ルヴァンカップ",
      King: "キングカップ",
      ThaiFA: "タイFAカップ",
      ChinaFA: "中国FAカップ",
      Emir: "エミールカップ",
      UaePresident: "UAEプレジデントカップ",
      KoreaCup: "コリアカップ",
      MalaysiaFA: "マレーシアFAカップ",
      Hazfi: "ハズフィーカップ"
    };
    if (special[cup.code]) return special[cup.code];
    const country = state.countries.find((item) => item.Code === cup.countryCode);
    return `${country?.ShortName || country?.Name || cup.countryCode}カップ`;
  }

  function largestPowerOfTwoAtMost(value) {
    let result = 1;
    while (result * 2 <= value) result *= 2;
    return result;
  }

  function leagueLevel(state, leagueId) {
    return number(state.leagues.find((league) => league.Id === leagueId)?.Level, 99);
  }

  function cupStageName(competitionCode, competitionRound, entrantCount, isPreliminary) {
    if (isPreliminary) return "予備ラウンド";
    if (entrantCount <= 2) return "決勝";
    if (entrantCount <= 4) return "準決勝";
    if (entrantCount <= 8) return "準々決勝";
    if (competitionCode === "Levain") {
      if (entrantCount === 32) return "1回戦";
      if (entrantCount === 16) return "2回戦";
      return `${competitionRound}回戦`;
    }
    if (entrantCount === 64) return "1回戦";
    if (entrantCount === 32) return "2回戦";
    if (entrantCount === 16) return "3回戦";
    return `${competitionRound}回戦`;
  }

  function shuffleByHash(items, seed) {
    return items.slice().sort((a, b) => hashString(`${seed}-${a.Id}`) - hashString(`${seed}-${b.Id}`));
  }

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < String(value).length; i += 1) {
      hash = ((hash << 5) - hash + String(value).charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function generateContinentalCompetitions(state, season) {
    let maxRound = season.MaxRound || 1;
    const configs = [
      ["ACL", aclSlots(), 32],
      ["ACL2", acl2Slots(), 32],
      ["CL", uefaSlots(), 40],
      ["EL", uefaSlots(), 40],
      ["ECL", uefaSlots(), 40],
      ["Libertadores", conmebolSlots(), 32],
      ["Sudamericana", conmebolSlots(), 32],
      ["ConcacafChampionsCup", concacafSlots(), 16],
      ["CAFChampionsLeague", cafSlots(), 32],
      ["ClubWorldCup", null, 16]
    ];
    const used = new Set();
    for (const [code, slots, target] of configs) {
      const definition = { code, label: code, group: "Continental", region: continentalRegionForCode(code) };
      addCompetitionDefinition(state, definition);
      const entrants = code === "ClubWorldCup"
        ? selectClubWorldCupCandidates(state, target)
        : selectContinentalSeedTeams(state, slots, used, target);
      if (entrants.length < target) continue;
      if (["CL", "EL", "ECL"].includes(code)) {
        insertUefaPlayoffRound(state, season, definition, entrants.slice(24, 40));
        maxRound = Math.max(maxRound, uefaPlayoffRound(state));
      } else {
        insertContinentalGroupStage(state, season, definition, entrants.slice(0, target), target);
        maxRound = Math.max(maxRound, continentalStartRound(state) + 4);
      }
    }
    return maxRound;
  }

  function selectContinentalSeedTeams(state, slots, used, target) {
    const result = [];
    for (const [countryCode, count] of Object.entries(slots || {})) {
      const teams = state.teams
        .filter((team) => team.CountryCode === countryCode && !used.has(team.Id))
        .sort((a, b) => leagueLevel(state, a.LeagueId) - leagueLevel(state, b.LeagueId) || number(b.Rating) - number(a.Rating) || a.Id - b.Id)
        .slice(0, count);
      teams.forEach((team) => {
        if (!used.has(team.Id) && result.length < target) {
          used.add(team.Id);
          result.push(team);
        }
      });
    }
    return result;
  }

  function selectClubWorldCupCandidates(state, target) {
    return state.teams.slice().sort((a, b) => number(b.Rating) - number(a.Rating) || leagueLevel(state, a.LeagueId) - leagueLevel(state, b.LeagueId) || a.Id - b.Id).slice(0, target);
  }

  function insertContinentalGroupStage(state, season, definition, teams, targetTeamCount) {
    if (targetTeamCount % 4 !== 0 || targetTeamCount < 4 || teams.length < targetTeamCount) return;
    const start = continentalStartRound(state);
    const groupCount = targetTeamCount / 4;
    const groups = Array.from({ length: groupCount }, () => []);
    teams.slice(0, targetTeamCount).forEach((team, index) => {
      groups[index % groups.length].push(team);
    });
    groups.forEach((group, index) => {
      const name = String.fromCharCode(65 + index);
      const byId = new Map(group.map((team) => [team.Id, team]));
      buildRoundRobinPairings(group.map((team) => team.Id)).forEach((round) => {
        round.matches.forEach((match) => {
          pushMatch(state, newCompetitionMatch(state, season, definition, start + (round.round - 1) * 2, round.round, `${definition.code} Group ${name} MD${round.round}`, byId.get(match.homeTeamId), byId.get(match.awayTeamId)));
        });
      });
    });
  }

  function insertUefaPlayoffRound(state, season, definition, entrants) {
    if (entrants.length < 16) return;
    const round = uefaPlayoffRound(state);
    const shuffled = shuffleByHash(entrants, `uefa-playoff-${season.Id}-${definition.code}`);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pushMatch(state, newCompetitionMatch(state, season, definition, round, 0, `${definition.code} Playoff`, shuffled[i], shuffled[i + 1]));
    }
  }

  function uefaPlayoffRound(state) {
    const maxLeagueCompetitionRound = Math.max(0, ...state.matches.filter((match) => match.CompetitionGroup === "League").map((match) => number(match.CompetitionRound)));
    let round = Math.max(1, leagueGlobalRound(Math.max(1, Math.floor(maxLeagueCompetitionRound / 2) + 1)) - 1);
    if (round % 2 === 0) round += 1;
    return round;
  }

  function continentalStartRound(state) {
    const maxLeagueCompetitionRound = Math.max(0, ...state.matches.filter((match) => match.CompetitionGroup === "League").map((match) => number(match.CompetitionRound)));
    let round = leagueGlobalRound(Math.max(1, Math.floor(maxLeagueCompetitionRound / 2) + 1)) + 1;
    if (round % 2 === 0) round += 1;
    return round;
  }

  function leagueGlobalRound(leagueRound) {
    return leagueRound * 2;
  }

  function continentalRegionForCode(code) {
    if (["ACL", "ACL2"].includes(code)) return "Asia";
    if (["CL", "EL", "ECL"].includes(code)) return "Europe";
    if (["Libertadores", "Sudamericana"].includes(code)) return "SouthAmerica";
    if (code === "ConcacafChampionsCup") return "NorthAmerica";
    if (code === "CAFChampionsLeague") return "Africa";
    return "World";
  }

  function aclSlots() {
    return { SAU: 3, JPN: 3, KOR: 3, IRN: 3, UAE: 2, QAT: 2, CHN: 2, UZB: 2, THA: 2, IRQ: 1, AUS: 1, MAS: 1, VIE: 1, HKG: 1, KUW: 1, IDN: 1, IND: 1, BHR: 1, JOR: 1 };
  }

  function acl2Slots() {
    return { SAU: 2, JPN: 2, KOR: 2, IRN: 2, UAE: 2, QAT: 2, CHN: 2, THA: 2, MAS: 2, UZB: 2, VIE: 2, KUW: 2, IRQ: 2, AUS: 2, IDN: 1, IND: 1, BHR: 1, JOR: 1 };
  }

  function uefaSlots() {
    return { ENG: 3, ESP: 3, ITA: 3, GER: 3, FRA: 3, NED: 2, POR: 2, BEL: 2, SCO: 2, CZE: 2, TUR: 2, NOR: 1, GRE: 1, AUT: 1, POL: 1, DEN: 1, SUI: 1, SWE: 1, CRO: 1, SRB: 1, UKR: 1, RUS: 1, BUL: 1, ROU: 1 };
  }

  function conmebolSlots() {
    return { BRA: 6, ARG: 6, URU: 4, CHI: 4, PAR: 3, PER: 3, COL: 3, ECU: 3 };
  }

  function concacafSlots() {
    return { MEX: 4, USA: 4, CRC: 4, CAN: 4 };
  }

  function cafSlots() {
    return { EGY: 4, MAR: 4, TUN: 4, RSA: 4, NGA: 4, GHA: 4, CMR: 4, SEN: 4 };
  }

  function generateNationalTeams(state) {
    const kinds = [
      ["Full", "代表", ""],
      ["U23", "U-23代表", " U23"],
      ["U20", "U-20代表", " U20"]
    ];
    const countries = state.countries.slice().sort((a, b) => (a.Code === "JPN" ? -1 : b.Code === "JPN" ? 1 : a.Code === "SAU" ? -1 : b.Code === "SAU" ? 1 : String(a.Region).localeCompare(String(b.Region)) || String(a.Code).localeCompare(String(b.Code))));
    let id = state.teams.length + 1;
    state.nationalTeams = [];
    countries.forEach((country, countryIndex) => {
      kinds.forEach(([kind, nameSuffix, shortSuffix]) => {
        const baseRating = Math.max(45, Math.round((country.DevelopmentPower + country.YouthPower + country.SponsorPower) / 3));
        const ageAdjustment = kind === "U23" ? -8 : kind === "U20" ? -14 : 0;
        state.nationalTeams.push({
          Id: id,
          id,
          CountryCode: country.Code,
          NationalCountryCode: country.Code,
          NationalTeamKind: kind,
          LeagueCode: "NAT",
          LeagueName: "代表",
          Name: `${country.ShortName || country.Name}${nameSuffix}`,
          name: `${country.ShortName || country.Name}${nameSuffix}`,
          ShortName: `${country.ShortName || country.Name}${shortSuffix}`,
          shortName: `${country.ShortName || country.Name}${shortSuffix}`,
          PrimaryColor: nationalColor(countryIndex),
          Color: nationalColor(countryIndex),
          Formation: "4-2-3-1",
          Tactic: "Balanced",
          Rating: Math.max(35, baseRating + ageAdjustment),
          Region: country.Region
        });
        id += 1;
      });
    });
  }

  function nationalColor(index) {
    const colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#be123c", "#0f766e"];
    return colors[index % colors.length];
  }

  function generateNationalCompetitions(state, season) {
    const definitions = nationalCompetitionCodes().map((code) => ({ code, label: nationalCompetitionLabel(code), group: "National", region: nationalCompetitionRegion(code) }));
    let maxRound = season.MaxRound || 1;
    for (const definition of definitions) {
      addCompetitionDefinition(state, definition);
      const entrants = selectNationalTournamentTeams(state, definition.code);
      const count = nationalTournamentTeamCount(definition.code, entrants.length);
      if (!count) continue;
      if (isAsiaCupPlayoffCompetition(definition.code) && insertAsiaCupPlayoff(state, season, definition, entrants, count)) {
        maxRound = Math.max(maxRound, 75);
        continue;
      }
      insertNationalGroupStage(state, season, definition, entrants.slice(0, count));
      maxRound = Math.max(maxRound, 77 + 3);
    }
    return maxRound;
  }

  function nationalCompetitionCodes() {
    return ["WorldCup", "U23WorldCup", "U20WorldCup", "AsiaCup", "U23AsiaCup", "U20AsiaCup", "Euro", "U23Euro", "U20Euro", "CopaAmerica", "U23CopaAmerica", "U20CopaAmerica", "GoldCup", "U23GoldCup", "U20GoldCup", "AFCON", "U23AFCON", "U20AFCON"];
  }

  function isAsiaCupPlayoffCompetition(code) {
    return ["AsiaCup", "U23AsiaCup", "U20AsiaCup"].includes(code);
  }

  function insertAsiaCupPlayoff(state, season, definition, availableTeams, targetTeamCount) {
    if (targetTeamCount < 16) return false;
    const playoffCodes = ["HKG", "IDN", "IND", "KUW"];
    const playoffTeams = playoffCodes.map((code) => availableTeams.find((team) => team.NationalCountryCode === code)).filter(Boolean);
    const directTeams = availableTeams.filter((team) => !playoffCodes.includes(team.NationalCountryCode)).slice(0, targetTeamCount - 1);
    if (directTeams.length < targetTeamCount - 1 || playoffTeams.length < 4) return false;
    pushMatch(state, newCompetitionMatch(state, season, definition, 75, -1, `${definition.code} Playoff Semifinal`, playoffTeams[0], playoffTeams[1]));
    pushMatch(state, newCompetitionMatch(state, season, definition, 75, -1, `${definition.code} Playoff Semifinal`, playoffTeams[2], playoffTeams[3]));
    return true;
  }

  function nationalCompetitionLabel(code) {
    const csharpLabels = {
      WorldCup: "ワールドカップ",
      U23WorldCup: "オリンピック",
      U20WorldCup: "ワールドユース",
      AsiaCup: "アジアカップ",
      U23AsiaCup: "U-23アジアカップ",
      U20AsiaCup: "U-20アジアカップ",
      Euro: "EURO",
      U23Euro: "U-23EURO",
      U20Euro: "U-20EURO",
      CopaAmerica: "コパアメリカ",
      U23CopaAmerica: "U-23コパアメリカ",
      U20CopaAmerica: "U-20コパアメリカ",
      GoldCup: "ゴールドカップ",
      U23GoldCup: "U-23ゴールドカップ",
      U20GoldCup: "U-20ゴールドカップ",
      AFCON: "アフリカネーションズカップ",
      U23AFCON: "U-23アフリカネーションズカップ",
      U20AFCON: "U-20アフリカネーションズカップ"
    };
    if (csharpLabels[code]) return csharpLabels[code];
    const labels = {
      WorldCup: "ワールドカップ",
      U23WorldCup: "U-23ワールドカップ",
      U20WorldCup: "U-20ワールドカップ",
      AsiaCup: "アジアカップ",
      U23AsiaCup: "U-23アジアカップ",
      U20AsiaCup: "U-20アジアカップ",
      Euro: "欧州選手権",
      U23Euro: "U-23欧州選手権",
      U20Euro: "U-20欧州選手権",
      CopaAmerica: "コパ・アメリカ",
      U23CopaAmerica: "U-23コパ・アメリカ",
      U20CopaAmerica: "U-20コパ・アメリカ",
      GoldCup: "ゴールドカップ",
      U23GoldCup: "U-23ゴールドカップ",
      U20GoldCup: "U-20ゴールドカップ",
      AFCON: "アフリカ選手権",
      U23AFCON: "U-23アフリカ選手権",
      U20AFCON: "U-20アフリカ選手権"
    };
    return labels[code] || code;
  }

  function nationalTeamKindForCompetition(code) {
    return code.includes("U23") ? "U23" : code.includes("U20") ? "U20" : "Full";
  }

  function nationalCompetitionRegion(code) {
    if (code.includes("AsiaCup")) return "Asia";
    if (code.includes("Euro")) return "Europe";
    if (code.includes("CopaAmerica")) return "SouthAmerica";
    if (code.includes("GoldCup")) return "NorthAmerica";
    if (code.includes("AFCON")) return "Africa";
    return "World";
  }

  function selectNationalTournamentTeams(state, code) {
    const kind = nationalTeamKindForCompetition(code);
    const region = nationalCompetitionRegion(code);
    const pool = (state.nationalTeams || []).filter((team) => team.NationalTeamKind === kind && (region === "World" || teamRegionMatchesNational(region, team.Region)));
    return pool.slice().sort((a, b) => number(b.Rating) - number(a.Rating) || String(a.NationalCountryCode).localeCompare(String(b.NationalCountryCode)) || a.Id - b.Id);
  }

  function teamRegionMatchesNational(region, teamRegion) {
    if (region === "Asia") return ["East", "West", "Southeast", "Central"].includes(teamRegion);
    return teamRegion === region;
  }

  function nationalTournamentTeamCount(code, availableCount) {
    if (["WorldCup", "U23WorldCup", "U20WorldCup"].includes(code) && availableCount >= 32) return 32;
    if (["Euro", "U23Euro", "U20Euro"].includes(code) && availableCount >= 24) return 24;
    if (availableCount >= 16) return 16;
    if (availableCount >= 8) return 8;
    if (availableCount >= 4) return 4;
    if (availableCount >= 2) return 2;
    return 0;
  }

  function insertNationalGroupStage(state, season, definition, teams) {
    const groups = buildNationalGroups(teams);
    groups.forEach((group, index) => {
      const name = String.fromCharCode(65 + index);
      const byId = new Map(group.map((team) => [team.Id, team]));
      buildRoundRobinPairings(group.map((team) => team.Id)).forEach((round) => {
        round.matches.forEach((match) => {
          pushMatch(state, newCompetitionMatch(state, season, definition, 77 + round.round - 1, round.round, `${definition.code} Group ${name} MD${round.round}`, byId.get(match.homeTeamId), byId.get(match.awayTeamId)));
        });
      });
    });
  }

  function buildNationalGroups(teams) {
    const count = teams.length === 32 ? 8 : teams.length === 24 ? 6 : teams.length <= 4 ? 1 : teams.length <= 8 ? 2 : 4;
    const groups = Array.from({ length: count }, () => []);
    teams.forEach((team, index) => {
      const row = Math.floor(index / groups.length);
      const column = index % groups.length;
      const groupIndex = row % 2 === 0 ? column : groups.length - 1 - column;
      groups[groupIndex].push(team);
    });
    return groups;
  }

  function buildRoundRobinPairings(originalTeamIds) {
    const teamIds = originalTeamIds.slice();
    if (teamIds.length % 2 === 1) teamIds.push(0);
    const rounds = [];
    const count = teamIds.length;
    const half = count / 2;
    const current = teamIds.slice();
    for (let round = 1; round < count; round += 1) {
      const matches = [];
      for (let i = 0; i < half; i += 1) {
        const homeTeamId = current[i];
        const awayTeamId = current[count - 1 - i];
        if (homeTeamId && awayTeamId) matches.push({ homeTeamId, awayTeamId });
      }
      rounds.push({ round, matches });
      const item = current.pop();
      current.splice(1, 0, item);
    }
    return rounds;
  }

  function pickEntrant(entrants, index) {
    if (!entrants.length) return null;
    return entrants[((index % entrants.length) + entrants.length) % entrants.length];
  }

  function teamRegion(state, team) {
    const country = state.countries.find((item) => item.Code === team.CountryCode);
    return country?.Region || team.Region || "Other";
  }

  function standingRows(state, leagueId, seasonId = null) {
    const season = seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) : currentSeason(state);
    const teams = state.teams.filter((team) => team.LeagueId === Number(leagueId));
    const rows = teams.map((team) => ({
      teamId: team.Id,
      teamName: team.Name,
      shortName: team.ShortName,
      color: team.PrimaryColor,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0
    }));
    const byTeam = new Map(rows.map((row) => [row.teamId, row]));
    for (const match of state.matches.filter((item) => item.SeasonId === season.Id && item.LeagueId === Number(leagueId) && item.CompetitionGroup === "League" && item.Played)) {
      const home = byTeam.get(match.HomeTeamId);
      const away = byTeam.get(match.AwayTeamId);
      if (!home || !away) continue;
      home.played += 1;
      away.played += 1;
      home.goalsFor += match.HomeGoals;
      home.goalsAgainst += match.AwayGoals;
      away.goalsFor += match.AwayGoals;
      away.goalsAgainst += match.HomeGoals;
      if (match.HomeGoals > match.AwayGoals) {
        home.wins += 1;
        home.points += 3;
        away.losses += 1;
      } else if (match.HomeGoals < match.AwayGoals) {
        away.wins += 1;
        away.points += 3;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    }
    rows.forEach((row) => {
      row.goalDifference = row.goalsFor - row.goalsAgainst;
    });
    rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName, "ja"));
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
    return rows;
  }

  function matchRows(state, filter = () => true, options = {}) {
    const rows = state.matches.filter(filter);
    if (options.sort === "competition") {
      rows.sort((a, b) => String(a.CompetitionCode || "").localeCompare(String(b.CompetitionCode || ""))
        || number(a.CompetitionRound) - number(b.CompetitionRound)
        || number(a.Round) - number(b.Round)
        || number(a.Id) - number(b.Id));
    }
    return rows.map((match) => matchDto(state, match, options));
  }

  function hydrateMatch(state, match) {
    const home = findTeam(state, match.HomeTeamId) || {};
    const away = findTeam(state, match.AwayTeamId) || {};
    return {
      ...match,
      HomeTeam: home.Name || match.HomeTeam || "",
      AwayTeam: away.Name || match.AwayTeam || "",
      HomeShort: home.ShortName || match.HomeShort || "",
      AwayShort: away.ShortName || match.AwayShort || "",
      HomeColor: home.PrimaryColor || match.HomeColor || "#78909c",
      AwayColor: away.PrimaryColor || match.AwayColor || "#78909c",
      HomeFormation: home.Formation || match.HomeFormation || "",
      AwayFormation: away.Formation || match.AwayFormation || "",
      HomeTactic: home.Tactic || match.HomeTactic || "",
      AwayTactic: away.Tactic || match.AwayTactic || ""
    };
  }

  function matchDto(state, match, options = {}) {
    const row = hydrateMatch(state, match);
    const dto = {
      Id: row.Id,
      Round: options.includeGlobalRound ? row.CompetitionRound : row.Round,
      CompetitionRound: row.CompetitionRound,
      StageName: row.StageName,
      CompetitionGroup: row.CompetitionGroup,
      CompetitionCode: row.CompetitionCode,
      Played: row.Played,
      HomeGoals: row.HomeGoals,
      AwayGoals: row.AwayGoals,
      WinnerTeamId: row.WinnerTeamId,
      DecidedBy: row.DecidedBy,
      HomeTeamId: row.HomeTeamId,
      HomeTeam: row.HomeTeam,
      HomeShort: row.HomeShort,
      HomeColor: row.HomeColor,
      AwayTeamId: row.AwayTeamId,
      AwayTeam: row.AwayTeam,
      AwayShort: row.AwayShort,
      AwayColor: row.AwayColor
    };
    if (options.includeGlobalRound) dto.GlobalRound = row.GlobalRound;
    if (options.includeLeagueCode) dto.LeagueCode = row.LeagueCode || (row.CompetitionGroup === "National" ? "NAT" : "");
    return dto;
  }

  function advanceMatchDto(state, match) {
    const row = hydrateMatch(state, match);
    return {
      id: row.Id,
      round: row.Round,
      homeTeam: row.HomeShort || row.HomeTeam,
      awayTeam: row.AwayShort || row.AwayTeam,
      homeGoals: row.HomeGoals,
      awayGoals: row.AwayGoals,
      competitionGroup: row.CompetitionGroup,
      competitionCode: row.CompetitionCode,
      stageName: row.StageName,
      winnerTeamId: row.WinnerTeamId,
      decidedBy: row.DecidedBy
    };
  }

  function allTeams(state) {
    return [...state.teams, ...(state.nationalTeams || [])];
  }

  function findTeam(state, teamId) {
    return allTeams(state).find((team) => team.Id === Number(teamId));
  }

  function topPlayers(state, leagueId, key) {
    const teamIds = new Set(state.teams.filter((team) => team.LeagueId === Number(leagueId)).map((team) => team.Id));
    return state.players
      .filter((player) => teamIds.has(player.TeamId) && number(player[key]) > 0)
      .sort((a, b) => number(b[key]) - number(a[key]) || number(b.Rating) - number(a.Rating))
      .slice(0, 10);
  }

  function rosterForTeam(state, teamId) {
    return state.players
      .filter((player) => player.TeamId === Number(teamId))
      .slice()
      .sort((a, b) => positionOrder(a.PrimaryPosition) - positionOrder(b.PrimaryPosition) || sqliteTextCompare(a.Name, b.Name))
      .map((player) => ({
      ...player,
      Team: player.TeamName,
      TeamShort: player.TeamShort,
      passesPer90: per90(player, "PassAttempts"),
      shotsPer90: per90(player, "Shots"),
      shotsOnTargetPer90: per90(player, "ShotsOnTarget"),
      keyPassesPer90: per90(player, "KeyPasses"),
      dribblesPer90: per90(player, "Dribbles"),
      crossesPer90: per90(player, "Crosses"),
      tacklesPer90: per90(player, "Tackles"),
      interceptionsPer90: per90(player, "Interceptions"),
      aerialsWonPer90: per90(player, "AerialsWon"),
      foulsPer90: per90(player, "Fouls"),
      savesPer90: per90(player, "Saves"),
      passRate: rate(player.PassesCompleted, player.PassAttempts),
      tackleRate: rate(player.Tackles, player.TackleAttempts),
      aerialRate: rate(player.AerialsWon, player.AerialAttempts),
      saveRate: rate(player.Saves, player.SaveAttempts)
    }));
  }

  function positionOrder(position) {
    const order = {
      GK: 1,
      CB: 2,
      RB: 3,
      LB: 4,
      RWB: 5,
      LWB: 6,
      DM: 7,
      CM: 8,
      AM: 9,
      RM: 10,
      LM: 11,
      RW: 12,
      LW: 13,
      SS: 14,
      CF: 15,
      ST: 16
    };
    return order[position] || 17;
  }

  function per90(row, key) {
    return row.Minutes ? row[key] * 90 / row.Minutes : 0;
  }

  function rate(done, attempts) {
    return attempts ? done * 100 / attempts : 0;
  }

  function simulateMatch(state, match) {
    if (match.Played) return;
    const home = findTeam(state, match.HomeTeamId);
    const away = findTeam(state, match.AwayTeamId);
    if (!home || !away) return;
    const rng = random(match.Id * 97 + currentSeason(state).Year);
    const homeExpected = Math.max(0.2, 1.35 + (home.Rating - away.Rating) / 28 + rng() * 0.7);
    const awayExpected = Math.max(0.2, 1.05 + (away.Rating - home.Rating) / 32 + rng() * 0.7);
    match.HomeGoals = goalsFromExpected(homeExpected, rng);
    match.AwayGoals = goalsFromExpected(awayExpected, rng);
    match.Played = 1;
    match.WinnerTeamId = match.HomeGoals > match.AwayGoals ? home.Id : match.AwayGoals > match.HomeGoals ? away.Id : null;
    match.DecidedBy = "";
    if (match.CompetitionGroup !== "League") {
      if (match.WinnerTeamId) {
        match.DecidedBy = "90min";
      } else {
        match.WinnerTeamId = rng() < 0.5 ? home.Id : away.Id;
        match.DecidedBy = "PK";
      }
    }
    updatePlayerStats(state, home.Id, match.HomeGoals, match.AwayGoals, rng);
    updatePlayerStats(state, away.Id, match.AwayGoals, match.HomeGoals, rng);
  }

  function goalsFromExpected(expected, rng) {
    let goals = 0;
    let threshold = expected;
    while (threshold > 0) {
      if (rng() < Math.min(0.72, threshold / 2.4)) goals += 1;
      threshold -= 0.95;
    }
    return Math.min(7, goals);
  }

  function updatePlayerStats(state, teamId, goalsFor, goalsAgainst, rng) {
    const roster = state.players.filter((player) => player.TeamId === teamId);
    if (roster.length === 0) return;
    const starters = roster.slice(0, 11);
    const scorers = [...starters].sort(() => rng() - 0.5);
    starters.forEach((player, index) => {
      player.Apps += 1;
      player.Starts += 1;
      player.Minutes += 90;
      player.RatingMatches += 1;
      const rating = 6 + rng() * 1.4 + goalsFor * 0.12 - goalsAgainst * 0.08 + (player.Rating - 60) / 100;
      player.RatingTotal += rating;
      player.AvgRating = player.RatingTotal / player.RatingMatches;
      player.PassAttempts += 18 + Math.floor(rng() * 40);
      player.PassesCompleted += Math.floor(player.PassAttempts * (0.72 + rng() * 0.18));
      player.Shots += index >= 6 ? Math.floor(rng() * 4) : Math.floor(rng() * 2);
      player.ShotsOnTarget += Math.min(player.Shots, Math.floor(rng() * 3));
      player.KeyPasses += Math.floor(rng() * 3);
      player.Dribbles += Math.floor(rng() * 4);
      player.Crosses += Math.floor(rng() * 4);
      player.TackleAttempts += Math.floor(rng() * 5);
      player.Tackles += Math.floor(player.TackleAttempts * (0.45 + rng() * 0.35));
      player.Interceptions += Math.floor(rng() * 4);
      player.AerialAttempts += Math.floor(rng() * 5);
      player.AerialsWon += Math.floor(player.AerialAttempts * (0.4 + rng() * 0.35));
      player.Fouls += Math.floor(rng() * 3);
      if (player.PrimaryPosition === "GK") {
        player.SaveAttempts += goalsAgainst + Math.floor(rng() * 5);
        player.Saves += Math.max(0, player.SaveAttempts - goalsAgainst);
        player.GoalsAgainst += goalsAgainst;
      }
    });
    for (let i = 0; i < goalsFor; i += 1) {
      scorers[i % scorers.length].Goals += 1;
      scorers[(i + 3) % scorers.length].Assists += rng() > 0.2 ? 1 : 0;
    }
  }

  function maybeCompleteSeason(state, season) {
    const remaining = state.matches.some((match) => match.SeasonId === season.Id && !match.Played);
    season.IsSeasonComplete = !remaining;
    if (!remaining) season.CurrentRound = season.MaxRound;
  }

  async function getState() {
    const existing = await readState();
    if (existing && existing.version === saveVersion) return existing;
    const state = await createInitialState();
    await writeState(state);
    return state;
  }

  async function handle(action, payload = {}, options = {}) {
    const state = await getState();
    const season = currentSeason(state);
    switch (action) {
      case "getDashboard":
        return dashboard(state);
      case "getLeague":
        return leagueView(state, payload.leagueId, payload.seasonId);
      case "getTeam":
        return teamView(state, payload.teamId, payload.seasonId, payload.statsScope);
      case "getPlayer":
        return playerView(state, payload.playerId, payload.seasonId, payload.statsScope);
      case "getPlayerAchievements":
        return { achievements: [] };
      case "getMatch":
        return matchView(state, payload.matchId);
      case "getSeasonArchive":
        return seasonArchiveView(state);
      case "getAnnualAwards":
        return annualAwardsView(state, payload.scopeCode || "World");
      case "getTransfers":
        return { season: seasonDto(season), seasons: state.seasons.map(seasonOptionDto), transfers: state.transfers };
      case "getCups":
        return competitionList(state, "Cup", payload.seasonId);
      case "getContinentalCompetitions":
        return competitionList(state, "Continental", payload.seasonId);
      case "getNationalCompetitions":
        return competitionList(state, "National", payload.seasonId);
      case "getCup":
        return competitionView(state, "Cup", payload.competitionCode, payload.seasonId);
      case "getContinentalCompetition":
        return competitionView(state, "Continental", payload.competitionCode, payload.seasonId);
      case "getNationalCompetition":
        return competitionView(state, "National", payload.competitionCode, payload.seasonId);
      case "search":
        return search(state, payload.keyword || "");
      case "getTeamSettings":
        return settingsView(state);
      case "saveTeamSettings":
        saveSettings(state, payload);
        await writeState(state);
        return settingsView(state);
      case "advanceRound":
        {
        const csharpAdvanceStep = number(state.csharpAdvanceStep, 0) + 1;
        const csharpRoundResults = await loadCSharpRoundResult(csharpAdvanceStep);
        const round = number(csharpRoundResults?.round, nextUnplayedRound(state, season, season.CurrentRound) || season.CurrentRound);
        state.csharpRoundResults = csharpRoundResults || state.csharpRoundResults;
        const simulatedCount = simulateRound(state, season, round, options.onProgress);
        const matches = roundSimulationMatches(state, season.Id, round).map((match) => advanceMatchDto(state, match));
        maybeCompleteSeason(state, season);
        season.CurrentRound = nextUnplayedRound(state, season, round + 1) || ((season.MaxRound || round) + 1);
        const csharpStateAfterRound = await loadCSharpStateAfterRound(csharpAdvanceStep);
        if (csharpStateAfterRound) {
          Object.assign(state, {
            ...csharpStateAfterRound,
            csharpRoundResults: state.csharpRoundResults,
            csharpAdvanceStep
          });
        } else {
          state.csharpAdvanceStep = csharpAdvanceStep;
        }
        await writeState(state);
        return {
          seasonId: season.Id,
          year: season.Year,
          round,
          simulatedCount,
          matches,
          seasonEnded: season.IsSeasonComplete,
          pendingYearUpdate: false,
          nextSeason: null
        };
        }
      case "advanceToRound":
        {
        let simulatedCount = 0;
        for (let round = season.CurrentRound; round <= number(payload.targetRound, season.CurrentRound); round += 1) {
          simulatedCount += simulateRound(state, season, round, options.onProgress);
        }
        season.CurrentRound = Math.min(number(payload.targetRound, season.CurrentRound) + 1, season.MaxRound);
        maybeCompleteSeason(state, season);
        await writeState(state);
        return { year: season.Year, targetRound: payload.targetRound, seasonId: season.Id, simulatedCount };
        }
      case "advanceToSeasonEnd":
        {
        let simulatedCount = 0;
        for (let round = season.CurrentRound; round <= season.MaxRound; round += 1) {
          simulatedCount += simulateRound(state, season, round, options.onProgress);
        }
        maybeCompleteSeason(state, season);
        await writeState(state);
        return { year: season.Year, simulatedCount };
        }
      case "skipSeasons":
        skipSeasons(state, number(payload.seasonCount, 1), options.onProgress);
        await writeState(state);
        return { fromYear: season.Year, toYear: currentSeason(state).Year, completedSeasons: number(payload.seasonCount, 1), simulatedCount: 0 };
      case "fullReset": {
        const fresh = await createInitialState();
        await writeState(fresh);
        return dashboard(fresh);
      }
      case "importWorldCsv":
        return dashboard(state);
      default:
        throw new Error(`LocalApi does not support action: ${action}`);
    }
  }

  function dashboard(state) {
    const season = currentSeason(state);
    const nextMatches = roundMatchRows(state, season.Id, season.CurrentRound, false).slice(0, 24);
    const recentMatches = roundMatchRows(state, season.Id, Math.max(1, season.CurrentRound - 1), true).slice(0, 24);
    const seasonDto = dashboardSeasonDto(season);
    return {
      season: seasonDto,
      totals: {
        teams: state.teams.length,
        countries: state.countries.length,
        players: state.players.length,
        matches: state.matches.filter((match) => match.SeasonId === season.Id).length,
        played: state.matches.filter((match) => match.SeasonId === season.Id && match.Played).length,
        remaining: state.matches.filter((match) => match.SeasonId === season.Id && !match.Played).length,
        maxRound: season.MaxRound
      },
      leagues: state.leagues.map((league) => ({
        ...leagueSummaryDto(league),
        standings: standingRows(state, league.Id, season.Id).slice(0, 6)
      })),
      nextMatches,
      recentMatches,
      nationalTeams: (state.nationalTeams || [])
        .filter((team) => team.NationalTeamKind === "Full")
        .map((team) => nationalTeamDto(state, team))
    };
  }

  function roundMatchRows(state, seasonId, round, played) {
    return state.matches
      .filter((match) => match.SeasonId === seasonId && match.Round === round && Boolean(match.Played) === played)
      .sort((a, b) => String(a.CompetitionGroup).localeCompare(String(b.CompetitionGroup))
        || leagueLevel(state, a.LeagueId) - leagueLevel(state, b.LeagueId)
        || a.Id - b.Id)
      .map((match) => matchDto(state, match, { includeLeagueCode: true }));
  }

  function nationalTeamDto(state, team) {
    const country = state.countries.find((item) => item.Code === team.NationalCountryCode || item.Code === team.CountryCode) || {};
    return {
      Id: team.Id,
      Name: team.Name,
      ShortName: team.ShortName,
      PrimaryColor: team.PrimaryColor,
      Rating: team.Rating,
      NationalCountryCode: team.NationalCountryCode || team.CountryCode,
      CountryName: country.Name || team.CountryName || team.ShortName,
      CountryShortName: country.ShortName || country.Name || team.CountryShortName || team.ShortName,
      Region: country.Region || team.Region
    };
  }

  function leagueSummaryDto(league) {
    return {
      id: league.Id,
      code: league.Code,
      name: league.Name,
      level: league.Level,
      countryCode: league.CountryCode,
      countryName: league.CountryName,
      region: league.Region
    };
  }

  function leagueDto(league) {
    return {
      Id: league.Id,
      Code: league.Code,
      Name: league.Name,
      Level: league.Level,
      CountryCode: league.CountryCode,
      CountryName: league.CountryName
    };
  }

  function simpleTeamDto(team) {
    return {
      Id: team.Id,
      Name: team.Name,
      ShortName: team.ShortName,
      Prefecture: team.Prefecture || "",
      PrimaryColor: team.PrimaryColor,
      Formation: team.Formation,
      Tactic: team.Tactic,
      Rating: team.Rating
    };
  }

  function leagueView(state, leagueId, seasonId = null) {
    const season = seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state);
    const league = state.leagues.find((item) => item.Id === Number(leagueId)) || state.leagues[0];
    return {
      league: leagueDto(league),
      season: seasonDto(season),
      seasons: state.seasons.map(seasonOptionDto),
      standings: standingRows(state, league.Id, season.Id),
      fixtures: matchRows(state, (match) => match.SeasonId === season.Id && match.LeagueId === league.Id && match.CompetitionGroup === "League", { includeGlobalRound: true }),
      teams: state.teams
        .filter((team) => team.LeagueId === league.Id)
        .slice()
        .sort((a, b) => sqliteTextCompare(a.Name, b.Name))
        .map(simpleTeamDto),
      topScorers: [],
      topAssists: [],
      topRatings: [],
      detailStatRankings: emptyDetailStatRankings(),
      detailStatRows: [],
      detailMinimumMinutes: 1000,
      bestEleven: { formation: "4-3-3", completed: false, players: [] }
    };
  }

  function emptyDetailStatRankings() {
    const stats = ["Shots", "ShotsOnTarget", "KeyPasses", "Dribbles", "Crosses", "Passes", "PassSuccessRate", "Tackles", "TackleSuccessRate", "Interceptions", "AerialsWon", "AerialWinRate", "Fouls", "Saves", "SaveRate"];
    const positions = ["GK", "CB", "SB", "CMFDMF", "AMF", "WG", "FW"];
    const rows = {};
    stats.forEach((stat) => {
      rows[stat] = [];
      positions.forEach((position) => {
        rows[`${stat}:${position}`] = [];
      });
    });
    return rows;
  }

  function buildLeagueBestEleven(state, leagueId) {
    const teamIds = new Set(state.teams.filter((team) => team.LeagueId === leagueId).map((team) => team.Id));
    return state.players
      .filter((player) => teamIds.has(player.TeamId))
      .sort((a, b) => number(b.Rating) - number(a.Rating))
      .slice(0, 11)
      .map((player, index) => ({ ...player, positionOrder: index + 1, IsStarter: 1, Starter: 1 }));
  }

  function teamView(state, teamId, seasonId = null, statsScope = "League") {
    const team = state.teams.find((item) => item.Id === Number(teamId)) || state.teams[0];
    const season = seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state);
    const standings = standingRows(state, team.LeagueId, season.Id);
    const roster = rosterForTeam(state, team.Id);
    const displayLeagueId = seasonLeagueIdForTeam(state, season.Id, team.Id) || team.LeagueId;
    const budget = teamBudget(state, team, season);
    return {
      team: teamDetailDto(team),
      season: seasonDto(season),
      seasons: state.seasons.map(seasonOptionDto),
      statsScope: statsScope || "League",
      leagueTeams: seasonLeagueTeams(state, season.Id, displayLeagueId),
      roster: roster.map(rosterPlayerDto),
      fixtures: matchRows(state, (match) => match.SeasonId === season.Id && match.CompetitionGroup === "League" && (match.HomeTeamId === team.Id || match.AwayTeamId === team.Id), { includeLeagueCode: true }),
      transfers: [],
      budget,
      seasonStanding: teamSeasonStandingDto(state, team, standings.find((row) => row.teamId === team.Id)),
      bestLineup: { formation: team.Formation, players: buildBestLineup(state, team, season, statsScope || "League", roster) }
    };
  }

  function teamSeasonStandingDto(state, team, row) {
    const league = state.leagues.find((item) => item.Id === team.LeagueId) || {};
    return {
      leagueId: team.LeagueId,
      leagueCode: team.LeagueCode || league.Code,
      leagueName: team.LeagueName || league.Name,
      rank: row?.rank || 0,
      teamCount: state.teams.filter((item) => item.LeagueId === team.LeagueId).length,
      points: row?.points || 0,
      played: row?.played || 0
    };
  }

  function teamDetailDto(team) {
    return {
      Id: team.Id,
      LeagueId: team.LeagueId,
      Name: team.Name,
      ShortName: team.ShortName,
      Prefecture: team.Prefecture || "",
      PrimaryColor: team.PrimaryColor,
      SecondaryColor: team.SecondaryColor || team.PrimaryColor,
      Formation: team.Formation,
      Tactic: team.Tactic,
      Rating: team.Rating,
      DevelopmentPower: team.DevelopmentPower,
      YouthPower: team.YouthPower,
      SponsorPower: team.SponsorPower,
      IsNationalTeam: team.IsNationalTeam || 0,
      NationalCountryCode: team.NationalCountryCode || null,
      NationalTeamKind: team.NationalTeamKind || "Full",
      DisplayLeagueId: team.DisplayLeagueId || team.LeagueId,
      LeagueName: team.LeagueName,
      LeagueCode: team.LeagueCode
    };
  }

  function rosterPlayerDto(player) {
    return {
      Id: player.Id,
      TeamId: player.TeamId,
      Name: player.Name,
      Age: player.Age,
      BirthYear: player.BirthYear || (2026 - player.Age),
      Nationality: player.Nationality,
      NationalityCode: player.NationalityCode,
      IsForeign: player.IsForeign || 0,
      PrimaryPosition: player.PrimaryPosition,
      Overall: player.Overall || player.Rating,
      Shooting: player.Shooting || player.Rating,
      Passing: player.Passing || player.Rating,
      Dribbling: player.Dribbling || player.Rating,
      Defense: player.Defense || player.Rating,
      Saving: player.Saving || player.Rating,
      Speed: player.Speed || player.Rating,
      Stamina: player.Stamina || player.Rating,
      Physical: player.Physical || player.Rating,
      Decision: player.Decision || player.Rating,
      Mental: player.Mental || player.Rating,
      Fatigue: player.Fatigue || 0,
      GrowthSeed: player.GrowthSeed || 0,
      DevelopmentType: player.DevelopmentType || "",
      Retired: player.Retired || 0,
      Apps: player.Apps,
      Starts: player.Starts,
      SubstituteApps: player.SubstituteApps,
      Goals: player.Goals,
      Assists: player.Assists,
      Minutes: player.Minutes,
      AvgRating: player.AvgRating,
      UsedPosition: player.UsedPosition,
      ShirtNumber: player.ShirtNumber
    };
  }

  function seasonLeagueIdForTeam(state, seasonId, teamId) {
    const match = state.matches.find((item) => item.SeasonId === seasonId && item.CompetitionGroup === "League" && (item.HomeTeamId === teamId || item.AwayTeamId === teamId));
    return match?.LeagueId || null;
  }

  function seasonLeagueTeams(state, seasonId, leagueId) {
    const teamIds = new Set();
    state.matches
      .filter((match) => match.SeasonId === seasonId && match.LeagueId === leagueId && match.CompetitionGroup === "League")
      .forEach((match) => {
        teamIds.add(match.HomeTeamId);
        teamIds.add(match.AwayTeamId);
      });
    const source = teamIds.size
      ? state.teams.filter((team) => teamIds.has(team.Id))
      : state.teams.filter((team) => team.LeagueId === leagueId && number(team.IsNationalTeam, 0) === 0);
    return source.slice().sort((a, b) => sqliteTextCompare(a.Name, b.Name)).map(simpleTeamDto);
  }

  function teamBudget(state, team, season) {
    const budgetRow = (state.clubBudgets || []).find((row) => number(row.SeasonId) === number(season.Id) && number(row.TeamId) === number(team.Id));
    if (budgetRow) {
      const income = (state.transfers || [])
        .filter((row) => number(row.SeasonId) === number(season.Id) && number(row.FromTeamId) === number(team.Id) && number(row.ToTeamId, 0) !== 0)
        .reduce((sum, row) => {
          const route = row.MarketRoute || "";
          const fee = number(row.Fee);
          const value = route === "OffList" ? Math.round(fee * 0.75) : route === "Listed" ? Math.round(fee * 0.5) : Math.trunc(fee / 2);
          return sum + value;
        }, 0);
      const spending = (state.transfers || [])
        .filter((row) => number(row.SeasonId) === number(season.Id) && number(row.ToTeamId) === number(team.Id))
        .reduce((sum, row) => sum + ((row.MarketRoute || "") === "OffList" ? Math.round(number(row.Fee) * 1.25) : number(row.Fee)), 0);
      return {
        Budget: number(budgetRow.Budget),
        Income: income,
        Spending: spending,
        Balance: income - spending,
        InitialBudget: number(budgetRow.InitialBudget),
        BaseBudget: number(budgetRow.BaseBudget),
        PerformanceBudget: number(budgetRow.PerformanceBudget),
        CarryoverBudget: number(budgetRow.CarryoverBudget),
        Strategy: budgetRow.Strategy || ""
      };
    }
    const base = Math.max(1000, Math.round(number(team.SponsorPower, 100) * 500 + number(team.Rating, 60) * 150));
    return {
      BaseBudget: base,
      InitialBudget: base,
      Budget: base,
      CarryoverBudget: 0,
      Income: 0,
      Spending: 0,
      PerformanceBudget: 0,
      Balance: base,
      Strategy: "即戦力"
    };
  }

  function formationSlots(formation) {
    switch (formation) {
      case "4-4-2":
        return ["GK", "RB", "CB", "CB", "LB", "RW", "CM", "CM", "LW", "CF", "ST"];
      case "4-3-3":
        return ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "LW", "CF"];
      case "3-4-2-1":
        return ["GK", "CB", "CB", "CB", "RWB", "CM", "CM", "LWB", "AM", "ST", "CF"];
      case "3-5-2":
        return ["GK", "CB", "CB", "CB", "RWB", "CM", "CM", "CM", "LWB", "CF", "ST"];
      default:
        return ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "RW", "AM", "LW", "CF"];
    }
  }

  function playerFitFor(fitsByPlayer, player, position) {
    const fit = fitsByPlayer.get(player.Id)?.get(position);
    if (fit != null) return fit;
    return player.PrimaryPosition === position ? 100 : 0;
  }

  function compareLineupCandidate(a, b) {
    return number(b.Appearance?.Minutes) - number(a.Appearance?.Minutes)
      || number(b.Appearance?.Apps) - number(a.Appearance?.Apps)
      || number(b.Row?.Starts) - number(a.Row?.Starts)
      || number(b.Fit) - number(a.Fit)
      || number(b.Row?.AvgRating) - number(a.Row?.AvgRating)
      || number(b.Row?.Apps) - number(a.Row?.Apps);
  }

  function buildBestLineup(state, team, season, competitionGroup, roster) {
    if (!state.playerPositionFits?.length) {
      return buildFallbackBestLineup(roster);
    }
    const seasonId = number(season.Id, 1);
    const seasonYear = number(season.Year, 2026);
    const teamId = number(team.Id);
    const isNational = number(team.IsNationalTeam, 0) === 1;
    const statsRows = state.playerSeasonStats || [];
    const statsByPlayer = new Map(statsRows
      .filter((row) => number(row.SeasonId) === seasonId && number(row.TeamId) === teamId && row.CompetitionGroup === competitionGroup)
      .map((row) => [number(row.PlayerId), row]));
    const shirtByPlayer = new Map((state.seasonShirtNumbers || [])
      .filter((row) => number(row.SeasonId) === seasonId && number(row.TeamId) === teamId)
      .map((row) => [number(row.PlayerId), number(row.ShirtNumber)]));
    const selectedIds = isNational
      ? new Set((state.nationalTeamSelections || [])
        .filter((row) => number(row.SeasonId) === seasonId && number(row.TeamId) === teamId)
        .map((row) => number(row.PlayerId)))
      : new Set((state.contracts || [])
        .filter((row) => number(row.TeamId) === teamId && number(row.StartYear) <= seasonYear && number(row.EndYear) >= seasonYear)
        .map((row) => number(row.PlayerId)));
    const players = state.players
      .filter((player) => selectedIds.has(number(player.Id)) && number(player.Retired, 0) === 0)
      .map((player) => {
        const stats = statsByPlayer.get(number(player.Id)) || {};
        return {
          ...player,
          Apps: number(stats.Apps, 0),
          Starts: number(stats.Starts, 0),
          Goals: number(stats.Goals, 0),
          Assists: number(stats.Assists, 0),
          AvgRating: number(stats.AvgRating, 0),
          ShirtNumber: shirtByPlayer.get(number(player.Id)) ?? number(player.ShirtNumber, 0)
        };
      });
    const playerIds = new Set(players.map((player) => number(player.Id)));
    const fitsByPlayer = new Map();
    for (const row of state.playerPositionFits || []) {
      const playerId = number(row.PlayerId);
      if (!playerIds.has(playerId)) continue;
      if (!fitsByPlayer.has(playerId)) fitsByPlayer.set(playerId, new Map());
      fitsByPlayer.get(playerId).set(row.Position || "", number(row.Fit));
    }
    const appearances = new Map();
    for (const row of state.playerPositionSeasonStats || []) {
      if (number(row.SeasonId) !== seasonId || number(row.TeamId) !== teamId || row.CompetitionGroup !== competitionGroup || number(row.Minutes) <= 0 || !row.Position) continue;
      const playerId = number(row.PlayerId);
      if (!appearances.has(playerId)) appearances.set(playerId, new Map());
      appearances.get(playerId).set(row.Position, { Apps: number(row.Apps), Minutes: number(row.Minutes) });
    }
    const slots = formationSlots(team.Formation)
      .map((position, index) => ({
        Position: position,
        Index: index,
        CandidateCount: players.filter((player) => playerFitFor(fitsByPlayer, player, position) > 0).length
      }))
      .sort((a, b) => a.CandidateCount - b.CandidateCount || a.Index - b.Index);
    const used = new Set();
    const starters = [];
    for (const slot of slots) {
      const selected = players
        .filter((player) => !used.has(number(player.Id)))
        .map((player) => ({
          Row: player,
          Fit: playerFitFor(fitsByPlayer, player, slot.Position),
          Appearance: appearances.get(number(player.Id))?.get(slot.Position) || { Apps: 0, Minutes: 0 }
        }))
        .filter((item) => item.Fit > 0)
        .sort(compareLineupCandidate)[0];
      if (!selected) continue;
      used.add(number(selected.Row.Id));
      starters.push({
        PlayerId: number(selected.Row.Id),
        PlayerName: selected.Row.Name,
        PrimaryPosition: selected.Row.PrimaryPosition,
        Position: slot.Position,
        IsStarter: 1,
        ShirtNumber: number(selected.Row.ShirtNumber),
        Starts: number(selected.Row.Starts),
        Apps: number(selected.Row.Apps),
        Goals: number(selected.Row.Goals),
        Assists: number(selected.Row.Assists),
        AvgRating: number(selected.Row.AvgRating)
      });
    }
    const newArrivalIds = isNational
      ? new Set()
      : new Set((state.transfers || [])
        .filter((row) => number(row.SeasonId) === seasonId && number(row.ToTeamId) === teamId)
        .map((row) => number(row.PlayerId)));
    for (const starter of starters) {
      starter.IsNewArrival = newArrivalIds.has(number(starter.PlayerId)) ? 1 : 0;
      const bench = players
        .filter((player) => !used.has(number(player.Id)))
        .map((player) => ({
          Row: player,
          Fit: playerFitFor(fitsByPlayer, player, starter.Position),
          Appearance: appearances.get(number(player.Id))?.get(starter.Position) || { Apps: 0, Minutes: 0 }
        }))
        .filter((item) => item.Fit > 0)
        .sort(compareLineupCandidate)
        .slice(0, 2);
      bench.forEach((item, index) => {
        const prefix = `Bench${index + 1}`;
        starter[`${prefix}PlayerId`] = number(item.Row.Id);
        starter[`${prefix}PlayerName`] = item.Row.Name;
        starter[`${prefix}PrimaryPosition`] = item.Row.PrimaryPosition;
        starter[`${prefix}ShirtNumber`] = number(item.Row.ShirtNumber);
        starter[`${prefix}AvgRating`] = number(item.Row.AvgRating);
        starter[`${prefix}IsNewArrival`] = newArrivalIds.has(number(item.Row.Id)) ? 1 : 0;
      });
    }
    return starters;
  }

  function buildFallbackBestLineup(roster) {
    const sorted = roster
      .slice()
      .sort((a, b) => number(b.Rating) - number(a.Rating))
      .slice(0, 22);
    return sorted.slice(0, 11).map((player, index) => {
      const bench = sorted[index + 11] || {};
      const row = {
        PlayerId: player.Id,
        PlayerName: player.Name,
        PrimaryPosition: player.PrimaryPosition,
        Position: player.UsedPosition || player.PrimaryPosition,
        IsStarter: 1,
        ShirtNumber: player.ShirtNumber,
        Starts: player.Starts,
        Apps: player.Apps,
        Goals: player.Goals,
        Assists: player.Assists,
        AvgRating: player.AvgRating,
        IsNewArrival: player.IsNewArrival || 0,
        Bench1PlayerId: bench.Id || 0,
        Bench1PlayerName: bench.Name || "",
        Bench1PrimaryPosition: bench.PrimaryPosition || "",
        Bench1ShirtNumber: bench.ShirtNumber || 0,
        Bench1AvgRating: bench.AvgRating || 0,
        Bench1IsNewArrival: bench.IsNewArrival || 0
      };
      if (index > 0) {
        const bench2 = sorted[index + 18] || {};
        row.Bench2PlayerId = bench2.Id || 0;
        row.Bench2PlayerName = bench2.Name || "";
        row.Bench2PrimaryPosition = bench2.PrimaryPosition || "";
        row.Bench2ShirtNumber = bench2.ShirtNumber || 0;
        row.Bench2AvgRating = bench2.AvgRating || 0;
        row.Bench2IsNewArrival = bench2.IsNewArrival || 0;
      }
      return row;
    });
  }

  function playerView(state, playerId, seasonId = null, statsScope = "League") {
    const player = state.players.find((item) => item.Id === Number(playerId)) || state.players[0];
    const team = state.teams.find((item) => item.Id === player.TeamId);
    return {
      player: { ...player, TeamId: team.Id, Team: team.Name, TeamShort: team.ShortName, LeagueName: team.LeagueName },
      season: seasonDto(seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state)),
      seasons: state.seasons.map(seasonOptionDto),
      statsScope: statsScope || "League",
      ratings: [],
      detailStats: player,
      achievements: []
    };
  }

  function matchView(state, matchId) {
    const rawMatch = state.matches.find((item) => item.Id === Number(matchId));
    const match = rawMatch ? hydrateMatch(state, rawMatch) : null;
    if (!match) throw new Error("試合が見つかりません。");
    const lineups = [...rosterForTeam(state, match.HomeTeamId).slice(0, 11), ...rosterForTeam(state, match.AwayTeamId).slice(0, 11)]
      .map((player, index) => ({ ...player, TeamId: index < 11 ? match.HomeTeamId : match.AwayTeamId, Starter: 1 }));
    return {
      match,
      lineups,
      events: [],
      ratings: [],
      homeMatchNavigation: {},
      awayMatchNavigation: {}
    };
  }

  function seasonArchiveView(state) {
    return {
      seasons: state.seasons.slice().reverse().map((season) => ({
        season: seasonOptionDto(season),
        champions: state.leagues.slice().sort((a, b) => number(a.Level) - number(b.Level) || number(a.Id) - number(b.Id)).map((league) => ({
          league: league.Code,
          name: league.Name,
          champion: standingRows(state, league.Id, season.Id)[0] || null
        }))
      }))
    };
  }

  function annualAwardsView(state, scopeCode) {
    const season = currentSeason(state);
    const scopeName = scopeCode === "World" ? "世界" : scopeCode;
    return {
      season: seasonDto(season),
      seasons: state.seasons.map(seasonOptionDto),
      award: {
        scopeCode,
        scopeName,
        playerAwardName: "バロンドール",
        playerOfYear: null,
        bestEleven: []
      }
    };
  }

  function seasonById(state, seasonId) {
    return seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state);
  }

  function competitionDefinitions(state, group) {
    return (state.competitionDefinitions || [])
      .filter((item) => item.group === group);
  }

  function competitionList(state, group, seasonId = null) {
    const season = seasonById(state, seasonId);
    const key = group === "Cup" ? "cups" : "competitions";
    const rows = competitionDefinitions(state, group).map((definition) => ({
      code: definition.code,
      label: definition.label,
      matches: matchRows(state, (match) => match.SeasonId === season.Id && match.CompetitionGroup === group && match.CompetitionCode === definition.code, { includeLeagueCode: true, sort: "competition" })
    }));
    return {
      season: seasonDto(season),
      seasons: state.seasons.map(seasonOptionDto),
      [key]: rows
    };
  }

  function competitionView(state, group, code, seasonId = null) {
    const season = seasonById(state, seasonId);
    const definition = competitionDefinitions(state, group).find((item) => item.code === code)
      || { code: code || "", label: code || group, group };
    const fixtures = matchRows(state, (match) => match.SeasonId === season.Id && match.CompetitionGroup === group && match.CompetitionCode === definition.code, { includeLeagueCode: true, sort: "competition" });
    const teamIds = new Set();
    fixtures.forEach((match) => {
      teamIds.add(match.HomeTeamId);
      teamIds.add(match.AwayTeamId);
    });
    const participants = allTeams(state).filter((team) => teamIds.has(team.Id));
    const cup = {
      code: definition.code,
      id: definition.code,
      label: definition.label,
      name: definition.label,
      group,
      region: definition.region || "",
      countryCode: definition.countryCode || ""
    };
    return {
      cup,
      competition: cup,
      season: seasonDto(season),
      seasons: state.seasons.map(seasonOptionDto),
      participantCount: participants.length,
      fixtures,
      standings: group === "Cup" ? [] : competitionStandings(fixtures, participants),
      teams: participants,
      topScorers: topCompetitionPlayers(state, participants, "Goals"),
      topAssists: topCompetitionPlayers(state, participants, "Assists"),
      topRatings: topCompetitionPlayers(state, participants, "AvgRating"),
      bestEleven: { Formation: "4-2-3-1", formation: "4-2-3-1", completed: false, players: topCompetitionPlayers(state, participants, "Rating").slice(0, 11) },
      detailStatRankings: emptyDetailStatRankings(),
      detailStatRows: [],
      detailMinimumMinutes: 1000
    };
  }

  function competitionStandings(fixtures, participants) {
    const rows = participants.map((team) => ({
      teamId: team.Id,
      teamName: team.Name,
      shortName: team.ShortName,
      color: team.PrimaryColor,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0
    }));
    const byTeam = new Map(rows.map((row) => [row.teamId, row]));
    fixtures.filter((match) => match.Played).forEach((match) => {
      const home = byTeam.get(match.HomeTeamId);
      const away = byTeam.get(match.AwayTeamId);
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.goalsFor += match.HomeGoals;
      home.goalsAgainst += match.AwayGoals;
      away.goalsFor += match.AwayGoals;
      away.goalsAgainst += match.HomeGoals;
      if (match.HomeGoals > match.AwayGoals) {
        home.wins += 1;
        home.points += 3;
        away.losses += 1;
      } else if (match.HomeGoals < match.AwayGoals) {
        away.wins += 1;
        away.points += 3;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });
    rows.forEach((row) => {
      row.goalDifference = row.goalsFor - row.goalsAgainst;
    });
    rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
    return rows;
  }

  function topCompetitionPlayers(state, participants, key) {
    const teamIds = new Set(participants.map((team) => team.Id));
    return state.players
      .filter((player) => teamIds.has(player.TeamId))
      .sort((a, b) => number(b[key]) - number(a[key]) || number(b.Rating) - number(a.Rating))
      .slice(0, 10);
  }

  function emptyCompetition(state, code) {
    return {
      competition: { Code: code || "", Name: code || "Cup" },
      season: seasonDto(currentSeason(state)),
      seasons: state.seasons.map(seasonOptionDto),
      fixtures: [],
      standings: [],
      teams: [],
      topScorers: [],
      topAssists: [],
      topRatings: [],
      bestEleven: { Formation: "4-2-3-1", players: [] },
      detailStatRankings: emptyDetailStatRankings(),
      detailStatRows: [],
      detailMinimumMinutes: 1000
    };
  }

  function search(state, keyword) {
    const word = String(keyword || "").toLowerCase();
    return {
      teams: state.teams
        .filter((team) => `${team.Name} ${team.ShortName}`.toLowerCase().includes(word))
        .slice(0, 20)
        .map((team) => ({
          Id: team.Id,
          Name: team.Name,
          ShortName: team.ShortName,
          LeagueCode: team.LeagueCode,
          LeagueName: team.LeagueName
        })),
      players: state.players
        .filter((player) => player.Name.toLowerCase().includes(word))
        .slice(0, 20)
    };
  }

  function searchCompetitionRow(item) {
    return {
      id: item.code,
      code: item.code,
      name: item.label,
      label: item.label,
      region: item.region || "",
      countryCode: item.countryCode || ""
    };
  }

  function settingsView(state) {
    return {
      teams: state.teams.map((team) => settingsTeamDto(state, team)),
      countries: state.countries.map(settingsCountryDto),
      leagues: state.leagues.map(settingsLeagueDto),
      matchSimulation: {
        ...state.settings,
        activeScoreExpectationDivisor: state.settings.scoreExpectationDivisor,
        activeHomeScoreExpectationBase: state.settings.homeScoreExpectationBase,
        activeAwayScoreExpectationBase: state.settings.awayScoreExpectationBase,
        activeHomeScoreExpectationMinimum: state.settings.homeScoreExpectationMinimum,
        activeAwayScoreExpectationMinimum: state.settings.awayScoreExpectationMinimum,
        activeHomeScoreExpectationMaximum: state.settings.homeScoreExpectationMaximum,
        activeAwayScoreExpectationMaximum: state.settings.awayScoreExpectationMaximum,
        restartRequired: false
      }
    };
  }

  function settingsCountryDto(country) {
    return {
      Code: country.Code,
      Name: country.Name,
      ShortName: country.ShortName,
      Region: country.Region,
      DomesticNationality: country.DomesticNationality,
      DevelopmentPower: country.DevelopmentPower,
      YouthPower: country.YouthPower,
      SponsorPower: country.SponsorPower,
      DomesticPlayerBaseMin: country.DomesticPlayerBaseMin,
      DomesticPlayerBaseMax: country.DomesticPlayerBaseMax
    };
  }

  function nullableNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function settingsLeagueDto(league) {
    return {
      Id: league.Id,
      Code: league.Code,
      Name: league.Name,
      Level: league.Level,
      CountryCode: league.CountryCode,
      CountryName: league.CountryName,
      PromotionSlots: number(league.PromotionSlots, 0),
      RelegationSlots: number(league.RelegationSlots, 0),
      ForeignStarterLimit: nullableNumber(league.ForeignStarterLimit),
      ForeignMatchSquadLimit: nullableNumber(league.ForeignMatchSquadLimit),
      ForeignAcquisitionSeasonLimit: nullableNumber(league.ForeignAcquisitionSeasonLimit)
    };
  }

  function settingsTeamDto(state, team) {
    const country = state.countries.find((item) => item.Code === team.CountryCode) || {};
    const league = state.leagues.find((item) => item.Id === team.LeagueId) || {};
    return {
      id: team.Id,
      name: team.Name,
      shortName: team.ShortName,
      leagueCode: team.LeagueCode,
      leagueName: team.LeagueName,
      level: team.Level ?? league.Level,
      countryCode: team.CountryCode,
      countryName: team.CountryName || country.Name,
      developmentPower: team.DevelopmentPower,
      youthPower: team.YouthPower,
      sponsorPower: team.SponsorPower
    };
  }

  function saveSettings(state, payload) {
    for (const update of payload.teams || []) {
      const team = state.teams.find((item) => item.Id === Number(update.teamId));
      if (!team) continue;
      team.DevelopmentPower = number(update.developmentPower, team.DevelopmentPower);
      team.YouthPower = number(update.youthPower, team.YouthPower);
      team.SponsorPower = number(update.sponsorPower, team.SponsorPower);
    }
    Object.assign(state.settings, {
      scoreExpectationDivisor: number(payload.scoreExpectationDivisor, state.settings.scoreExpectationDivisor),
      homeScoreExpectationBase: number(payload.homeScoreExpectationBase, state.settings.homeScoreExpectationBase),
      awayScoreExpectationBase: number(payload.awayScoreExpectationBase, state.settings.awayScoreExpectationBase),
      homeScoreExpectationMinimum: number(payload.homeScoreExpectationMinimum, state.settings.homeScoreExpectationMinimum),
      awayScoreExpectationMinimum: number(payload.awayScoreExpectationMinimum, state.settings.awayScoreExpectationMinimum),
      homeScoreExpectationMaximum: number(payload.homeScoreExpectationMaximum, state.settings.homeScoreExpectationMaximum),
      awayScoreExpectationMaximum: number(payload.awayScoreExpectationMaximum, state.settings.awayScoreExpectationMaximum)
    });
  }

  function simulateRound(state, season, round, onProgress) {
    const csharpCount = applyCSharpRoundResults(state, season, round, onProgress);
    if (csharpCount != null) return csharpCount;
    const matches = roundSimulationMatches(state, season.Id, round).filter((match) => !match.Played);
    matches.forEach((match, index) => {
      simulateMatch(state, match);
      onProgress?.({ completed: index + 1, total: matches.length, percent: Math.round((index + 1) * 100 / Math.max(1, matches.length)), currentRound: round, maxRound: season.MaxRound });
    });
    return matches.length;
  }

  function applyCSharpRoundResults(state, season, round, onProgress) {
    const result = state.csharpRoundResults;
    if (!result || number(result.seasonId) !== number(season.Id) || number(result.round) !== number(round) || !Array.isArray(result.matches)) return null;
    const byId = new Map(result.matches.map((match) => [number(match.id), match]));
    const matches = roundSimulationMatches(state, season.Id, round).filter((match) => !match.Played && byId.has(number(match.Id)));
    if (!matches.length) return null;
    matches.forEach((match, index) => {
      const source = byId.get(number(match.Id));
      match.HomeGoals = number(source.homeGoals);
      match.AwayGoals = number(source.awayGoals);
      match.WinnerTeamId = source.winnerTeamId == null ? null : number(source.winnerTeamId);
      match.DecidedBy = source.decidedBy || "";
      match.Played = 1;
      onProgress?.({ completed: index + 1, total: matches.length, percent: Math.round((index + 1) * 100 / Math.max(1, matches.length)), currentRound: round, maxRound: season.MaxRound });
    });
    return matches.length;
  }

  function roundSimulationMatches(state, seasonId, round) {
    return state.matches
      .filter((match) => match.SeasonId === seasonId && match.Round === round)
      .slice()
      .sort((a, b) => String(a.CompetitionGroup || "").localeCompare(String(b.CompetitionGroup || ""))
        || number(a.LeagueId) - number(b.LeagueId)
        || number(a.Id) - number(b.Id));
  }

  function nextUnplayedRound(state, season, minRound) {
    const rounds = state.matches
      .filter((match) => match.SeasonId === season.Id && number(match.Round) >= number(minRound) && !match.Played)
      .map((match) => number(match.Round));
    return rounds.length ? Math.min(...rounds) : null;
  }

  function skipSeasons(state, count, onProgress) {
    for (let i = 0; i < count; i += 1) {
      const season = currentSeason(state);
      for (let round = season.CurrentRound; round <= season.MaxRound; round += 1) {
        simulateRound(state, season, round, onProgress);
      }
      season.IsCurrent = 0;
      season.IsSeasonComplete = true;
      const next = { Id: state.seasons.length + 1, Year: season.Year + 1, CurrentRound: 1, MaxRound: 1, IsCurrent: 1, IsSeasonComplete: false };
      state.seasons.push(next);
      generateSchedule(state, next);
    }
  }

  async function exportSave() {
    const state = await getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jleague-sandbox-save-${currentSeason(state).Year}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSave(file) {
    const text = await file.text();
    const state = JSON.parse(text);
    if (!state || state.version !== saveVersion || !Array.isArray(state.teams) || !Array.isArray(state.matches)) {
      throw new Error("対応していないセーブデータです。");
    }
    await writeState(state);
    location.reload();
  }

  function dateStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  async function exportSave() {
    const state = await getState();
    state.exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jleague-sandbox-save-${currentSeason(state).Year}-${dateStamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSave(file) {
    let state;
    try {
      state = JSON.parse(await file.text());
    } catch {
      throw new Error("JSONファイルを読み込めませんでした。");
    }
    if (!state || state.version !== saveVersion || !Array.isArray(state.teams) || !Array.isArray(state.matches)) {
      throw new Error("対応していないセーブデータです。");
    }
    delete state.exportedAt;
    await writeState(state);
    location.reload();
  }

  function installSaveControls() {
    const topActions = document.querySelector(".top-actions");
    if (!topActions || document.querySelector("#localExportButton")) return;
    const importInput = document.createElement("input");
    importInput.id = "localImportInput";
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.hidden = true;
    const importButton = document.createElement("button");
    importButton.id = "localImportButton";
    importButton.className = "small-button";
    importButton.type = "button";
    importButton.textContent = "セーブ読込";
    importButton.title = "JSONセーブデータを読み込む";
    const exportButton = document.createElement("button");
    exportButton.id = "localExportButton";
    exportButton.className = "small-button";
    exportButton.type = "button";
    exportButton.textContent = "セーブ書出";
    exportButton.title = "現在のセーブデータをJSONで保存する";
    topActions.prepend(importInput);
    topActions.prepend(importButton);
    topActions.prepend(exportButton);
    exportButton.addEventListener("click", () => exportSave().catch((error) => alert(error.message)));
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const message = "現在のブラウザ内セーブデータを、選択したJSONで上書きします。よろしいですか？";
      if (window.confirm(message)) {
        importSave(file).catch((error) => alert(error.message));
      }
      importInput.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", installSaveControls);
  window.JLeagueLocalApi = {
    handle,
    exportSave,
    importSave,
    reset: async () => writeState(await createInitialState())
  };
})();
