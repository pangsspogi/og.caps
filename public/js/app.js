import { convertMinorAmount } from './currency.js';
import { filterCatalog, validateCatalogCart } from './static-catalog.js';

const API_BASE = '/api/v1';
const CART_KEY = 'ogcaps-guest-cart';
const CURRENCY_KEY = 'ogcaps-display-currency';
const STATIC_DEMO = window.OG_CAPS_STATIC_DEMO === true;
const supportedCurrencies = ['PHP', 'USD'];
let displayCurrency = supportedCurrencies.includes(localStorage.getItem(CURRENCY_KEY))
  ? localStorage.getItem(CURRENCY_KEY)
  : 'PHP';
let phpPerUsd = null;
let staticProducts = [];
let staticCatalogError = '';
const COLLECTIONS = {
  'new-arrivals': { name: 'New Arrivals', description: 'Fresh into the rotation. Meet the latest from OG CAPS.' },
  'fitted-caps': { name: 'Fitted Caps', description: 'A closer fit, finished with the details that matter.' },
  'vintage-caps': { name: 'Vintage Caps', description: 'Old-school influence, made for right now.' },
  accessories: { name: 'Accessories', description: 'The finishing touches to make the fit your own.' }
};
const SAMPLE_PRODUCT_IMAGES = {
  'sample-new-black-cap': '/assets/images/products/main.jpg',
  'sample-new-stone-cap': '/assets/images/products/product-tan-cap.jpg',
  'sample-fitted-black-cap': '/assets/images/products/product-white-la-cap.jpg',
  'sample-fitted-navy-cap': '/assets/images/products/product-white-ny-cap.jpg',
  'sample-vintage-washed-cap': '/assets/images/products/new-arrival-lookbook.jpg'
};

const $ = (selector, root = document) => root.querySelector(selector);
const routeView = $('#routeView');
const toast = $('#toast');
let toastTimer;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatMoney(amount, currency = 'USD') {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 'Price unavailable';
  const baseCurrency = currency.toUpperCase();
  let displayAmount;
  try {
    displayAmount = phpPerUsd === null
      ? (baseCurrency === 'USD' ? numeric : null)
      : convertMinorAmount(Math.round(numeric), baseCurrency, displayCurrency, phpPerUsd);
  } catch (error) {
    console.error('Could not convert product price', error);
    return 'Price unavailable';
  }
  if (displayAmount === null) return 'Price unavailable';
  try {
    return new Intl.NumberFormat(displayCurrency === 'PHP' ? 'en-PH' : 'en-US', {
      style: 'currency',
      currency: displayCurrency,
    }).format(displayAmount / 100);
  } catch {
    return `${displayCurrency} ${(displayAmount / 100).toFixed(2)}`;
  }
}

function displayPriceAmount(usdCents, currency) {
  const cents = convertMinorAmount(Math.round(usdCents), 'USD', currency, phpPerUsd);
  return (cents / 100).toFixed(2);
}

function inputPriceToUsdCents(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isSafeInteger(Math.round(numeric * 100))) {
    throw new Error('Enter a valid product price.');
  }
  return convertMinorAmount(Math.round(numeric * 100), currency, 'USD', phpPerUsd);
}

function updateCurrencyToggle() {
  const button = $('#currencyToggle');
  button.textContent = displayCurrency === 'PHP' ? 'PHP ₱' : 'USD $';
  button.setAttribute('aria-label', `Switch currency to ${displayCurrency === 'PHP' ? 'US dollars' : 'Philippine pesos'}`);
  button.title = phpPerUsd === null
    ? 'Currency conversion is unavailable'
    : `Peso display uses ₱${phpPerUsd.toFixed(2)} per US$1`;
}

function unwrap(body) {
  if (body && typeof body === 'object' && 'data' in body) return body.data;
  return body;
}

async function api(path, options = {}) {
  if (STATIC_DEMO) return staticApi(path, options);
  const csrfToken = document.cookie.split('; ').find((entry) => entry.startsWith('ogcaps_csrf='))?.split('=').slice(1).join('=');
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const csrfHeader = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken
    ? { 'x-csrf-token': decodeURIComponent(csrfToken) }
    : {};
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...csrfHeader, ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || body?.message || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return unwrap(body);
}

function staticApi(path, options) {
  const url = new URL(path, location.origin);
  const method = (options.method || 'GET').toUpperCase();
  if (staticCatalogError) throw new Error(staticCatalogError);

  if (method === 'GET' && url.pathname === '/store-config') return { PHP_PER_USD: 57.5 };
  if (method === 'GET' && url.pathname === '/products') {
    return filterCatalog(staticProducts, {
      search: url.searchParams.get('search') || url.searchParams.get('q') || '',
      sort: url.searchParams.get('sort') || 'featured',
      color: url.searchParams.get('color') || '',
      minPriceCents: url.searchParams.has('minPrice') ? Number(url.searchParams.get('minPrice')) : undefined,
      maxPriceCents: url.searchParams.has('maxPrice') ? Number(url.searchParams.get('maxPrice')) : undefined,
      inStock: url.searchParams.get('inStock') === 'true',
    });
  }

  const collectionProductsMatch = url.pathname.match(/^\/collections\/([^/]+)\/products$/);
  if (method === 'GET' && collectionProductsMatch) {
    return filterCatalog(staticProducts, {
      collectionSlug: decodeURIComponent(collectionProductsMatch[1]),
      search: url.searchParams.get('search') || url.searchParams.get('q') || '',
      sort: url.searchParams.get('sort') || 'featured',
      color: url.searchParams.get('color') || '',
      minPriceCents: url.searchParams.has('minPrice') ? Number(url.searchParams.get('minPrice')) : undefined,
      maxPriceCents: url.searchParams.has('maxPrice') ? Number(url.searchParams.get('maxPrice')) : undefined,
      inStock: url.searchParams.get('inStock') === 'true',
    });
  }

  if (method === 'GET' && url.pathname === '/collections') {
    const collections = new Map();
    for (const product of staticProducts) {
      if (!collections.has(product.collection.slug)) {
        collections.set(product.collection.slug, {
          id: product.collection.slug,
          ...product.collection,
          _count: { products: 0 },
        });
      }
      collections.get(product.collection.slug)._count.products += 1;
    }
    return [...collections.values()];
  }

  const productMatch = url.pathname.match(/^\/products\/([^/]+)$/);
  if (method === 'GET' && productMatch) {
    const slug = decodeURIComponent(productMatch[1]);
    const product = staticProducts.find((entry) => entry.slug === slug);
    if (!product) throw new Error('We couldn’t find that product.');
    return product;
  }

  if (method === 'POST' && url.pathname === '/cart/validate') {
    const body = JSON.parse(options.body || '{}');
    return validateCatalogCart(body.items, staticProducts);
  }

  throw new Error('This read-only demo does not support accounts, administration, or checkout.');
}

