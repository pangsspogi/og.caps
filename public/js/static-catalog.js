export function filterCatalog(products, {
  collectionSlug = '',
  search = '',
  sort = 'featured',
  color = '',
  minPriceCents,
  maxPriceCents,
  inStock = false,
} = {}) {
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedColor = color.toLowerCase();
  const filtered = products.filter((product) => {
    if (product.active === false) return false;
    if (collectionSlug && product.collection?.slug !== collectionSlug) return false;
    if (normalizedSearch && ![product.name, product.description, product.color, product.collection?.name]
      .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))) return false;
    if (normalizedColor && String(product.color || '').toLowerCase() !== normalizedColor) return false;
    if (minPriceCents !== undefined && product.priceCents < minPriceCents) return false;
    if (maxPriceCents !== undefined && product.priceCents > maxPriceCents) return false;
    if (inStock && product.stock < 1) return false;
    return true;
  });

  switch (sort) {
    case 'newest':
      return filtered.reverse();
    case 'price_asc':
      return filtered.sort((left, right) => left.priceCents - right.priceCents);
    case 'price_desc':
      return filtered.sort((left, right) => right.priceCents - left.priceCents);
    case 'name_asc':
      return filtered.sort((left, right) => left.name.localeCompare(right.name));
    case 'featured':
    default:
      return filtered.sort((left, right) => Number(right.featured) - Number(left.featured));
  }
}

export function validateCatalogCart(items, products) {
  if (!Array.isArray(items)) throw new Error('Your bag could not be validated.');
  const catalog = new Map(products.map((product) => [product.id, product]));
  const validatedItems = items.map((item) => {
    const product = catalog.get(item.productId);
    if (!product || product.active === false) throw new Error('A product in your bag is no longer available in this demo.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error('Enter a quantity between 1 and 99.');
    }
    if (item.quantity > product.stock) throw new Error(`${product.name} does not have that many demo items available.`);
    return {
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      currency: product.currency,
      unitPriceCents: product.priceCents,
      quantity: item.quantity,
      lineTotalCents: product.priceCents * item.quantity,
    };
  });
  return {
    items: validatedItems,
    totalCents: validatedItems.reduce((total, item) => total + item.lineTotalCents, 0),
    currency: 'usd',
  };
}
