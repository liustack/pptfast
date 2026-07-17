import '@testing-library/jest-dom/vitest'

// jsdom lacks ResizeObserver — radix-ui components require it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function createMockCanvas2dContext(): CanvasRenderingContext2D {
  const state = {
    fillStyle: '#000000',
    font: '10px sans-serif',
  }

  const gradient = {
    addColorStop() {},
  } as unknown as CanvasGradient

  const context = {
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      state.fillStyle = String(value)
    },
    get font() {
      return state.font
    },
    set font(value: string) {
      state.font = value
    },
    canvas: null,
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    rect() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    resetTransform() {},
    fillText() {},
    strokeText() {},
    measureText(text: string) {
      return { width: text.length * 7 } as TextMetrics
    },
    getImageData() {
      return {
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
        colorSpace: 'srgb',
      } as ImageData
    },
    createLinearGradient() {
      return gradient
    },
    createRadialGradient() {
      return gradient
    },
    createPattern() {
      return null
    },
  }

  return context as unknown as CanvasRenderingContext2D
}

// jsdom intentionally does not implement canvas without the optional native
// canvas package. The app only needs a quiet 2d context for chart/color tests.
// Guarded: files with `@vitest-environment node` (Task 4 node smoke test) run
// this same setup file with no DOM globals at all — HTMLCanvasElement would
// throw a ReferenceError before the test body ever executes.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(contextId: string) {
      if (contextId === '2d') return createMockCanvas2dContext()
      return null
    },
  })
}
