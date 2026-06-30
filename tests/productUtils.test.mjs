import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function loadProductUtils() {
  const source = readFileSync(new URL('../src/utils/productUtils.js', import.meta.url), 'utf8')
    .replaceAll('export const ', 'const ');

  return Function(`
    ${source}
    return {
      csv,
      costPriceOf,
      salePriceOf,
      stock,
      wholesale
    };
  `)();
}

const utils = loadProductUtils();

test('stock uses variant quantity when inventory total is missing', () => {
  const product = {
    inventory: { minStock: 5 },
    variants: [{ quantity: '3' }, { quantity: '4 pcs' }]
  };

  const status = utils.stock(product);
  assert.equal(status.key, 'ok');
  assert.equal(status.tone, 'success');
  assert.equal(status.total, 7);
  assert.equal(status.min, 5);
});

test('stock honors inventory total and low/out thresholds', () => {
  assert.equal(utils.stock({ inventory: { totalQuantity: 0, minStock: 5 } }).key, 'out');
  assert.equal(utils.stock({ inventory: { totalQuantity: 5, minStock: 5 } }).key, 'low');
  assert.equal(utils.stock({ inventory: { totalQuantity: 6, minStock: 5 } }).key, 'ok');
});

test('price helpers normalize mixed numeric input', () => {
  const product = {
    basePrice: '1250,75 EGP',
    cost: '900',
    wholesalePrice: '2000'
  };

  assert.equal(utils.salePriceOf(product), 1250.75);
  assert.equal(utils.costPriceOf(product), 900);
  assert.equal(utils.wholesale(product), 1250.75);
});

test('csv escapes commas, quotes, and newlines', () => {
  assert.equal(utils.csv('simple'), 'simple');
  assert.equal(utils.csv('a,b'), '"a,b"');
  assert.equal(utils.csv('a"b'), '"a""b"');
});

test('hot-path helpers stay fast for large product pages', () => {
  const products = Array.from({ length: 5000 }, (_, index) => ({
    basePrice: String(100 + index),
    cost: String(70 + index),
    inventory: { totalQuantity: index % 120, minStock: 8 },
    variants: [{ quantity: index % 5 }, { quantity: index % 7 }]
  }));

  const start = performance.now();
  let total = 0;
  for (const product of products) {
    total += utils.stock(product).total;
    total += utils.salePriceOf(product);
    total += utils.costPriceOf(product);
  }
  const elapsedMs = performance.now() - start;

  assert.ok(total > 0);
  assert.ok(elapsedMs < 80, `product helper loop took ${elapsedMs.toFixed(1)}ms`);
});
