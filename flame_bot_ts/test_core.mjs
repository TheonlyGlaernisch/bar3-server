import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TradePrice,
  calculateCityCost,
  calculateInfraCost,
  parseNationCreateDetail,
  secsUntilTurnWindow,
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
