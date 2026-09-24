import { calculatePosition } from './calc.mjs';
import { formatNumber as number, formatPrice as price } from './format.mjs';

const $ = id => document.getElementById(id);
const DEFAULTS = Object.freeze({ capital: '100', risk: '5', leverage: '10', entry: '', stop: '' });
const STORAGE_KEY = 'position-calculator-v2-plan';
const fields = Object.keys(DEFAULTS);
let plan = null;
let toastTimer;

function restoreInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key of fields) if (typeof saved?.[key] === 'string') $(key).value = saved[key];
  } catch { /* Local storage is optional; calculations work without it. */ }
}

function saveInputs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(fields.map(key => [key, $(key).value])))); } catch {}
}

function readInputs() {
  return {
    capital: Number($('capital').value), riskPercent: Number($('risk').value),
    leverage: Number($('leverage').value), entry: Number($('entry').value), stop: Number($('stop').value),
  };
}

function showStatus(text, state = '') {
  $('status').textContent = text;
  $('status').className = `status ${state}`;
}

function resetOutputs() {
  plan = null;
  for (const id of ['margin', 'notional', 'quantity', 'distance', 'usage', 'low-price', 'high-price']) $(id).textContent = '—';
  $('allocation').style.setProperty('--allocation', '0%');
  $('allocation').classList.remove('over');
  $('direction').className = 'direction';
  $('direction').textContent = '等待价格';
  $('low-label').textContent = '较低价格';
  $('high-label').textContent = '较高价格';
  $('low-point').className = $('high-point').className = 'price-point';
  $('map-note').textContent = '等待输入';
  $('copy').disabled = true;
}

function renderPriceMap(input, result) {
  const long = result.direction === 'long';
  $('low-label').textContent = long ? '止损价格' : '开仓价格';
  $('high-label').textContent = long ? '开仓价格' : '止损价格';
  $('low-price').textContent = price(Math.min(input.entry, input.stop));
  $('high-price').textContent = price(Math.max(input.entry, input.stop));
  $('low-point').className = `price-point ${long ? 'stop' : 'entry'}`;
  $('high-point').className = `price-point ${long ? 'entry' : 'stop'}`;
  $('map-note').textContent = `价格差 ${price(Math.abs(input.entry - input.stop))} USDT`;
}

function render() {
  saveInputs();
  const input = readInputs();
  const validBudget = $('capital').value.trim() !== '' && $('risk').value.trim() !== ''
    && Number.isFinite(input.capital) && input.capital > 0
    && Number.isFinite(input.riskPercent) && input.riskPercent > 0 && input.riskPercent <= 100;
  $('risk-amount').textContent = validBudget ? number(input.capital * input.riskPercent / 100, 4) : '—';
  $('error').hidden = $('warning').hidden = true;
  resetOutputs();

  if ($('entry').value.trim() === '' || $('stop').value.trim() === '') {
    showStatus('等待价格');
    $('result-hint').textContent = '补全开仓价和止损价，即可生成方案。';
    return;
  }

  const result = calculatePosition(input);
  if (result.error) {
    showStatus('请检查参数', 'invalid');
    $('error').textContent = result.error;
    $('error').hidden = false;
    $('direction').textContent = '暂无法判定';
    $('result-hint').textContent = '修正下方提示的参数后，将重新计算。';
    return;
  }

  plan = { input, result };
  showStatus(result.overCapital ? '资金不足' : '已计算', result.overCapital ? 'invalid' : 'ready');
  $('margin').textContent = number(result.margin, 4);
  $('risk-amount').textContent = number(result.stopAmount, 4);
  $('notional').textContent = number(result.notional, 4);
  $('quantity').textContent = number(result.quantity, 8);
  $('distance').textContent = `${number(result.stopDistancePercent * 100, 4)}%`;
  $('usage').textContent = `${number(result.capitalUsagePercent, 2)}%`;
  $('allocation').style.setProperty('--allocation', `${Math.min(100, result.capitalUsagePercent)}%`);
  $('allocation').classList.toggle('over', result.overCapital);
  $('direction').className = `direction ${result.direction}`;
  $('direction').textContent = result.direction === 'long' ? '↗ 做多' : '↘ 做空';
  $('result-hint').textContent = result.overCapital
    ? '所需保证金超过可用资金，当前方案无法执行。'
    : `保证金占全仓可用资金的 ${number(result.capitalUsagePercent, 2)}%。`;
  if (result.overCapital) {
    $('warning').textContent = '保证金超过全仓仓位。请检查风险额度、价格和杠杆参数。';
    $('warning').hidden = false;
  }
  renderPriceMap(input, result);
  $('copy').disabled = false;
}

function summary({ input, result }) {
  return [
    '仓位计算器 · 合约交易计划',
    `方向：${result.direction === 'long' ? '做多' : '做空'}（自动判定）`,
    `全仓仓位：${number(input.capital, 4)} USDT`,
    `风险百分比：${number(input.riskPercent, 4)}% · 杠杆：${number(input.leverage, 4)}×`,
    `开仓价格：${price(input.entry)} USDT`, `止损价格：${price(input.stop)} USDT`,
    `计划止损金额：${number(result.stopAmount, 4)} USDT`,
    `所需保证金（仓量）：${number(result.margin, 4)} USDT`,
    `名义仓位：${number(result.notional, 4)} USDT`, `合约数量：${number(result.quantity, 8)}`,
    `资金占用：${number(result.capitalUsagePercent, 2)}%`,
    ...(result.overCapital ? ['注意：所需保证金超过全仓可用资金。'] : []),
    '未计手续费、滑点、资金费率、强平规则及交易所下单精度。',
  ].join('\n');
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}

for (const key of fields) $(key).addEventListener('input', render);
$('calculator').addEventListener('submit', event => event.preventDefault());
$('reset').addEventListener('click', () => {
  for (const [key, value] of Object.entries(DEFAULTS)) $(key).value = value;
  render();
  toast('已恢复默认参数');
});
$('risk-help').addEventListener('click', () => {
  $('risk-explainer').hidden = !$('risk-explainer').hidden;
  $('risk-help').setAttribute('aria-expanded', String(!$('risk-explainer').hidden));
});
$('copy').addEventListener('click', async () => {
  if (!plan) return;
  try { await navigator.clipboard.writeText(summary(plan)); toast('完整方案已复制'); }
  catch { toast('复制失败，请检查浏览器的剪贴板权限'); }
});

const deviceTheme = matchMedia('(prefers-color-scheme: dark)');
function showTheme() { $('theme-label').textContent = `跟随系统 · ${deviceTheme.matches ? '夜间' : '白天'}`; }
deviceTheme.addEventListener('change', showTheme);
showTheme();

restoreInputs();
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
