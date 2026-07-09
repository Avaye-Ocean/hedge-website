'use strict';

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'https://dev-vendorstack-backend.herokuapp.com/api/v1/';
const API_KEY = process.env.BACKEND_API_KEY ?? '';
const SOURCE_ID = process.env.BACKEND_SOURCE_ID ?? 'HEDGE_WEARSLY_LTD';
const BUSINESS_ID = process.env.BACKEND_BUSINESS_ID ?? '';

const cache = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 minutes

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

// GET /categories and GET /tags return a BARE ARRAY by default (only paginated
// `{ results }` when categoryFullPaging/tagFullPaging=1). Handle both shapes so
// the list is never silently empty. GET /products always returns `{ results }`.
const getCategories = () =>
  cachedFetch('categories', () =>
    apiGet(`categories?categoryBusinessIds=${BUSINESS_ID}&limit=12`)
      .then(d => (Array.isArray(d) ? d : d?.results ?? []))
  );

const getFeaturedProducts = () =>
  cachedFetch('featured-products', () =>
    apiGet(`products?productBusinessId=${BUSINESS_ID}&activeProduct=1&limit=8`)
      .then(d => d?.results ?? [])
  );

const getProductsByCategory = (categoryId) =>
  cachedFetch(`products-cat-${categoryId}`, () =>
    apiGet(`products?productBusinessId=${BUSINESS_ID}&activeProduct=1&productCategoryIds=${categoryId}&limit=4`)
      .then(d => d?.results ?? [])
  );

const getTags = () =>
  cachedFetch('tags', () =>
    apiGet(`tags?tagByBusinessIds=${BUSINESS_ID}&limit=20`)
      .then(d => (Array.isArray(d) ? d : d?.results ?? []))
  );

module.exports = { getCategories, getFeaturedProducts, getProductsByCategory, getTags };
