import { useRouter } from 'vue-router'
import { closeWidget } from './useWidgetExpand'

export function useWidgetPage() {
  const router = useRouter()
  function closeToWidget() {
    if (closeWidget()) return
    if (window.history.length > 1) router.back()
    else router.replace('/home')
  }
  return { closeToWidget }
}
