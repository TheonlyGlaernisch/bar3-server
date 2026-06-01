import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TradePrice,
  calculateCityCost,
  calculateInfraCost,
  computeNationRevenue,
  GameInfo,
  parseLootResources,
  parseNationCreateDetail,
  parseResourceLoot,
  secsUntilTurnWindow,
  PnWClient,
} from './build/src/pnw_api.js';

test('TradePrice helpers calculate expected value totals', () => {
  const prices = { gasoline: 100, munitions: 200, aluminum: 300, steel: 400 };
  const resourceValue = TradePrice.resourceValue(prices, { gasoline: 2, munitions: 1, aluminum: 0, steel: 3 });
  assert.equal(resourceValue, 2 * 100 + 1 * 200 + 3 * 400);

  const unitValue = TradePrice.unitKillValue(prices, { soldiers: 10, tanks: 2, aircraft: 1, ships: 0 });
  const expected = (10 * 5.0) + (2 * (60.0 + 0.5 * 400)) + (1 * (4000.0 + 10.0 * 300));
  assert.equal(unitValue, expected);
});

test('calculateInfraCost matches Locutus cent-rounded formula and discounts', () => {
  const small = calculateInfraCost(100, 110);
  const big = calculateInfraCost(100, 120);
  assert.equal(small, 3280.6);
  assert.equal(big, 6561.2);
  assert.equal(calculateInfraCost(1000, 1500), 4337302);
  assert.equal(calculateInfraCost(1500, 1000), -75000);
  const discounted = calculateInfraCost(1000, 1500, {
    urbanization: true,
    governmentSupportAgency: true,
    bureauOfDomesticAffairs: true,
    centerForCivilEngineering: true,
    advancedEngineeringCorps: true,
  });
  assert.ok(Math.abs(discounted - (4337302 * 0.8125)) < 0.001);
});

test('computeNationRevenue money uses Locutus-style population inputs', () => {
  const nation = {
    projectsBuilt: ['CRC'],
    continent: 'NA',
    offensiveWars: 0,
    defensiveWars: 0,
    population: 100000,
    soldiers: 0,
    color: '',
    domesticPolicy: '',
  };
  const cityBase = {
    cityId: 1,
    foundedDate: '2020-01-01',
    infrastructure: 1500,
    land: 2000,
    powered: true,
    coalPower: 0, oilPower: 0, nuclearPower: 0, windPower: 0,
    coalMine: 0, oilWell: 0, uraniumMine: 0, ironMine: 0, bauxiteMine: 0, leadMine: 0,
    farm: 0, supermarket: 4, bank: 4, shoppingMall: 2, stadium: 1, subway: 1,
    gasrefinery: 0, aluminumRefinery: 0, steelMill: 0, munitionsFactory: 0,
    policeStation: 0,
    hospital: 0,
  };
  const noHospitals = computeNationRevenue(nation, [cityBase], GameInfo.create()).money;
  const withHospitals = computeNationRevenue(nation, [{ ...cityBase, hospital: 5 }], GameInfo.create()).money;
  assert.ok(withHospitals > noHospitals);
});


test('computeNationRevenue money is daily Locutus income, not per-turn income multiplied twice', () => {
  const nation = {
    projectsBuilt: [],
    continent: 'NA',
    offensiveWars: 0,
    defensiveWars: 0,
    population: 100000,
    soldiers: 0,
    color: '',
    domesticPolicy: '',
  };
  const city = {
    cityId: 1,
    foundedDate: 'bad-date',
    infrastructure: 100,
    land: 100000,
    powered: true,
    coalPower: 0, oilPower: 0, nuclearPower: 0, windPower: 0,
    coalMine: 0, oilWell: 0, uraniumMine: 0, ironMine: 0, bauxiteMine: 0, leadMine: 0,
    farm: 0, supermarket: 0, bank: 0, shoppingMall: 0, stadium: 0, subway: 0,
    gasrefinery: 0, aluminumRefinery: 0, steelMill: 0, munitionsFactory: 0,
    policeStation: 0,
    hospital: 0,
  };
  // With invalid city age, Locutus-style ageDays clamps to 1; population rounds to
  // 9,840 and the one-city new-player bonus doubles base commerce income.
  assert.equal(computeNationRevenue(nation, [city], GameInfo.create()).money, 14268);
});

test('calculateCityCost applies policy/project discounts', () => {
  const base = calculateCityCost(10, { cityAverage: 20, manifestDestiny: false, governmentSupportAgency: false });
  const md = calculateCityCost(10, { cityAverage: 20, manifestDestiny: true, governmentSupportAgency: false });
  const mdGsa = calculateCityCost(10, { cityAverage: 20, manifestDestiny: true, governmentSupportAgency: true });
  assert.ok(md < base);
  assert.ok(mdGsa < md);
});

