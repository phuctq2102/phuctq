const text = value => String(value ?? '').trim();
const number = value => Number(value) || 0;

export function summarizeInventory(rows, catalog) {
  const byIndustry = new Map();
  const byParent = new Map();
  const products = new Map();
  let positive = 0;
  let negative = 0;

  for (const row of rows) {
    const code = text(row.nhom_vat_tu);
    const value = number(row.gt_chenh_lech);
    const category = catalog.get(code);
    const parentCode = category?.ma_mch2 || '';
    if (!byParent.has(parentCode)) {
      byParent.set(parentCode, { code: parentCode, name: category?.ten_mch2 || parentCode || 'Chưa đối chiếu MCH2', net: 0, positive: 0, negative: 0, products: new Set() });
    }
    const parent = byParent.get(parentCode);
    parent.net += value;
    if (value > 0) parent.positive += value;
    if (value < 0) parent.negative += value;
    if (!byIndustry.has(code)) {
      byIndustry.set(code, { code, name: category?.ten_nganh || code || 'Chưa có nhóm vật tư', positive: 0, negative: 0, count: 0 });
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
    parent.products.add(productCode);
    const product = products.get(productCode) || { code: productCode, name: text(row.ten_sp), value: 0, counted: 0, book: 0 };
    product.value += value;
    product.counted += number(row.sl_dem);
    product.book += number(row.sl_so);
    products.set(productCode, product);
  }

  const ranked = [...products.values()].sort((a, b) => a.value - b.value || a.code.localeCompare(b.code));
  const totalAbsoluteNet = [...byParent.values()].reduce((total, row) => total + Math.abs(row.net), 0);
  return {
    positive,
    negative,
    productCount: products.size,
    positiveTop: ranked.slice().reverse().filter(row => row.value > 0).slice(0, 10),
    negativeTop: ranked.filter(row => row.value < 0).slice(0, 10),
    parents: [...byParent.values()].map(({ products, ...parent }) => ({ ...parent, productCount: products.size, share: totalAbsoluteNet ? Math.abs(parent.net) / totalAbsoluteNet : null })).sort((a, b) => a.net - b.net || a.code.localeCompare(b.code)),
    industries: [...byIndustry.values()].map(row => ({ ...row, net: row.positive + row.negative }))
      .sort((a, b) => a.net - b.net || a.code.localeCompare(b.code)),
  };
}

export function summarizeZones(rows) {
  const zones = new Map();
  for (const row of rows) {
    const zone = text(row.khu_vuc);
    if (!zones.has(zone)) zones.set(zone, {
      zone, lines: 0, products: new Set(), updaters: new Set(),
      rounds: [{ count: 0, first: Infinity, last: -Infinity }, { count: 0, first: Infinity, last: -Infinity }],
    });
    const summary = zones.get(zone);
    summary.lines += 1;
    const source = row.du_lieu_goc;
    const updater = text(source?.nguoi_cap_nhat);
    if (updater) summary.updaters.add(updater);
    for (const [index, key] of ['round1_at', 'round2_at'].entries()) {
      const raw = source?.[key];
      const timestamp = typeof raw === 'string' ? Date.parse(raw) : NaN;
      if (!Number.isFinite(timestamp)) continue;
      const round = summary.rounds[index];
      round.count += 1;
      round.first = Math.min(round.first, timestamp);
      round.last = Math.max(round.last, timestamp);
    }
    const code = text(row.ma_sp);
    if (code) summary.products.add(code);
  }
  return [...zones.values()].sort((a, b) => Number(!a.zone) - Number(!b.zone) || a.zone.localeCompare(b.zone, 'vi', { numeric: true }));
}
