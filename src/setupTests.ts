// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util'

// jsdom has no matchMedia; antd's responsive grid (the menu drawer on phones) asks it for the screen width.
window.matchMedia =
  window.matchMedia ||
  ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    }) as MediaQueryList)

// jsdom lacks TextEncoder/TextDecoder, which react-router uses.
Object.assign(global, { TextEncoder, TextDecoder })

// jsdom lacks these browser parts too: a MessageChannel (React and antd schedule work with it; Node's own would keep
// Jest from exiting), and a ResizeObserver that never fires (antd measures some elements with it).
type Port = { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (data: unknown) => void; close: () => void }
class TimerMessageChannel {
  port1: Port
  port2: Port
  constructor() {
    const port = (other: () => Port): Port => ({
      onmessage: null,
      postMessage: (data) => void setTimeout(() => other().onmessage?.({ data }), 0),
      close: () => undefined
    })
    this.port1 = port(() => this.port2)
    this.port2 = port(() => this.port1)
  }
}
Object.assign(global, { MessageChannel: TimerMessageChannel })
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(global, { ResizeObserver: NoResizeObserver })

// CRA's jsdom cannot match some of antd's newer CSS selectors and throws while computing styles (antd's tables
// measure their width that way); there, an element gets no computed styles instead. Pseudo-elements, which jsdom
// does not compute (it only logs that), get the element's own.
const computedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = (element: Element) => {
  try {
    return computedStyle(element)
  } catch {
    return document.createElement('div').style
  }
}
