/**
 * 依赖：marked（Markdown -> HTML）、html2pdf.js（HTML -> PDF，基于 canvas 渲染，天然支持中文）
 */
import { marked } from 'marked'

/**
 * 判断内容是否包含 Markdown 格式特征
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeMarkdown(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 6) return false

  const patterns = [
    /^#{1,6}\s+\S+/m,                        // 标题 # ## ...
    /(\*\*|__)[^*_\n]+(\*\*|__)/,            // 粗体 **text** / __text__
    /(\*|_)[^*_\n]+(\*|_)/,                  // 斜体 *text* / _text_
    /`[^`\n]+`/,                             // 行内代码
    /```[\s\S]*?```/,                        // 代码块
    /^\s*[-*+]\s+\S+/m,                      // 无序列表
    /^\s*\d+[.)]\s+\S+/m,                    // 有序列表
    /^\s*>\s+\S+/m,                          // 引用
    /\|[^\n|]+\|[^\n]*\n\s*\|?[\s:|-]+\|/m,  // 表格
    /^\s*(---|\*\*\*|___)\s*$/m,             // 分割线
    /\[[^\]\n]+\]\([^)\n]+\)/,               // 链接 [text](url)
    /!\[[^\]\n]*\]\([^)\n]+\)/,              // 图片 ![alt](url)
  ]
  return patterns.some((re) => re.test(t))
}

/**
 * Markdown 预处理：
 * AI 模型被要求“输出 Markdown”时，常把 Markdown 内容（含表格）包在
 * ```markdown / ```md 代码围栏里返回，导致页面和 PDF 显示的是原始语法文本而非渲染结果。
 * 处理策略：
 *   1. 完整闭合的 markdown/md 代码块 -> 解包为正常 Markdown 参与渲染
 *   2. 流式过程中尚未闭合的 markdown/md 围栏开头 -> 同样解包（闭合符稍后才会到达）
 *   3. 其他语言（python/js 等）与无语言标注的代码块 -> 保持原样，不误伤
 * @param {string} text
 * @returns {string}
 */
export function preprocessMarkdown(text) {
  if (!text || typeof text !== 'string') return text
  let t = text
  // 1) 解包所有完整闭合的 ```markdown ... ``` 代码块
  t = t.replace(/```(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*(?=\r?\n|$)/g,
    (m, inner) => `\n\n${inner}\n\n`)
  // 2) 处理流式过程中未闭合的围栏开头（上面替换后仍残留的就是没有闭合符的）
  t = t.replace(/```(?:markdown|md)[ \t]*(?=\r?\n|$)/g, '\n\n')
  return t
}

/** PDF 内部排版样式（A4 纸阅读友好） */
const PDF_CSS = `
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
                   "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #24292f;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 1.1em 0 0.5em;
      line-height: 1.35;
      color: #1f2328;
      page-break-after: avoid;
    }
    h1 { font-size: 24px; border-bottom: 1px solid #d0d7de; padding-bottom: 8px; }
    h2 { font-size: 20px; border-bottom: 1px solid #eaeef2; padding-bottom: 6px; }
    h3 { font-size: 17px; }
    p { margin: 0.6em 0; }
    a { color: #0969da; text-decoration: none; }
    strong { font-weight: 600; }
    ul, ol { margin: 0.6em 0; padding-left: 2em; }
    li { margin: 0.25em 0; }
    blockquote {
      margin: 0.8em 0;
      padding: 6px 14px;
      border-left: 4px solid #d0d7de;
      color: #57606a;
      background: #f6f8fa;
    }
    pre {
      background: #f6f8fa;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      padding: 12px 14px;
      overflow-x: auto;
      font-size: 12.5px;
      line-height: 1.5;
      page-break-inside: avoid;
    }
    code {
      font-family: "SF Mono", Consolas, Monaco, "Courier New", monospace;
    }
    :not(pre) > code {
      background: rgba(175, 184, 193, 0.25);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      margin: 12px 0;
      width: 100%;
      font-size: 14px;
      page-break-inside: avoid;
      background: #fff;
    }
    th, td {
      border: 1px solid #e4e7ed;
      padding: 12px 16px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f5f7fa; font-weight: 600; color: #1f2d3d; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #d0d7de; margin: 1.2em 0; }
  </style>
`

/**
 * 将 Markdown 内容生成 PDF 并触发浏览器下载
 * @param {string} markdown 原始 Markdown 文本
 * @param {string} filename 下载文件名（不含 .pdf 后缀）
 * @returns {Promise<void>}
 */
export async function downloadMarkdownAsPdf(markdown, filename = 'AI回复') {
  // 按需动态加载 html2pdf.js（体积较大，避免拖慢首屏）
  const { default: html2pdf } = await import('html2pdf.js')

  const html = marked.parse(preprocessMarkdown(markdown || ''))

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:730px;background:#fff;'
  container.innerHTML = `${PDF_CSS}<div class="md-pdf-body">${html}</div>`
  document.body.appendChild(container)

  const safeName = (filename || 'AI回复').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)

  try {
    await html2pdf()
      .set({
        margin: [18, 18, 20, 18], // 上 右 下 左（pt）
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2,           // 2 倍分辨率，保证文字清晰
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 766,   // 与容器宽度 + 边距匹配，避免内容被截断
        },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(container.querySelector('.md-pdf-body'))
      .save()
  } finally {
    if (container.parentNode) document.body.removeChild(container)
  }
}