function collectionOptions(collections, selectedId = '') {
  return `<option value="">No collection</option>${collections.map((collection) => `<option value="${escapeHtml(collection.id)}" ${collection.id === selectedId ? 'selected' : ''}>${escapeHtml(collection.name)}</option>`).join('')}`;
}

function productImageField(product = {}) {
  const imageUrl = product.imageUrl || '';
  const name = product.name || 'Product';
  return `<label>Upload product photo (JPEG, PNG, or WebP; max 5 MB)<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" /></label><img class="admin-image-preview" data-image-preview src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${name} preview`)}" ${imageUrl ? '' : 'hidden'} /><label>Or image URL / path<input name="imageUrl" type="text" value="${escapeHtml(imageUrl)}" placeholder="https://… or /assets/… (optional if you upload a photo)" /></label>`;
}

function productPriceField(product = {}) {
  const amount = product.priceCents === undefined ? '' : displayPriceAmount(product.priceCents, 'PHP');
  const maxAmount = (phpPerUsd * 1000000).toFixed(2);
  return `<label data-price-label>Price amount (PHP)<input name="priceAmount" type="number" min="0" max="${maxAmount}" step="0.01" value="${amount}" required /></label><label>Enter price in<select name="priceCurrency" data-price-currency><option value="PHP" selected>Philippine peso (PHP ₱)</option><option value="USD">US dollar (USD $)</option></select></label>`;
}

function productFormMarkup(product = {}, collections = [], editing = false) {
  return `<label>Name<input name="name" value="${escapeHtml(product.name || '')}" required maxlength="160" /></label><label>URL slug<input name="slug" value="${escapeHtml(product.slug || '')}" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="classic-black-cap" /></label><label>Description<textarea name="description" maxlength="5000" rows="4">${escapeHtml(product.description || '')}</textarea></label><label>Color<input name="color" value="${escapeHtml(product.color || '')}" maxlength="60" placeholder="Black" /></label>${productImageField(product)}${productPriceField(product)}<label>Stock quantity<input name="stock" type="number" min="0" max="1000000" step="1" value="${Number(product.stock || 0)}" required /></label><label>Collection<select name="collectionId">${collectionOptions(collections, product.collectionId || '')}</select></label><label class="checkbox-field"><input name="active" type="checkbox" ${product.active === false ? '' : 'checked'} /> Active on storefront</label><label class="checkbox-field"><input name="featured" type="checkbox" ${product.featured ? 'checked' : ''} /> Feature on homepage</label><button class="solid-button">${editing ? 'Save changes' : 'Create product'}</button>`;
}

async function productFormData(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  const imageFile = formData.get('imageFile');
  delete data.imageFile;
  data.priceCents = inputPriceToUsdCents(data.priceAmount, data.priceCurrency);
  delete data.priceAmount;
  delete data.priceCurrency;
  data.stock = Number(data.stock);
  data.featured = formData.get('featured') === 'on';
  data.active = formData.get('active') === 'on';
  data.color = data.color.trim() || null;
  data.imageUrl = data.imageUrl.trim() || null;
  if (!data.collectionId) delete data.collectionId;
  if (imageFile instanceof File && imageFile.size > 0) {
    const upload = new FormData();
    upload.append('image', imageFile);
    const result = await api('/admin/product-images', { method: 'POST', body: upload });
    data.imageUrl = result.imageUrl;
  }
  return data;
}

function readGuestCart() {
  const raw = localStorage.getItem(CART_KEY);
  if (!raw) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.some((item) => !item || typeof item.productId !== 'string' || (item.variantId != null && typeof item.variantId !== 'string') || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
    throw new Error('Your saved bag could not be read. Clear the bag and add your items again.');
  }
  return items;
}

function writeGuestCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

async function validateGuestCart(items = readGuestCart()) {
  if (!items.length) return { items: [], totalCents: 0, currency: 'usd' };
  return api('/cart/validate', { method: 'POST', body: JSON.stringify({ items }) });
}

