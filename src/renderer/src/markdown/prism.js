/**
 * Prism 装配。
 *
 * 单独成模块是为了控制求值顺序：prismjs 的语言组件是普通 IIFE，内部直接引用裸标识符
 * `Prism`（即 window.Prism），所以核心必须先执行完。ESM 按 import 出现顺序求值，
 * 只要本模块排在语言组件之前被 import 就不会踩空。
 *
 * 语言清单对齐洛谷解析器的别名表（cpp/c/pascal/python/java/rust/go/bash/json/latex）
 * 并补上 OI 题解里常见的几门，缺语言时代码块会自动退化成纯文本而不是报错。
 */
import Prism from 'prismjs'

if (typeof window !== 'undefined') window.Prism = window.Prism || Prism

// 关掉自动高亮：它会在 DOMContentLoaded 时扫描整页 code[class*=language-]，
// 把解析器已经产出的高亮结构再包一层。highlightAutomaticallyCallback 在触发时
// 才读 manual，因此这里赋值一定来得及。
Prism.manual = true

export default Prism
