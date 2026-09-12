/**
 * 上游 luogu-markdown-editor 的 ESM 接入层。
 *
 * vendor/ 下的 5 个文件与上游逐字节一致（sha256 校验通过），便于后续拉取更新时
 * 直接覆盖，不做任何本地改写。它们是 IIFE + UMD 风格：执行后把类挂到 window 上。
 * 这里只承担一件事——按 ESM 顺序执行它们，再把挂载结果重新导出为模块绑定。
 *
 * 依赖注入不在这里做（KaTeX / Prism 由上层门面传入），本文件保持零逻辑。
 */

import './luogu-parser.js'
import './luogu-linter.js'
import './luogu-typora.js'
import './luogu-math-cheatsheet.js'
import './luogu-templates.js'

const host = typeof window !== 'undefined' ? window : globalThis

export const LuoguParser = host.LuoguParser
export const LuoguLinter = host.LuoguLinter
export const LuoguTypora = host.LuoguTypora
export const LuoguMathLibrary = host.LuoguMathLibrary
export const LuoguTemplates = host.LuoguTemplates
export const parseBilibiliSpec = host.parseBilibiliSpec
export const parseHighlightLines = host.parseHighlightLines