function guestCartCount() {
  return readGuestCart().reduce((sum, item) => sum + item.quantity, 0);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function productImage(product, index = 0) {
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images[index] || images[0];
  return typeof image === 'string' ? image : image?.url || image?.src || product.imageUrl || SAMPLE_PRODUCT_IMAGES[product.slug] || '';
}

function imageMarkup(src, name, className = 'product-image') {
  const safeSrc = escapeHtml(src);
  const alt = escapeHtml(name);
  if (!safeSrc) {
    return `<span class="product-placeholder" role="img" aria-label="${alt} image placeholder"><span class="placeholder-cap" aria-hidden="true"></span></span>`;
  }
  return `<img class="${className}" src="${safeSrc}" alt="${alt}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span class="product-placeholder" role="img" aria-label="${alt} image placeholder" hidden><span class="placeholder-cap" aria-hidden="true"></span></span>`;
}

function productCard(product) {
  const slug = encodeURIComponent(product.slug || product.id);
  const name = product.name || 'OG CAPS product';
  const image = productImage(product);
  const price = product.price ?? product.priceInMinorUnits ?? product.priceCents;
  const currency = product.currency || 'USD';
  const collection = product.collection?.name || product.collectionName || '';
  return `<article class="product-card">
    <a class="product-image-link" href="/products/${slug}" aria-label="View ${escapeHtml(name)}">
      ${product.featured ? '<span class="product-flags">Featured</span>' : ''}
      ${imageMarkup(image, name)}
    </a>
    <div class="product-info"><div><a class="product-name" href="/products/${slug}">${escapeHtml(name)}</a>${collection ? `<div class="product-meta">${escapeHtml(collection)}</div>` : ''}</div><span class="product-price">${formatMoney(price, currency)}</span></div>
  </article>`;
}

function setBagCount(count) {
  const badge = $('.bag-count');
  if (badge) {
    const value = Math.max(0, Number(count) || 0);
    badge.textContent = value;
    badge.setAttribute('aria-label', `${value} ${value === 1 ? 'item' : 'items'}`);
  }
}

function setBagCountUnavailable() {
  const badge = $('.bag-count');
  if (badge) {
    badge.textContent = '—';
    badge.setAttribute('aria-label', 'Bag count unavailable');
  }
}

async function refreshBagCount() {
  try {
    setBagCount(guestCartCount());
  } catch {
    setBagCountUnavailable();
  }
}

function showHome() {
  routeView.hidden = true;
  document.querySelectorAll('main > section').forEach((section) => { section.hidden = false; });
  document.title = 'OG CAPS — Built for the OGs';
}

function showRoutePage() {
  document.querySelectorAll('main > section').forEach((section) => { section.hidden = true; });
  routeView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function pageShell(content) {
  return `<section class="page-content">${content}</section>`;
}

function renderNotice(message, action = '') {
  return `<p class="notice">${escapeHtml(message)} ${action}</p>`;
}

async function renderCollection(slug) {
  showRoutePage();
  const meta = COLLECTIONS[slug] || null;
  const searchQuery = new URLSearchParams(location.search).get('search');
  routeView.innerHTML = pageShell(`
    <p class="breadcrumbs"><a href="/">Home</a> / ${escapeHtml(meta?.name || 'Collections')}</p>
    <p class="eyebrow">OG CAPS / COLLECTION</p>
    <h1 class="page-title" id="collectionTitle">${searchQuery ? `Search: ${escapeHtml(searchQuery)}` : escapeHtml(meta?.name || 'Shop all')}</h1>
    <p class="page-description" id="collectionDescription">${escapeHtml(meta?.description || (searchQuery ? 'Matching products from OG CAPS.' : 'Explore the OG CAPS collection.'))}</p>
    <div class="collection-toolbar"><span id="collectionCount">Loading products…</span><div class="collection-controls"><label for="sortSelect">Sort</label><select id="sortSelect" aria-label="Sort products"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name_asc">Name: A to Z</option></select></div></div>
    <div class="filter-row">
      <label>Color <select id="colorFilter"><option value="">All colors</option></select></label>
      <label>Min price (${displayCurrency}) <input id="minPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" /></label>
      <label>Max price (${displayCurrency}) <input id="maxPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Any" /></label>
      <label><input id="availableFilter" type="checkbox" /> In stock</label>
    </div>
    <div class="product-grid" id="collectionProducts" aria-live="polite">${renderNotice('Loading products…')}</div>
  `);
  document.title = `${meta?.name || 'Shop all'} — OG CAPS`;

  const params = new URLSearchParams(location.search);
  const sortSelect = $('#sortSelect', routeView);
  const colorSelect = $('#colorFilter', routeView);
  const minPrice = $('#minPrice', routeView);
  const maxPrice = $('#maxPrice', routeView);
  const available = $('#availableFilter', routeView);
  sortSelect.value = params.get('sort') || 'featured';
  colorSelect.value = params.get('color') || '';
  minPrice.value = params.get('minPrice') ? displayPriceAmount(Number(params.get('minPrice')), displayCurrency) : '';
  maxPrice.value = params.get('maxPrice') ? displayPriceAmount(Number(params.get('maxPrice')), displayCurrency) : '';
  available.checked = params.get('inStock') === 'true';
  const productContainer = $('#collectionProducts', routeView);
  const fetchProducts = async () => {
    const query = new URLSearchParams();
    query.set('sort', sortSelect.value);
    if (colorSelect.value) query.set('color', colorSelect.value);
    if (minPrice.value) query.set('minPrice', String(inputPriceToUsdCents(minPrice.value, displayCurrency)));
    if (maxPrice.value) query.set('maxPrice', String(inputPriceToUsdCents(maxPrice.value, displayCurrency)));
    if (available.checked) query.set('inStock', 'true');
    if (params.get('search')) query.set('search', params.get('search'));
    history.replaceState({}, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
    productContainer.innerHTML = renderNotice('Loading products…');
    try {
      const path = slug ? `/collections/${encodeURIComponent(slug)}/products` : '/products';
      const productsResult = await api(`${path}${query.size ? `?${query}` : ''}`);
      const products = Array.isArray(productsResult) ? productsResult : (productsResult.products || []);
      const count = productsResult.total ?? productsResult.count ?? productsResult.pagination?.total ?? products.length;
      $('#collectionCount', routeView).textContent = `${count} ${count === 1 ? 'product' : 'products'}`;
      const colors = [...new Set(products.flatMap((product) => [
        product.color,
        ...(product.variants || []).map((variant) => variant.color)
      ]).filter(Boolean))];
      const previousColor = colorSelect.value;
      colorSelect.innerHTML = '<option value="">All colors</option>' + colors.map((color) => `<option value="${escapeHtml(color)}">${escapeHtml(color)}</option>`).join('');
      if (previousColor && !colors.includes(previousColor)) {
        colorSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(previousColor)}">${escapeHtml(previousColor)}</option>`);
      }
      colorSelect.value = previousColor;
      productContainer.innerHTML = products.length ? products.map(productCard).join('') : renderNotice('No products match those filters.');
    } catch (error) {
      productContainer.innerHTML = renderNotice(error.message, '<a href="/collections">Try again</a>');
    }
  };
  [sortSelect, colorSelect, available].forEach((control) => control.addEventListener('change', fetchProducts));
  [minPrice, maxPrice].forEach((control) => control.addEventListener('change', fetchProducts));
  await fetchProducts();
}

async function renderProduct(slug) {
  showRoutePage();
  routeView.innerHTML = pageShell(renderNotice('Loading product…'));
  try {
    const result = await api(`/products/${encodeURIComponent(slug)}`);
    const product = result.product || result;
    if (!product || (!product.id && !product.slug)) throw new Error('We couldn’t find that product.');
    const name = product.name || 'OG CAPS product';
    const images = (product.images || []).map((image) => typeof image === 'string' ? image : image.url || image.src).filter(Boolean);
    const variants = (product.variants || []).filter((variant) => variant.active !== false);
    const availableVariants = variants.filter((variant) => Number(variant.stockQuantity ?? variant.stock ?? 0) > 0);
    const currency = product.currency || 'USD';
    const price = product.price ?? product.priceInMinorUnits ?? product.priceCents;
    const variantStock = availableVariants.reduce((sum, variant) => sum + Number(variant.stockQuantity ?? variant.stock ?? 0), 0);
    const stock = variants.length ? variantStock : Number(product.stock || 0);
    const firstAvailableVariant = availableVariants[0];
    const initialStock = Number(firstAvailableVariant?.stockQuantity ?? firstAvailableVariant?.stock ?? stock);
    routeView.innerHTML = pageShell(`
      <p class="breadcrumbs"><a href="/">Home</a> / <a href="/collections">Shop</a> / ${escapeHtml(name)}</p>
      <div class="detail-layout">
        <div class="detail-gallery">
          <div class="detail-main-image">${images.length ? imageMarkup(images[0], `${name} image 1`) : '<span class="product-placeholder"><span class="placeholder-cap"></span></span>'}</div>
          ${images.length > 1 ? `<div class="detail-thumbnails" aria-label="Choose product image">${images.map((image, index) => `<button type="button" class="detail-thumbnail ${index === 0 ? 'is-selected' : ''}" data-image-index="${index}" aria-label="Show product image ${index + 1}" aria-pressed="${index === 0}">${imageMarkup(image, `${name} thumbnail ${index + 1}`)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="detail-copy">
          <p class="eyebrow">${escapeHtml(product.brand || 'OG CAPS')}</p>
          <h1 class="page-title">${escapeHtml(name)}</h1>
          <p class="detail-price">${formatMoney(price, currency)}</p>
          <p class="detail-description">${escapeHtml(product.description || '')}</p>
          ${STATIC_DEMO ? '<p class="notice">Static demo only. Prices and availability are placeholders; purchases are disabled.</p>' : ''}
          ${product.color ? `<p class="product-meta">Color: ${escapeHtml(product.color)}</p>` : ''}
          <p class="product-meta availability">${stock > 0 ? (variants.length ? `${initialStock} available in this option` : `${stock} available`) : 'Currently unavailable'}</p>
          <form class="detail-form" id="addToBagForm">
            ${variants.length ? `<label for="variantSelect">Select option</label><select id="variantSelect" required ${availableVariants.length ? '' : 'disabled'}>${[...availableVariants, ...variants.filter((variant) => !availableVariants.includes(variant))].map((variant, index) => `<option value="${escapeHtml(variant.id)}" ${index === 0 ? 'selected' : ''} ${Number(variant.stockQuantity ?? variant.stock ?? 0) < 1 ? 'disabled' : ''}>${escapeHtml([variant.color, variant.size].filter(Boolean).join(' / ') || variant.name || 'Standard')}${Number(variant.stockQuantity ?? variant.stock ?? 0) < 1 ? ' — unavailable' : ''}</option>`).join('')}</select>` : ''}
            <label for="quantityInput">Quantity</label><input id="quantityInput" type="number" value="1" min="1" max="${Math.max(1, Math.min(99, initialStock))}" required />
            <button class="solid-button" type="submit" ${stock > 0 ? '' : 'disabled'}>Add to bag</button>
          </form>
        </div>
      </div>
      <section class="related-products" aria-labelledby="relatedTitle">
        <div class="section-heading"><div><p class="eyebrow">Complete the rotation</p><h2 id="relatedTitle">YOU MAY ALSO LIKE</h2></div></div>
        <div class="product-grid" id="relatedProducts">${renderNotice('Loading related products…')}</div>
      </section>
    `);
    document.title = `${name} — OG CAPS`;
    $('.detail-thumbnails', routeView)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-image-index]');
      if (!button) return;
      const index = Number(button.dataset.imageIndex);
      const mainImage = $('.detail-main-image img', routeView);
      if (mainImage) {
        mainImage.src = images[index];
        mainImage.alt = `${name} image ${index + 1}`;
        mainImage.hidden = false;
        const fallback = mainImage.nextElementSibling;
        if (fallback) fallback.hidden = true;
      }
      $('.detail-thumbnail.is-selected', routeView)?.classList.remove('is-selected');
      button.classList.add('is-selected');
      routeView.querySelectorAll('.detail-thumbnail').forEach((thumbnail) => thumbnail.setAttribute('aria-pressed', String(thumbnail === button)));
    });
    $('#variantSelect', routeView)?.addEventListener('change', (event) => {
      const variant = variants.find((entry) => String(entry.id) === event.target.value);
      const availableStock = Number(variant?.stockQuantity ?? variant?.stock ?? 0);
      $('.availability', routeView).textContent = availableStock > 0 ? `${availableStock} available in this option` : 'Currently unavailable';
      $('#quantityInput', routeView).max = String(Math.max(1, Math.min(99, availableStock)));
      $('#addToBagForm .solid-button', routeView).disabled = availableStock < 1;
    });
    $('#addToBagForm', routeView).addEventListener('submit', async (event) => {
      event.preventDefault();
      const quantity = Number($('#quantityInput', routeView).value);
      if (!Number.isInteger(quantity) || quantity < 1) return showToast('Enter a valid quantity.');
      try {
        const items = readGuestCart();
        const variantId = $('#variantSelect', routeView)?.value || null;
        const existing = items.find((item) => item.productId === product.id && item.variantId === variantId);
        const nextItems = existing
          ? items.map((item) => item.productId === product.id && item.variantId === variantId ? { ...item, quantity: item.quantity + quantity } : item)
          : [...items, { productId: product.id, ...(variantId ? { variantId } : {}), quantity }];
        if (nextItems.some((item) => item.quantity > 99)) throw new Error('The maximum quantity per product is 99.');
        await validateGuestCart(nextItems);
        writeGuestCart(nextItems);
        await refreshBagCount();
        showToast('Added to your bag.');
      } catch (error) {
        showToast(error.message);
      }
    });
    if (STATIC_DEMO && product.collection?.slug) {
      const related = filterCatalog(staticProducts, { collectionSlug: product.collection.slug })
        .filter((entry) => entry.id !== product.id)
        .slice(0, 4);
      $('#relatedProducts', routeView).innerHTML = related.length ? related.map(productCard).join('') : renderNotice('No related products right now.');
    } else if (product.collection?.slug) {
      try {
        const relatedResult = await api(`/collections/${encodeURIComponent(product.collection.slug)}/products?limit=4`);
        const related = (Array.isArray(relatedResult) ? relatedResult : relatedResult.products || [])
          .filter((entry) => entry.id !== product.id)
          .slice(0, 4);
        $('#relatedProducts', routeView).innerHTML = related.length ? related.map(productCard).join('') : renderNotice('No related products right now.');
      } catch (error) {
        $('#relatedProducts', routeView).innerHTML = renderNotice(error.message);
      }
    } else {
      $('#relatedProducts', routeView).innerHTML = renderNotice('No related products right now.');
    }
  } catch (error) {
    routeView.innerHTML = pageShell(`<p class="breadcrumbs"><a href="/">Home</a> / Product</p><h1 class="page-title">PRODUCT NOT FOUND</h1>${renderNotice(error.message, '<a href="/collections">Continue shopping</a>')}`);
  }
}

async function renderCart() {
  showRoutePage();
  routeView.innerHTML = pageShell('<p class="eyebrow">Your selection</p><h1 class="page-title">THE BAG</h1><div id="cartContent" class="notice">Loading your bag…</div>');
  document.title = 'Your Bag — OG CAPS';
  const content = $('#cartContent', routeView);
  try {
    const cartResult = await validateGuestCart();
    const items = cartResult.items || [];
    setBagCount(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    if (!items.length) {
      content.innerHTML = renderNotice('Your bag is empty.', '<a href="/collections">Explore the collection</a>');
      return;
    }
    const lines = items.map((item) => {
      const name = item.name || 'OG CAPS product';
      const image = productImage(item);
      const amount = item.unitPriceCents;
      const currency = item.currency || cartResult.currency || 'usd';
      return `<article class="cart-row" data-product-id="${escapeHtml(item.productId)}" data-variant-id="${escapeHtml(item.variantId || '')}"><div class="cart-image">${imageMarkup(image, name)}</div><div><h3>${escapeHtml(name)}</h3>${item.variantLabel ? `<p>${escapeHtml(item.variantLabel)}</p>` : ''}<p>${formatMoney(amount, currency)}</p><label class="visually-hidden" for="qty-${escapeHtml(item.productId)}-${escapeHtml(item.variantId || 'default')}">Quantity for ${escapeHtml(name)}</label><input id="qty-${escapeHtml(item.productId)}-${escapeHtml(item.variantId || 'default')}" data-quantity type="number" min="1" max="99" value="${Number(item.quantity)}" /><button type="button" data-remove>Remove</button></div><strong>${formatMoney(item.lineTotalCents, currency)}</strong></article>`;
    }).join('');
    const subtotal = cartResult.totalCents;
    const checkoutMarkup = STATIC_DEMO
      ? '<p class="notice">Static demo only. Prices and stock are placeholders; this bag cannot be checked out.</p>'
      : `<div class="summary-line"><span>Shipping and tax</span><span>Calculated at checkout</span></div>${displayCurrency === 'PHP' ? `<p class="product-meta">Peso prices are estimates converted at ₱${phpPerUsd.toFixed(2)} per US$1. Checkout is charged in USD.</p>` : ''}<label for="checkoutEmail">Email for order updates</label><input id="checkoutEmail" type="email" autocomplete="email" required /><button class="solid-button" id="checkoutButton">Proceed to checkout</button><p class="product-meta" id="cartFeedback" role="status"></p>`;
    content.outerHTML = `<div id="cartContent">${lines}<div class="cart-summary"><div class="summary-line"><span>Subtotal</span><strong>${formatMoney(subtotal, cartResult.currency || 'usd')}</strong></div>${checkoutMarkup}</div></div>`;
    $('#cartContent', routeView).addEventListener('change', async (event) => {
      const row = event.target.closest('[data-product-id]');
      if (!row || !event.target.matches('[data-quantity]')) return;
      try {
        const items = readGuestCart().map((item) => item.productId === row.dataset.productId && (item.variantId || '') === row.dataset.variantId ? { ...item, quantity: Number(event.target.value) } : item);
        await validateGuestCart(items);
        writeGuestCart(items);
        await renderCart();
        await refreshBagCount();
      } catch (error) { showToast(error.message); }
    });
    $('#cartContent', routeView).addEventListener('click', async (event) => {
      const remove = event.target.closest('[data-remove]');
      if (!remove) return;
      const row = remove.closest('[data-product-id]');
      try {
        writeGuestCart(readGuestCart().filter((item) => item.productId !== row.dataset.productId || (item.variantId || '') !== row.dataset.variantId));
        await renderCart();
        await refreshBagCount();
      } catch (error) { showToast(error.message); }
    });
    if (!STATIC_DEMO) $('#checkoutButton', routeView).addEventListener('click', async () => {
      const button = $('#checkoutButton', routeView);
      button.disabled = true;
      try {
        const email = $('#checkoutEmail', routeView).value.trim();
        if (!email) throw new Error('Enter an email address for order updates.');
        const checkout = await api('/orders/checkout', {
          method: 'POST',
          body: JSON.stringify({
            items: readGuestCart(),
            email,
            successUrl: `${location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${location.origin}/checkout/cancel`
          })
        });
        if (!checkout.checkoutUrl) throw new Error('Checkout is not available right now.');
        location.assign(checkout.checkoutUrl);
      } catch (error) {
        button.disabled = false;
        showToast(error.message);
      }
    });
  } catch (error) {
    content.innerHTML = `${renderNotice(error.message, '<a href="/collections">Continue shopping</a>')}<button class="text-button" id="clearInvalidCart">Clear saved bag</button>`;
    $('#clearInvalidCart', routeView).addEventListener('click', () => {
      try {
        writeGuestCart([]);
        renderCart();
        refreshBagCount();
      } catch (storageError) {
        showToast(storageError.message);
      }
    });
  }
}

async function renderAuth(register = false) {
  showRoutePage();
  routeView.innerHTML = pageShell(`<div class="auth-layout"><p class="eyebrow">OG CAPS / YOUR ACCOUNT</p><h1 class="page-title">${register ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</h1><form class="auth-form" id="authForm">${register ? '<label for="name">Name</label><input id="name" name="name" autocomplete="name" required />' : ''}<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required /><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8" /><button class="solid-button" type="submit">${register ? 'Create account' : 'Log in'}</button><p class="form-message" role="status"></p></form><p class="auth-switch">${register ? 'Already have an account?' : 'New to OG CAPS?'} <a href="${register ? '/login' : '/register'}">${register ? 'Log in' : 'Create one'}</a></p></div>`);
  document.title = `${register ? 'Create account' : 'Log in'} — OG CAPS`;
  $('#authForm', routeView).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('.form-message', form);
    const button = $('button[type="submit"]', form);
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(values) });
      location.assign('/account');
    } catch (error) {
      message.textContent = error.message;
    } finally { button.disabled = false; }
  });
}

