const canvasContext = {
  fillText: () => undefined,
  measureText: () => ({ width: 0 })
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: (contextId: string) => contextId === '2d' ? canvasContext : null
})

const nativeGetComputedStyle = window.getComputedStyle.bind(window)
Object.defineProperty(window, 'getComputedStyle', {
  configurable: true,
  value: (element: Element, _pseudoElement?: string | null) =>
    nativeGetComputedStyle(element)
})
