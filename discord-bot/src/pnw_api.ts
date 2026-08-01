/**
 * Thin async wrapper around the Politics and War GraphQL and REST APIs.
 */
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Loot-info parsing helpers
// ---------------------------------------------------------------------------

export type LootResourceKey =
  | 'money' | 'food' | 'coal' | 'oil' | 'uranium' | 'iron' | 'bauxite' | 'lead'
  | 'gasoline' | 'munitions' | 'steel' | 'aluminum';

export type LootResources = Record<LootResourceKey, number>;

export const LOOT_RESOURCE_KEYS: LootResourceKey[] = [
  'money', 'food', 'coal', 'oil', 'uranium', 'iron', 'bauxite', 'lead',
  'gasoline', 'munitions', 'steel', 'aluminum',
];

const LOOT_RESOURCE_RE: Record<LootResourceKey, RegExp> = {
  money: /([\d,]+(?:\.\d+)?)\s+money/i,
  food: /([\d,]+(?:\.\d+)?)\s+food/i,
  coal: /([\d,]+(?:\.\d+)?)\s+coal/i,
  oil: /([\d,]+(?:\.\d+)?)\s+oil/i,
  uranium: /([\d,]+(?:\.\d+)?)\s+uranium/i,
  iron: /([\d,]+(?:\.\d+)?)\s+iron/i,
  bauxite: /([\d,]+(?:\.\d+)?)\s+bauxite/i,
  lead: /([\d,]+(?:\.\d+)?)\s+lead/i,
  gasoline: /([\d,]+(?:\.\d+)?)\s+gasoline/i,
  munitions: /([\d,]+(?:\.\d+)?)\s+munitions/i,
  steel: /([\d,]+(?:\.\d+)?)\s+steel/i,
  aluminum: /([\d,]+(?:\.\d+)?)\s+aluminum/i,
};

const ATTACK_TYPES_WITH_LOOT = new Set(['GROUND', 'VICTORY']);
const WARATTACKS_BATCH_SIZE = 50;

function emptyLootResources(): LootResources {
  return Object.fromEntries(LOOT_RESOURCE_KEYS.map((key) => [key, 0.0])) as LootResources;
}

function addLootResources(target: LootResources, source: LootResources): LootResources {
  for (const key of LOOT_RESOURCE_KEYS) target[key] += source[key];
  return target;
}

function hasLootResources(resources: LootResources): boolean {
  return LOOT_RESOURCE_KEYS.some((key) => Math.abs(resources[key]) > 0.000001);
}

export function parseLootResources(lootInfo: string): LootResources {
  const result = emptyLootResources();
  for (const key of LOOT_RESOURCE_KEYS) {
    const m = LOOT_RESOURCE_RE[key].exec(lootInfo);
    if (m && m[1]) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      result[key] = isNaN(v) ? 0.0 : v;
    }
  }
  return result;
}

export function parseResourceLoot(lootInfo: string): [number, number, number, number, number] {
  const parsed = parseLootResources(lootInfo);
  return [parsed.money, parsed.gasoline, parsed.munitions, parsed.aluminum, parsed.steel];
}

export const PNW_GRAPHQL_URL = 'https://api.politicsandwar.com/graphql';
export const PNW_TEST_GRAPHQL_URL = 'https://test.politicsandwar.com/graphql';
export const PNW_REST_URL = 'https://politicsandwar.com/api/';
export const PNW_TEST_REST_URL = 'https://test.politicsandwar.com/api/';

// Maximum military units per city
export const MAX_SOLDIERS_PER_CITY = 15_000;
export const MAX_TANKS_PER_CITY = 1_250;
export const MAX_AIRCRAFT_PER_CITY = 75;
export const MAX_SHIPS_PER_CITY = 15;
export const MAX_DEFENSIVE_SLOTS = 3;

// War score range constants
export const WAR_RANGE_MIN_RATIO = 0.75;
export const WAR_RANGE_MAX_RATIO = 2.5;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface Nation {
  nationId: number;
  nationName: string;
  leaderName: string;
  discordTag: string;
  numCities: number;
  score: number;
  lastActive: string;
  lastActiveUnix: number;
  minutesSinceActive: number;
  soldiers: number;
  soldiersToday: number;
  tanks: number;
  tanksToday: number;
  aircraft: number;
  aircraftToday: number;
  ships: number;
  shipsToday: number;
  missiles: number;
  missilesToday: number;
  nukes: number;
  nukesToday: number;
  spies: number;         // -1 = unknown
  spiesToday: number;
  projectsBuilt: string[];
  numProjects: number;
  allianceId: number;
  allianceName: string;
  alliancePosition: string;
  allianceSeniority: number;
  rank: number;
  continent: string;
  warPolicy: string;
  color: string;
  offensiveWars: number;
  defensiveWars: number;
  warsWon: number;
  warsLost: number;
  beigeTurns: number;
  population: number;
  domesticPolicy: string;
}

export interface TradePrice {
  gasoline: number;
  munitions: number;
  aluminum: number;
  steel: number;
}

export namespace TradePrice {
  export function resourceValue(
    prices: TradePrice,
    opts: { gasoline?: number; munitions?: number; aluminum?: number; steel?: number }
  ): number {
    return (
      (opts.gasoline ?? 0) * prices.gasoline +
      (opts.munitions ?? 0) * prices.munitions +
      (opts.aluminum ?? 0) * prices.aluminum +
      (opts.steel ?? 0) * prices.steel
    );
  }

  export function unitKillValue(
    prices: TradePrice,
    opts: { soldiers?: number; tanks?: number; aircraft?: number; ships?: number }
  ): number {
    return (
      (opts.soldiers ?? 0) * 5.0 +
      (opts.tanks ?? 0) * (60.0 + 0.5 * prices.steel) +
      (opts.aircraft ?? 0) * (4_000.0 + 10.0 * prices.aluminum) +
      (opts.ships ?? 0) * (50_000.0 + 30.0 * prices.steel)
    );
  }
}

export interface AllianceInfo {
  allianceId: number;
  name: string;
  acronym: string;
  score: number;
  averageScore: number;
  color: string;
  flag: string;
  discordLink: string;
  numMembers: number;
  numApplicants: number;
  totalCities: number;
  avgCities: number;
  rank: number;
}

export interface City {
  cityId: number;
  infrastructure: number;
  land: number;
  foundedDate: string;
  powered: boolean;
  coalPower: number;
  oilPower: number;
  nuclearPower: number;
  windPower: number;
  coalMine: number;
  oilWell: number;
  uraniumMine: number;
  ironMine: number;
  bauxiteMine: number;
  leadMine: number;
  farm: number;
  supermarket: number;
  bank: number;
  shoppingMall: number;
  stadium: number;
  subway: number;
  gasrefinery: number;
  aluminumRefinery: number;
  steelMill: number;
  munitionsFactory: number;
  policeStation: number;
  hospital: number;
}

export interface GameInfo {
  cityAverage: number;
  gameMonth: number;
  globalRadiation: number;
  continentRadiation: Record<string, number>;
  colorBonuses: Record<string, number>;
}

export namespace GameInfo {
  export function create(): GameInfo {
    return {
      cityAverage: 43.6,
      gameMonth: 6,
      globalRadiation: 0.0,
      continentRadiation: {},
      colorBonuses: {},
    };
  }

  export function radiationFor(info: GameInfo, continent: string): number {
    return info.continentRadiation[continent.toUpperCase()] ?? 0.0;
  }
}

export interface NationRevenue {
  money: number;
  foodProduction: number;
  foodConsumption: number;
  coal: number;
  oil: number;
  uranium: number;
  iron: number;
  bauxite: number;
  lead: number;
  gasoline: number;
  munitions: number;
  steel: number;
  aluminum: number;
  avgCommerce: number;
  food: number; // = foodProduction - foodConsumption
}

export interface BankTransactionRecord {
  id: string;
  date: string;
  senderId: number;
  senderType: number;
  receiverId: number;
  receiverType: number;
  bankerId: number;
  note: string;
  resources: LootResources;
}

export interface BankTransferRequest {
  receiverId: number;
  receiverType: 1 | 2;
  resources: Partial<LootResources>;
  note?: string | null;
}

export interface NationWar {
  warId: number;
  attackerId: number;
  defenderId: number;
  attackerName: string;
  defenderName: string;
}

export interface WarDetail {
  warId: number;
  date: Date;
  warType: string;
  attackerId: number;
  attackerName: string;
  attackerLeader: string;
  attackerAllianceId: number;
  attackerAllianceName: string;
  attackerCities: number;
  attackerScore: number;
  attackerSoldiers: number;
  attackerTanks: number;
  attackerAircraft: number;
  attackerShips: number;
  attackerMissiles: number;
  attackerNukes: number;
  attackerWarsWon: number;
  attackerWarsLost: number;
  defenderId: number;
  defenderName: string;
  defenderLeader: string;
  defenderAllianceId: number;
  defenderAllianceName: string;
  defenderCities: number;
  defenderScore: number;
  defenderSoldiers: number;
  defenderTanks: number;
  defenderAircraft: number;
  defenderShips: number;
  defenderMissiles: number;
  defenderNukes: number;
  defenderWarsWon: number;
  defenderWarsLost: number;
}

export interface NationWarLootEntry {
  warId: number;
  warDate: Date;
  victoryDate: Date;
  attackerId: number;
  attackerName: string;
  defenderId: number;
  defenderName: string;
  attackType: string;
  looterId: number;
  looterName: string;
  victimId: number;
  victimName: string;
  victorId: number;
  victorName: string;
  loserId: number;
  loserName: string;
  resources: LootResources;
}

export interface NationLootSummary {
  nationId: number;
  days: number;
  since: Date;
  warsChecked: number;
  lootAttacks: number;
  victoryAttacks: number;
  gained: LootResources;
  lost: LootResources;
  total: LootResources;
  entries: NationWarLootEntry[];
}

export interface NationCreateDetail {
  nationId: number;
  nationName: string;
  leaderName: string;
  founded: Date;
  allianceId: number;
  cities: number;
  score: number;
}

// ---------------------------------------------------------------------------
// GraphQL field fragments
// ---------------------------------------------------------------------------

const NATION_FIELDS = `
    id
    nation_name
    leader_name
    discord
    num_cities
    score
    last_active
    soldiers
    tanks
    aircraft
    ships
    missiles
    nukes
    wars_won
    wars_lost
    spies
    soldiers_today
    tanks_today
    aircraft_today
    ships_today
    missiles_today
    nukes_today
    spies_today
    iron_works
    bauxite_works
    arms_stockpile
    emergency_gasoline_reserve
    mass_irrigation
    international_trade_center
    missile_launch_pad
    nuclear_research_facility
    iron_dome
    vital_defense_system
    space_program
    uranium_enrichment_program
    advanced_urban_planning
    government_support_agency
    research_and_development_center
    propaganda_bureau
    telecommunications_satellite
    green_technologies
    arable_land_agency
    clinical_research_center
    urban_planning
    advanced_engineering_corps
    pirate_economy
    recycling_initiative
    specialized_police_training_program
    metropolitan_planning
    moon_landing
    surveillance_network
    nuclear_launch_facility
    activity_center
    military_research_center
    center_for_civil_engineering
    advanced_pirate_economy
    bureau_of_domestic_affairs
    fallout_shelter
    central_intelligence_agency
    guiding_satellite
    military_doctrine
    military_salvage
    mars_landing
    spy_satellite
    alliance_id
    alliance_position
    alliance_seniority
    beige_turns
    color
    alliance {
        name
    }
`;

const CITY_FIELDS = `
    id
    date
    infrastructure
    land
    powered
    coal_power
    oil_power
    nuclear_power
    wind_power
    coal_mine
    oil_well
    uranium_mine
    iron_mine
    bauxite_mine
    lead_mine
    farm
    supermarket
    bank
    shopping_mall
    stadium
    subway
    gasrefinery
    aluminum_refinery
    steel_mill
    munitions_factory
    police_station
    hospital
`;

const ALLIANCE_MEMBER_FIELDS = `
    id
    num_cities
    alliance_position
    vacation_mode_turns
    beige_turns
`;

