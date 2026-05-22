'use strict';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'https://dev-vendorstack-backend.herokuapp.com/api/v1/';
const API_KEY = process.env.BACKEND_API_KEY ?? '';
const SOURCE_ID = process.env.BACKEND_SOURCE_ID ?? 'HEDGE_WEARSLY_LTD';
const BUSINESS_ID = process.env.BACKEND_BUSINESS_ID ?? '';

const cache = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function cachedFetch(key, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return Promise.resolve(hit.data);
  return fetcher().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  }).catch(err => {
    console.error('[api]', key, err.message);
    return hit ? hit.data : null; // serve stale on error
  });
}

async function apiGet(path) {
  const url = `${BACKEND_API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'api-key': API_KEY, 'api-identity': SOURCE_ID },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const getCategories = () =>
  cachedFetch('categories', () =>
    apiGet(`categories?categoryByBusinessIds=${BUSINESS_ID}&limit=12`)
      .then(d => d?.results ?? [])
  );

const getFeaturedProducts = () =>
  cachedFetch('featured-products', () =>
    apiGet(`products?productByBusinessIds=${BUSINESS_ID}&activeProduct=1&limit=8`)
      .then(d => d?.results ?? [])
  );

const getProductsByCategory = (categoryId) =>
  cachedFetch(`products-cat-${categoryId}`, () =>
    apiGet(`products?productByBusinessIds=${BUSINESS_ID}&activeProduct=1&productByCategoryIds=${categoryId}&limit=4`)
      .then(d => d?.results ?? [])
  );

const getTags = () =>
  cachedFetch('tags', () =>
    apiGet(`tags?tagByBusinessIds=${BUSINESS_ID}&limit=20`)
      .then(d => d?.results ?? [])
  );

module.exports = { getCategories, getFeaturedProducts, getProductsByCategory, getTags };
