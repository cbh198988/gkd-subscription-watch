import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';
import { PATHS } from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = rel => path.join(ROOT, rel);

// 开屏精选订阅标识（独立 ID，避免与 990667/990668/990669 撞号）
export const SPLASH_SUBSCRIPTION = {
  id: 990670,
  name: 'GKD 开屏广告精选（精准去重）',
  author: 'gkd-subscription-watch',
  checkUpdateUrl: './splash.version.json5',
};

// 开屏广告识别规则：
// - 组名含「开屏」或「启动广告」视为开屏场景；
// - 排除：用户协议/隐私授权弹窗（非广告）、功能类自动操作、摇一摇（多为页内广告）。
const SPLASH_RE = /开屏|启动广告/;
const EXCLUDE_NAMES = new Set(['开屏广告-用户协议']);

export function isSplashGroup(group) {
  const name = group?.name || '';
  if (EXCLUDE_NAMES.has(name)) return false;
  if (name.startsWith('功能类')) return false;
  if (name.includes('摇一摇')) return false;
  return SPLASH_RE.test(name);
}

// 从精准去重订阅中仅保留开屏广告规则组，丢弃无开屏组的应用
export function buildSplash(preciseApps) {
  const apps = [];
  for (const app of preciseApps || []) {
    const groups = (app.groups || []).filter(isSplashGroup);
    if (!groups.length) continue;
    apps.push({ id: app.id, name: app.name, enable: app.enable !== false, groups });
  }
  // 规则组 key 重新编号为整数，保证同一订阅内唯一（与主流程约定一致）
  let n = 1;
  for (const app of apps) for (const g of app.groups) g.key = n++;
  return apps;
}

function main() {
  const precise = JSON5.parse(fs.readFileSync(p(PATHS.preciseRules), 'utf8'));
  const apps = buildSplash(precise.apps);
  const splashSub = {
    id: SPLASH_SUBSCRIPTION.id,
    name: SPLASH_SUBSCRIPTION.name,
    version: precise.version,
    author: SPLASH_SUBSCRIPTION.author,
    checkUpdateUrl: SPLASH_SUBSCRIPTION.checkUpdateUrl,
    apps,
  };
  fs.writeFileSync(p(PATHS.splashRules), JSON.stringify(splashSub));
  fs.writeFileSync(p(PATHS.splashVersion), JSON.stringify({ id: splashSub.id, version: splashSub.version }));
  const groups = apps.reduce((s, a) => s + a.groups.length, 0);
  const rules = apps.reduce((s, a) => s + a.groups.reduce((x, g) => x + (Array.isArray(g.rules) ? g.rules.length : 1), 0), 0);
  console.log(`开屏精选: ${apps.length} 个应用, ${groups} 个规则组, ${rules} 条规则`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
