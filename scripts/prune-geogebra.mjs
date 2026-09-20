// GeoGebra 离线包裁剪（resources/geogebra）
//
// 背景：resources/geogebra 原始体积 48MB，其中两块对本项目完全无用：
//
//   1) js/properties_keys_<lang>.js —— 90 个语言的「属性名翻译表」，合计 23MB。
//      GeoGebra 只在运行时按「当前界面语言」动态拼出文件名去加载一个语言包
//      （web 主包 FBEE*.cache.js 内：'js/properties_keys_'+lang+'.js'）。
//      calculator.html 固定写死 language:"zh"，实测（无头 Chrome 抓网络）只会请求
//      js/properties_keys_zh-CN.js，其余 89 个永远不会被加载。
//
//   2) deferredjs/<hash>/3.cache.js (10.2MB) + 12.cache.js (0.7MB) —— Giac 符号计算引擎
//      及其 wasm 装载器。calculator.html 用的是 appName:"geometry"（几何），没有 CAS 视图；
//      实测两组 16 条命令（含 Solve / NSolve / Intersect / Root / FitPoly / Integral …）
//      在「有」和「无」这两个分包时结果逐字节一致，且 init 阶段从不请求它们。
//
// 用法：node scripts/prune-geogebra.mjs
// 幂等，可重复执行。裁剪后 resources/geogebra ≈ 14MB。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../resources/geogebra');
const WEB = path.join(ROOT, 'HTML5/5.0/web');

// 保留的语言包：中文（简/繁）+ 英文（含 en-US / en-GB 兜底）。
const KEEP_LOCALES = new Set(['zh-CN', 'zh-TW', 'en', 'en-GB', 'en-AU']);

// 明确删除的 Giac CAS 分包（几何小程序用不到）。
const DROP_DEFERRED = ['3.cache.js', '12.cache.js'];

// 对中文 + maths 用户无用的字体目录（拉丁/西里尔/希腊字母区，公式引擎不依赖）。
const DROP_FONT_DIRS = ['greek', 'cyrillic'];

// canvas2pdf.js 是 canvas2pdf.min.js 的未压缩版本，GeoGebra 加载器只引用 .min.js。
const DROP_JS_FILES = ['canvas2pdf.js'];

let removed = 0;
let bytes = 0;

function drop(file) {
  try {
    if (!fs.existsSync(file)) return;
    bytes += fs.statSync(file).size;
    fs.rmSync(file, { force: true });
    removed++;
  } catch (e) {
    console.warn(`  [geogebra] 删除失败 ${file}: ${e.message}`);
  }
}

// —— 1. 语言包 ——
const jsDir = path.join(WEB, 'js');
const localeFiles = fs.readdirSync(jsDir).filter((f) => /^properties_keys_.+\.js$/.test(f));
let keptLocales = [];
for (const f of localeFiles) {
  const lang = f.slice('properties_keys_'.length, -'.js'.length);
  if (KEEP_LOCALES.has(lang)) {
    keptLocales.push(lang);
    continue;
  }
  drop(path.join(jsDir, f));
}
console.log(`[geogebra] 语言包：保留 ${keptLocales.sort().join(', ')}，删除 ${localeFiles.length - keptLocales.length} 个`);

// —— 2. CAS 分包 ——
const deferredRoot = path.join(WEB, 'deferredjs');
if (fs.existsSync(deferredRoot)) {
  for (const perm of fs.readdirSync(deferredRoot)) {
    for (const name of DROP_DEFERRED) {
      drop(path.join(deferredRoot, perm, name));
    }
  }
}
console.log(`[geogebra] CAS 分包：目标 ${DROP_DEFERRED.join(', ')}`);

// —— 3. 字体目录（greek/cyrillic，中文+maths 用户用不到）——
const fontsDir = path.join(WEB, 'fonts');
for (const dirName of DROP_FONT_DIRS) {
  const dir = path.join(fontsDir, dirName);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      drop(path.join(dir, f));
    }
    fs.rmdirSync(dir);
    console.log(`[geogebra] 字体目录已删：fonts/${dirName}`);
  }
}

// —— 4. 冗余 JS（canvas2pdf 未压缩版）——
for (const name of DROP_JS_FILES) {
  drop(path.join(jsDir, name));
}

const before = 48;
console.log(`[geogebra] 完成：删除 ${removed} 个文件，释放 ${(bytes / 1048576).toFixed(1)}MB（原有约 ${before}MB）`);