test('parseNationCreateDetail parses valid events and rejects missing id', () => {
  const parsed = parseNationCreateDetail({
    id: 123,
    nation_name: 'Foo',
    leader_name: 'Bar',
    date: '2026-01-02T03:04:05Z',
    alliance_id: 99,
    num_cities: 5,
    score: 1234.5,
  });
  assert.ok(parsed);
  assert.equal(parsed.nationId, 123);
  assert.equal(parsed.nationName, 'Foo');
  assert.equal(parsed.leaderName, 'Bar');
  assert.equal(parsed.allianceId, 99);
  assert.equal(parsed.cities, 5);
  assert.equal(parsed.score, 1234.5);

  const missingId = parseNationCreateDetail({ nation_name: 'Nope' });
  assert.equal(missingId, null);
});

test('secsUntilTurnWindow always returns non-negative bounded value', () => {
  const secs = secsUntilTurnWindow();
  assert.ok(secs >= 0);
  assert.ok(secs <= 2 * 60 * 60);
});


test('parseLootResources extracts full victory resource payloads', () => {
  const loot = parseLootResources('won the war and looted 1,234 money, 50 food, 2 coal, 3 oil, 4 uranium, 5 iron, 6 bauxite, 7 lead, 8 gasoline, 9 munitions, 10 steel, 11 aluminum.');
  assert.equal(loot.money, 1234);
  assert.equal(loot.food, 50);
  assert.equal(loot.coal, 2);
  assert.equal(loot.oil, 3);
  assert.equal(loot.uranium, 4);
  assert.equal(loot.iron, 5);
  assert.equal(loot.bauxite, 6);
  assert.equal(loot.lead, 7);
  assert.equal(loot.gasoline, 8);
  assert.equal(loot.munitions, 9);
  assert.equal(loot.steel, 10);
  assert.equal(loot.aluminum, 11);
});

test('parseResourceLoot extracts all five resource amounts', () => {
  const line = 'attacked and looted 1,234.5 money, 10 gasoline, 20 munitions, 30 aluminum, 40 steel';
  const [money, gas, mun, alu, stl] = parseResourceLoot(line);
  assert.equal(money, 1234.5);
  assert.equal(gas, 10);
  assert.equal(mun, 20);
  assert.equal(alu, 30);
  assert.equal(stl, 40);
});

test('parseResourceLoot returns zeros for empty string', () => {
  const [money, gas, mun, alu, stl] = parseResourceLoot('');
  assert.equal(money, 0);
  assert.equal(gas, 0);
  assert.equal(mun, 0);
  assert.equal(alu, 0);
  assert.equal(stl, 0);
});

test('getNationWarLoot requests inactive wars like Locutus', async () => {
  const client = new PnWClient('test-key');
  const queries = [];
  client._query = async (query) => {
    queries.push(query);
    return {
      data: {
        wars: { data: [], paginatorInfo: { hasMorePages: false } },
      },
    };
  };

  const summary = await client.getNationWarLoot(123, 7);
  assert.equal(summary.warsChecked, 0);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((query) => query.includes('active: false')), 'wars queries should opt into inactive war fetching');
});

test('getAllianceDamage requests inactive wars like Locutus', async () => {
  const client = new PnWClient('test-key');
  const queries = [];
  client._query = async (query) => {
    queries.push(query);
    return {
      data: {
        wars: { data: [], paginatorInfo: { hasMorePages: false } },
      },
    };
  };

  const damage = await client.getAllianceDamage(456, new Date('2026-01-01T00:00:00Z'));
  assert.equal(damage.size, 0);
  assert.equal(queries.length, 1);
  assert.ok(queries[0].includes('active: false'), 'alliance damage war query should opt into inactive war fetching');
});

test('parseResourceLoot returns zeros when resource not mentioned', () => {
  const [money, gas, mun, alu, stl] = parseResourceLoot('stole 500 money');
  assert.equal(money, 500);
  assert.equal(gas, 0);
  assert.equal(mun, 0);
  assert.equal(alu, 0);
  assert.equal(stl, 0);
});