const PROJECT_ABBREVS: Record<string, string> = {
  iron_works: 'IW',
  bauxite_works: 'BW',
  arms_stockpile: 'AS',
  emergency_gasoline_reserve: 'EGR',
  mass_irrigation: 'MI',
  international_trade_center: 'ITC',
  missile_launch_pad: 'MLP',
  nuclear_research_facility: 'NRF',
  iron_dome: 'ID',
  vital_defense_system: 'VDS',
  space_program: 'SP',
  uranium_enrichment_program: 'UEP',
  advanced_urban_planning: 'ACP',
  government_support_agency: 'GSA',
  research_and_development_center: 'RDC',
  propaganda_bureau: 'PB',
  telecommunications_satellite: 'TS',
  green_technologies: 'GT',
  arable_land_agency: 'ALA',
  clinical_research_center: 'CRC',
  urban_planning: 'UP',
  advanced_engineering_corps: 'AEC',
  pirate_economy: 'PE',
  recycling_initiative: 'RI',
  specialized_police_training_program: 'SPTP',
  metropolitan_planning: 'MP',
  moon_landing: 'ML',
  surveillance_network: 'SN',
  nuclear_launch_facility: 'NLF',
  activity_center: 'AC',
  military_research_center: 'MRC',
  center_for_civil_engineering: 'CCV',
  advanced_pirate_economy: 'APE',
  bureau_of_domestic_affairs: 'BDA',
  fallout_shelter: 'FOS',
  guiding_satellite: 'GS',
  central_intelligence_agency: 'IA',
  military_doctrine: 'MD',
  military_salvage: 'MS',
  mars_landing: 'MAL',
  spy_satellite: 'SS',
};