async function renderAccount(path = location.pathname) {
  showRoutePage();
  routeView.innerHTML = pageShell(`<p class="eyebrow">OG CAPS / ACCOUNT</p><h1 class="page-title">${path.startsWith('/account/orders') ? 'ORDER HISTORY' : 'YOUR ACCOUNT'}</h1><div class="account-grid"><nav class="account-nav"><a href="/account">Overview</a><a href="/account/orders">Order history</a><button id="logoutButton" class="text-button">Log out</button></nav><div id="accountContent" class="notice">Loading your account…</div></div>`);
  document.title = `${path.startsWith('/account/orders') ? 'Order history' : 'Account'} — OG CAPS`;
  try {
    const user = await api('/auth/me');
    const account = user.user || user;
    if (path.startsWith('/account/orders/')) {
      const orderId = path.split('/').slice(3).join('/');
      const result = await api(`/orders/${encodeURIComponent(orderId)}`);
      const order = result.order || result;
      const items = order.items || [];
      $('#accountContent', routeView).innerHTML = `<p class="eyebrow">${escapeHtml(order.number || order.id)}</p><h2>${escapeHtml(order.status || 'Order status unavailable')}</h2><p class="page-description">Placed ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'recently')}</p>${items.map((item) => `<div class="order-row"><span>${escapeHtml(item.product?.name || item.productName || item.name || 'Product')} × ${Number(item.quantity) || 0}</span><span>${formatMoney(item.unitPriceCents ?? item.unitPrice ?? item.price, item.currency || order.currency || 'USD')}</span></div>`).join('')}<div class="summary-line total"><span>Total</span><strong>${formatMoney(order.totalCents ?? order.total, order.currency || 'USD')}</strong></div>`;
    } else {
      const orders = await api('/orders');
      const list = Array.isArray(orders) ? orders : (orders.orders || []);
      const title = path.startsWith('/account/orders') ? 'Your orders' : 'Recent orders';
      $('#accountContent', routeView).innerHTML = `<h2>${escapeHtml(account.name || account.email || 'Welcome back')}</h2><p class="page-description">${escapeHtml(account.email || '')}</p><h3>${title}</h3>${list.length ? list.map((order) => `<a class="order-row" href="/account/orders/${encodeURIComponent(order.id)}"><span>Order ${escapeHtml(order.number || order.id)}</span><span>${escapeHtml(order.status || 'Pending')}</span></a>`).join('') : '<p class="notice">No orders yet.</p>'}`;
    }
  } catch {
    $('#accountContent', routeView).innerHTML = renderNotice('Unable to load your account or order. Please log in or try again.', '<a href="/login">Log in</a>');
  }
  $('#logoutButton', routeView).addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); location.assign('/'); }
    catch (error) { showToast(error.message); }
  });
}

