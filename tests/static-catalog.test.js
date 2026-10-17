import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterCatalog, validateCatalogCart } from '../public/js/static-catalog.js';

const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));

test('static sample catalog includes non-purchasable placeholders in each collection', () => {
  assert.equal(catalog.length, 8);
  assert.ok(catalog.every((product) => product.name.startsWith('SAMPLE ONLY —')));
  assert.deepEqual(
    [...new Set(catalog.map((product) => product.collection.slug))].sort(),
    ['accessories', 'fitted-caps', 'new-arrivals', 'vintage-caps'],
  );
});

test('static catalog filters and sorts products without a backend', () => {
  assert.deepEqual(
    filterCatalog(catalog, { collectionSlug: 'new-arrivals', search: 'tan', sort: 'price_asc' }).map((product) => product.slug),
    ['sample-new-stone-cap'],
  );
  assert.equal(filterCatalog(catalog, { color: 'white' }).length, 3);
  assert.equal(filterCatalog(catalog, { minPriceCents: 3600, maxPriceCents: 3600 }).length, 2);
  assert.equal(filterCatalog(catalog, { sort: 'featured' })[0].slug, 'sample-new-black-cap');
});

test('static cart calculates sample totals and refuses invalid quantities', () => {
  const result = validateCatalogCart([{ productId: 'sample-new-black-cap', quantity: 2 }], catalog);
  assert.equal(result.totalCents, 6400);
  assert.equal(result.items[0].lineTotalCents, 6400);
  assert.throws(
    () => validateCatalogCart([{ productId: 'sample-new-black-cap', quantity: 26 }], catalog),
    /does not have that many demo items available/,
  );
  assert.throws(
    () => validateCatalogCart([{ productId: 'not-in-catalog', quantity: 1 }], catalog),
    /no longer available in this demo/,
  );
});
