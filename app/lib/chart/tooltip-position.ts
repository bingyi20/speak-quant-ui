import type { ChartMarkerHit } from './adapter'

/** Choose each axis independently; align with the tag so the popup stays close. */
export function tradeTooltipPosition(
  tag: ChartMarkerHit,
  popup: { width: number; height: number },
  area: { width: number; height: number },
) {
  const inset = 8,
    gap = 4
  const above = tag.top - gap - popup.height >= inset
  const rightEdge = above ? tag.left : tag.left + tag.width + gap
  const leftEdge = above ? tag.left + tag.width - popup.width : tag.left - gap - popup.width
  const right = rightEdge + popup.width <= area.width - inset
  return {
    left: Math.max(inset, Math.min(right ? rightEdge : leftEdge, area.width - popup.width - inset)),
    top: Math.max(
      inset,
      Math.min(above ? tag.top - popup.height - gap : tag.top, area.height - popup.height - inset),
    ),
    placement: `${right ? 'right' : 'left'}-${above ? 'top' : 'bottom'}`,
  }
}
