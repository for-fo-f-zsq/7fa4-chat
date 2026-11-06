// ========== Release 资源链接的筛选与排序（CI 与本地脚本共用）==========
// 只把「用户能下载安装的东西」挂成 Release 资源链接：
//   - 排除自动更新元数据（latest*.yml 等 *.yml/*.blockmap）与 CHANGELOG（客户端内部依赖，不是下载项）
// 排序：先按平台类型分组（Windows → macOS → Linux → Android → 压缩包），组内 x64/amd64 → arm64 → universal → 其他，再按文件名
// 用法：import { isLinkableAsset, sortAssetNames, assetType } from './release-assets.mjs';

const TYPE_ORDER = ['windows', 'macos', 'linux', 'android', 'archive'];
const TYPE_BY_EXT = {
  '.exe': 'windows',
  '.msi': 'windows',
  '.dmg': 'macos',
  '.pkg': 'macos',
  '.appimage': 'linux',
  '.deb': 'linux',
  '.rpm': 'linux',
  '.apk': 'android',
  // zip 同时被 Windows 与 macOS 目标产出且文件名相同，无法从名字判断平台，统一归到压缩包组
  '.zip': 'archive',
};
const ARCH_ORDER = ['x64', 'arm64', 'universal'];
// 架构别名：x86_64 / amd64 视同 x64；aarch64 视同 arm64（Linux 产物命名不一致）
const ARCH_ALIASES = {
  x64: ['x64', 'x86_64', 'amd64'],
  arm64: ['arm64', 'aarch64'],
  universal: ['universal'],
};
// 平台内格式顺序：AppImage 优先于 deb/rpm，dmg 优先于 pkg，exe 优先于 msi
const FORMAT_ORDER = {
  '.appimage': 0, '.deb': 1, '.rpm': 2,
  '.dmg': 0, '.pkg': 1,
  '.exe': 0, '.msi': 1,
};
// 不挂链接的文件：自动更新清单、校验文件、构建日志、更新日志
const SKIP_NAMES = new Set(['changelog', 'changelog.md', 'builder-debug.yml', 'builder-effective-config.yaml']);

const extOf = (name) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

function isLinkableAsset(name) {
  const lower = String(name).toLowerCase();
  if (SKIP_NAMES.has(lower)) return false;
  const ext = extOf(lower);
  if (ext === '.yml' || ext === '.yaml' || ext === '.blockmap' || ext === '.json') return false;
  return Boolean(TYPE_BY_EXT[ext]);
}

function assetType(name) {
  return TYPE_BY_EXT[extOf(String(name))] || 'archive';
}

function archRank(name) {
  const lower = String(name).toLowerCase();
  for (let i = 0; i < ARCH_ORDER.length; i++) {
    const aliases = ARCH_ALIASES[ARCH_ORDER[i]];
    if (aliases.some((alias) => lower.includes(`-${alias}`) || lower.includes(`_${alias}`))) return i;
  }
  return ARCH_ORDER.length;
}

function sortAssetNames(names) {
  return [...names].sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(assetType(a));
    const tb = TYPE_ORDER.indexOf(assetType(b));
    if (ta !== tb) return ta - tb;
    const fa = FORMAT_ORDER[extOf(a)] ?? 9;
    const fb = FORMAT_ORDER[extOf(b)] ?? 9;
    if (fa !== fb) return fa - fb;
    const aa = archRank(a);
    const ab = archRank(b);
    if (aa !== ab) return aa - ab;
    return a.localeCompare(b, 'en');
  });
}

export { TYPE_ORDER, TYPE_BY_EXT, ARCH_ORDER, FORMAT_ORDER, ARCH_ALIASES, isLinkableAsset, assetType, archRank, sortAssetNames };
