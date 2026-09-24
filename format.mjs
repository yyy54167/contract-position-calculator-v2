export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return '—';
  const threshold = 10 ** -decimals;
  if (value > 0 && value < threshold) return `< ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(threshold)}`;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: decimals }).format(value);
}

export function formatPrice(value) {
  if (value > 0 && value < .00000001) return value.toExponential(4);
  return formatNumber(value, 8);
}