const ALLIANCE_POSITION_MAP: Record<number, string> = {
  0: 'NOALLIANCE',
  1: 'MEMBER',
  2: 'OFFICER',
  3: 'HEIR',
  4: 'LEADER',
  5: 'APPLICANT',
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function parseLastActiveUnix(value: string): number {
  if (!value) return 0;
  try {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return 0;
    return Math.floor(dt.getTime() / 1000);
  } catch {
    return 0;
  }
}

function n(val: unknown, fallback = 0): number {
  const v = Number(val);
  return isNaN(v) ? fallback : v;
}

function s(val: unknown, fallback = ''): string {
  return val != null ? String(val) : fallback;
}

function parseNationDict(raw: Record<string, unknown>): Nation {
  const alliance = (raw['alliance'] as Record<string, unknown>) || {};
  const laStr = s(raw['last_active']);
  const projectsBuilt = Object.entries(PROJECT_ABBREVS)
    .filter(([fieldName]) => Boolean(raw[fieldName]))
    .map(([, abbr]) => abbr)
    .sort();
  return {
    nationId: n(raw['id']),
    nationName: s(raw['nation_name']),
    leaderName: s(raw['leader_name']),
    discordTag: s(raw['discord']),
    numCities: n(raw['num_cities']),
    score: n(raw['score']),
    lastActive: laStr,
    lastActiveUnix: parseLastActiveUnix(laStr),
    minutesSinceActive: 0,
    soldiers: n(raw['soldiers']),
    soldiersToday: n(raw['soldiers_today']),
    tanks: n(raw['tanks']),
    tanksToday: n(raw['tanks_today']),
    aircraft: n(raw['aircraft']),
    aircraftToday: n(raw['aircraft_today']),
    ships: n(raw['ships']),
    shipsToday: n(raw['ships_today']),
    missiles: n(raw['missiles']),
    missilesToday: n(raw['missiles_today']),
    nukes: n(raw['nukes']),
    nukesToday: n(raw['nukes_today']),
    warsWon: n(raw['wars_won']),
    warsLost: n(raw['wars_lost']),
    spies: raw['spies'] == null ? -1 : n(raw['spies']),
    spiesToday: n(raw['spies_today']),
    projectsBuilt,
    numProjects: projectsBuilt.length,
    allianceId: n(raw['alliance_id']),
    allianceName: s(alliance['name']),
    alliancePosition: s(raw['alliance_position']),
    allianceSeniority: n(raw['alliance_seniority']),
    beigeTurns: n(raw['beige_turns']),
    color: s(raw['color']),
    rank: 0,
    continent: '',
    warPolicy: '',
    offensiveWars: 0,
    defensiveWars: 0,
    population: 0,
    domesticPolicy: '',
  };
}

function parseNationFromNationsList(raw: Record<string, unknown>): Nation {
  const minutes = n(raw['minutessinceactive']);
  const posInt = n(raw['allianceposition']);
  const posStr = ALLIANCE_POSITION_MAP[posInt] ?? 'NOALLIANCE';
  let allianceName = s(raw['alliance']);
  if (allianceName === 'None') allianceName = '';
  return {
    nationId: n(raw['nationid']),
    nationName: s(raw['nation']),
    leaderName: s(raw['leader']),
    discordTag: '',
    numCities: n(raw['cities']),
    score: n(raw['score']),
    lastActive: minutes ? `${minutes} minutes ago` : '',
    lastActiveUnix: 0,
    minutesSinceActive: minutes,
    soldiers: 0,
    soldiersToday: 0,
    tanks: 0,
    tanksToday: 0,
    aircraft: 0,
    aircraftToday: 0,
    ships: 0,
    shipsToday: 0,
    missiles: 0,
    missilesToday: 0,
    nukes: 0,
    nukesToday: 0,
    warsWon: n(raw['warson']),
    warsLost: n(raw['warslost']),
    spies: -1,
    spiesToday: 0,
    projectsBuilt: [],
    numProjects: 0,
    allianceId: n(raw['allianceid']),
    allianceName,
    alliancePosition: posStr,
    allianceSeniority: 0,
    beigeTurns: 0,
    color: s(raw['color']),
    rank: n(raw['rank']),
    continent: s(raw['continent']),
    warPolicy: s(raw['war_policy']),
    offensiveWars: n(raw['offensivewars']),
    defensiveWars: n(raw['defensivewars']),
    population: 0,
    domesticPolicy: '',
  };
}

function parseAllianceDict(raw: Record<string, unknown>): AllianceInfo {
  const nations = (raw['nations'] as Record<string, unknown>[]) || [];
  const active = nations.filter(
    (nation) =>
      !['', 'APPLICANT', 'NOALLIANCE'].includes(s(nation['alliance_position'])) &&
      n(nation['vacation_mode_turns']) === 0
  );
  const applicants = nations.filter((nation) => s(nation['alliance_position']) === 'APPLICANT');
  const totalCities = active.reduce((sum, nation) => sum + n(nation['num_cities']), 0);
  const avgCities = active.length > 0 ? totalCities / active.length : 0.0;
  return {
    allianceId: n(raw['id']),
    name: s(raw['name']),
    acronym: s(raw['acronym']),
    score: n(raw['score']),
    averageScore: n(raw['average_score']),
    color: s(raw['color']),
    flag: s(raw['flag']),
    discordLink: s(raw['discord_link']),
    numMembers: active.length,
    numApplicants: applicants.length,
    totalCities,
    avgCities,
    rank: 0,
  };
}

function parseCityDict(raw: Record<string, unknown>): City {
  return {
    cityId: n(raw['id']),
    foundedDate: s(raw['date']),
    infrastructure: n(raw['infrastructure']),
    land: n(raw['land']),
    powered: Boolean(raw['powered'] ?? true),
    coalPower: n(raw['coal_power']),
    oilPower: n(raw['oil_power']),
    nuclearPower: n(raw['nuclear_power']),
    windPower: n(raw['wind_power']),
    coalMine: n(raw['coal_mine']),
    oilWell: n(raw['oil_well']),
    uraniumMine: n(raw['uranium_mine']),
    ironMine: n(raw['iron_mine']),
    bauxiteMine: n(raw['bauxite_mine']),
    leadMine: n(raw['lead_mine']),
    farm: n(raw['farm']),
    supermarket: n(raw['supermarket']),
    bank: n(raw['bank']),
    shoppingMall: n(raw['shopping_mall']),
    stadium: n(raw['stadium']),
    subway: n(raw['subway']),
    gasrefinery: n(raw['gasrefinery']),
    aluminumRefinery: n(raw['aluminum_refinery']),
    steelMill: n(raw['steel_mill']),
    munitionsFactory: n(raw['munitions_factory']),
    policeStation: n(raw['police_station']),
    hospital: n(raw['hospital']),
  };
}

function parseAllianceRest(raw: Record<string, unknown>): AllianceInfo {
  return {
    allianceId: n(raw['id']),
    name: s(raw['name']),
    acronym: s(raw['acronym']),
    score: n(raw['score']),
    averageScore: n(raw['avgscore']),
    color: s(raw['color']),
    flag: s(raw['flagurl']),
    discordLink: '',
    numMembers: n(raw['members']),
    numApplicants: 0,
    totalCities: 0,
    avgCities: 0.0,
    rank: n(raw['rank']),
  };
}

// ---------------------------------------------------------------------------
// PnWClient
// ---------------------------------------------------------------------------

export class PnWClient {
  private _apiKey: string;
  private _graphqlUrl: string;
  private _restUrl: string | null;
  private _lastTradePrices: TradePrice;

  constructor(
    apiKey: string,
    opts: { graphqlUrl?: string; restUrl?: string | null } = {}
  ) {
    this._apiKey = apiKey;
    this._graphqlUrl = opts.graphqlUrl ?? PNW_GRAPHQL_URL;
    this._restUrl = opts.restUrl ?? null;
    this._lastTradePrices = { gasoline: 0, munitions: 0, aluminum: 0, steel: 0 };
  }

  get apiKey(): string { return this._apiKey; }
  set apiKey(key: string) { this._apiKey = key; }

  // ------------------------------------------------------------------
  // GraphQL helpers
  // ------------------------------------------------------------------

  private async _query(
    query: string,
    variables: Record<string, unknown>,
    opts: { botKey?: string | null } = {}
  ): Promise<Record<string, unknown>> {
    const url = `${this._graphqlUrl}?api_key=${this._apiKey}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this._apiKey,
    };
    const botKey = (opts.botKey ?? process.env['bot_key'] ?? '').trim();
    if (botKey) headers['X-Bot-Key'] = botKey;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) {
      throw new Error(`PnW API HTTP error: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json() as Record<string, unknown>;
    if (data['errors']) {
      const errors = data['errors'] as Array<Record<string, unknown>>;
      throw new Error('PnW API returned errors: ' + errors.map((e) => s(e['message'])).join('; '));
    }
    return data;
  }

  async getAllianceBankTransactions(
    allianceId: number,
    opts: { minId?: number; limit?: number; page?: number } = {}
  ): Promise<BankTransactionRecord[]> {
    if (allianceId <= 0) return [];
    const query = `query GetAllianceBankTransactions($or_id: [Int], $or_type: [Int], $min_id: Int, $first: Int, $page: Int) {
      bankrecs(or_id: $or_id, or_type: $or_type, min_id: $min_id, first: $first, page: $page, orderBy: { column: ID, order: ASC }) {
        data {
          id date sender_id sender_type receiver_id receiver_type banker_id note
          money food coal oil uranium iron bauxite lead gasoline munitions steel aluminum
        }
      }
    }`;
    const first = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 100)));
    const data = await this._query(query, {
      or_id: [allianceId],
      or_type: [2],
      min_id: opts.minId,
      first,
      page: opts.page ?? 1,
    });
    const payload = (data['data'] as Record<string, unknown>) ?? {};
    const paginator = (payload['bankrecs'] as Record<string, unknown>) ?? {};
    const rows = Array.isArray(paginator['data'])
      ? paginator['data'] as Array<Record<string, unknown>>
      : Array.isArray(payload['bankrecs'])
        ? payload['bankrecs'] as Array<Record<string, unknown>>
        : [];
    return rows.map((raw) => ({
      id: String(raw['id'] ?? ''),
      date: s(raw['date']),
      senderId: n(raw['sender_id'] ?? raw['sid']),
      senderType: n(raw['sender_type'] ?? raw['stype']),
      receiverId: n(raw['receiver_id'] ?? raw['rid']),
      receiverType: n(raw['receiver_type'] ?? raw['rtype']),
      bankerId: n(raw['banker_id'] ?? raw['pid']),
      note: s(raw['note']),
      resources: {
        money: n(raw['money']),
        food: n(raw['food']),
        coal: n(raw['coal']),
        oil: n(raw['oil']),
        uranium: n(raw['uranium']),
        iron: n(raw['iron']),
        bauxite: n(raw['bauxite']),
        lead: n(raw['lead']),
        gasoline: n(raw['gasoline']),
        munitions: n(raw['munitions']),
        steel: n(raw['steel']),
        aluminum: n(raw['aluminum']),
      },
    })).filter((row) => row.id.length > 0);
  }

  async bankWithdraw(request: BankTransferRequest): Promise<BankTransactionRecord> {
    const query = `mutation BankWithdraw($receiver: Int!, $receiver_type: Int!, $note: String, $money: Float, $food: Float, $coal: Float, $oil: Float, $uranium: Float, $iron: Float, $bauxite: Float, $lead: Float, $gasoline: Float, $munitions: Float, $steel: Float, $aluminum: Float) {
      bankWithdraw(receiver: $receiver, receiver_type: $receiver_type, note: $note, money: $money, food: $food, coal: $coal, oil: $oil, uranium: $uranium, iron: $iron, bauxite: $bauxite, lead: $lead, gasoline: $gasoline, munitions: $munitions, steel: $steel, aluminum: $aluminum) {
        id date sender_id sender_type receiver_id receiver_type banker_id note
        money food coal oil uranium iron bauxite lead gasoline munitions steel aluminum
      }
    }`;
    const resources = {
      money: request.resources.money ?? 0,
      food: request.resources.food ?? 0,
      coal: request.resources.coal ?? 0,
      oil: request.resources.oil ?? 0,
      uranium: request.resources.uranium ?? 0,
      iron: request.resources.iron ?? 0,
      bauxite: request.resources.bauxite ?? 0,
      lead: request.resources.lead ?? 0,
      gasoline: request.resources.gasoline ?? 0,
      munitions: request.resources.munitions ?? 0,
      steel: request.resources.steel ?? 0,
      aluminum: request.resources.aluminum ?? 0,
    };
    const data = await this._query(query, {
      receiver: request.receiverId,
      receiver_type: request.receiverType,
      note: request.note ?? null,
      ...resources,
    });
    const payload = (data['data'] as Record<string, unknown>) ?? {};
    const raw = (payload['bankWithdraw'] as Record<string, unknown>) ?? {};
    const id = String(raw['id'] ?? '');
    if (!id) throw new Error('PnW bankWithdraw returned no transaction ID.');
    return {
      id,
      date: s(raw['date']),
      senderId: n(raw['sender_id'] ?? raw['sid']),
      senderType: n(raw['sender_type'] ?? raw['stype']),
      receiverId: n(raw['receiver_id'] ?? raw['rid']),
      receiverType: n(raw['receiver_type'] ?? raw['rtype']),
      bankerId: n(raw['banker_id'] ?? raw['pid']),
      note: s(raw['note']),
      resources: {
        money: n(raw['money']),
        food: n(raw['food']),
        coal: n(raw['coal']),
        oil: n(raw['oil']),
        uranium: n(raw['uranium']),
        iron: n(raw['iron']),
        bauxite: n(raw['bauxite']),
        lead: n(raw['lead']),
        gasoline: n(raw['gasoline']),
        munitions: n(raw['munitions']),
        steel: n(raw['steel']),
        aluminum: n(raw['aluminum']),
      },
    };
  }

  // ------------------------------------------------------------------
  // Nation lookups
  // ------------------------------------------------------------------

  async getNation(nationId: number): Promise<Nation | null> {
    if (this._restUrl !== null) {
      const nations = await this._fetchNationsRest();
      const found = nations.find((n_) => Number((n_ as Record<string, unknown>)['nationid']) === nationId);
      return found ? parseNationFromNationsList(found as Record<string, unknown>) : null;
    }
    const query = `query GetNation($id: [Int]) {
      nations(id: $id, first: 1) {
        data { ${NATION_FIELDS} }
      }
    }`;
    const data = await this._query(query, { id: [nationId] });
    const nations = (((data['data'] as Record<string, unknown>)?.['nations'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!nations.length) return null;
    return parseNationDict(nations[0] as Record<string, unknown>);
  }

  async getWarDetail(warId: number): Promise<WarDetail | null> {
    if (warId <= 0) return null;
    const data = await this._query(WAR_DETAIL_QUERY, { id: [warId] });
    const wars = (((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    return wars.length ? parseWarFromDict(wars[0] as Record<string, unknown>) : null;
  }

  async getNationWarLoot(nationId: number, days: number): Promise<NationLootSummary> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const warLookupCutoff = new Date(since.getTime() - 6 * 24 * 60 * 60 * 1000);
    const summary: NationLootSummary = {
      nationId,
      days: safeDays,
      since,
      warsChecked: 0,
      lootAttacks: 0,
      victoryAttacks: 0,
      gained: emptyLootResources(),
      lost: emptyLootResources(),
      total: emptyLootResources(),
      entries: [],
    };
    if (this._restUrl !== null || nationId <= 0) return summary;

    type LootWar = {
      warId: number;
      date: Date;
      attackerId: number;
      attackerName: string;
      defenderId: number;
      defenderName: string;
    };

    const warsById = new Map<number, LootWar>();
    const fetchRole = async (role: 'attid' | 'defid'): Promise<void> => {
      let page = 1;
      while (true) {
        const query = `query GetNationLootWars($nationId: [Int], $page: Int) {
          wars(${role}: $nationId, page: $page, first: 100) {
            data {
              id date end_date att_id def_id
              attacker { nation_name }
              defender { nation_name }
            }
            paginatorInfo { hasMorePages }
          }
        }`;
        const data = await this._query(query, { nationId: [nationId], page });
        const payload = ((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>) ?? {};
        const wars = (payload['data'] as unknown[]) ?? [];
        const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
        let allBeforeLookupCutoff = wars.length > 0;
        for (const raw of wars as Array<Record<string, unknown>>) {
          const dateStr = s(raw['date']);
          const warDate = dateStr ? new Date(dateStr) : null;
          if (!warDate || isNaN(warDate.getTime())) continue;
          if (warDate >= warLookupCutoff) allBeforeLookupCutoff = false;
          const endDateStr = s(raw['end_date']);
          const endDate = endDateStr ? new Date(endDateStr) : null;
          const validEndDate = endDate && !isNaN(endDate.getTime()) ? endDate : null;
          if (warDate < since && validEndDate !== null && validEndDate < since) continue;
          if (warDate < since && validEndDate === null && warDate < warLookupCutoff) continue;
          const warId = n(raw['id']);
          if (!warId || warsById.has(warId)) continue;
          const attacker = (raw['attacker'] as Record<string, unknown>) ?? {};
          const defender = (raw['defender'] as Record<string, unknown>) ?? {};
          const attackerId = n(raw['att_id']);
          const defenderId = n(raw['def_id']);
          warsById.set(warId, {
            warId,
            date: warDate,
            attackerId,
            attackerName: s(attacker['nation_name']) || String(attackerId || '?'),
            defenderId,
            defenderName: s(defender['nation_name']) || String(defenderId || '?'),
          });
        }
        if (!hasMore || allBeforeLookupCutoff) break;
        page += 1;
      }
    };

    await fetchRole('attid');
    await fetchRole('defid');

    const wars = Array.from(warsById.values());
    summary.warsChecked = wars.length;
    if (!wars.length) return summary;

    const warIds = wars.map((war) => war.warId);
    const warById = new Map(wars.map((war) => [war.warId, war]));
    for (let batchStart = 0; batchStart < warIds.length; batchStart += WARATTACKS_BATCH_SIZE) {
      const batch = warIds.slice(batchStart, batchStart + WARATTACKS_BATCH_SIZE);
      let page = 1;
      while (true) {
        const query = `query GetNationAttackLoot($war_id: [Int], $page: Int) {
          warattacks(war_id: $war_id, page: $page, first: 100) {
            data {
              war_id att_id date type victor money_stolen money_looted loot_info
              gasoline_looted munitions_looted aluminum_looted steel_looted
            }
            paginatorInfo { hasMorePages }
          }
        }`;
        const data = await this._query(query, { war_id: batch, page });
        const payload = ((data['data'] as Record<string, unknown>)?.['warattacks'] as Record<string, unknown>) ?? {};
        const attacks = (payload['data'] as unknown[]) ?? [];
        const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
        for (const attack of attacks as Array<Record<string, unknown>>) {
          const attackType = s(attack['type']).toUpperCase();
          if (!ATTACK_TYPES_WITH_LOOT.has(attackType)) continue;
          const warId = n(attack['war_id']);
          const war = warById.get(warId);
          if (!war) continue;
          const attackDateStr = s(attack['date']);
          const victoryDate = attackDateStr ? new Date(attackDateStr) : war.date;
          const resources = parseLootResources(s(attack['loot_info']));
          const money = n(attack['money_stolen']) + n(attack['money_looted']) + n(attack['moneystolen']);
          if (money > 0) resources.money = money;
          const gasoline = n(attack['gasoline_looted']);
          const munitions = n(attack['munitions_looted']);
          const aluminum = n(attack['aluminum_looted']);
          const steel = n(attack['steel_looted']);
          if (gasoline > 0) resources.gasoline = gasoline;
          if (munitions > 0) resources.munitions = munitions;
          if (aluminum > 0) resources.aluminum = aluminum;
          if (steel > 0) resources.steel = steel;
          if (!hasLootResources(resources)) continue;

          const attackAttackerId = n(attack['att_id']);
          const victorId = attackType === 'VICTORY' ? n(attack['victor']) || attackAttackerId : attackAttackerId;
          const looterId = victorId || attackAttackerId;
          const looterIsWarAttacker = looterId === war.attackerId;
          const looterName = looterIsWarAttacker ? war.attackerName : looterId === war.defenderId ? war.defenderName : String(looterId || '?');
          const victimId = looterIsWarAttacker ? war.defenderId : war.attackerId;
          const victimName = looterIsWarAttacker ? war.defenderName : war.attackerName;
          summary.lootAttacks += 1;
          if (attackType === 'VICTORY') summary.victoryAttacks += 1;
          addLootResources(summary.total, resources);
          if (looterId === nationId) addLootResources(summary.gained, resources);
          else if (victimId === nationId) addLootResources(summary.lost, resources);
          summary.entries.push({
            warId,
            warDate: war.date,
            victoryDate: isNaN(victoryDate.getTime()) ? war.date : victoryDate,
            attackerId: war.attackerId,
            attackerName: war.attackerName,
            defenderId: war.defenderId,
            defenderName: war.defenderName,
            attackType,
            looterId,
            looterName,
            victimId,
            victimName,
            victorId: looterId,
            victorName: looterName,
            loserId: victimId,
            loserName: victimName,
            resources,
          });
        }
        if (!hasMore) break;
        page += 1;
      }
    }

    summary.entries.sort((a, b) => b.victoryDate.getTime() - a.victoryDate.getTime());
    return summary;
  }

  async getNationByName(name: string): Promise<Nation | null> {
    if (this._restUrl !== null) {
      const nations = await this._fetchNationsRest();
      const lower = name.trim().toLowerCase();
      let found = (nations as Record<string, unknown>[]).find(
        (n_) => s(n_['nation']).trim().toLowerCase() === lower
      );
      if (!found) {
        found = (nations as Record<string, unknown>[]).find(
          (n_) => s(n_['leader']).trim().toLowerCase() === lower
        );
      }
      return found ? parseNationFromNationsList(found) : null;
    }
    const query = `query GetNationByName($name: [String]) {
      nations(nation_name: $name, first: 1) {
        data { ${NATION_FIELDS} }
      }
    }`;
    const data = await this._query(query, { name: [name] });
    const nations = (((data['data'] as Record<string, unknown>)?.['nations'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!nations.length) return null;
    return parseNationDict(nations[0] as Record<string, unknown>);
  }

  async getNationByDiscordTag(discordTag: string): Promise<Nation | null> {
    if (this._restUrl !== null) return null;
    const query = `query GetNationByDiscord($discord: [String]) {
      nations(discord: $discord, first: 1) {
        data { ${NATION_FIELDS} }
      }
    }`;
    const data = await this._query(query, { discord: [discordTag] });
    const nations = (((data['data'] as Record<string, unknown>)?.['nations'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!nations.length) return null;
    return parseNationDict(nations[0] as Record<string, unknown>);
  }

  async getAllianceMembers(allianceIds: number[]): Promise<Nation[]> {
    const query = `query GetAllianceMembers($alliance_id: [Int], $page: Int) {
      nations(alliance_id: $alliance_id, vmode: false, first: 500, page: $page) {
        data { ${NATION_FIELDS} }
        paginatorInfo { hasMorePages }
      }
    }`;
    const parsed: Nation[] = [];
    let page = 1;
    while (true) {
      const data = await this._query(query, { alliance_id: allianceIds, page });
      const payload = ((data['data'] as Record<string, unknown>)?.['nations'] as Record<string, unknown>) ?? {};
      const nations = (payload['data'] as unknown[]) ?? [];
      parsed.push(...nations.map((n_) => parseNationDict(n_ as Record<string, unknown>)));
      const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
      if (!hasMore) break;
      page++;
    }
    return parsed;
  }

  async getNationWithCities(nationId: number): Promise<[Nation, City[]] | null> {
    if (this._restUrl !== null) return null;
    const query = `query GetNationWithCities($id: [Int]) {
      nations(id: $id, first: 1) {
        data {
          ${NATION_FIELDS}
          continent
          population
          domestic_policy
          war_policy
          wars(active: true) { id att_id }
          cities { ${CITY_FIELDS} }
        }
      }
    }`;
    const data = await this._query(query, { id: [nationId] });
    const nations = (((data['data'] as Record<string, unknown>)?.['nations'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!nations.length) return null;
    const raw = nations[0] as Record<string, unknown>;
    const nation = parseNationDict(raw);
    nation.continent = s(raw['continent']);
    nation.population = n(raw['population']);
    nation.domesticPolicy = s(raw['domestic_policy']);
    nation.warPolicy = s(raw['war_policy']);
    const activeWars = (raw['wars'] as Array<Record<string, unknown>>) ?? [];
    nation.offensiveWars = activeWars.filter((w) => n(w['att_id']) === nationId).length;
    nation.defensiveWars = activeWars.length - nation.offensiveWars;
    const cities = ((raw['cities'] as unknown[]) ?? []).map((c) => parseCityDict(c as Record<string, unknown>));
    return [nation, cities];
  }

  async getGameInfo(): Promise<GameInfo> {
    const query = `query GetGameInfo {
      game_info {
        city_average
        game_date
        radiation {
          africa antarctica asia australia europe global north_america south_america
        }
      }
      colors { color turn_bonus }
    }`;
    try {
      const data = await this._query(query, {});
      const d = data['data'] as Record<string, unknown>;
      const gi = (d?.['game_info'] as Record<string, unknown>) ?? {};
      const rad = (gi['radiation'] as Record<string, unknown>) ?? {};
      const cityAvg = n(gi['city_average'], 43.6);
      let month = 6;
      const gameDate = gi['game_date'];
      if (typeof gameDate === 'string' && gameDate) {
        try { month = parseInt(gameDate.split('-')[1] ?? '6', 10); } catch { /**/ }
      } else if (typeof gameDate === 'object' && gameDate !== null) {
        month = n((gameDate as Record<string, unknown>)['month'], 6);
      }
      const colorBonuses: Record<string, number> = {};
      for (const c of ((d?.['colors'] as unknown[]) ?? []) as Array<Record<string, unknown>>) {
        const name = s(c['color']).toLowerCase();
        const bonus = n(c['turn_bonus']);
        if (name && name !== 'gray' && bonus > 0) colorBonuses[name] = bonus;
      }
      return {
        cityAverage: cityAvg,
        gameMonth: month,
        globalRadiation: n(rad['global']),
        continentRadiation: {
          AF: n(rad['africa']),
          AN: n(rad['antarctica']),
          AS: n(rad['asia']),
          AU: n(rad['australia']),
          EU: n(rad['europe']),
          NA: n(rad['north_america']),
          SA: n(rad['south_america']),
        },
        colorBonuses,
      };
    } catch {
      return GameInfo.create();
    }
  }

  async getTradePrices(): Promise<TradePrice> {
    const query = `query GetTradePrices {
      tradeprices(first: 1) {
        data { gasoline munitions aluminum steel }
      }
    }`;
    try {
      const data = await this._query(query, {});
      const prices = (((data['data'] as Record<string, unknown>)?.['tradeprices'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
      if (prices.length) {
        const p = prices[0] as Record<string, unknown>;
        const current: TradePrice = {
          gasoline: n(p['gasoline']),
          munitions: n(p['munitions']),
          aluminum: n(p['aluminum']),
          steel: n(p['steel']),
        };
        if (current.gasoline || current.munitions || current.aluminum || current.steel) {
          this._lastTradePrices = current;
        }
        return current;
      }
    } catch {
      // fall through to return cached prices
    }
    return this._lastTradePrices;
  }

  async getActiveWarCounts(nationIds: number[]): Promise<Map<number, number>> {
    if (!nationIds.length) return new Map();
    const query = `query GetActiveWars($defid: [Int]) {
      wars(defid: $defid, active: true, first: 500) {
        data { def_id }
      }
    }`;
    const data = await this._query(query, { defid: nationIds });
    const wars = (((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    const counts = new Map<number, number>();
    for (const war of wars as Array<Record<string, unknown>>) {
      const defId = n(war['def_id']);
      counts.set(defId, (counts.get(defId) ?? 0) + 1);
    }
    return counts;
  }

  async getActiveDefWarCountsByAlliance(allianceIds: number[]): Promise<Map<number, number>> {
    const validIds = allianceIds.filter((id) => id > 0);
    if (!validIds.length) return new Map();
    const query = `query GetActiveDefWars($alliance_id: [Int]) {
      wars(alliance_id: $alliance_id, active: true, first: 500) {
        data { def_id def_alliance_id }
      }
    }`;
    const data = await this._query(query, { alliance_id: validIds });
    const wars = (((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    const allianceIdSet = new Set(validIds);
    const counts = new Map<number, number>();
    for (const war of wars as Array<Record<string, unknown>>) {
      if (!allianceIdSet.has(n(war['def_alliance_id']))) continue;
      const defId = n(war['def_id']);
      if (defId) counts.set(defId, (counts.get(defId) ?? 0) + 1);
    }
    return counts;
  }

  async getActiveDefensiveWarsForAlliance(allianceId: number): Promise<WarDetail[]> {
    if (allianceId <= 0 || this._restUrl !== null) return [];
    const wars: WarDetail[] = [];
    const seenWarIds = new Set<number>();
    let page = 1;
    while (true) {
      const query = `query GetActiveAllianceWars($alliance_id: [Int], $page: Int) {
        wars(alliance_id: $alliance_id, page: $page, first: 100, active: true) {
          data {
            id date war_type att_id def_id att_alliance_id def_alliance_id
            attacker {
              nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
              alliance { name }
            }
            defender {
              nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
              alliance { name }
            }
          }
          paginatorInfo { hasMorePages }
        }
      }`;
      const data = await this._query(query, { alliance_id: [allianceId], page });
      const payload = ((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>) ?? {};
      const rows = (payload['data'] as unknown[]) ?? [];
      const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
      for (const row of rows as Array<Record<string, unknown>>) {
        const parsed = parseWarFromDict(row);
        if (!parsed) continue;
        if (parsed.defenderAllianceId !== allianceId) continue;
        if (seenWarIds.has(parsed.warId)) continue;
        seenWarIds.add(parsed.warId);
        wars.push(parsed);
      }
      if (!hasMore) break;
      page += 1;
    }
    wars.sort((a, b) => b.date.getTime() - a.date.getTime());
    return wars;
  }

  async getActiveWarsForNation(nationId: number): Promise<NationWar[]> {
    if (nationId <= 0) return [];
    const query = `query GetActiveWarsByNation($attid: [Int], $defid: [Int]) {
      attacking: wars(attid: $attid, active: true, first: 100) {
        data { id att_id def_id attacker { nation_name } defender { nation_name } }
      }
      defending: wars(defid: $defid, active: true, first: 100) {
        data { id att_id def_id attacker { nation_name } defender { nation_name } }
      }
    }`;
    const data = await this._query(query, { attid: [nationId], defid: [nationId] });
    const d = data['data'] as Record<string, unknown>;
    const attWars = (((d?.['attacking'] as Record<string, unknown>)?.['data']) as unknown[]) ?? [];
    const defWars = (((d?.['defending'] as Record<string, unknown>)?.['data']) as unknown[]) ?? [];
    const dedup = new Map<number, NationWar>();
    for (const war of [...attWars, ...defWars] as Array<Record<string, unknown>>) {
      const warId = n(war['id']);
      if (!warId || dedup.has(warId)) continue;
      const attacker = (war['attacker'] as Record<string, unknown>) ?? {};
      const defender = (war['defender'] as Record<string, unknown>) ?? {};
      dedup.set(warId, {
        warId,
        attackerId: n(war['att_id']),
        defenderId: n(war['def_id']),
        attackerName: s(attacker['nation_name']) || String(war['att_id'] ?? '?'),
        defenderName: s(defender['nation_name']) || String(war['def_id'] ?? '?'),
      });
    }
    return Array.from(dedup.values());
  }

  async getNewWarsForAlliance(allianceIds: number[], since: Date): Promise<WarDetail[]> {
    if (this._restUrl !== null) return [];
    const results: WarDetail[] = [];
    let page = 1;
    while (true) {
      const query = `query GetNewAllianceWars($alliance_id: [Int], $page: Int) {
        wars(alliance_id: $alliance_id, page: $page, first: 100) {
          data {
            id date war_type att_id def_id att_alliance_id def_alliance_id
            attacker {
              nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
              alliance { name }
            }
            defender {
              nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
              alliance { name }
            }
          }
          paginatorInfo { hasMorePages }
        }
      }`;
      const data = await this._query(query, { alliance_id: allianceIds, page });
      const payload = ((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>) ?? {};
      const wars = (payload['data'] as unknown[]) ?? [];
      const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
      let allBeforeSince = true;
      for (const war of wars as Array<Record<string, unknown>>) {
        const dateStr = s(war['date']);
        const warDate = dateStr ? new Date(dateStr) : null;
        if (warDate && !isNaN(warDate.getTime()) && warDate >= since) {
          allBeforeSince = false;
          const warId = n(war['id']);
          if (!warId) continue;
          const attacker = (war['attacker'] as Record<string, unknown>) ?? {};
          const defender = (war['defender'] as Record<string, unknown>) ?? {};
          const attAlliance = (attacker['alliance'] as Record<string, unknown>) ?? {};
          const defAlliance = (defender['alliance'] as Record<string, unknown>) ?? {};
          results.push({
            warId,
            date: warDate,
            warType: (s(war['war_type']) || 'ORDINARY').toUpperCase(),
            attackerId: n(war['att_id']),
            attackerName: s(attacker['nation_name']) || String(war['att_id'] ?? '?'),
            attackerLeader: s(attacker['leader_name']),
            attackerAllianceId: n(war['att_alliance_id']),
            attackerAllianceName: s(attAlliance['name']),
            attackerCities: n(attacker['num_cities']),
            attackerScore: n(attacker['score']),
            attackerSoldiers: n(attacker['soldiers']),
            attackerTanks: n(attacker['tanks']),
            attackerAircraft: n(attacker['aircraft']),
            attackerShips: n(attacker['ships']),
            attackerMissiles: n(attacker['missiles']),
            attackerNukes: n(attacker['nukes']),
            attackerWarsWon: n(attacker['wars_won']),
            attackerWarsLost: n(attacker['wars_lost']),
            defenderId: n(war['def_id']),
            defenderName: s(defender['nation_name']) || String(war['def_id'] ?? '?'),
            defenderLeader: s(defender['leader_name']),
            defenderAllianceId: n(war['def_alliance_id']),
            defenderAllianceName: s(defAlliance['name']),
            defenderCities: n(defender['num_cities']),
            defenderScore: n(defender['score']),
            defenderSoldiers: n(defender['soldiers']),
            defenderTanks: n(defender['tanks']),
            defenderAircraft: n(defender['aircraft']),
            defenderShips: n(defender['ships']),
            defenderMissiles: n(defender['missiles']),
            defenderNukes: n(defender['nukes']),
            defenderWarsWon: n(defender['wars_won']),
            defenderWarsLost: n(defender['wars_lost']),
          });
        }
      }
      if (allBeforeSince || !hasMore) break;
      page++;
    }
    results.sort((a, b) => a.date.getTime() - b.date.getTime());
    return results;
  }

  async getNationsInAllianceByScoreRange(
    allianceIds: number[],
    minScore: number,
    maxScore: number
  ): Promise<Nation[]> {
    const members = await this.getAllianceMembers(allianceIds);
    return members.filter((m) => m.score >= minScore && m.score <= maxScore);
  }

  async getAllianceById(allianceId: number): Promise<AllianceInfo | null> {
    if (this._restUrl !== null) return this._getAllianceRest(allianceId);
    const query = `query GetAlliance($id: [Int]) {
      alliances(id: $id, first: 1) {
        data {
          id name acronym score average_score color flag discord_link
          nations { ${ALLIANCE_MEMBER_FIELDS} }
        }
      }
    }`;
    const data = await this._query(query, { id: [allianceId] });
    const alliances = (((data['data'] as Record<string, unknown>)?.['alliances'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!alliances.length) return null;
    return parseAllianceDict(alliances[0] as Record<string, unknown>);
  }

  async getAllianceByName(name: string): Promise<AllianceInfo | null> {
    if (this._restUrl !== null) {
      const alliances = await this._fetchAlliancesRest();
      const lower = name.trim().toLowerCase();
      const found = (alliances as Record<string, unknown>[]).find(
        (a) => s(a['name']).trim().toLowerCase() === lower
      );
      return found ? parseAllianceRest(found) : null;
    }
    const query = `query GetAllianceByName($name: [String]) {
      alliances(name: $name, first: 1) {
        data {
          id name acronym score average_score color flag discord_link
          nations { ${ALLIANCE_MEMBER_FIELDS} }
        }
      }
    }`;
    const data = await this._query(query, { name: [name] });
    const alliances = (((data['data'] as Record<string, unknown>)?.['alliances'] as Record<string, unknown>)?.['data'] as unknown[]) ?? [];
    if (!alliances.length) return null;
    return parseAllianceDict(alliances[0] as Record<string, unknown>);
  }

  async getNationRest(nationId: number): Promise<Nation | null> {
    const base = this._restUrl ?? PNW_REST_URL;
    const url = `${base}nation/id=${nationId}/&key=${this._apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PnW REST error: ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    if (!data['success']) return null;
    const minutes = n(data['minutessinceactive']);
    return {
      nationId: n(data['nationid'], nationId),
      nationName: s(data['name']),
      leaderName: s(data['leadername']),
      discordTag: '',
      numCities: n(data['cities']),
      score: n(data['score']),
      lastActive: minutes ? `${minutes} minutes ago` : '',
      lastActiveUnix: 0,
      minutesSinceActive: minutes,
      soldiers: 0, soldiersToday: 0, tanks: 0, tanksToday: 0, aircraft: 0, aircraftToday: 0,
      ships: 0, shipsToday: 0, missiles: 0, missilesToday: 0, nukes: 0, nukesToday: 0,
      warsWon: 0, warsLost: 0, spies: -1, spiesToday: 0, projectsBuilt: [], numProjects: 0,
      allianceId: 0, allianceName: '', alliancePosition: '', allianceSeniority: 0,
      beigeTurns: 0, color: '', rank: 0, continent: '', warPolicy: '',
      offensiveWars: 0, defensiveWars: 0, population: 0, domesticPolicy: '',
    };
  }

  private async _fetchNationsRest(): Promise<unknown[]> {
    const base = this._restUrl ?? PNW_REST_URL;
    const url = `${base}nations/?key=${this._apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PnW REST nations error: ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    return (data['nations'] as unknown[]) ?? [];
  }

  private async _fetchAlliancesRest(): Promise<unknown[]> {
    const base = this._restUrl ?? PNW_REST_URL;
    const url = `${base}alliances/?key=${this._apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PnW REST alliances error: ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    return (data['alliances'] as unknown[]) ?? [];
  }

  private async _getAllianceRest(allianceId: number): Promise<AllianceInfo | null> {
    const alliances = await this._fetchAlliancesRest();
    const found = (alliances as Record<string, unknown>[]).find(
      (a) => n(a['id']) === allianceId
    );
    return found ? parseAllianceRest(found) : null;
  }

  static discordMatches(discordTag: string, username: string): boolean {
    const stored = discordTag.trim().toLowerCase();
    if (!stored) return false;
    const check = username.trim().toLowerCase();
    return stored === check || stored.startsWith(check + '#') || check.startsWith(stored + '#');
  }

  async getAllianceDamage(
    allianceId: number,
    after: Date
  ): Promise<Map<number, Record<string, unknown>>> {
    const results = new Map<number, Record<string, unknown>>();
    const warIds: number[] = [];
    const warDefAlum = new Map<number, number>();
    const warDefSteel = new Map<number, number>();

    const makeEntry = (nationName: string, numCities: number): Record<string, unknown> => ({
      nation_name: nationName,
      num_cities: numCities,
      infra_value: 0,
      money_looted: 0,
      gas_looted: 0,
      mun_looted: 0,
      alum_looted: 0,
      steel_looted: 0,
      def_gas_used: 0,
      def_mun_used: 0,
      def_alum_used: 0,
      def_steel_used: 0,
      def_soldiers_killed: 0,
      def_tanks_killed: 0,
      def_aircraft_killed: 0,
      def_ships_sunk: 0,
    });

    const warCutoff = new Date(after.getTime() - 5 * 24 * 60 * 60 * 1000);
    let page = 1;
    while (true) {
      const query = `query GetAllianceWars($alliance_id: [Int], $page: Int) {
        wars(alliance_id: $alliance_id, page: $page, first: 100, active: false) {
          data {
            id att_id def_id att_alliance_id def_alliance_id date def_alum_used def_steel_used
            attacker { nation_name num_cities }
            defender { nation_name num_cities }
          }
          paginatorInfo { hasMorePages }
        }
      }`;
      const data = await this._query(query, { alliance_id: [allianceId], page });
      const payload = ((data['data'] as Record<string, unknown>)?.['wars'] as Record<string, unknown>) ?? {};
      const wars = (payload['data'] as unknown[]) ?? [];
      const hasMore = Boolean((payload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);
      let allBeforeCutoff = true;
      for (const war of wars as Array<Record<string, unknown>>) {
        const dateStr = s(war['date']);
        const warDate = dateStr ? new Date(dateStr) : null;
        if (warDate && !isNaN(warDate.getTime()) && warDate >= warCutoff) {
          allBeforeCutoff = false;
        }
        if (!warDate || isNaN(warDate.getTime()) || warDate < warCutoff) continue;
        const warId = n(war['id']);
        const attAlliance = n(war['att_alliance_id']);
        const defAlliance = n(war['def_alliance_id']);
        if (warId) {
          warDefAlum.set(warId, n(war['def_alum_used']));
          warDefSteel.set(warId, n(war['def_steel_used']));
        }
        if (attAlliance === allianceId) {
          const attId = n(war['att_id']);
          if (attId) {
            const attacker = (war['attacker'] as Record<string, unknown>) ?? {};
            const name = s(attacker['nation_name']) || String(attId);
            const cities = n(attacker['num_cities']);
            if (!results.has(attId)) results.set(attId, makeEntry(name, cities));
            const entry = results.get(attId)!;
            if (cities > (entry['num_cities'] as number)) entry['num_cities'] = cities;
            if (warId && !warIds.includes(warId)) warIds.push(warId);
          }
        }
        if (defAlliance === allianceId && attAlliance !== allianceId) {
          const defId = n(war['def_id']);
          if (defId) {
            const defender = (war['defender'] as Record<string, unknown>) ?? {};
            const name = s(defender['nation_name']) || String(defId);
            const cities = n(defender['num_cities']);
            if (!results.has(defId)) results.set(defId, makeEntry(name, cities));
            const entry = results.get(defId)!;
            if (cities > (entry['num_cities'] as number)) entry['num_cities'] = cities;
            if (warId && !warIds.includes(warId)) warIds.push(warId);
          }
        }
      }
      if (!hasMore || allBeforeCutoff) break;
      page++;
    }

    if (!warIds.length) return results;

    const warMemberUsage = new Map<string, number>();
    const warTotalUsage = new Map<number, number>();
    const warMemberAttacks = new Map<string, number>();
    const warTotalAttacks = new Map<number, number>();

    for (let batchStart = 0; batchStart < warIds.length; batchStart += WARATTACKS_BATCH_SIZE) {
      const batch = warIds.slice(batchStart, batchStart + WARATTACKS_BATCH_SIZE);
      let atkPage = 1;
      while (true) {
        const atkQuery = `query GetWarAttacks($war_id: [Int], $page: Int) {
          warattacks(war_id: $war_id, page: $page, first: 100) {
            data {
              war_id att_id date type victor money_stolen money_looted infra_destroyed_value
              loot_info def_gas_used def_mun_used gasoline_looted munitions_looted
              aluminum_looted steel_looted defcas1 defcas2 aircraft_killed_by_tanks
            }
            paginatorInfo { hasMorePages }
          }
        }`;
        let atkData: Record<string, unknown>;
        try {
          atkData = await this._query(atkQuery, { war_id: batch, page: atkPage });
        } catch {
          break;
        }
        const atkPayload = ((atkData['data'] as Record<string, unknown>)?.['warattacks'] as Record<string, unknown>) ?? {};
        const attacks = (atkPayload['data'] as unknown[]) ?? [];
        const atkHasMore = Boolean((atkPayload['paginatorInfo'] as Record<string, unknown>)?.['hasMorePages']);

        for (const attack of attacks as Array<Record<string, unknown>>) {
          const warId = n(attack['war_id']);
          const attId = n(attack['att_id']);
          if (!results.has(attId)) continue;

          const attackDateStr = s(attack['date']);
          if (attackDateStr) {
            const attackDate = new Date(attackDateStr);
            if (!isNaN(attackDate.getTime()) && attackDate < after) continue;
          }

          const attackType = s(attack['type']);
          const victor = n(attack['victor']);
          const won = attackType === 'VICTORY' || (victor !== 0 && victor === attId);

          const defGas = n(attack['def_gas_used']);
          const defMun = n(attack['def_mun_used']);
          const entry = results.get(attId)!;
          (entry['def_gas_used'] as number) && 0; // TypeScript workaround
          entry['def_gas_used'] = (entry['def_gas_used'] as number) + defGas;
          entry['def_mun_used'] = (entry['def_mun_used'] as number) + defMun;

          if (warId) {
            const usage = Math.max(0, defGas + defMun);
            const k = `${warId}:${attId}`;
            warMemberUsage.set(k, (warMemberUsage.get(k) ?? 0) + usage);
            warTotalUsage.set(warId, (warTotalUsage.get(warId) ?? 0) + usage);
            warMemberAttacks.set(k, (warMemberAttacks.get(k) ?? 0) + 1);
            warTotalAttacks.set(warId, (warTotalAttacks.get(warId) ?? 0) + 1);
          }

          const defcas1 = n(attack['defcas1']);
          const defcas2 = n(attack['defcas2']);
          const acByTanks = n(attack['aircraft_killed_by_tanks']);
          if (attackType === 'GROUND') {
            entry['def_soldiers_killed'] = (entry['def_soldiers_killed'] as number) + defcas1;
            entry['def_tanks_killed'] = (entry['def_tanks_killed'] as number) + defcas2;
            entry['def_aircraft_killed'] = (entry['def_aircraft_killed'] as number) + acByTanks;
          } else if (attackType === 'NAVAL') {
            entry['def_ships_sunk'] = (entry['def_ships_sunk'] as number) + defcas1;
          } else if (attackType === 'AIRVAIR') {
            entry['def_aircraft_killed'] = (entry['def_aircraft_killed'] as number) + defcas1;
          } else if (attackType === 'AIRVSOLDIERS') {
            entry['def_soldiers_killed'] = (entry['def_soldiers_killed'] as number) + defcas2;
          } else if (attackType === 'AIRVTANKS') {
            entry['def_tanks_killed'] = (entry['def_tanks_killed'] as number) + defcas2;
          } else if (attackType === 'AIRVSHIPS') {
            entry['def_ships_sunk'] = (entry['def_ships_sunk'] as number) + defcas2;
          }

          if (!won) continue;

          entry['infra_value'] = (entry['infra_value'] as number) + n(attack['infra_destroyed_value']);

          if (ATTACK_TYPES_WITH_LOOT.has(attackType)) {
            let gas = n(attack['gasoline_looted']);
            let mun = n(attack['munitions_looted']);
            let alum = n(attack['aluminum_looted']);
            let steel = n(attack['steel_looted']);
            if (!gas && !mun && !alum && !steel) {
              const lootStr = s(attack['loot_info']);
              if (lootStr) {
                const [, g, m, a, st] = parseResourceLoot(lootStr);
                gas = g; mun = m; alum = a; steel = st;
              }
            }
            entry['gas_looted'] = (entry['gas_looted'] as number) + gas;
            entry['mun_looted'] = (entry['mun_looted'] as number) + mun;
            entry['alum_looted'] = (entry['alum_looted'] as number) + alum;
            entry['steel_looted'] = (entry['steel_looted'] as number) + steel;
          }

          let money = n(attack['money_stolen']) + n(attack['money_looted']);
          if (!money) {
            const lootStr = s(attack['loot_info']);
            if (lootStr) {
              [money] = parseResourceLoot(lootStr);
            }
          }
          if (money > 0) entry['money_looted'] = (entry['money_looted'] as number) + money;
        }

        if (!atkHasMore) break;
        atkPage++;
      }
    }

    for (const warId of warIds) {
      const alum = warDefAlum.get(warId) ?? 0;
      const steel = warDefSteel.get(warId) ?? 0;
      if (!alum && !steel) continue;
      const totalUsage = warTotalUsage.get(warId) ?? 0;
      const totalAttacks = warTotalAttacks.get(warId) ?? 0;
      for (const [key, attackCount] of warMemberAttacks) {
        const [kWarId, kNationId] = key.split(':').map(Number);
        if (kWarId !== warId) continue;
        const nationId = kNationId!;
        let weight: number;
        if (totalUsage > 0) {
          weight = (warMemberUsage.get(key) ?? 0) / totalUsage;
        } else if (totalAttacks > 0) {
          weight = attackCount / totalAttacks;
        } else {
          continue;
        }
        const entry = results.get(nationId);
        if (entry) {
          entry['def_alum_used'] = (entry['def_alum_used'] as number) + alum * weight;
          entry['def_steel_used'] = (entry['def_steel_used'] as number) + steel * weight;
        }
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Standalone utility functions
// ---------------------------------------------------------------------------

export interface InfraCostOptions {
  advancedEngineeringCorps?: boolean;
  centerForCivilEngineering?: boolean;
  urbanization?: boolean;
  governmentSupportAgency?: boolean;
  bureauOfDomesticAffairs?: boolean;
}

function infraCostDiscountFactor(opts: InfraCostOptions = {}): number {
  let factor = 1.0;
  if (opts.advancedEngineeringCorps) factor -= 0.05;
  if (opts.centerForCivilEngineering) factor -= 0.05;
  if (opts.urbanization) {
    factor -= 0.05;
    if (opts.governmentSupportAgency) factor -= 0.025;
    if (opts.bureauOfDomesticAffairs) factor -= 0.0125;
  }
  return factor;
}

export function calculateInfraCost(buyFrom: number, buyTo: number, opts: InfraCostOptions = {}): number {
  if (buyFrom < 0) buyFrom = 0;
  if (buyTo <= buyFrom) return (buyFrom - buyTo) * -150.0;
  if (buyTo > 20_000) throw new Error(`Infra cannot exceed 20,000 (${buyTo}).`);
  const fromCents = Math.round(buyFrom * 100);
  const toCents = Math.round(buyTo * 100);
  let totalCents = 0;
  for (let i = toCents; i >= fromCents; i -= 10_000) {
    const amount = Math.min(10_000, i - fromCents);
    const costCents = getInfraCostCents(i - amount);
    totalCents += costCents * amount;
  }
  totalCents = Math.floor((totalCents + 50) / 100);
  return totalCents * 0.01 * (buyTo > buyFrom ? infraCostDiscountFactor(opts) : 1.0);
}

const CITY_COST_DEFAULT_AVERAGE = 43.6;

export function calculateCityCost(
  currentCount: number,
  opts: {
    cityAverage?: number;
    manifestDestiny?: boolean;
    governmentSupportAgency?: boolean;
    bureauOfDomesticAffairs?: boolean;
  } = {}
): number {
  const {
    cityAverage = CITY_COST_DEFAULT_AVERAGE,
    manifestDestiny = false,
    governmentSupportAgency = false,
    bureauOfDomesticAffairs = false,
  } = opts;
  const cityN = currentCount + 1;
  const q = cityAverage * 0.25;
  const dynamic = 100_000.0 * Math.pow(cityN - q, 3) + 150_000.0 * (cityN - q) + 75_000.0;
  const floor = 100_000.0 * cityN * cityN;
  let cost = Math.max(floor, dynamic);
  if (manifestDestiny) {
    let factor = 0.05;
    if (governmentSupportAgency) factor += 0.025;
    if (bureauOfDomesticAffairs) factor += 0.0125;
    cost *= 1.0 - factor;
  }
  return Math.max(1.0, cost);
}

// ---------------------------------------------------------------------------
// Revenue calculation
// ---------------------------------------------------------------------------

const TURNS_PER_DAY = 12;
const NORTHERN_CONTINENTS = new Set(['NA', 'EU', 'AS']);
const SOUTHERN_CONTINENTS = new Set(['SA', 'AF', 'AU']);
const CITY_MIN_POPULATION = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function getInfraCostCents(infraCents: number): number {
  // Locutus prices an infra cent at max(infra - 10, 20), rounded to cents.
  return Math.round(100 * (
    300.0 + Math.pow(Math.max((infraCents - 1000) * 0.01, 20.0), 2.2) * 0.0014084507042253522
  ));
}

function normalizeContinent(raw: string): string {
  const mapping: Record<string, string> = {
    'north america': 'NA', 'europe': 'EU', 'asia': 'AS',
    'africa': 'AF', 'south america': 'SA', 'australia': 'AU', 'antarctica': 'AN',
  };
  return mapping[raw.trim().toLowerCase()] ?? raw.trim().toUpperCase().substring(0, 2);
}

function cityCommerceRate(city: City, hasItc: boolean, hasSptp = false): number {
  let rate = (
    city.supermarket * 3.5 + city.bank * 5.0 + city.shoppingMall * 5.0 +
    city.stadium * 5.0 + city.subway * 8.0
  );
  if (hasItc) rate += 2.0;
  if (hasSptp) rate += 4.0;
  return Math.min(100.0, rate);
}

function rawProd(count: number): number {
  if (count <= 0) return 0.0;
  const bonus = Math.max(Math.round((count - 1) * (1.0 / 18.0) * 10000) / 10000, 0.0);
  return count * 3.0 * (1.0 + bonus);
}

function uraniumProd(count: number, hasUep: boolean): number {
  if (count <= 0) return 0.0;
  const bonus = Math.max(Math.round((count - 1) * 0.125 * 10000) / 10000, 0.0);
  return count * 3.0 * (1.0 + (hasUep ? 1 : 0)) * (1.0 + bonus);
}

function manuProd(count: number, perUnit: number, projectMult: number): number {
  if (count <= 0) return 0.0;
  const bonus = Math.max(Math.round((count - 1) * 0.125 * 10000) / 10000, 0.0);
  return count * perUnit * (1.0 + bonus) * projectMult;
}

function coalOilPowerUsage(infra: number, plantCount: number): number {
  if (plantCount <= 0) return 0.0;
  let usage = 0.0;
  let remaining = infra;
  for (let i = 0; i < plantCount; i++) {
    const covered = Math.min(remaining, 500.0);
    if (covered <= 0) break;
    usage += Math.ceil(covered / 100.0) * 1.2;
    remaining -= 500.0;
  }
  return usage;
}

function nuclearPowerUsage(infra: number, plantCount: number): number {
  if (plantCount <= 0) return 0.0;
  let usage = 0.0;
  let remaining = infra;
  for (let i = 0; i < plantCount; i++) {
    const covered = Math.min(remaining, 2000.0);
    if (covered <= 0) break;
    usage += Math.min(Math.ceil(covered / 1000.0) * 3.0, 6.0);
    remaining -= 2000.0;
  }
  return usage;
}

function foodProdPerCity(
  farm: number,
  land: number,
  hasMi: boolean,
  gameMonth: number,
  continent: string,
  contRadiation: number,
  globalRadiation: number
): number {
  if (farm <= 0) return 0.0;
  const landDiv = hasMi ? 400.0 : 500.0;
  let prod = farm * 12.0 * (land / landDiv);
  const farmBonus = Math.max(Math.round((farm - 1) * (5.0 / 190.0) * 10000) / 10000, 0.0);
  prod *= 1.0 + farmBonus;
  let season = 1.0;
  if (NORTHERN_CONTINENTS.has(continent)) {
    if (gameMonth > 5 && gameMonth < 9) season = 1.2;
    else if (gameMonth > 11 || gameMonth < 3) season = 0.8;
  } else if (SOUTHERN_CONTINENTS.has(continent)) {
    if (gameMonth > 5 && gameMonth < 9) season = 0.8;
    else if (gameMonth > 11 || gameMonth < 3) season = 1.2;
  } else {
    if ((gameMonth > 5 && gameMonth < 9) || gameMonth > 11 || gameMonth < 3) season = 0.5;
  }
  const radFactor = Math.max(1.0 - (contRadiation + globalRadiation) / 1000.0, 0.0);
  return prod * season * radFactor;
}

const UPKEEP: Record<string, number> = {
  coal_power: 1200, oil_power: 1800, nuclear_power: 10500, wind_power: 500,
  coal_mine: 400, oil_well: 600, uranium_mine: 5000, iron_mine: 1600,
  bauxite_mine: 1600, lead_mine: 1500, farm: 300, gasrefinery: 4000,
  aluminum_refinery: 2500, steel_mill: 9000, munitions_factory: 8750,
  supermarket: 600, bank: 1800, shopping_mall: 5400, stadium: 12150, subway: 3250,
};

const CITY_UPKEEP_KEY_MAP: Record<string, keyof City> = {
  coal_power: 'coalPower', oil_power: 'oilPower', nuclear_power: 'nuclearPower',
  wind_power: 'windPower', coal_mine: 'coalMine', oil_well: 'oilWell',
  uranium_mine: 'uraniumMine', iron_mine: 'ironMine', bauxite_mine: 'bauxiteMine',
  lead_mine: 'leadMine', farm: 'farm', gasrefinery: 'gasrefinery',
  aluminum_refinery: 'aluminumRefinery', steel_mill: 'steelMill',
  munitions_factory: 'munitionsFactory', supermarket: 'supermarket',
  bank: 'bank', shopping_mall: 'shoppingMall', stadium: 'stadium', subway: 'subway',
};

function improvementUpkeep(city: City): number {
  let total = 0.0;
  for (const [attr, dailyCost] of Object.entries(UPKEEP)) {
    const key = CITY_UPKEEP_KEY_MAP[attr];
    if (key) {
      const count = city[key] as number;
      if (count) total += count * dailyCost;
    }
  }
  return total;
}

function cityAgeDays(city: City): number {
  const foundedAt = Date.parse(city.foundedDate);
  if (!Number.isFinite(foundedAt)) return 1.0;
  return Math.max(1.0, (Date.now() - foundedAt) / DAY_MS);
}

function cityDiseaseRate(city: City, hasCrc: boolean): number {
  const hospitalModifier = city.hospital * (hasCrc ? 3.5 : 2.5);
  return Math.max(
    0.0,
    ((0.01 * Math.pow((city.infrastructure * 100.0) / (city.land + 0.001), 2.0) - 25.0) * 0.01)
      + (city.infrastructure * 0.001)
      - hospitalModifier
  );
}

function cityCrimeRate(city: City, commerce: number, hasSptp: boolean): number {
  const policeModifier = city.policeStation * (hasSptp ? 3.5 : 2.5);
  return Math.max(0.0, ((Math.pow(103.0 - commerce, 2.0) + (city.infrastructure * 100.0)) * 0.000009) - policeModifier);
}

function hasDomesticPolicy(nation: Nation, policy: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalize(nation.domesticPolicy || '') === normalize(policy);
}

function nationGrossModifier(nation: Nation, noFood = false): number {
  const pb = new Set(nation.projectsBuilt);
  let modifier = 1.0;
  if (hasDomesticPolicy(nation, 'OPEN_MARKETS')) {
    modifier += 0.01;
    if (pb.has('GSA')) modifier += 0.005;
    if (pb.has('BDA')) modifier += 0.0025;
  }
  if (noFood) modifier -= 0.33;
  return modifier;
}

function cityPopulation(city: City, commerce: number, hasCrc: boolean, hasSptp: boolean): number {
  const basePopulation = city.infrastructure * 100.0;
  const diseaseDeaths = cityDiseaseRate(city, hasCrc) * 0.01 * basePopulation;
  const crimeDeaths = Math.max(cityCrimeRate(city, commerce, hasSptp) * 0.1 * basePopulation - 25.0, 0.0);
  const ageBonus = 1.0 + Math.log(cityAgeDays(city)) / 15.0;
  return Math.max(CITY_MIN_POPULATION, Math.round((basePopulation - diseaseDeaths - crimeDeaths) * ageBonus));
}

export function computeNationRevenue(
  nation: Nation,
  cities: City[],
  gameInfo: GameInfo = GameInfo.create()
): NationRevenue {
  const pb = new Set(nation.projectsBuilt);
  const hasItc = pb.has('ITC');
  const hasMi = pb.has('MI');
  const hasAla = pb.has('ALA');
  const hasUep = pb.has('UEP');
  const hasIw = pb.has('IW');
  const hasBw = pb.has('BW');
  const hasEgr = pb.has('EGR');
  const hasAs = pb.has('AS');
  const hasSptp = pb.has('SPTP');
  const hasCrc = pb.has('CRC');

  const continent = normalizeContinent(nation.continent || 'NA');
  const contRad = GameInfo.radiationFor(gameInfo, continent);

  const gasMultiplier = hasEgr ? 2.0 : 1.0;
  const munMultiplier = hasAs ? 1.2 : 1.0;
  const steelMultiplier = hasIw ? 1.36 : 1.0;
  const aluminumMultiplier = hasBw ? 1.36 : 1.0;
  const grossModifier = nationGrossModifier(nation);

  let money = 0, foodProduction = 0, foodConsumption = 0;
  let coal = 0, oil = 0, uranium = 0, iron = 0, bauxite = 0, lead = 0;
  let gasoline = 0, munitions = 0, steel = 0, aluminum = 0;
  let totalCommerce = 0;

  for (const city of cities) {
    const commerce = cityCommerceRate(city, hasItc, hasSptp);
    totalCommerce += commerce;
    const population = cityPopulation(city, commerce, hasCrc, hasSptp);
    const newPlayerBonus = 1.0 + Math.max(1.0 - (cities.length - 1) * 0.05, 0.0);
    money += (((commerce * 0.02) * 0.725) + 0.725) * population * newPlayerBonus * grossModifier;
    foodProduction += foodProdPerCity(
      city.farm, city.land, hasMi, gameInfo.gameMonth, continent, contRad, gameInfo.globalRadiation
    );
    coal += rawProd(city.coalMine);
    oil += rawProd(city.oilWell);
    iron += rawProd(city.ironMine);
    bauxite += rawProd(city.bauxiteMine);
    lead += rawProd(city.leadMine);
    uranium += uraniumProd(city.uraniumMine, hasUep);
    if (city.powered) {
      gasoline += manuProd(city.gasrefinery, 6.0, gasMultiplier);
      munitions += manuProd(city.munitionsFactory, 18.0, munMultiplier);
      steel += manuProd(city.steelMill, 9.0, steelMultiplier);
      aluminum += manuProd(city.aluminumRefinery, 9.0, aluminumMultiplier);
      oil -= manuProd(city.gasrefinery, 3.0, gasMultiplier);
      lead -= manuProd(city.munitionsFactory, 6.0, 1.0);
      iron -= manuProd(city.steelMill, 3.0, steelMultiplier);
      coal -= manuProd(city.steelMill, 3.0, steelMultiplier);
      bauxite -= manuProd(city.aluminumRefinery, 3.0, aluminumMultiplier);
      coal -= coalOilPowerUsage(city.infrastructure, city.coalPower);
      oil -= coalOilPowerUsage(city.infrastructure, city.oilPower);
      uranium -= nuclearPowerUsage(city.infrastructure, city.nuclearPower);
    }
    money -= improvementUpkeep(city);
  }

  if (hasAla) foodProduction *= 1.2;

  const atWar = nation.offensiveWars + nation.defensiveWars > 0;
  const soldierDivisor = atWar ? 500.0 : 750.0;
  foodConsumption = nation.population / 850.0 + nation.soldiers / soldierDivisor;

  const colorKey = (nation.color || '').toLowerCase();
  const colorTurnBonus = gameInfo.colorBonuses[colorKey] ?? 0;
  money += colorTurnBonus * TURNS_PER_DAY * grossModifier;

  const avgCommerce = cities.length > 0 ? totalCommerce / cities.length : 0;

  return {
    money, foodProduction, foodConsumption, coal, oil, uranium, iron, bauxite, lead,
    gasoline, munitions, steel, aluminum, avgCommerce,
    food: foodProduction - foodConsumption,
  };
}

// ---------------------------------------------------------------------------
// PnW WebSocket subscription client
// ---------------------------------------------------------------------------

const PNW_PUSHER_URL = 'wss://socket.politicsandwar.com/app/a22734a47847a64386c8?protocol=7';
const PNW_SUBSCRIPTION_URL = 'https://api.politicsandwar.com/subscriptions/v1/subscribe/{model}/{event}';
const PNW_SUBSCRIPTION_AUTH_URL = 'https://api.politicsandwar.com/subscriptions/v1/auth';
// Turn-change window constants (seconds in the 2-hour turn cycle).
// Cycle: even hour:00:00 -> next even hour:00:00 (7200 seconds total).
// Window spans across boundary: :59:28 -> :00:32.
const TURN_CYCLE_SECONDS = 7200;
const TURN_WINDOW_START = 7168;
const TURN_WINDOW_END = 32;
const TURN_WINDOW_LEN = (TURN_CYCLE_SECONDS - TURN_WINDOW_START) + TURN_WINDOW_END;
const MIN_TURN_WINDOW_SLEEP_MS = 100;
const MAX_TURN_WINDOW_SLEEP_MS = 1000;

function secsIntoTurnCycle(): number {
  const now = new Date();
  return (now.getUTCHours() % 2) * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
}

function inTurnWindow(): [boolean, number] {
  const s = secsIntoTurnCycle();
  if (s >= TURN_WINDOW_START) {
    return [true, TURN_WINDOW_LEN - (s - TURN_WINDOW_START)];
  }
  if (s < TURN_WINDOW_END) {
    return [true, TURN_WINDOW_END - s];
  }
  return [false, 0];
}

export function secsUntilTurnWindow(): number {
  const s = secsIntoTurnCycle();
  if (s >= TURN_WINDOW_START) return 0;
  if (s < TURN_WINDOW_END) return 0;
  return TURN_WINDOW_START - s;
}

export function parseNationCreateDetail(raw: Record<string, unknown>): NationCreateDetail | null {
  const nationId = n(raw['id']);
  if (!nationId) return null;
  const dateStr = s(raw['date']);
  let founded: Date;
  try {
    founded = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(founded.getTime())) founded = new Date();
  } catch {
    founded = new Date();
  }
  return {
    nationId,
    nationName: s(raw['nation_name']) || String(nationId),
    leaderName: s(raw['leader_name']),
    founded,
    allianceId: n(raw['alliance_id']),
    cities: n(raw['num_cities']),
    score: n(raw['score']),
  };
}

const WAR_DETAIL_QUERY = `query GetWarDetail($id: [Int]) {
  wars(id: $id, first: 1) {
    data {
      id date war_type att_id def_id att_alliance_id def_alliance_id
      attacker {
        nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
        alliance { name }
      }
      defender {
        nation_name leader_name num_cities score soldiers tanks aircraft ships missiles nukes wars_won wars_lost
        alliance { name }
      }
    }
  }
}`;

function parseWarFromDict(raw: Record<string, unknown>): WarDetail | null {
  const warId = n(raw['id']);
  if (!warId) return null;
  const dateStr = s(raw['date']);
  const warDate = dateStr ? new Date(dateStr) : new Date();
  const attacker = (raw['attacker'] as Record<string, unknown>) ?? {};
  const defender = (raw['defender'] as Record<string, unknown>) ?? {};
  const attAlliance = ((attacker['alliance'] as Record<string, unknown>) ?? (raw['att_alliance'] as Record<string, unknown>)) ?? {};
  const defAlliance = ((defender['alliance'] as Record<string, unknown>) ?? (raw['def_alliance'] as Record<string, unknown>)) ?? {};
  return {
    warId,
    date: isNaN(warDate.getTime()) ? new Date() : warDate,
    warType: (s(raw['war_type']) || 'ORDINARY').toUpperCase(),
    attackerId: n(raw['att_id']),
    attackerName: s(attacker['nation_name']) || String(raw['att_id'] ?? '?'),
    attackerLeader: s(attacker['leader_name']),
    attackerAllianceId: n(raw['att_alliance_id']),
    attackerAllianceName: s(attAlliance['name']),
    attackerCities: n(attacker['num_cities']),
    attackerScore: n(attacker['score']),
    attackerSoldiers: n(attacker['soldiers']),
    attackerTanks: n(attacker['tanks']),
    attackerAircraft: n(attacker['aircraft']),
    attackerShips: n(attacker['ships']),
    attackerMissiles: n(attacker['missiles']),
    attackerNukes: n(attacker['nukes']),
    attackerWarsWon: n(attacker['wars_won']),
    attackerWarsLost: n(attacker['wars_lost']),
    defenderId: n(raw['def_id']),
    defenderName: s(defender['nation_name']) || String(raw['def_id'] ?? '?'),
    defenderLeader: s(defender['leader_name']),
    defenderAllianceId: n(raw['def_alliance_id']),
    defenderAllianceName: s(defAlliance['name']),
    defenderCities: n(defender['num_cities']),
    defenderScore: n(defender['score']),
    defenderSoldiers: n(defender['soldiers']),
    defenderTanks: n(defender['tanks']),
    defenderAircraft: n(defender['aircraft']),
    defenderShips: n(defender['ships']),
    defenderMissiles: n(defender['missiles']),
    defenderNukes: n(defender['nukes']),
    defenderWarsWon: n(defender['wars_won']),
    defenderWarsLost: n(defender['wars_lost']),
  };
}

function getFirstNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (key in raw) return n(raw[key]);
  }
  return undefined;
}

function getFirstString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (key in raw) return s(raw[key]);
  }
  return undefined;
}

function parseWarCreateFromSubscription(raw: Record<string, unknown>): WarDetail | null {
  const warId = getFirstNumber(raw, ['id', 'war_id', 'warId']) ?? 0;
  if (!warId) return null;
  const dateStr = getFirstString(raw, ['date', 'created_at', 'createdAt']) || '';
  const warDate = dateStr ? new Date(dateStr) : new Date();
  const attacker = (raw['attacker'] as Record<string, unknown>) ?? {};
  const defender = (raw['defender'] as Record<string, unknown>) ?? {};
  const attAlliance = ((attacker['alliance'] as Record<string, unknown>) ?? (raw['att_alliance'] as Record<string, unknown>)) ?? {};
  const defAlliance = ((defender['alliance'] as Record<string, unknown>) ?? (raw['def_alliance'] as Record<string, unknown>)) ?? {};
  const attackerId = getFirstNumber(raw, ['att_id', 'attacker_id', 'attacker_nation_id', 'attid']) ?? 0;
  const defenderId = getFirstNumber(raw, ['def_id', 'defender_id', 'defender_nation_id', 'defid']) ?? 0;
  return {
    warId,
    date: isNaN(warDate.getTime()) ? new Date() : warDate,
    warType: (getFirstString(raw, ['war_type', 'warType', 'declaration_type', 'declaration']) || 'ORDINARY').toUpperCase(),
    attackerId,
    attackerName: getFirstString(attacker, ['nation_name', 'name']) || getFirstString(raw, ['attacker_name']) || (attackerId ? String(attackerId) : '?'),
    attackerLeader: getFirstString(attacker, ['leader_name', 'leader']) || '',
    attackerAllianceId: getFirstNumber(raw, ['att_alliance_id', 'attacker_alliance_id', 'attallianceid']) ?? 0,
    attackerAllianceName: getFirstString(attAlliance, ['name']) || getFirstString(raw, ['attacker_alliance_name']) || '',
    attackerCities: getFirstNumber(attacker, ['num_cities', 'cities']) ?? 0,
    attackerScore: getFirstNumber(attacker, ['score']) ?? 0,
    attackerSoldiers: getFirstNumber(attacker, ['soldiers']) ?? 0,
    attackerTanks: getFirstNumber(attacker, ['tanks']) ?? 0,
    attackerAircraft: getFirstNumber(attacker, ['aircraft']) ?? 0,
    attackerShips: getFirstNumber(attacker, ['ships']) ?? 0,
    attackerMissiles: getFirstNumber(attacker, ['missiles']) ?? 0,
    attackerNukes: getFirstNumber(attacker, ['nukes']) ?? 0,
    attackerWarsWon: getFirstNumber(attacker, ['wars_won']) ?? 0,
    attackerWarsLost: getFirstNumber(attacker, ['wars_lost']) ?? 0,
    defenderId,
    defenderName: getFirstString(defender, ['nation_name', 'name']) || getFirstString(raw, ['defender_name']) || (defenderId ? String(defenderId) : '?'),
    defenderLeader: getFirstString(defender, ['leader_name', 'leader']) || '',
    defenderAllianceId: getFirstNumber(raw, ['def_alliance_id', 'defender_alliance_id', 'defallianceid']) ?? 0,
    defenderAllianceName: getFirstString(defAlliance, ['name']) || getFirstString(raw, ['defender_alliance_name']) || '',
    defenderCities: getFirstNumber(defender, ['num_cities', 'cities']) ?? 0,
    defenderScore: getFirstNumber(defender, ['score']) ?? 0,
    defenderSoldiers: getFirstNumber(defender, ['soldiers']) ?? 0,
    defenderTanks: getFirstNumber(defender, ['tanks']) ?? 0,
    defenderAircraft: getFirstNumber(defender, ['aircraft']) ?? 0,
    defenderShips: getFirstNumber(defender, ['ships']) ?? 0,
    defenderMissiles: getFirstNumber(defender, ['missiles']) ?? 0,
    defenderNukes: getFirstNumber(defender, ['nukes']) ?? 0,
    defenderWarsWon: getFirstNumber(defender, ['wars_won']) ?? 0,
    defenderWarsLost: getFirstNumber(defender, ['wars_lost']) ?? 0,
  };
}

type SubscriptionEvent = WarDetail | NationCreateDetail;
type SubscriptionQueryValue = string | number | boolean;
type SubscriptionQuery = Record<string, SubscriptionQueryValue | SubscriptionQueryValue[]>;

export class PnWSubscriptionClient {
  private static readonly MS_PER_SECOND = 1_000;
  private static readonly SECONDS_PER_MINUTE = 60;
  private static readonly KEEPALIVE_INTERVAL_SECONDS = 18;
  private static readonly GATEWAY_RESET_INTERVAL_MINUTES = (() => {
    const raw = Number.parseInt(process.env.PNW_SUBSCRIPTION_GATEWAY_RESET_MINUTES || '', 10);
    return Number.isFinite(raw) && raw >= 30 ? raw : 180;
  })();
  private static readonly RECONNECT_BASE = 15;
  private static readonly RECONNECT_MAX = 300;
  private static readonly MIN_IDLE_RECONNECT_DELAY_SECONDS = 5;
  private static readonly WAR_DEDUPE_WINDOW_MINUTES = 10;
  private static readonly WAR_DEDUPE_COOLDOWN_SECONDS = 60;
  private static readonly GATEWAY_RESET_INTERVAL_MS =
    PnWSubscriptionClient.GATEWAY_RESET_INTERVAL_MINUTES
    * PnWSubscriptionClient.SECONDS_PER_MINUTE
    * PnWSubscriptionClient.MS_PER_SECOND;
  private static readonly KEEPALIVE_INTERVAL_MS =
    PnWSubscriptionClient.KEEPALIVE_INTERVAL_SECONDS
    * PnWSubscriptionClient.MS_PER_SECOND;
  private static readonly WAR_DEDUPE_WINDOW_MS =
    PnWSubscriptionClient.WAR_DEDUPE_WINDOW_MINUTES
    * PnWSubscriptionClient.SECONDS_PER_MINUTE
    * PnWSubscriptionClient.MS_PER_SECOND;
  private static readonly WAR_DEDUPE_COOLDOWN_MS =
    PnWSubscriptionClient.WAR_DEDUPE_COOLDOWN_SECONDS
    * PnWSubscriptionClient.MS_PER_SECOND;

  private _apiKey: string;
  private _channelCache = new Map<string, string>();

  constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  private _normalizedChannelQueryEntries(query?: SubscriptionQuery): [string, string][] {
    if (!query) return [];
    const entries: [string, string][] = [];
    const keys = Object.keys(query).sort();
    for (const key of keys) {
      const value = query[key];
      if (Array.isArray(value)) {
        const filtered = value
          .map((item) => String(item))
          .filter((item) => item.length > 0);
        if (!filtered.length) continue;
        entries.push([key, filtered.join(',')]);
      } else {
        entries.push([key, String(value)]);
      }
    }
    return entries;
  }

  private _serializeChannelQuery(query?: SubscriptionQuery): string {
    return this._normalizedChannelQueryEntries(query)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  private async _getChannel(model: string, event: string, query?: SubscriptionQuery): Promise<string> {
    const url = new URL(PNW_SUBSCRIPTION_URL.replace('{model}', model).replace('{event}', event));
    url.searchParams.set('api_key', this._apiKey);
    for (const [key, value] of this._normalizedChannelQueryEntries(query)) {
      url.searchParams.set(key, value);
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await resp.json() as Record<string, unknown>;
    if (data['error']) throw new Error(`PnW subscription API error: ${data['error']}`);
    const channel = data['channel'] as string;
    if (!channel) throw new Error(`PnW subscription API returned no channel: ${JSON.stringify(data)}`);
    return channel;
  }

  private async _getAuth(channel: string, socketId: string): Promise<string> {
    const params = new URLSearchParams({
      socket_id: socketId,
      channel_name: channel,
      api_key: this._apiKey,
    });
    const resp = await fetch(PNW_SUBSCRIPTION_AUTH_URL, {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await resp.json() as Record<string, unknown>;
    const auth = data['auth'] as string;
    if (!auth) throw new Error(`PnW subscription auth returned no token: ${JSON.stringify(data)}`);
    return auth;
  }

  private async *_streamSubscription<T>(opts: {
    model: string;
    event: string;
    eventNames: [string, string];
    parser: (raw: Record<string, unknown>) => T | null;
    logPrefix: string;
    channelQuery?: SubscriptionQuery;
    channelQueries?: SubscriptionQuery[];
    disableChannelCache?: boolean;
  }): AsyncGenerator<T> {
    const queryList = opts.channelQueries?.length ? opts.channelQueries : [opts.channelQuery ?? {}];
    const channelEntries: { cacheKey: string; channel: string; }[] = [];
    for (const query of queryList) {
      const cacheKey = `${opts.model}:${opts.event}:${this._serializeChannelQuery(query)}`;
      let channel = opts.disableChannelCache ? undefined : this._channelCache.get(cacheKey);
      if (!channel) {
        channel = await this._getChannel(opts.model, opts.event, query);
        if (!opts.disableChannelCache) this._channelCache.set(cacheKey, channel);
      }
      channelEntries.push({ cacheKey, channel });
    }
    const channels = [...new Set(channelEntries.map((entry) => entry.channel))];
    console.info(`${opts.logPrefix} obtained channels ${channels.join(', ')}.`);

    const ws = new WebSocket(PNW_PUSHER_URL);
    const messageQueue: Record<string, unknown>[] = [];
    let socketId: string | null = null;
    const subscribedChannels = new Set<string>();
    let closed = false;
    let intentionalCloseReason = '';
    const gatewayResetAt = Date.now() + PnWSubscriptionClient.GATEWAY_RESET_INTERVAL_MS;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    let lastActivityAt = Date.now();

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => { console.error(`${opts.logPrefix} WS error:`, err); resolve(); });
    });

    if (ws.readyState !== WebSocket.OPEN) return;
    console.info(`${opts.logPrefix} WebSocket connected.`);

    ws.on('message', (raw) => {
      try {
        lastActivityAt = Date.now();
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
        const wsEvent = s(frame['event']);
        if (wsEvent === 'pusher:ping') {
          const pusherPingData = frame['data'];
          let pongData: Record<string, unknown> = {};
          if (typeof pusherPingData === 'string') {
            try {
              const parsed = JSON.parse(pusherPingData);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                pongData = parsed as Record<string, unknown>;
              }
            } catch {
              // Fall back to an empty object.
            }
          } else if (pusherPingData && typeof pusherPingData === 'object' && !Array.isArray(pusherPingData)) {
            pongData = pusherPingData as Record<string, unknown>;
          }
          ws.send(JSON.stringify({ event: 'pusher:pong', data: pongData }));
          return;
        }
        messageQueue.push(frame);
      } catch { /**/ }
    });
    ws.on('pong', () => {
      lastActivityAt = Date.now();
    });
    ws.on('ping', () => {
      lastActivityAt = Date.now();
      try {
        ws.pong();
      } catch {
        // Ignore keepalive send failures; close/error handlers drive reconnect.
      }
    });
    ws.on('close', (code: number, reason: Buffer) => {
      closed = true;
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      const reasonText = reason.length ? reason.toString('utf8') : '';
      const idleSeconds = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000));
      const closeSummary =
        `${opts.logPrefix} WebSocket closed (code=${code}, reason=${reasonText || 'n/a'}, subscribed=${subscribedChannels.size}/${channels.length}, idle=${idleSeconds}s).`;
      if (intentionalCloseReason) {
        console.info(`${closeSummary} ${intentionalCloseReason}.`);
      } else {
        for (const entry of channelEntries) this._channelCache.delete(entry.cacheKey);
        console.warn(closeSummary);
      }
    });
    ws.on('error', () => { closed = true; });
    keepaliveTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
      } catch {
        // Ignore keepalive send failures; close/error handlers drive reconnect.
      }
    }, PnWSubscriptionClient.KEEPALIVE_INTERVAL_MS);

    const [singleEvent, bulkEvent] = opts.eventNames;

    while (!closed) {
      if (Date.now() >= gatewayResetAt) {
        intentionalCloseReason = `Scheduled reconnect after ${PnWSubscriptionClient.GATEWAY_RESET_INTERVAL_MINUTES} minutes`;
        ws.close();
        break;
      }
      const frame = messageQueue.shift();
      if (!frame) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      const wsEvent = s(frame['event']);
      if (wsEvent === 'pusher:connection_established') {
        const inner = typeof frame['data'] === 'string'
          ? JSON.parse(frame['data']) as Record<string, unknown>
          : (frame['data'] as Record<string, unknown>) ?? {};
        socketId = s(inner['socket_id']) || null;
        if (!socketId) {
          console.warn(`${opts.logPrefix} no socket_id in connection_established`);
          ws.close();
          return;
        }
        console.info(`${opts.logPrefix} connection established (socket_id=${socketId}).`);
        for (const channel of channels) {
          const auth = await this._getAuth(channel, socketId);
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth, channel } }));
        }
      } else if (wsEvent === 'pusher_internal:subscription_succeeded') {
        const eventChannel = s(frame['channel']);
        if (eventChannel) subscribedChannels.add(eventChannel);
        console.info(`${opts.logPrefix} subscribed to channel ${eventChannel || 'unknown'} (${subscribedChannels.size}/${channels.length}).`);
      } else if (wsEvent === singleEvent || wsEvent === bulkEvent) {
        let rawData = frame['data'];
        if (typeof rawData === 'string') {
          try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
        }
        const items: Record<string, unknown>[] = wsEvent === bulkEvent
          ? rawData as Record<string, unknown>[]
          : [rawData as Record<string, unknown>];
        for (const item of items) {
          const parsed = opts.parser(item);
          if (parsed !== null) yield parsed;
        }
      } else if (wsEvent === 'pusher:error') {
        console.warn(`${opts.logPrefix} gateway error:`, frame['data']);
        for (const entry of channelEntries) this._channelCache.delete(entry.cacheKey);
        ws.close();
        return;
      }
    }
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  async *iterWarCreates(opts?: {
    getAllianceIds?: () => Promise<number[]>;
    idleDelaySeconds?: number;
  }): AsyncGenerator<WarDetail> {
    let delay = PnWSubscriptionClient.RECONNECT_BASE;
    const recentlyEmittedWarIds = new Map<number, number>();
    while (true) {
      try {
        const dynamicAllianceIds = opts?.getAllianceIds
          ? await opts.getAllianceIds()
          : [];
        const allianceIds = [...new Set(dynamicAllianceIds.filter((id) => Number.isInteger(id) && id > 0))];
        if (opts?.getAllianceIds && !allianceIds.length) {
          const idleDelay = Math.max(PnWSubscriptionClient.MIN_IDLE_RECONNECT_DELAY_SECONDS, opts.idleDelaySeconds ?? 60);
          await new Promise((r) => setTimeout(r, idleDelay * 1000));
          delay = PnWSubscriptionClient.RECONNECT_BASE;
          continue;
        }
        const nowMs = Date.now();
        for (const [warId, seenAt] of recentlyEmittedWarIds) {
          if (nowMs - seenAt > PnWSubscriptionClient.WAR_DEDUPE_WINDOW_MS) recentlyEmittedWarIds.delete(warId);
        }
        for await (const war of this._streamSubscription({
          model: 'war',
          event: 'create',
          eventNames: ['WAR_CREATE', 'BULK_WAR_CREATE'],
          parser: parseWarCreateFromSubscription,
          logPrefix: 'PnW subscription:',
          channelQueries: allianceIds.length
            ? [{ att_alliance_id: allianceIds }, { def_alliance_id: allianceIds }]
            : undefined,
          disableChannelCache: !!opts?.getAllianceIds,
        })) {
          const warId = Number.isInteger(war.warId) ? war.warId : 0;
          if (warId > 0) {
            const seenAt = recentlyEmittedWarIds.get(warId);
            const nowMs = Date.now();
            if (seenAt && nowMs - seenAt < PnWSubscriptionClient.WAR_DEDUPE_COOLDOWN_MS) {
              continue;
            }
            recentlyEmittedWarIds.set(warId, nowMs);
          }
          delay = PnWSubscriptionClient.RECONNECT_BASE;
          yield war;
        }
      } catch (err) {
        console.error(`PnW subscription: connection lost, reconnecting in ${delay}s.`, err);
      }
      const [insideWindow, remaining] = inTurnWindow();
      if (insideWindow) {
        delay = PnWSubscriptionClient.RECONNECT_BASE;
        const sleepMs = Math.max(
          MIN_TURN_WINDOW_SLEEP_MS,
          Math.min(MAX_TURN_WINDOW_SLEEP_MS, remaining * 1000)
        );
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      await new Promise((r) => setTimeout(r, delay * 1000));
      delay = Math.min(delay * 2, PnWSubscriptionClient.RECONNECT_MAX);
    }
  }

  async *iterNationCreates(): AsyncGenerator<NationCreateDetail> {
    let delay = PnWSubscriptionClient.RECONNECT_BASE;
    while (true) {
      try {
        for await (const nation of this._streamSubscription({
          model: 'nation',
          event: 'create',
          eventNames: ['NATION_CREATE', 'BULK_NATION_CREATE'],
          parser: parseNationCreateDetail,
          logPrefix: 'PnW recruiter subscription:',
          disableChannelCache: true,
        })) {
          delay = PnWSubscriptionClient.RECONNECT_BASE;
          yield nation;
        }
      } catch (err) {
        console.error(`PnW recruiter subscription: connection lost, reconnecting in ${delay}s.`, err);
      }
      const [insideWindow, remaining] = inTurnWindow();
      if (insideWindow) {
        delay = PnWSubscriptionClient.RECONNECT_BASE;
        const sleepMs = Math.max(
          MIN_TURN_WINDOW_SLEEP_MS,
          Math.min(MAX_TURN_WINDOW_SLEEP_MS, remaining * 1000)
        );
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      await new Promise((r) => setTimeout(r, delay * 1000));
      delay = Math.min(delay * 2, PnWSubscriptionClient.RECONNECT_MAX);
    }
  }
}
