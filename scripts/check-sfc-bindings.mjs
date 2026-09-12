// 用 @vue/compiler-sfc 编译 SFC：任何在模板里用到、但 setup 里并不存在的标识符
// 都会被编译成 _ctx.xxx。这是"模板写错名字"最靠谱的静态检查方式。
//
//   node tmp/check-sfc-bindings.mjs <file.vue> [...]
import fs from 'node:fs'
import path from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const files = process.argv.slice(2)
let bad = 0
const ALLOWED = new Set(['$slots', '$attrs', '$refs', '$emit', '$props'])

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const { descriptor, errors } = parse(src, { filename: f })
  if (errors.length) {
    console.log(' FAIL  ' + path.relative(process.cwd(), f) + '  解析错误: ' + errors.map((e) => e.message).join('; '))
    bad++
    continue
  }
  if (!descriptor.template) {
    console.log('  --   ' + path.relative(process.cwd(), f) + '  （无模板）')
    continue
  }
  const id = 'x' + Math.abs(f.split('').reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36)
  const script = compileScript(descriptor, { id, inlineTemplate: false })
  const tpl = compileTemplate({
    source: descriptor.template.content,
    filename: f,
    id,
    compilerOptions: { bindingMetadata: script.bindings, prefixIdentifiers: true },
  })
  if (tpl.errors.length) {
    console.log(' FAIL  ' + path.relative(process.cwd(), f) + '  模板错误: ' + tpl.errors.map((e) => e.message || e).join('; '))
    bad++
    continue
  }
  const refs = [...new Set([...tpl.code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
  const suspicious = refs.filter((n) => !ALLOWED.has(n) && !n.startsWith('_'))
  if (suspicious.length) {
    console.log(' FAIL  ' + path.relative(process.cwd(), f) + '  → 模板引用了 setup 里没有的: ' + suspicious.join(', '))
    bad++
  } else {
    console.log('  ok   ' + path.relative(process.cwd(), f))
  }
}
process.exit(bad ? 1 : 0)
