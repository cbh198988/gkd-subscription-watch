# GKD 开屏广告精选订阅

在 [angussleeping/gkd-subscription-watch](https://github.com/angussleeping/gkd-subscription-watch) 全站精准去重规则的基础上，**仅保留开屏广告规则组**，剥离信息流、局部卡片、悬浮弹窗、权限/更新/评价提示、功能类自动操作等其余规则，适合只想要「跳过开屏广告」的场景。

每周一随上游流水线自动重新生成并更新（`scripts/splash.mjs` 在精准去重产物上二次过滤）。

## 导入订阅

在 GKD App 的订阅页点右下角 **+**，粘贴以下链接。**国内直连推荐 jsDelivr 镜像**（见下方链接表）。

### 开屏广告精选（本仓库产物，ID 990670）

| 渠道 | 链接 |
|---|---|
| jsDelivr 镜像（国内推荐） | `https://cdn.jsdelivr.net/gh/cbh198988/gkd-subscription-watch@main/dist/splash.json5` |
| admincdn 备用镜像 | `https://jsd.admincdn.com/gh/cbh198988/gkd-subscription-watch@main/dist/splash.json5` |
| GitHub Raw（海外/代理） | `https://raw.githubusercontent.com/cbh198988/gkd-subscription-watch/main/dist/splash.json5` |

版本检查文件：`dist/splash.version.json5`（随订阅同目录，无需手动导入）。

### 过滤范围

- **保留**：组名含「开屏」或「启动广告」的规则组，含小程序开屏、切回应用时的开屏广告，以及两条「开屏误触返回/兜底」辅助规则。
- **排除**：用户协议/隐私授权弹窗（非广告）、功能类自动操作、摇一摇页内广告，以及虽带「开屏」字样但实为公告/会员引导的非广告组（`全屏广告-开屏提示`、`全屏广告-开屏vip提示`），以及全部局部广告、分段广告、信息流、悬浮/Banner/卡片广告、全屏活动弹窗、权限/通知/更新/评价/青少年模式等规则组。

> 过滤规则见 `scripts/splash.mjs` 的 `isSplashGroup`；如需调整口径，修改该文件后重新运行 `node scripts/splash.mjs`。

## 上游去重产物（完整规则，仅供参考）

本仓库同时保留上游三档去重产物，原始链接（GitHub Raw）：

```
https://raw.githubusercontent.com/cbh198988/gkd-subscription-watch/main/dist/precise.json5
https://raw.githubusercontent.com/cbh198988/gkd-subscription-watch/main/dist/unique_rules.json5
https://raw.githubusercontent.com/cbh198988/gkd-subscription-watch/main/dist/merged.json5
```

| 产物 | 说明 | 订阅 ID |
|---|---|---|
| `dist/precise.json5` | 精准去重订阅（语义级去重，上游推荐） | 990669 |
| `dist/unique_rules.json5` | 全站去重精选，只保留跨源唯一规则 | 990667 |
| `dist/merged.json5` | 全站合并全量，按内容指纹去重 | 990668 |
| `dist/splash.json5` | **开屏广告精选（本仓库二次过滤）** | 990670 |

## 工作原理

1. **全站发现**：每周用多组关键词搜索 GitHub（订阅/规则/开屏广告等），并读取社区维护的订阅收录名单作为种子，覆盖仓库名不含 `gkd` 的订阅
2. **质量筛选**：自动排除归档仓库、stars 不足 10、超过 180 天无更新、非订阅类仓库；候选源必须能解析出有效订阅文件且至少 5 个规则组
3. **自动降级**：已纳入的源一旦归档、长期停更或连续抓取失败，自动移出活跃池并在报告中说明原因；重新活跃后可再次纳入
4. **动态评分**：按 stars（热度）、最近推送时间（活跃度）、规则组数量（规模）综合评分，决定合并时保留谁的规则写法
5. **精准去重**：基于「快照图片 ID + 语义组名」识别跨源的同一广告，即使各库选择器写法完全不同也能识别为重复；同一广告只保留一份，并合并各源独有的选择器
6. **开屏过滤**：在精准去重产物上按组名二次过滤，生成 `dist/splash.json5`

核心保底源：Lin-arm (667)、甘霖 (233)、奥怪 (86)——它们只在仓库归档或连续失败时才会降级，不因 stars/停更阈值被剔除。

## 目录结构

- `scripts/splash.mjs`：开屏广告二次过滤（组名识别 + 产物生成）
- `scripts/discover.mjs`：GitHub 全站发现、质量筛选、路径探测、自动降级
- `scripts/main.mjs`：主流程（抓取、对比、生成产物与报告）
- `scripts/precise.mjs`：精准去重（快照 ID + 语义名，动态评分选保留源）
- `scripts/lib.mjs`：指纹与解析工具
- `scripts/config.mjs`：发现参数与输出配置
- `data/sources.json`：动态源注册表（活跃/降级记录）
- `data/baseline.json`：规则指纹基线（每周自动更新，用于计算差异）
- `data/changed.json`：本周变化摘要（含新增/降级源）
- `reports/`：每周检测报告（`latest.md` 为最新一期）
- `dist/`：生成的去重订阅文件

## 手动运行

在 GitHub 仓库页面进入 **Actions** → 选择「每周检测 GKD 全站订阅差异」→ **Run workflow**，可立即触发一次检测。

本地运行（需要设置 `GITHUB_TOKEN` 环境变量，用于 GitHub API 搜索）：

```bash
npm install
npm start            # 完整流水线（发现 + 去重 + 开屏过滤）
node scripts/splash.mjs   # 仅基于现有 dist/precise.json5 重新生成开屏精选
```

## 调整发现策略

编辑 `scripts/config.mjs` 的 `DISCOVERY`：

- `minStars`：新源最低 stars（默认 10）
- `maxInactiveDays`：超过多少天无推送视为停更（默认 180）
- `minGroups`：订阅最少规则组数（默认 5）
- `maxSources`：每周参与合并的源数量上限（默认 20）
- `queries`：GitHub 搜索关键词
- `communityList`：社区订阅收录名单地址

## 调整检测频率

编辑 `.github/workflows/weekly.yml` 中的 cron 表达式。默认每周一 09:00（北京时间）：

```yaml
schedule:
  - cron: '0 1 * * 1'   # UTC 01:00 = 北京时间 09:00
```
