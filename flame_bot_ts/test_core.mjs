import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TradePrice,
  calculateCityCost,
  calculateInfraCost,
  computeNationRevenue,
  GameInfo,
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

test('calculateInfraCost increases with larger buy ranges', () => {
  const small = calculateInfraCost(100, 110);
  const big = calculateInfraCost(100, 120);
  assert.ok(small > 0);
  assert.ok(big > small);
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

test('parseResourceLoot returns zeros when resource not mentioned', () => {
  const [money, gas, mun, alu, stl] = parseResourceLoot('stole 500 money');
  assert.equal(money, 500);
  assert.equal(gas, 0);
  assert.equal(mun, 0);
  assert.equal(alu, 0);
  assert.equal(stl, 0);
});

test('PnWClient.discordMatches is case-insensitive and handles legacy hash tags', () => {
  assert.ok(PnWClient.discordMatches('alice', 'alice'));
  assert.ok(PnWClient.discordMatches('ALICE', 'alice'));
  assert.ok(PnWClient.discordMatches('alice#1234', 'alice'));
  assert.ok(!PnWClient.discordMatches('alice', 'bob'));
  assert.ok(!PnWClient.discordMatches('', 'alice'));
});
