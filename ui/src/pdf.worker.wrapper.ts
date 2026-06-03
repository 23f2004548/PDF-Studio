// Promise.try Polyfill for the Web Worker context
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (callback: (...args: any[]) => any, ...args: any[]): Promise<any> {
    try {
      return Promise.resolve(callback(...args));
    } catch (e) {
      return Promise.reject(e);
    }
  };
}

// Math.sumPrecise Polyfill for the Web Worker context
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

// Uint8Array.prototype.toHex and fromHex Polyfill for the Web Worker context
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

// Map.prototype.getOrInsertComputed Polyfill for the Web Worker context
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

// Import the official PDF.js worker script
import 'pdfjs-dist/build/pdf.worker.mjs';
