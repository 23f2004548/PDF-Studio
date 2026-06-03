// Promise.try Polyfill for compatibility with older Chromium versions in Electron 30
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (callback: (...args: any[]) => any, ...args: any[]): Promise<any> {
    try {
      return Promise.resolve(callback(...args));
    } catch (e) {
      return Promise.reject(e);
    }
  };
}

// Math.sumPrecise Polyfill for compatibility with older Chromium versions in Electron 30
if (typeof (Math as any).sumPrecise !== 'function') {
  (Math as any).sumPrecise = function (iterable: Iterable<number>): number {
    let sum = 0;
    for (const val of iterable) {
      const num = Number(val);
      if (!isNaN(num)) {
        sum += num;
      }
    }
    return sum;
  };
}

// Uint8Array.prototype.toHex and fromHex Polyfill for compatibility with older Chromium versions in Electron 30
if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function (): string {
    return Array.prototype.map.call(this, (x: number) => x.toString(16).padStart(2, '0')).join('');
  };
}
if (typeof (Uint8Array as any).fromHex !== 'function') {
  (Uint8Array as any).fromHex = function (hexString: string): Uint8Array {
    if (typeof hexString !== 'string') {
      throw new TypeError('Expected a string');
    }
    if (hexString.length % 2 !== 0) {
      throw new SyntaxError('Hex string must have an even length');
    }
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };
}

// Map.prototype.getOrInsertComputed Polyfill for compatibility with older Chromium versions in Electron 30
if (typeof (Map.prototype as any).getOrInsertComputed !== 'function') {
  (Map.prototype as any).getOrInsertComputed = function (key: any, callback: () => any): any {
    if (this.has(key)) {
      return this.get(key);
    }
    const value = callback();
    this.set(key, value);
    return value;
  };
}

if (typeof (Map.prototype as any).getOrInsert !== 'function') {
  (Map.prototype as any).getOrInsert = function (key: any, defaultValue: any): any {
    if (this.has(key)) {
      return this.get(key);
    }
    this.set(key, defaultValue);
    return defaultValue;
  };
}

import { createApp } from 'vue'
import * as Sentry from '@sentry/electron/renderer'
import './style.css'
import App from './App.vue'

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0" // Replace with your Sentry DSN later
})

window.addEventListener('error', (event) => {
  const errText = `[RENDER_ERROR] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}\nStack: ${event.error?.stack || 'No stack'}\n`;
  console.error(errText);
  if (window.desktopApi && window.desktopApi.writeTextFile) {
    window.desktopApi.writeTextFile('C:/Users/dell/.gemini/antigravity/brain/0b582dfc-8deb-44d3-ab06-b7e322e1d8eb/browser_error.log', errText);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const errText = `[RENDER_PROMISE_REJECTION] Reason: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack || 'No stack'}\n`;
  console.error(errText);
  if (window.desktopApi && window.desktopApi.writeTextFile) {
    window.desktopApi.writeTextFile('C:/Users/dell/.gemini/antigravity/brain/0b582dfc-8deb-44d3-ab06-b7e322e1d8eb/browser_error.log', errText);
  }
});

// Prevent any viewport/window/body/app scrolling that disrupts layout responsiveness
const resetViewportScroll = () => {
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
  if (document.documentElement && (document.documentElement.scrollTop !== 0 || document.documentElement.scrollLeft !== 0)) {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
  }
  if (document.body && (document.body.scrollTop !== 0 || document.body.scrollLeft !== 0)) {
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }
  const appEl = document.getElementById('app');
  if (appEl && (appEl.scrollTop !== 0 || appEl.scrollLeft !== 0)) {
    appEl.scrollTop = 0;
    appEl.scrollLeft = 0;
  }
  const shellEl = document.querySelector('.reader-shell');
  if (shellEl && (shellEl.scrollTop !== 0 || shellEl.scrollLeft !== 0)) {
    shellEl.scrollTop = 0;
    shellEl.scrollLeft = 0;
  }
};

// Listen without capturing so it only fires when the window/document viewport scrolls,
// completely bypassing scroll events from internal scrollable panels like .page-viewport.
window.addEventListener('scroll', resetViewportScroll);

window.addEventListener('resize', resetViewportScroll);


createApp(App).mount('#app')