test('getNationWarLoot queries supported war fields and includes ground attack loot', async () => {
  const { PnWClient } = await import('./build/src/pnw_api.js');
  const client = new PnWClient('test-key');
  const queries = [];
  client._query = async (query, variables) => {
    queries.push({ query, variables });
    if (query.includes('GetNationLootWars')) {
      assert.equal('daysAgo' in variables, false);
      assert.doesNotMatch(query, /active:/);
      assert.doesNotMatch(query, /days_ago:/);
      assert.match(query, /id date end_date att_id def_id/);
      const isAttackerRole = query.includes('wars(attid:');
      return {
        data: {
          wars: {
            data: isAttackerRole ? [{
              id: 123,
              date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              end_date: new Date().toISOString(),
              att_id: 1,
              def_id: 2,
              attacker: { nation_name: 'Raider' },
              defender: { nation_name: 'Target' },
            }] : [],
            paginatorInfo: { hasMorePages: false },
          },
        },
      };
    }
    if (query.includes('GetNationAttackLoot')) {
      assert.deepEqual(variables.war_id, [123]);
      return {
        data: {
          warattacks: {
            data: [
              {
                war_id: 123,
                att_id: 1,
                date: new Date().toISOString(),
                type: 'GROUND',
                victor: 1,
                money_stolen: 100,
                money_looted: 0,
                gasoline_looted: 5,
                munitions_looted: 6,
                aluminum_looted: 7,
                steel_looted: 8,
                loot_info: '',
              },
              {
                war_id: 123,
                att_id: 1,
                date: new Date(Date.now() + 1000).toISOString(),
                type: 'VICTORY',
                victor: 1,
                money_stolen: 0,
                money_looted: 200,
                gasoline_looted: 0,
                munitions_looted: 0,
                aluminum_looted: 0,
                steel_looted: 0,
                loot_info: 'won the war and looted 10 food, 20 coal.',
              },
            ],
            paginatorInfo: { hasMorePages: false },
          },
        },
      };
    }
    throw new Error(`Unexpected query: ${query}`);
  };

  const summary = await client.getNationWarLoot(1, 7);
  assert.equal(summary.warsChecked, 1);
  assert.equal(summary.lootAttacks, 2);
  assert.equal(summary.victoryAttacks, 1);
  assert.equal(summary.gained.money, 300);
  assert.equal(summary.gained.gasoline, 5);
  assert.equal(summary.gained.munitions, 6);
  assert.equal(summary.gained.aluminum, 7);
  assert.equal(summary.gained.steel, 8);
  assert.equal(summary.gained.food, 10);
  assert.equal(summary.gained.coal, 20);
  assert.equal(summary.entries[0].attackType, 'VICTORY');
  assert.equal(summary.entries[1].attackType, 'GROUND');
  assert.equal(summary.entries[1].looterName, 'Raider');
  assert.equal(summary.entries[1].victimName, 'Target');
  assert.equal(queries.filter(({ query }) => query.includes('GetNationLootWars')).length, 2);
});

test('PnWClient.discordMatches is case-insensitive and handles legacy hash tags', () => {
  assert.ok(PnWClient.discordMatches('alice', 'alice'));
  assert.ok(PnWClient.discordMatches('ALICE', 'alice'));
  assert.ok(PnWClient.discordMatches('alice#1234', 'alice'));
  assert.ok(!PnWClient.discordMatches('alice', 'bob'));
  assert.ok(!PnWClient.discordMatches('', 'alice'));
});

test('translateBetweenEnglishAndCroatian translates English to Croatian', async () => {
  const { translateBetweenEnglishAndCroatian } = await import('./build/src/translation.js');
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get('q'), 'Good morning');
    if (parsed.searchParams.get('tl') === 'en') {
      return {
        ok: true,
        async json() {
          return [[["Good morning", "Good morning"]], null, 'en'];
        },
      };
    }
    return {
      ok: true,
      async json() {
        return [[["Dobro jutro", "Good morning"]], null, 'en'];
      },
    };
  };
  try {
    const result = await translateBetweenEnglishAndCroatian('Good morning');
    assert.deepEqual(result, { sourceLanguage: 'en', targetLanguage: 'hr', text: 'Dobro jutro' });
    assert.equal(requests.length, 2);
    assert.ok(requests[1].includes('sl=en'));
    assert.ok(requests[1].includes('tl=hr'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('translateBetweenEnglishAndCroatian translates Croatian detected as related languages to English', async () => {
  const { translateBetweenEnglishAndCroatian } = await import('./build/src/translation.js');
  const detectionCases = [
    { detectedLanguage: 'bs', label: 'Bosnian' },
    { detectedLanguage: 'sr', label: 'Serbian' },
    { detectedLanguage: 'sl', label: 'Slovenian' },
    { detectedLanguage: 'cnr', label: 'Montenegrin' },
  ];

  for (const { detectedLanguage, label } of detectionCases) {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get('q'), 'Dobro jutro');
      assert.equal(parsed.searchParams.get('sl'), 'auto');
      assert.equal(parsed.searchParams.get('tl'), 'en');
      return {
        ok: true,
        async json() {
          return [[["Good morning", "Dobro jutro"]], null, detectedLanguage];
        },
      };
    };
    try {
      const result = await translateBetweenEnglishAndCroatian('Dobro jutro');
      assert.deepEqual(result, { sourceLanguage: 'hr', targetLanguage: 'en', text: 'Good morning' }, label);
      assert.equal(requests.length, 1, label);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});
