import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT_SUBSCRIPTION, REPO, PATHS } from './config.mjs';
import { fetchWithFallback, parseSubscription, stats } from './lib.mjs';
import { discoverSources } from './discover.mjs';
import { buildPrecise } from './precise.mjs';
import { buildSplash, SPLASH_SUBSCRIPTION } from './splash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = rel => path.join(ROOT, rel);

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(p(file), 'utf8')); }
  catch { return fallback; }
}

function writeFile(rel, content) {
  const full = p(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function groupKey(appId, fp) { return `${appId}|${fp}`; }

// GKD 要求规则组 key 为整数，且同一订阅内唯一。生成产物时统一重新编号。
function normalizeOutputKeys(apps) {
  let n = 1;
  for (const app of apps) {
    for (const g of app.groups) g.key = n++;
  }
  return apps;
}

function nowISO() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }
function st(sub) { return stats(sub); }

async function main() {
  console.log(`[${nowISO()}] 开始全站订阅检测...`);

  // 1. 动态发现本周活跃源（含自动降级）
  const prevRegistry = readJSON(PATHS.sources, null);
  const discovery = await discoverSources(prevRegistry);
  const activeSources = discovery.active;

  // 2. 抓取并解析所有活跃源
  const subs = {};
  const failed = [];
  for (const s of activeSources) {
    console.log(`抓取 ${s.name} (${s.fullName})...`);
    try {
      const { url, text } = await fetchWithFallback(s.urls, 30000);
      subs[s.key] = parseSubscription(text);
      console.log(`  成功: ${url} (${(text.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed.push(s);
      console.error(`  [失败] ${s.name}: ${e.message}`);
    }
  }
  if (!Object.keys(subs).length) throw new Error('全部订阅源抓取失败，终止以避免产出空订阅');
  const sources = activeSources.filter(s => subs[s.key]);

  // 3. 全局指纹索引：fingerprint -> 出现在哪些源
  const fingerprintSources = new Map();
  for (const s of sources) {
    for (const [appId, app] of subs[s.key].apps) {
      for (const g of app.groups) {
        const k = groupKey(appId, g.fingerprint);
        if (!fingerprintSources.has(k)) fingerprintSources.set(k, new Set());
        fingerprintSources.get(k).add(s.key);
      }
    }
  }

  // 4. 读取基线并计算每源变化
  const baseline = readJSON(PATHS.baseline, null);
  const isFirstRun = !baseline;
  const changes = {};
  for (const s of sources) {
    const currentKeys = new Set();
    for (const [appId, app] of subs[s.key].apps) {
      for (const g of app.groups) currentKeys.add(groupKey(appId, g.fingerprint));
    }
    const prevKeys = new Set((baseline?.sources?.[s.key]?.groups) || []);
    changes[s.key] = {
      added: [...currentKeys].filter(k => !prevKeys.has(k)),
      removed: [...prevKeys].filter(k => !currentKeys.has(k)),
      current: [...currentKeys],
    };
  }

  // 5. 本周新增且跨源唯一的规则
  const newUnique = [];
  for (const s of sources) {
    for (const k of changes[s.key].added) {
      if ((fingerprintSources.get(k)?.size || 0) !== 1) continue;
      const [appId] = k.split('|');
      const app = subs[s.key].apps.get(appId);
      const g = app?.groups.find(g => groupKey(appId, g.fingerprint) === k);
      if (g) newUnique.push({ source: s.name, sourceKey: s.key, appId, appName: app.name, groupName: g.name });
    }
  }

  // 6. 各源当前独有规则数（按内容指纹）
  const uniqueCounts = {};
  for (const s of sources) {
    uniqueCounts[s.key] = 0;
    for (const [, owners] of fingerprintSources) if (owners.size === 1 && owners.has(s.key)) uniqueCounts[s.key]++;
  }

  // 7. 去重精选订阅（只保留跨源唯一规则）
  const uniqueApps = new Map();
  for (const s of sources) {
    for (const [appId, app] of subs[s.key].apps) {
      for (const g of app.groups) {
        if (fingerprintSources.get(groupKey(appId, g.fingerprint))?.size !== 1) continue;
        if (!uniqueApps.has(appId)) uniqueApps.set(appId, { id: appId, name: app.name, enable: true, groups: [] });
        const raw = { ...g.raw };
        delete raw.key;
        uniqueApps.get(appId).groups.push({ key: `${s.key}-${g.key ?? 0}`, ...raw, enable: g.enable && app.enable });
      }
    }
  }
  const version = Number(today().replace(/-/g, ''));
  const uniqueSub = {
    id: OUTPUT_SUBSCRIPTION.id,
    name: OUTPUT_SUBSCRIPTION.name,
    version,
    author: OUTPUT_SUBSCRIPTION.author,
    checkUpdateUrl: OUTPUT_SUBSCRIPTION.checkUpdateUrl,
    apps: normalizeOutputKeys([...uniqueApps.values()]),
  };
  writeFile(PATHS.uniqueRules, JSON.stringify(uniqueSub));
  writeFile(PATHS.uniqueVersion, JSON.stringify({ id: uniqueSub.id, version }));

  // 8. 合并全量订阅（按内容指纹去重）
  const mergedApps = new Map();
  const seen = new Set();
  for (const s of sources) {
    for (const [appId, app] of subs[s.key].apps) {
      for (const g of app.groups) {
        const k = groupKey(appId, g.fingerprint);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!mergedApps.has(appId)) mergedApps.set(appId, { id: appId, name: app.name, enable: true, groups: [] });
        const raw = { ...g.raw };
        delete raw.key;
        mergedApps.get(appId).groups.push({ key: `${s.key}-${g.key ?? 0}`, ...raw, enable: g.enable && app.enable });
      }
    }
  }
  const mergedSub = {
    id: OUTPUT_SUBSCRIPTION.id + 1,
    name: 'GKD 全站动态合并全量',
    version,
    author: OUTPUT_SUBSCRIPTION.author,
    apps: normalizeOutputKeys([...mergedApps.values()]),
  };
  writeFile(PATHS.merged, JSON.stringify(mergedSub));

  // 8.5 精准去重（快照 ID + 语义名），按动态评分与小米优先策略选保留源
  const preciseResult = buildPrecise(subs, sources);
  const preciseSub = {
    id: OUTPUT_SUBSCRIPTION.id + 2,
    name: 'GKD 全站动态精准去重',
    version,
    author: OUTPUT_SUBSCRIPTION.author,
    checkUpdateUrl: './precise.version.json5',
    apps: normalizeOutputKeys(preciseResult.apps),
  };
  writeFile(PATHS.preciseRules, JSON.stringify(preciseSub));
  writeFile(PATHS.preciseVersion, JSON.stringify({ id: preciseSub.id, version }));

  // 8.6 开屏广告精选：从精准去重结果中仅保留开屏广告规则组
  const splashSub = {
    id: SPLASH_SUBSCRIPTION.id,
    name: SPLASH_SUBSCRIPTION.name,
    version,
    author: OUTPUT_SUBSCRIPTION.author,
    checkUpdateUrl: SPLASH_SUBSCRIPTION.checkUpdateUrl,
    apps: buildSplash(preciseSub.apps),
  };
  writeFile(PATHS.splashRules, JSON.stringify(splashSub));
  writeFile(PATHS.splashVersion, JSON.stringify({ id: splashSub.id, version }));

  // 9. 生成报告
  const lines = [];
  lines.push('# GKD 全站动态订阅检测报告');
  lines.push('');
  lines.push(`生成时间：${nowISO()}`);
  lines.push('');
  lines.push('## 一、本周源发现与自动降级');
  lines.push('');
  const d = discovery.registry.discovery;
  lines.push(`扫描 GitHub 仓库 **${d.searched}** 个，社区名单种子 ${d.communitySeeds} 个，仓库级初筛 ${d.candidates} 个，规则文件校验通过 ${d.validated} 个，最终纳入 **${sources.length}** 个活跃源。`);
  lines.push('');
  if (discovery.newSources.length) {
    lines.push(`### 本周新增源（${discovery.newSources.length}）`);
    lines.push('');
    lines.push('| 订阅 | 仓库 | Stars | 规则组 | 独有规则 | 评分 |');
    lines.push('|---|---|---|---|---|---|');
    for (const s of discovery.newSources) {
      if (!subs[s.key]) continue;
      lines.push(`| ${s.name} | ${s.fullName} | ${s.stars} | ${st(subs[s.key]).groups} | ${uniqueCounts[s.key] ?? 0} | ${s.score} |`);
    }
    lines.push('');
  } else {
    lines.push('本周未发现符合门槛的新源。');
    lines.push('');
  }
  if (discovery.droppedSources.length) {
    lines.push(`### 本周降级源（${discovery.droppedSources.length}）`);
    lines.push('');
    lines.push('| 订阅 | 原因 |');
    lines.push('|---|---|');
    for (const s of discovery.droppedSources) lines.push(`| ${s.name || s.fullName} | ${s.reason} |`);
    lines.push('');
  }
  if (failed.length) {
    lines.push(`> 注意：${failed.map(s => s.name).join('、')} 本周抓取失败，已从本次合并中跳过（仍在注册表中，下周重试）。`);
    lines.push('');
  }

  lines.push('## 二、活跃订阅状态');
  lines.push('');
  lines.push('| 订阅 | ID | 版本 | 应用数 | 规则组 | 启用组 | 规则条目 | 评分 | 来源 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  const idCount = {};
  for (const s of sources) if (s.id) idCount[s.id] = (idCount[s.id] || 0) + 1;
  for (const s of sources) {
    const stx = st(subs[s.key]);
    const idMark = s.id && idCount[s.id] > 1 ? `${s.id} ⚠️` : `${s.id ?? '-'}`;
    lines.push(`| ${s.name} | ${idMark} | ${stx.version} | ${stx.apps} | ${stx.groups} | ${stx.enabledGroups} | ${stx.ruleItems} | ${s.score ?? '-'} | ${s.core ? '核心' : s.origin === 'community' ? '社区名单' : 'GitHub发现'} |`);
  }
  lines.push('');
  if (Object.values(idCount).some(n => n > 1)) {
    lines.push('> ⚠️ 表示上游订阅 ID 撞号（不影响本仓库产物：三档订阅 ID 990667/990668/990669 独立且唯一）。');
    lines.push('');
  }
  lines.push('## 三、本周变化');
  lines.push('');
  if (isFirstRun) {
    lines.push('> 首次运行，已建立基线快照。下周起将报告精确的新增/删除规则。');
  } else {
    lines.push('| 订阅 | 新增规则组 | 删除规则组 |');
    lines.push('|---|---|---|');
    for (const s of sources) lines.push(`| ${s.name} | ${changes[s.key].added.length} | ${changes[s.key].removed.length} |`);
  }
  lines.push('');
  lines.push('## 四、本周新增且不重复的规则');
  lines.push('');
  if (discovery.newSources.length) {
    lines.push('> 新源首次纳入时，其存量规则会计入本周新增；下周起该数字才反映真实增量。');
    lines.push('');
  }
  if (!newUnique.length) {
    lines.push(isFirstRun ? '> 首次运行无对比基线，暂不列出。' : '本周无新增的独有规则。');
  } else {
    lines.push(`共 ${newUnique.length} 条来自单一源的新规则（其他源均无相同规则）：`);
    lines.push('');
    for (const item of newUnique.slice(0, 100)) {
      lines.push(`- **${item.source}** · ${item.appName || item.appId} · ${item.groupName || '未命名规则组'} \`${item.appId}\``);
    }
    if (newUnique.length > 100) lines.push(`- ...另有 ${newUnique.length - 100} 条，见去重订阅文件`);
  }
  lines.push('');
  lines.push('## 五、各源当前独有规则数');
  lines.push('');
  for (const s of sources) lines.push(`- ${s.name}：${uniqueCounts[s.key] ?? 0} 条`);
  lines.push('');
  const preciseGroups = preciseResult.apps.reduce((s, a) => s + a.groups.length, 0);
  lines.push('## 六、精准去重结果（推荐）');
  lines.push('');
  lines.push(`基于「快照图片 ID + 语义组名」识别跨源的同一广告（即使选择器写法不同也能识别），共合并 **${preciseResult.dedupCount}** 条重复规则。`);
  lines.push('');
  lines.push('| 产物 | 应用数 | 规则组数 | 说明 |');
  lines.push('|---|---|---|---|');
  lines.push(`| 全站合并全量 | ${mergedApps.size} | ${mergedSub.apps.reduce((s, a) => s + a.groups.length, 0)} | 仅按内容指纹去重 |`);
  lines.push(`| 全站去重精选 | ${uniqueApps.size} | ${uniqueSub.apps.reduce((s, a) => s + a.groups.length, 0)} | 只保留跨源唯一规则 |`);
  lines.push(`| **全站精准去重** | ${preciseResult.apps.length} | ${preciseGroups} | 语义级去重，推荐导入 |`);
  const splashGroups = splashSub.apps.reduce((s, a) => s + a.groups.length, 0);
  lines.push(`| 开屏广告精选 | ${splashSub.apps.length} | ${splashGroups} | 精准去重结果中仅保留开屏广告规则组 |`);
  lines.push('');
  lines.push('精准去重策略：同一广告只保留一份；小米系统应用优先奥怪版本，其余按「热度 + 活跃度 + 规则规模」评分选保留源；并合并各源独有选择器以防漏杀。');
  lines.push('');
  lines.push('## 七、产物说明');
  lines.push('');
  lines.push('- `dist/precise.json5`：**精准去重订阅（推荐）**，ID 990669');
  lines.push('- `dist/unique_rules.json5`：去重精选订阅，ID 990667');
  lines.push('- `dist/merged.json5`：合并全量订阅，ID 990668');
  lines.push('- `dist/splash.json5`：开屏广告精选订阅（仅开屏广告规则组），ID 990670');
  lines.push('- `dist/*.version.json5`：更新检查文件');
  lines.push('- `data/sources.json`：动态源注册表（活跃/降级记录）');
  lines.push('');
  const rawUrl = `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/main/`;
  lines.push('### 一键导入链接');
  lines.push('');
  lines.push('```txt');
  lines.push(rawUrl + PATHS.preciseRules);
  lines.push(rawUrl + PATHS.uniqueRules);
  lines.push(rawUrl + PATHS.merged);
  lines.push(rawUrl + PATHS.splashRules);
  lines.push('```');
  lines.push('');
  writeFile(PATHS.report, lines.join('\n'));
  writeFile(`${PATHS.reportArchiveDir}/${today()}.md`, lines.join('\n'));

  // 10. 更新基线
  const newBaseline = { generatedAt: nowISO(), sources: {} };
  for (const s of sources) {
    newBaseline.sources[s.key] = { version: subs[s.key].version, groups: changes[s.key].current };
  }
  writeFile(PATHS.baseline, JSON.stringify(newBaseline, null, 2));
  writeFile(PATHS.changed, JSON.stringify({
    date: today(),
    isFirstRun,
    changed: isFirstRun || newUnique.length > 0 || discovery.newSources.length > 0 || discovery.droppedSources.length > 0 ||
      sources.some(s => changes[s.key].added.length || changes[s.key].removed.length),
    newUnique: newUnique.length,
    newSources: discovery.newSources.map(s => ({
      name: s.name, fullName: s.fullName,
      groups: subs[s.key] ? st(subs[s.key]).groups : 0,
      unique: uniqueCounts[s.key] ?? 0, score: s.score,
    })),
    droppedSources: discovery.droppedSources.map(s => ({ name: s.name || s.fullName, reason: s.reason })),
    added: Object.fromEntries(sources.map(s => [s.key, changes[s.key].added.length])),
    removed: Object.fromEntries(sources.map(s => [s.key, changes[s.key].removed.length])),
  }, null, 2));

  console.log('\n=== 完成 ===');
  console.log(`活跃源 ${sources.length} 个，新增 ${discovery.newSources.length}，降级 ${discovery.droppedSources.length}，抓取失败 ${failed.length}`);
  console.log(`新增独有规则: ${newUnique.length}`);
  console.log(`精准去重: 合并 ${preciseResult.dedupCount} 条重复, 产出 ${preciseGroups} 组`);
  console.log(`产物: ${PATHS.preciseRules}, ${PATHS.uniqueRules}, ${PATHS.merged}, ${PATHS.report}`);
}

main().catch(e => { console.error(e); process.exit(1); });
