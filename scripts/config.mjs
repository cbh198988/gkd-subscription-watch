// 订阅源配置：核心保底源 + GitHub 全站动态发现参数

// 核心保底源：用户明确选择且验证过，仅在仓库归档或连续抓取失败时降级
export const CORE_SOURCES = [
  {
    key: 'linarm',
    id: 667,
    name: 'Lin-arm',
    fullName: 'Lin-arm/GKD_subscription',
    url: 'https://raw.githubusercontent.com/Lin-arm/GKD_subscription/main/dist/gkd.json5',
    fallbacks: [
      'https://jsd.admincdn.com/gh/Lin-arm/GKD_subscription@main/dist/gkd.json5',
      'https://cdn.jsdelivr.net/gh/Lin-arm/GKD_subscription@main/dist/gkd.json5',
    ],
    core: true,
  },
  {
    key: 'ganlin',
    id: 233,
    name: '甘霖',
    fullName: 'ganlinte/GKD-subscription',
    url: 'https://raw.githubusercontent.com/ganlinte/GKD-subscription/main/dist/ganlin_gkd.json5',
    fallbacks: [
      'https://registry.npmmirror.com/@ganlinte/gkd-subscription/latest/files',
    ],
    core: true,
  },
  {
    key: 'aoguai',
    id: 86,
    name: '奥怪',
    fullName: 'aoguai/subscription',
    url: 'https://raw.githubusercontent.com/aoguai/subscription/custom/dist/aoguai_gkd.json5',
    fallbacks: [
      'https://cdn.jsdelivr.net/gh/aoguai/subscription@custom/dist/aoguai_gkd.json5',
      'https://registry.npmmirror.com/@aoguai/subscription/latest/files/dist/aoguai_gkd.json5',
    ],
    core: true,
  },
];

// 动态发现参数
export const DISCOVERY = {
  // GitHub 搜索查询（每周自动执行）
  queries: [
    'gkd subscription in:name,description stars:>=10 archived:false',
    'gkd 订阅 in:name,description archived:false',
    'gkd rules in:name,description stars:>=10 archived:false',
    'gkd 规则 in:name,description,readme stars:>=10 archived:false',
    'topic:gkd archived:false',
  ],
  // 社区维护的订阅收录名单（作为种子，弥补仓库名不含 gkd 的订阅）
  communityList: 'https://raw.githubusercontent.com/Adpro-Team/GKD_THS_List/main/importUrlsList.md',
  minStars: 10,          // 新源最低 stars（核心源不受此限制）
  maxInactiveDays: 180,  // 超过多少天无推送视为停更
  minGroups: 5,          // 订阅文件至少包含的规则组数
  maxSources: 20,        // 每周参与合并的源数量上限（按评分排序）
  searchPages: 2,        // 每个查询抓取的页数
  // 明显的非订阅仓库（工具/文档/App 本体/AI 论文等噪声）
  excludePattern: 'llm|distill|awesome|paper|survey|training|nlp|agent|claude|github-ranking|star.?list|arxiv|opd|robomaster|vision|toolkit|studio|inspect|selector|docs|template|generator|gkd-kit/gkd$|gkd-kit/inspect|gkd-kit/docs|gkd-kit/selector|GKAndroidLab|nvidi|General-Keypoint',
  // 订阅文件路径探测优先级（正则）
  pathPriority: [
    /(^|\/)dist\/gkd\.json5$/i,
    /(^|\/)dist\/[a-z0-9_-]*_gkd\.json5$/i,
    /(^|\/)dist\/[a-z0-9_-]*gkd[a-z0-9_-]*\.json5$/i,
    /(^|\/)gkd\.json5$/i,
    /(^|\/)subscription\.json5?$/i,
    /\.json5$/i,
  ],
  pathExclude: /version|\.min\.|beta|library|selectors?\.subscription|globalGroups/i,
};

// 生成的去重订阅标识（ID 保持不变，确保用户已导入的订阅继续收到更新）
export const OUTPUT_SUBSCRIPTION = {
  id: 990667,
  name: 'GKD 全站动态去重精选',
  author: 'gkd-subscription-watch',
  checkUpdateUrl: './unique_rules.version.json5',
};

export const REPO = {
  owner: 'cbh198988',
  name: 'gkd-subscription-watch',
};

export const PATHS = {
  sources: 'data/sources.json',
  baseline: 'data/baseline.json',
  changed: 'data/changed.json',
  uniqueRules: 'dist/unique_rules.json5',
  uniqueVersion: 'dist/unique_rules.version.json5',
  merged: 'dist/merged.json5',
  preciseRules: 'dist/precise.json5',
  preciseVersion: 'dist/precise.version.json5',
  splashRules: 'dist/splash.json5',
  splashVersion: 'dist/splash.version.json5',
  report: 'reports/latest.md',
  reportArchiveDir: 'reports',
};

// 兼容旧引用：默认仍指向核心三源（main.mjs 会替换为动态源列表）
export const SOURCES = CORE_SOURCES;
