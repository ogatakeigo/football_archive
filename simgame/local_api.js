(function () {
  "use strict";

  const dbName = "jleague-sandbox-lite";
  const storeName = "saves";
  const stateKey = "default";
  const saveVersion = 1;
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

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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
    generateSchedule(state, currentSeason(state));
    return state;
  }

  function currentSeason(state) {
    return state.seasons.find((season) => season.IsCurrent || season.isCurrent) || state.seasons[state.seasons.length - 1];
  }

  function seasonDto(season) {
    return {
      Id: season.Id,
      id: season.Id,
      Year: season.Year,
      year: season.Year,
      CurrentRound: season.CurrentRound,
      currentRound: season.CurrentRound,
      MaxRound: season.MaxRound,
      maxRound: season.MaxRound,
      IsSeasonComplete: Boolean(season.IsSeasonComplete)
    };
  }

  function generatePlayers(state) {
    const rng = random(20260608);
    for (const team of state.teams) {
      for (let i = 0; i < 24; i += 1) {
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
    const byLeague = new Map();
    for (const team of state.teams) {
      if (!byLeague.has(team.LeagueId)) byLeague.set(team.LeagueId, []);
      byLeague.get(team.LeagueId).push(team);
    }
    let maxRound = 1;
    for (const [leagueId, teams] of byLeague.entries()) {
      const league = state.leagues.find((item) => item.Id === leagueId);
      const rounds = Math.max(1, teams.length - 1);
      maxRound = Math.max(maxRound, rounds);
      for (let round = 1; round <= rounds; round += 1) {
        for (let i = 0; i < Math.floor(teams.length / 2); i += 1) {
          const home = teams[(i + round - 1) % teams.length];
          const away = teams[(teams.length - 1 - i + round - 1) % teams.length];
          if (home.Id === away.Id) continue;
          state.matches.push(newMatch(state, season, league, round, round % 2 ? home : away, round % 2 ? away : home));
        }
      }
    }
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
      Round: round,
      CompetitionGroup: "League",
      CompetitionCode: "League",
      Played: 0,
      HomeTeamId: home.Id,
      AwayTeamId: away.Id,
      HomeTeam: home.Name,
      AwayTeam: away.Name,
      HomeShort: home.ShortName,
      AwayShort: away.ShortName,
      HomeColor: home.PrimaryColor,
      AwayColor: away.PrimaryColor,
      HomeFormation: home.Formation,
      AwayFormation: away.Formation,
      HomeTactic: home.Tactic,
      AwayTactic: away.Tactic,
      HomeGoals: null,
      AwayGoals: null,
      WinnerTeamId: null,
      DecidedBy: ""
    };
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
    for (const match of state.matches.filter((item) => item.SeasonId === season.Id && item.LeagueId === Number(leagueId) && item.Played)) {
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
      row.Rank = index + 1;
      row.TeamCount = rows.length;
    });
    return rows;
  }

  function matchRows(state, filter = () => true) {
    return state.matches.filter(filter).map((match) => ({ ...match }));
  }

  function topPlayers(state, leagueId, key) {
    const teamIds = new Set(state.teams.filter((team) => team.LeagueId === Number(leagueId)).map((team) => team.Id));
    return state.players
      .filter((player) => teamIds.has(player.TeamId))
      .sort((a, b) => number(b[key]) - number(a[key]) || number(b.Rating) - number(a.Rating))
      .slice(0, 10);
  }

  function rosterForTeam(state, teamId) {
    return state.players.filter((player) => player.TeamId === Number(teamId)).map((player) => ({
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

  function per90(row, key) {
    return row.Minutes ? row[key] * 90 / row.Minutes : 0;
  }

  function rate(done, attempts) {
    return attempts ? done * 100 / attempts : 0;
  }

  function simulateMatch(state, match) {
    if (match.Played) return;
    const home = state.teams.find((team) => team.Id === match.HomeTeamId);
    const away = state.teams.find((team) => team.Id === match.AwayTeamId);
    const rng = random(match.Id * 97 + currentSeason(state).Year);
    const homeExpected = Math.max(0.2, 1.35 + (home.Rating - away.Rating) / 28 + rng() * 0.7);
    const awayExpected = Math.max(0.2, 1.05 + (away.Rating - home.Rating) / 32 + rng() * 0.7);
    match.HomeGoals = goalsFromExpected(homeExpected, rng);
    match.AwayGoals = goalsFromExpected(awayExpected, rng);
    match.Played = 1;
    match.WinnerTeamId = match.HomeGoals > match.AwayGoals ? home.Id : match.AwayGoals > match.HomeGoals ? away.Id : null;
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
        return { seasons: state.seasons.map(seasonDto).reverse(), champions: [] };
      case "getAnnualAwards":
        return { season: seasonDto(season), scope: payload.scopeCode || "World", awards: [] };
      case "getTransfers":
        return { season: seasonDto(season), seasons: state.seasons.map(seasonDto), transfers: state.transfers };
      case "getCups":
      case "getContinentalCompetitions":
      case "getNationalCompetitions":
        return { season: seasonDto(season), competitions: [] };
      case "getCup":
      case "getContinentalCompetition":
      case "getNationalCompetition":
        return emptyCompetition(state, payload.competitionCode);
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
        const simulatedCount = simulateRound(state, season, season.CurrentRound, options.onProgress);
        maybeCompleteSeason(state, season);
        if (!season.IsSeasonComplete) season.CurrentRound += 1;
        await writeState(state);
        return { year: season.Year, round: season.CurrentRound, simulatedCount, seasonEnded: season.IsSeasonComplete };
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
    const nextMatches = matchRows(state, (match) => match.SeasonId === season.Id && match.Round === season.CurrentRound && !match.Played).slice(0, 24);
    const recentMatches = matchRows(state, (match) => match.SeasonId === season.Id && match.Played).slice(-24).reverse();
    return {
      season: seasonDto(season),
      totals: { teams: state.teams.length, players: state.players.length, remaining: state.matches.filter((match) => match.SeasonId === season.Id && !match.Played).length },
      leagues: state.leagues.map((league) => ({
        ...league,
        standings: standingRows(state, league.Id, season.Id).slice(0, 5)
      })),
      nextMatches,
      recentMatches,
      nationalTeams: []
    };
  }

  function leagueView(state, leagueId, seasonId = null) {
    const season = seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state);
    const league = state.leagues.find((item) => item.Id === Number(leagueId)) || state.leagues[0];
    return {
      league,
      season: seasonDto(season),
      seasons: state.seasons.map(seasonDto),
      standings: standingRows(state, league.Id, season.Id),
      fixtures: matchRows(state, (match) => match.SeasonId === season.Id && match.LeagueId === league.Id),
      teams: state.teams.filter((team) => team.LeagueId === league.Id),
      topScorers: topPlayers(state, league.Id, "Goals"),
      topRatings: topPlayers(state, league.Id, "AvgRating"),
      bestEleven: { Formation: "4-2-3-1", players: [] },
      detailRankings: [],
      detailHighlights: []
    };
  }

  function teamView(state, teamId, seasonId = null, statsScope = "League") {
    const team = state.teams.find((item) => item.Id === Number(teamId)) || state.teams[0];
    const season = seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state);
    const standings = standingRows(state, team.LeagueId, season.Id);
    return {
      team,
      season: seasonDto(season),
      seasons: state.seasons.map(seasonDto),
      statsScope: statsScope || "League",
      leagueTeams: state.teams.filter((item) => item.LeagueId === team.LeagueId),
      roster: rosterForTeam(state, team.Id),
      fixtures: matchRows(state, (match) => match.SeasonId === season.Id && (match.HomeTeamId === team.Id || match.AwayTeamId === team.Id)),
      transfers: [],
      budget: { Balance: team.SponsorPower * 100000, WageBudget: team.Rating * 10000, TransferBudget: team.SponsorPower * 50000 },
      seasonStanding: standings.find((row) => row.teamId === team.Id),
      bestLineup: { Formation: team.Formation, players: [] }
    };
  }

  function playerView(state, playerId, seasonId = null, statsScope = "League") {
    const player = state.players.find((item) => item.Id === Number(playerId)) || state.players[0];
    const team = state.teams.find((item) => item.Id === player.TeamId);
    return {
      player: { ...player, TeamId: team.Id, Team: team.Name, TeamShort: team.ShortName, LeagueName: team.LeagueName },
      season: seasonDto(seasonId ? state.seasons.find((item) => item.Id === Number(seasonId)) || currentSeason(state) : currentSeason(state)),
      seasons: state.seasons.map(seasonDto),
      statsScope: statsScope || "League",
      ratings: [],
      detailStats: player,
      achievements: []
    };
  }

  function matchView(state, matchId) {
    const match = state.matches.find((item) => item.Id === Number(matchId));
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

  function emptyCompetition(state, code) {
    return {
      competition: { Code: code || "", Name: code || "Cup" },
      season: seasonDto(currentSeason(state)),
      seasons: state.seasons.map(seasonDto),
      fixtures: [],
      standings: [],
      teams: [],
      topScorers: [],
      topRatings: [],
      bestEleven: { Formation: "4-2-3-1", players: [] },
      detailRankings: [],
      detailHighlights: []
    };
  }

  function search(state, keyword) {
    const word = String(keyword || "").toLowerCase();
    return {
      teams: state.teams.filter((team) => `${team.Name} ${team.ShortName}`.toLowerCase().includes(word)).slice(0, 20),
      players: state.players.filter((player) => player.Name.toLowerCase().includes(word)).slice(0, 20)
    };
  }

  function settingsView(state) {
    return {
      teams: state.teams,
      countries: state.countries,
      leagues: state.leagues,
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
    const matches = state.matches.filter((match) => match.SeasonId === season.Id && match.Round === round && !match.Played);
    matches.forEach((match, index) => {
      simulateMatch(state, match);
      onProgress?.({ completed: index + 1, total: matches.length, percent: Math.round((index + 1) * 100 / Math.max(1, matches.length)), currentRound: round, maxRound: season.MaxRound });
    });
    return matches.length;
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
