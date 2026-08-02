// 用 Electron 自带的 Node 执行（ELECTRON_RUN_AS_NODE=1），
// 保证 bytenode 生成的 V8 字节码与打包后的 Electron 运行时完全兼容。
const path = require('path');
const bytenode = require('bytenode');

const input = path.join(__dirname, '..', 'out', 'main', 'index.js');
const output = path.join(__dirname, '..', 'out', 'main', 'index.jsc');

bytenode
  .compileFile({ filename: input, output })
  .then(() => console.log('[jsc] 编译完成:', output))
  .catch((e) => {
    console.error('[jsc] 编译失败:', e);
    process.exit(1);
  });
