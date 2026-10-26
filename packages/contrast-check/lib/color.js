// Color math: parsing, WCAG 2.x contrast, alpha compositing, OKLab distance,
// APCA (W3 0.0.98G-4g) and the "nearest compliant color" suggestion.

/** Parse #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba() (comma or space syntax), hsl()/hsla(). Returns {r,g,b,a} (0-255, a 0-1) or null. */
export function parseColor (input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = s.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/)
  if (!m) return null
  const parts = m[2].replace(/\//g, ' ').replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length < 3) return null
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
  if (m[1].startsWith('rgb')) {
    const ch = (p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p))
    return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: alpha }
  }
  const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]))
  return { r, g, b, a: alpha }
}

export function hslToRgb (h, s, l) {
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

export function rgbToHsl ({ r, g, b }) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

export function toHex (c) {
  const x = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + x(c.r) + x(c.g) + x(c.b) + (c.a !== undefined && c.a < 1 ? x(c.a * 255) : '')
}

/** Composite `top` over `bottom` (bottom treated as opaque). */
export function blend (top, bottom) {
  const a = top.a ?? 1
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 }
}

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
export function luminance (c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b) }

/** WCAG 2.x contrast ratio; a translucent foreground is composited over the background first. */
export function contrast (fg, bg) {
  const f = typeof fg === 'string' ? parseColor(fg) : fg
  const b = typeof bg === 'string' ? parseColor(bg) : bg
  const top = (f.a ?? 1) < 1 ? blend(f, b) : f
  const [x, y] = [luminance(top), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** APCA Lc (W3 0.0.98G-4g). Positive: dark text on light; negative: light on dark. Informational only. */
export function apca (fg, bg) {
  const f = typeof fg === 'string' ? parseColor(fg) : fg
  const b = typeof bg === 'string' ? parseColor(bg) : bg
  const t = (f.a ?? 1) < 1 ? blend(f, b) : f
  const y = (c) => 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4
  const clamp = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414)
  const yt = clamp(y(t)); const yb = clamp(y(b))
  if (Math.abs(yb - yt) < 0.0005) return 0
  let lc
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; lc = s < 0.1 ? 0 : s - 0.027 } else { const s = (yb ** 0.65 - yt ** 0.62) * 1.14; lc = s > -0.1 ? 0 : s + 0.027 }
  return Math.round(lc * 1000) / 10
}

/** OKLab, for perceptual near-duplicate detection. */
export function oklab (c) {
  const r = lin(c.r); const g = lin(c.g); const b = lin(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function deltaE (a, b) {
  const p = oklab(typeof a === 'string' ? parseColor(a) : a); const q = oklab(typeof b === 'string' ? parseColor(b) : b)
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/**
 * Nearest color with the same hue and saturation as `fg` (only HSL lightness
 * moves) that reaches `target` against `bg`. Returns {hex, ratio, deltaL} or null.
 */
export function suggest (fg, bg, target) {
  const f = typeof fg === 'string' ? parseColor(fg) : fg
  const b = typeof bg === 'string' ? parseColor(bg) : bg
  const base = (f.a ?? 1) < 1 ? blend(f, b) : f
  const { h, s, l } = rgbToHsl(base)
  let best = null
  for (const dir of [-1, 1]) {
    for (let d = 0; d <= 100; d += 0.5) {
      const L = l + dir * d
      if (L < 0 || L > 100) break
      const [r, g, bb] = hslToRgb(h, s, L)
      const c = { r: Math.round(r), g: Math.round(g), b: Math.round(bb), a: 1 }
      const ratio = contrast(c, b)
      if (ratio >= target) { if (!best || d < best.deltaL) best = { hex: toHex(c), ratio: round(ratio), deltaL: d }; break }
    }
  }
  return best
}

export const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n
