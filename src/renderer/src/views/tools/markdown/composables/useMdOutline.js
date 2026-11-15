import { computed } from 'vue'

/**
 * Parse headings from markdown text, excluding code blocks.
 * Returns array of { id, line, level, text }
 */
export function parseHeadings(markdownText) {
  if (!markdownText) return []
  const lines = markdownText.split('\n')
  const headings = []
  let fenceChar = null
  let fenceLen = 0
  let inMathBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const char = fenceMatch[1][0]
      const len = fenceMatch[1].length
      if (!fenceChar) {
        fenceChar = char
        fenceLen = len
        continue
      } else if (char === fenceChar && len >= fenceLen) {
        fenceChar = null
        fenceLen = 0
        continue
      }
    }
    if (fenceChar) continue

    if (/^\s*\$\$\s*$/.test(line)) {
      inMathBlock = !inMathBlock
      continue
    }
    if (inMathBlock) continue

    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const rawText = match[2].trim()
      // Remove trailing optional closing hashes e.g. "## Heading ##"
      const cleanText = rawText.replace(/\s+#+$/, '').trim()
      if (!cleanText) continue
      headings.push({
        id: `heading-${i + 1}`,
        line: i + 1, // 1-based line number for data-src-line matching
        level,
        text: cleanText
      })
    }
  }
  return headings
}

export function useMdOutline(contentRef) {
  const headings = computed(() => parseHeadings(contentRef?.value || ''))
  return {
    headings
  }
}
