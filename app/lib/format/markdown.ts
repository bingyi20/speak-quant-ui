import { marked, Renderer } from 'marked'
import sanitizeHtml from 'sanitize-html'
export function renderMarkdown(content: string): string {
  const renderer = new Renderer()
  renderer.html = () => ''
  const renderTable = renderer.table.bind(renderer)
  renderer.table = (token) => `<div class="markdown-table-scroll">${renderTable(token)}</div>`
  const html = marked.parse(content, { async: false, renderer }) as string
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'blockquote',
      'pre',
      'code',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'a',
      'hr',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    allowedAttributes: { a: ['href', 'title', 'rel'], div: ['class'] },
    allowedClasses: { div: ['markdown-table-scroll'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  })
}
