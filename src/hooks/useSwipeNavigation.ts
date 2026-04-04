import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { normalizeAppPathname } from '@/constants/mainTabRoutes'

const EDGE_PX = 30
const MIN_HORIZONTAL_PX = 50

/**
 * Horizontal swipe navigation between ordered tab routes. Ignores edge starts, short moves,
 * and primarily vertical gestures. Attach listeners to `containerRef` (typically the swipe root).
 */
export function useSwipeNavigation(
  paths: readonly string[],
  containerRef: RefObject<HTMLElement | null>,
): void {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const pathsRef = useRef(paths)
  pathsRef.current = paths

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (e: TouchEvent): void => {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      const t = e.touches[0]
      if (!t) return
      const w = window.innerWidth
      if (t.clientX < EDGE_PX || t.clientX > w - EDGE_PX) {
        tracking = false
        return
      }
      tracking = true
      startX = t.clientX
      startY = t.clientY
    }

    const onEnd = (e: TouchEvent): void => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return

      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (Math.abs(dx) < MIN_HORIZONTAL_PX) return
      if (Math.abs(dy) >= Math.abs(dx)) return

      const p = normalizeAppPathname(pathname)
      const order = pathsRef.current
      const idx = order.indexOf(p)
      if (idx < 0) return

      if (dx < 0) {
        if (idx < order.length - 1) navigate(order[idx + 1]!)
      } else {
        if (idx > 0) navigate(order[idx - 1]!)
      }
    }

    const onCancel = (): void => {
      tracking = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [containerRef, pathname, navigate])
}