async function renderAdmin(path) {
  showRoutePage();
  routeView.innerHTML = pageShell('<p class="eyebrow">OG CAPS / ADMIN</p><h1 class="page-title">CONTROL ROOM</h1><nav class="admin-nav"><a href="/admin">Overview</a><a href="/admin/products">Products</a><a href="/admin/collections">Collections</a><a href="/admin/orders">Orders</a><a href="/admin/inventory">Inventory</a></nav><div id="adminContent" class="notice">Loading admin data…</div>');
  document.title = 'Admin — OG CAPS';
  const content = $('#adminContent', routeView);
  try {
    if (path.endsWith('/products')) {
      const [result, collectionResult] = await Promise.all([
        api('/admin/products'),
        api('/collections'),
      ]);
      const products = Array.isArray(result) ? result : (result.products || []);
      const collections = Array.isArray(collectionResult) ? collectionResult : (collectionResult.collections || []);
          const productRows = products.map((product) => `<tr><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.slug)}</td><td>${formatMoney(product.priceCents, product.currency || 'usd')}</td><td>${product.active ? 'Active' : 'Archived'}</td><td><details><summary>Edit</summary><form class="admin-form" data-edit-product="${escapeHtml(product.id)}" data-price-currency="PHP">${productFormMarkup(product, collections, true)}</form><button class="text-button" type="button" data-archive-product="${escapeHtml(product.id)}">Archive</button></details></td></tr>`).join('');
          content.innerHTML = `<h2>Products</h2><p class="page-description">Prices can be entered in Philippine pesos or US dollars. Peso storefront prices are converted from the USD catalog price.</p><form class="admin-form" id="productForm" data-price-currency="PHP">${productFormMarkup({}, collections)}</form><table class="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>${productRows}</tbody></table>`;
      $('#productForm', routeView).addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const data = await productFormData(event.currentTarget);
          await api('/admin/products', { method: 'POST', body: JSON.stringify(data) });
          showToast('Product created.');
          renderAdmin(path);
        }
        catch (error) { showToast(error.message); }
      });
      content.addEventListener('change', (event) => {
        const form = event.target.closest('#productForm, [data-edit-product]');
        if (!form) return;
        if (event.target.matches('[data-price-currency]')) {
          const previousCurrency = form.dataset.priceCurrency;
          const nextCurrency = event.target.value;
          const amount = Number($('[name="priceAmount"]', form).value);
          if (Number.isFinite(amount) && amount >= 0) {
            const cents = Math.round(amount * 100);
            const convertedCents = convertMinorAmount(cents, previousCurrency, nextCurrency, phpPerUsd);
            $('[name="priceAmount"]', form).value = (convertedCents / 100).toFixed(2);
          }
          form.dataset.priceCurrency = nextCurrency;
          $('[name="priceAmount"]', form).max = (nextCurrency === 'PHP' ? phpPerUsd * 1000000 : 1000000).toFixed(2);
          $('[data-price-label]', form).firstChild.textContent = `Price amount (${nextCurrency})`;
          return;
        }
        const preview = $('[data-image-preview]', form);
        if (event.target.matches('input[name="imageFile"]') && event.target.files[0]) {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            preview.src = reader.result;
            preview.hidden = false;
          }, { once: true });
          reader.readAsDataURL(event.target.files[0]);
        } else if (event.target.matches('input[name="imageUrl"]')) {
          preview.src = event.target.value;
          preview.hidden = !event.target.value;
        }
      });
      content.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-edit-product]');
        if (!form) return;
        event.preventDefault();
        try {
          const data = await productFormData(form);
          await api(`/admin/products/${encodeURIComponent(form.dataset.editProduct)}`, { method: 'PATCH', body: JSON.stringify(data) });
          showToast('Product updated.');
          renderAdmin(path);
        } catch (error) { showToast(error.message); }
      });
      content.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-archive-product]');
        if (!button) return;
        if (!confirm('Archive this product? It will no longer be available for purchase.')) return;
        try {
          await api(`/admin/products/${encodeURIComponent(button.dataset.archiveProduct)}`, { method: 'DELETE' });
          showToast('Product archived.');
          renderAdmin(path);
        } catch (error) { showToast(error.message); }
      });
    } else if (path.endsWith('/collections')) {
      const result = await api('/collections');
      const collections = Array.isArray(result) ? result : (result.collections || []);
      content.innerHTML = `<h2>Collections</h2><form class="admin-form" id="collectionForm"><label>Name<input name="name" required /></label><label>Slug<input name="slug" required /></label><label>Description<textarea name="description"></textarea></label><button class="solid-button">Create collection</button></form><table class="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Products</th></tr></thead><tbody>${collections.map((collection) => `<tr><td>${escapeHtml(collection.name)}</td><td>${escapeHtml(collection.slug)}</td><td>${Number(collection._count?.products || collection.products?.length || 0)}</td></tr>`).join('')}</tbody></table>`;
      $('#collectionForm', routeView).addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api('/admin/collections', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
          showToast('Collection created.');
          renderAdmin(path);
        } catch (error) { showToast(error.message); }
      });
    } else if (path.endsWith('/orders')) {
      const result = await api('/admin/orders');
      const orders = Array.isArray(result) ? result : (result.orders || []);
      content.innerHTML = `<h2>Orders</h2><table class="admin-table"><thead><tr><th>Order</th><th>Email</th><th>Payment</th><th>Fulfillment</th><th>Total</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${escapeHtml(order.number || order.id)}</td><td>${escapeHtml(order.email)}</td><td>${escapeHtml(order.status)}</td><td><select data-fulfillment="${escapeHtml(order.id)}" aria-label="Fulfillment status for order ${escapeHtml(order.number || order.id)}"><option value="UNFULFILLED" ${order.fulfillmentStatus === 'UNFULFILLED' ? 'selected' : ''}>Unfulfilled</option><option value="PROCESSING" ${order.fulfillmentStatus === 'PROCESSING' ? 'selected' : ''}>Processing</option><option value="FULFILLED" ${order.fulfillmentStatus === 'FULFILLED' ? 'selected' : ''}>Fulfilled</option></select></td><td>${formatMoney(order.totalCents ?? order.total, order.currency || 'usd')}</td></tr>`).join('')}</tbody></table>`;
      content.addEventListener('change', async (event) => {
        const control = event.target.closest('[data-fulfillment]');
        if (!control) return;
        control.disabled = true;
        try {
          await api(`/admin/orders/${encodeURIComponent(control.dataset.fulfillment)}/fulfillment`, {
            method: 'PATCH',
            body: JSON.stringify({ fulfillmentStatus: control.value })
          });
          showToast('Fulfillment status updated.');
        } catch (error) {
          showToast(error.message);
          renderAdmin(path);
        }
      });
    } else if (path.endsWith('/inventory')) {
      const result = await api('/admin/inventory');
      const rows = Array.isArray(result) ? result : result.inventory || result.items || [];
      content.innerHTML = `<h2>Inventory</h2><table class="admin-table"><thead><tr><th>Product</th><th>Available</th><th>Set stock</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.product?.name || item.name || item.productName || '—')}</td><td>${Number(item.stockQuantity ?? item.stock ?? 0)}</td><td><form data-adjust="${escapeHtml(item.id)}"><input aria-label="New stock quantity" type="number" name="stock" min="0" max="1000000" value="${Number(item.stockQuantity ?? item.stock ?? 0)}" required /><button class="text-button">Save</button></form></td></tr>`).join('')}</tbody></table>`;
      content.addEventListener('submit', async (event) => {
        if (!event.target.matches('[data-adjust]')) return;
        event.preventDefault();
        try {
          const data = Object.fromEntries(new FormData(event.target));
          data.stock = Number(data.stock);
          await api(`/admin/inventory/${encodeURIComponent(event.target.dataset.adjust)}`, { method: 'PATCH', body: JSON.stringify(data) });
          showToast('Inventory updated.');
          renderAdmin(path);
        }
        catch (error) { showToast(error.message); }
      });
    } else {
      const result = await api('/admin/orders');
      const orders = Array.isArray(result) ? result : (result.orders || []);
      content.innerHTML = `<h2>Overview</h2><p>${orders.length} recent orders</p><p>Catalog and inventory management are available from the links above.</p>`;
    }
  } catch (error) {
    content.innerHTML = renderNotice(error.message, '<a href="/login">Log in with an administrator account</a>');
  }
}

