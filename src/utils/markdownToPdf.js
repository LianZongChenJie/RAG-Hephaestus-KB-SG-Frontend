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

/** 由 columns/rows 构造 HTML 表格（用于 PDF 导出，单元格不换行以便整体等比缩放） */
function buildTableHtml(columns, rows = []) {
  const head = columns
    .map((c) => `<th>${escapeHtml(c.label || c.key)}</th>`)
    .join('')
  const body = (rows || [])
    .map((row) => {
      // 行数据可能是 {key: value} 对象，也兼容数组形式
      const tds = columns
        .map((col, i) => `<td>${escapeHtml(row?.[col.key] ?? row?.[i] ?? '')}</td>`)
        .join('')
      return `<tr>${tds}</tr>`
    })
    .join('')
  return `<table class="pdf-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** 表格 PDF 专用样式（配合等比缩放） */
const TABLE_CSS = `
  <style>
    .pdf-table-scale-wrap { overflow: hidden; width: 100%; }
    .pdf-table {
      width: max-content;        /* 覆盖全局 table{width:100%}，按内容自然宽度撑开 */
      max-width: none;
      border-collapse: collapse;
      font-size: 12px;
      margin: 8px 0;
      page-break-inside: auto;
    }
    .pdf-table th, .pdf-table td {
      border: 1px solid #d0d7de;
      padding: 5px 7px;
      text-align: left;
      white-space: nowrap;      /* 不换行，保证按内容自然宽度测量 */
      vertical-align: top;
    }
    .pdf-table th {
      background: #f5f7fa;
      font-weight: 600;
      color: #1f2d3d;
    }
  </style>
`

/**
 * 将 chat-stream 返回的 table 数据（columns/rows）导出为 PDF。
 * 列多导致表格超出页面宽度时，自动等比例缩小至页宽内。
 * @param {Array} columns [{key, label}]
 * @param {Array} rows 数据行
 * @param {string} filename 下载文件名（不含 .pdf 后缀）
 * @param {string} [title] PDF 内的表格标题（可选）
 */
export async function downloadTableAsPdf(columns, rows = [], filename = '数据表', title = '') {
  if (!columns?.length) return
  const { default: html2pdf } = await import('html2pdf.js')

  const titleHtml = title
    ? `<h2 style="margin:0 0 6px;font-size:18px;color:#1f2328;">${escapeHtml(title)}</h2>`
    : ''
  const tableHtml = buildTableHtml(columns, rows)

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:730px;background:#fff;'
  container.innerHTML = `${PDF_CSS}${TABLE_CSS}<div class="md-pdf-body">${titleHtml}<div class="pdf-table-scale-wrap">${tableHtml}</div></div>`
  document.body.appendChild(container)

  // 测量表格自然宽度；超出 PDF 内容区宽度时等比缩小
  const table = container.querySelector('table.pdf-table')
  const wrap = container.querySelector('.pdf-table-scale-wrap')
  const naturalWidth = table.offsetWidth
  const availWidth = 730 // 与容器宽度一致（A4 内容区）
  if (naturalWidth > availWidth && naturalWidth > 0) {
    const scale = availWidth / naturalWidth
    const naturalHeight = table.offsetHeight
    table.style.transform = `scale(${scale})`
    table.style.transformOrigin = 'top left'
    // transform 不改变布局尺寸，手动把包裹层压到缩放后的高度
    wrap.style.width = `${availWidth}px`
    wrap.style.height = `${Math.ceil(naturalHeight * scale)}px`
  }

  const safeName = (filename || '数据表').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)

  try {
    await html2pdf()
      .set({
        margin: [18, 18, 20, 18],
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 766,
        },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(container.querySelector('.md-pdf-body'))
      .save()
  } finally {
    if (container.parentNode) document.body.removeChild(container)
  }
}

/**
 * 将图表（echarts 导出的图片 dataURL）导出为 PDF
 * @param {string} imageDataUrl echarts getDataURL 得到的图片地址
 * @param {string} filename 下载文件名（不含 .pdf 后缀）
 * @param {string} [title] PDF 内的图表标题（可选）
 */
export async function downloadChartAsPdf(imageDataUrl, filename = '图表', title = '') {
  const { default: html2pdf } = await import('html2pdf.js')

  const titleHtml = title
    ? `<h2 style="margin:0 0 12px;font-size:20px;color:#1f2328;">${escapeHtml(title)}</h2>`
    : ''

  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:730px;background:#fff;'
  container.innerHTML = `${PDF_CSS}<div class="md-pdf-body">${titleHtml}<img src="${imageDataUrl}" style="width:100%;display:block;" /></div>`
  document.body.appendChild(container)

  const safeName = (filename || '图表').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)

  try {
    await html2pdf()
      .set({
        margin: [18, 18, 20, 18],
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 766,
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

/** 简单 HTML 转义，防止标题中的特殊字符破坏 HTML 结构 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

/**
 * 通用：让容器内所有超宽表格等比缩小到 availWidth 内。
 * 用于 Markdown 渲染出的 <table>（含 AI 回复中的 markdown 表格）。
 * @param {HTMLElement} container 已插入 DOM 的容器
 * @param {number} availWidth 可用宽度（px）
 */
function fitWideTables(container, availWidth) {
  container.querySelectorAll('table').forEach((table) => {
    if (table.classList.contains('pdf-table')) return // 表格导出已单独处理
    // 先按内容自然宽度测量（覆盖 CSS 里的 width:100%）
    const prevWidth = table.style.width
    table.style.width = 'max-content'
    let natural = table.offsetWidth
    if (natural <= availWidth) {
      table.style.width = prevWidth // 不超宽，还原
      return
    }
    // 禁止换行后重新测量（不换行才能得到最小自然宽度）
    table.querySelectorAll('th, td').forEach((c) => { c.style.whiteSpace = 'nowrap' })
    natural = table.offsetWidth
    if (natural <= availWidth || natural <= 0) {
      table.style.width = prevWidth
      return
    }
    const scale = availWidth / natural
    const naturalHeight = table.offsetHeight
    table.style.transform = `scale(${scale})`
    table.style.transformOrigin = 'top left'
    // 包一层固定尺寸容器，修正 transform 不改变布局的问题
    const wrap = document.createElement('div')
    wrap.style.cssText =
      `overflow:hidden;width:${availWidth}px;height:${Math.ceil(naturalHeight * scale)}px;`
    table.parentNode.insertBefore(wrap, table)
    wrap.appendChild(table)
  })
}

/**
 * 将 Markdown 内容生成 PDF 并触发浏览器下载。
 * 内容中的 markdown 表格会被渲染为真正的表格；超出页宽时等比缩小。
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

  // markdown 表格超宽时等比缩放
  fitWideTables(container, 730)

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

/**
 * 合并导出：将文本、表格、图表等内容合并到一个PDF中
 * @param {Object} options 导出选项
 * @param {string} options.text Markdown 文本内容
 * @param {Array} options.tables 表格数组 [{columns, rows, title}]
 * @param {Array} options.charts 图表数组 [{imageDataUrl, title}]
 * @param {string} options.filename 下载文件名（不含 .pdf 后缀）
 * @returns {Promise<void>}
 */
export async function downloadCombinedAsPdf({ text = '', tables = [], charts = [], filename = 'AI回复_合并导出' }) {
  const { default: html2pdf } = await import('html2pdf.js')

  // 构建合并的HTML内容
  let html = ''

  // 添加文本内容
  if (text && text.trim()) {
    const processedText = preprocessMarkdown(text)
    const textHtml = marked.parse(processedText)
    html += `<div class="combined-section">${textHtml}</div>`
  }

  // 添加表格
  tables.forEach((table, index) => {
    const title = table.title || `数据表 ${index + 1}`
    const tableHtml = buildTableHtml(table.columns, table.rows || [])
    html += `
      <div class="combined-section combined-table-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="pdf-table-scale-wrap" data-table-index="${index}">${tableHtml}</div>
      </div>
    `
  })

  // 添加图表
  charts.forEach((chart, index) => {
    const title = chart.title || `图表 ${index + 1}`
    html += `
      <div class="combined-section combined-chart-section">
        <h2>${escapeHtml(title)}</h2>
        <img src="${chart.imageDataUrl}" style="width:100%;display:block;" />
      </div>
    `
  })

  // 如果没有任何内容，直接返回
  if (!html.trim()) {
    throw new Error('没有可导出的内容')
  }

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:730px;background:#fff;'
  container.innerHTML = `${PDF_CSS}${TABLE_CSS}
    <style>
      .combined-section { margin: 16px 0; }
      .combined-section:first-child { margin-top: 0; }
      .combined-table-section h2,
      .combined-chart-section h2 {
        margin: 0 0 12px;
        font-size: 18px;
        color: #1f2328;
        border-bottom: 1px solid #eaeef2;
        padding-bottom: 8px;
      }
      .combined-chart-section {
        page-break-inside: avoid;
      }
    </style>
    <div class="md-pdf-body">${html}</div>
  `
  document.body.appendChild(container)

  // 专门处理合并导出中的表格等比例缩放
  container.querySelectorAll('.pdf-table-scale-wrap').forEach((wrap) => {
    const table = wrap.querySelector('.pdf-table')
    if (!table) return

    const naturalWidth = table.offsetWidth
    const availWidth = 730 // 与容器宽度一致（A4 内容区）

    if (naturalWidth > availWidth && naturalWidth > 0) {
      const scale = availWidth / naturalWidth
      const naturalHeight = table.offsetHeight
      table.style.transform = `scale(${scale})`
      table.style.transformOrigin = 'top left'
      // transform 不改变布局尺寸，手动把包裹层压到缩放后的高度
      wrap.style.width = `${availWidth}px`
      wrap.style.height = `${Math.ceil(naturalHeight * scale)}px`
    }
  })

  // 处理表格超宽缩放（包括合并导出中的表格）
  fitWideTables(container, 730)

  const safeName = (filename || 'AI回复_合并导出').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)

  try {
    await html2pdf()
      .set({
        margin: [18, 18, 20, 18],
        filename: `${safeName}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: 766,
        },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(container.querySelector('.md-pdf-body'))
      .save()
  } finally {
    if (container.parentNode) document.body.removeChild(container)
  }
}
