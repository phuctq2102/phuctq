const text = value => String(value ?? '').trim();
const number = value => Number(value) || 0;

export function summarizeInventory(rows, catalog) {
  const byIndustry = new Map();
  const products = new Map();
  let positive = 0;
  let negative = 0;

  for (const row of rows) {
    const code = text(row.nhom_vat_tu);
    const value = number(row.gt_chenh_lech);
    if (!byIndustry.has(code)) {
      byIndustry.set(code, { code, name: catalog.get(code) || code || 'Chưa có nhóm vật tư', positive: 0, negative: 0, count: 0 });
    }
    const group = byIndustry.get(code);
    group.count += 1;
    if (value > 0) {
      group.positive += value;
      positive += value;
    } else if (value < 0) {
      group.negative += value;
      negative += value;
    }

    const productCode = text(row.ma_sp);
    if (!productCode) continue;
    const product = products.get(productCode) || { code: productCode, name: text(row.ten_sp), value: 0 };
    product.value += value;
    products.set(productCode, product);
  }

  const ranked = [...products.values()].sort((a, b) => a.value - b.value || a.code.localeCompare(b.code));
  return {
    positive,
    negative,
    productCount: products.size,
    positiveTop: ranked.slice().reverse().filter(row => row.value > 0).slice(0, 10),
    negativeTop: ranked.filter(row => row.value < 0).slice(0, 10),
    industries: [...byIndustry.values()].sort((a, b) => b.positive - b.negative - (a.positive - a.negative)),
  };
}

export function summarizeZones(rows) {
  const zones = new Map();
  for (const row of rows) {
    const zone = text(row.khu_vuc);
    if (!zones.has(zone)) zones.set(zone, { zone, lines: 0, products: new Set() });
    const summary = zones.get(zone);
    summary.lines += 1;
    const code = text(row.ma_sp);
    if (code) summary.products.add(code);
  }
  return [...zones.values()].sort((a, b) => Number(!a.zone) - Number(!b.zone) || a.zone.localeCompare(b.zone, 'vi', { numeric: true }));
}