async function runSearch(query) {
  const results = $('#searchResults');
  if (!query.trim()) {
    results.innerHTML = '';
    return;
  }
  results.innerHTML = renderNotice('Searching…');
  try {
    const result = await api(`/products?q=${encodeURIComponent(query.trim())}&limit=6`);
    const products = Array.isArray(result) ? result : (result.products || []);
    results.innerHTML = products.length
      ? products.map((product) => `<a class="search-result" href="/products/${encodeURIComponent(product.slug || product.id)}"><span>${escapeHtml(product.name)}</span><span>${formatMoney(product.price, product.currency || 'USD')}</span></a>`).join('')
      : renderNotice('No matching products found.');
  } catch (error) {
    results.innerHTML = renderNotice(error.message);
  }
}

async function router() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    showHome();
    try {
      const result = await api('/products?page=1&limit=4&sort=featured');
      const products = Array.isArray(result) ? result : (result.products || []);
      $('#featuredProducts').innerHTML = products.length ? products.slice(0, 4).map(productCard).join('') : renderNotice('The next drop is on its way.');
    } catch {
      $('#featuredProducts').innerHTML = renderNotice('Products will appear here when the catalog is connected.', '<a href="/collections">Explore the collections</a>');
    }
    return;
  }
  if (path === '/collections' || path.startsWith('/collections/')) return renderCollection(path.split('/')[2] || '');
  if (path.startsWith('/products/')) return renderProduct(path.split('/').slice(2).join('/'));
  if (path === '/cart') return renderCart();
  if (STATIC_DEMO && (path === '/login' || path === '/register' || path === '/account' || path.startsWith('/account/') || path === '/admin' || path.startsWith('/admin/'))) {
    showRoutePage();
    routeView.innerHTML = pageShell(`<p class="eyebrow">OG CAPS / STATIC DEMO</p><h1 class="page-title">FEATURE UNAVAILABLE</h1>${renderNotice('This read-only Vercel demo has no database. Accounts, order history, and administration are unavailable.', '<a href="/collections">Explore the sample catalog</a>')}`);
    document.title = 'Feature unavailable — OG CAPS';
    return;
  }
  if (STATIC_DEMO && path.startsWith('/checkout/')) {
    showRoutePage();
    routeView.innerHTML = pageShell(`<p class="eyebrow">OG CAPS / STATIC DEMO</p><h1 class="page-title">CHECKOUT UNAVAILABLE</h1>${renderNotice('This static demo does not accept orders or payments.', '<a href="/collections">Explore the sample catalog</a>')}`);
    document.title = 'Checkout unavailable — OG CAPS';
    return;
  }
  if (path === '/login') return renderAuth(false);
  if (path === '/register') return renderAuth(true);
  if (path === '/account' || path.startsWith('/account/')) return renderAccount(path);
  if (path === '/checkout/success' || path === '/checkout/cancel') {
    showRoutePage();
    routeView.innerHTML = pageShell(`<p class="eyebrow">OG CAPS / CHECKOUT</p><h1 class="page-title">${path.endsWith('success') ? 'THANK YOU' : 'CHECKOUT CANCELLED'}</h1><p class="page-description">${path.endsWith('success') ? 'Your payment is being confirmed. Your order status will update once the payment provider verifies it.' : 'Your checkout was cancelled. Your bag is still here when you are ready.'}</p><a class="underlined-link" href="${path.endsWith('success') ? '/account/orders' : '/cart'}">${path.endsWith('success') ? 'View order history' : 'Return to bag'} <span>↗</span></a>`);
    return;
  }
  if (path === '/admin' || path.startsWith('/admin/')) return renderAdmin(path);
  showRoutePage();
  routeView.innerHTML = pageShell(`<p class="eyebrow">OG CAPS / 404</p><h1 class="page-title">PAGE NOT FOUND</h1>${renderNotice('That page may have moved.', '<a href="/">Return home</a>')}`);
}

