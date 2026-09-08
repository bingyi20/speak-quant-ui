/** Patch HTML that has already passed renderMarkdown's sanitizer. Not a Markdown parser. */
export function patchSanitizedHtml(element: HTMLElement, html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  patchChildren(element, template.content)
}

function patchChildren(current: Node, next: Node) {
  const children = Array.from(next.childNodes)
  children.forEach((child, index) => {
    const existing = current.childNodes[index]
    if (!existing) {
      current.appendChild(child.cloneNode(true))
    } else if (existing.nodeType !== child.nodeType || existing.nodeName !== child.nodeName) {
      current.replaceChild(child.cloneNode(true), existing)
    } else if (!existing.isEqualNode(child)) {
      if (existing instanceof Element && child instanceof Element) {
        for (const attribute of Array.from(existing.attributes)) {
          if (!child.hasAttribute(attribute.name)) existing.removeAttribute(attribute.name)
        }
        for (const attribute of Array.from(child.attributes)) {
          if (existing.getAttribute(attribute.name) !== attribute.value)
            existing.setAttribute(attribute.name, attribute.value)
        }
        patchChildren(existing, child)
      } else if (existing instanceof Text && child.nodeValue?.startsWith(existing.data)) {
        existing.appendData(child.nodeValue.slice(existing.data.length))
      } else {
        existing.nodeValue = child.nodeValue
      }
    }
  })
  while (current.childNodes.length > children.length) current.removeChild(current.lastChild!)
}