function scrollToLocationHash() {
  if (!location.hash) return;
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  router().then(scrollToLocationHash);
  if (link.closest('.site-nav')) {
    $('.site-nav').classList.remove('is-open');
    $('.menu-toggle').setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('popstate', () => router().then(scrollToLocationHash));

$('.menu-toggle').addEventListener('click', () => {
  const nav = $('.site-nav');
  const open = nav.classList.toggle('is-open');
  $('.menu-toggle').setAttribute('aria-expanded', String(open));
  $('.menu-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

const searchDialog = $('.search-dialog');
$('.search-open').addEventListener('click', () => {
  searchDialog.showModal();
  document.body.classList.add('dialog-open');
  $('#searchInput').focus();
});
searchDialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
$('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = $('#searchInput').value.trim();
  if (query) {
    searchDialog.close();
    history.pushState({}, '', `/collections?search=${encodeURIComponent(query)}`);
    router();
  }
});
$('#searchInput').addEventListener('input', (event) => {
  clearTimeout(event.__searchTimer);
  event.__searchTimer = setTimeout(() => runSearch(event.target.value), 220);
});
$('#newsletterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  $('#newsletterMessage').textContent = 'Email sign-up is not connected yet. Please check back soon.';
});
$('#year').textContent = new Date().getFullYear();

document.querySelectorAll('.hero-video, .manifesto-video').forEach((video) => {
  video.addEventListener('error', () => video.classList.add('video-unavailable'));
  video.addEventListener('stalled', () => video.classList.add('video-unavailable'));
});

$('#currencyToggle').addEventListener('click', async () => {
  displayCurrency = displayCurrency === 'PHP' ? 'USD' : 'PHP';
  localStorage.setItem(CURRENCY_KEY, displayCurrency);
  updateCurrencyToggle();
  await router().then(scrollToLocationHash);
});

async function initializeStorefront() {
  if (STATIC_DEMO) {
    try {
      const response = await fetch('/data/catalog.json');
      if (!response.ok) throw new Error(`Could not load the static sample catalog (HTTP ${response.status}).`);
      staticProducts = (await response.json()).map((product) => ({
        ...product,
        images: product.imageUrl ? [product.imageUrl] : [],
      }));
      if (!Array.isArray(staticProducts)) throw new Error('The static sample catalog has an invalid format.');
      phpPerUsd = 57.5;
      $('#currencyToggle').disabled = false;
    } catch (error) {
      staticCatalogError = error.message;
      console.error('Could not load the static sample catalog', error);
      showToast('The sample catalog could not be loaded.');
    }
  } else {
    try {
      const storeConfig = await api('/store-config');
      const rate = Number(storeConfig.PHP_PER_USD);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('The configured PHP/USD exchange rate is invalid.');
      phpPerUsd = rate;
      $('#currencyToggle').disabled = false;
    } catch (error) {
      console.error('Could not load storefront currency settings', error);
      displayCurrency = 'USD';
      localStorage.setItem(CURRENCY_KEY, displayCurrency);
      $('#currencyToggle').disabled = true;
      showToast('Currency settings could not be loaded. Prices remain in USD.');
    }
  }
  updateCurrencyToggle();
  refreshBagCount();
  await router().then(scrollToLocationHash);
}

initializeStorefront();
