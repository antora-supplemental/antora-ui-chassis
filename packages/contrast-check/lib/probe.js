// Runs inside the page (serialized by Playwright). Returns raw measurements only;
// ratios, thresholds and suggestions are computed in Node (lib/analyze.js).
export function probe (opts) {
  const cs = (el) => getComputedStyle(el)
  // Any CSS color (oklch, color-mix, color(srgb ...)) to rgba via a 1px canvas.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const g2 = cv.getContext('2d', { willReadFrequently: true })
  const norm = (s) => {
    if (!s || s === 'none') return null
    if (/^rgba?\(/.test(s)) return s
    g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#010203'; g2.fillStyle = s
    if (g2.fillStyle === '#010203' && !/#010203/i.test(s)) return null
    g2.fillRect(0, 0, 1, 1)
    const d = g2.getImageData(0, 0, 1, 1).data
    return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${+(d[3] / 255).toFixed(3)})`
  }
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(norm(s) || '')
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const str = (c) => c && `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(3)})`
  const over = (t, b) => {
    const a = t.a + b.a * (1 - t.a)
    if (!a) return { r: 0, g: 0, b: 0, a: 0 }
    return { r: (t.r * t.a + b.r * b.a * (1 - t.a)) / a, g: (t.g * t.a + b.g * b.a * (1 - t.a)) / a, b: (t.b * t.a + b.b * b.a * (1 - t.a)) / a, a }
  }
  // Effective background: composite ancestors' background-color until opaque.
  // null when an image/gradient is in the way (contrast unknown).
  const bgOf = (el) => {
    const layers = []
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = cs(e)
      if (s.backgroundImage && s.backgroundImage !== 'none') return null
      const c = parse(s.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc)
    return acc
  }
  const visible = (el) => {
    const s = cs(el)
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"],[hidden],.sr-only,.visually-hidden')
  }
  const sel = (el) => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break }
      let p = e.localName
      const cls = [...e.classList].filter((c) => !/^(is-|has-)/.test(c)).slice(0, 2)
      if (cls.length) p += '.' + cls.map((c) => CSS.escape(c)).join('.')
      parts.unshift(p)
      if (e === document.body) break
    }
    return parts.join(' > ')
  }
  const ignored = (el) => opts.ignoreSelectors.some((s) => { try { return el.closest(s) } catch { return false } })
  const out = { text: [], links: [], icons: [], controls: [], tokens: {}, scheme: document.documentElement.dataset.scheme || null, dark: document.documentElement.classList.contains('dark-theme') }

  // Text: elements with their own visible text.
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && out.text.length < opts.maxText; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || !n.nodeValue.trim() || seen.has(el)) continue
    seen.add(el)
    if (/^(script|style|noscript|template|option)$/.test(el.localName) || ignored(el) || !visible(el)) continue
    const s = cs(el)
    const fg = parse(s.color)
    const bg = bgOf(el)
    if (!fg || !bg) continue
    const size = parseFloat(s.fontSize)
    const bold = parseInt(s.fontWeight, 10) >= 700
    out.text.push({ selector: sel(el), fg: str(over(fg, bg)), bg: str(bg), large: size >= 24 || (bold && size >= 18.66), size, weight: s.fontWeight })
  }

  // Links inside running text without an underline: compare with the text around them.
  for (const a of document.querySelectorAll('p a[href], li a[href], td a[href], dd a[href]')) {
    if (out.links.length >= opts.maxText || ignored(a) || !visible(a)) continue
    const block = a.closest('p, li, td, dd')
    const own = [...block.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())
    if (!own) continue // the link is the whole block, not "in" text
    const s = cs(a)
    if (/underline/.test(s.textDecorationLine) || parseFloat(s.borderBottomWidth) > 0) continue
    const bg = bgOf(a)
    const fg = parse(s.color); const around = parse(cs(block).color)
    if (!bg || !fg || !around) continue
    out.links.push({ selector: sel(a), fg: str(over(fg, bg)), around: str(over(around, bg)), bg: str(bg) })
  }

  // Icons on fills: svg / icon fonts inside buttons and button-like links.
  for (const ic of document.querySelectorAll('button svg, [role=button] svg, a.button svg, .btn svg, button i, [role=button] i, button [class*="icon"]')) {
    if (out.icons.length >= opts.maxText || ignored(ic) || !visible(ic)) continue
    const host = ic.closest('button, [role=button], a.button, .btn')
    const bg = bgOf(host)
    if (!bg) continue
    const s = cs(ic)
    let c = parse(s.color)
    if (ic.localName === 'svg') {
      const shape = ic.querySelector('path, circle, rect, line, polyline, polygon') || ic
      const ss = cs(shape)
      c = (ss.stroke && ss.stroke !== 'none' && parse(ss.stroke)) || (ss.fill && ss.fill !== 'none' && parse(ss.fill)) || c
    }
    if (!c) continue
    out.icons.push({ selector: sel(ic), fg: str(over(c, bg)), bg: str(bg), host: sel(host) })
  }

  // Form-control boundaries: needed when the control's fill does not stand out.
  for (const f of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')) {
    if (out.controls.length >= opts.maxText || ignored(f) || !visible(f)) continue
    const s = cs(f)
    const outer = bgOf(f.parentElement)
    const inner = bgOf(f)
    if (!outer || !inner) continue
    const w = parseFloat(s.borderBottomWidth)
    out.controls.push({ selector: sel(f), fill: str(inner), outer: str(outer), border: w > 0 && s.borderBottomStyle !== 'none' ? str(over(parse(s.borderBottomColor), outer)) : null })
  }

  // Resolved --cs-* tokens.
  const root = cs(document.documentElement)
  for (const t of opts.tokens) out.tokens[t] = norm(root.getPropertyValue(t).trim()) || null
  return out
}

// Focus states: style snapshot before/after focus for each focusable.
export function focusables (opts) {
  const list = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')]
  return list.filter((e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[aria-hidden="true"],[inert]') &&
      !opts.ignoreSelectors.some((x) => { try { return e.closest(x) } catch { return false } })
  }).slice(0, opts.max).map((e, i) => { e.setAttribute('data-cc-focus', String(i)); return i })
}

export function snapshot (i) {
  const e = document.querySelector(`[data-cc-focus="${i}"]`)
  if (!e) return null
  // Any CSS color (oklch, color-mix, color(srgb ...)) to rgba via a 1px canvas.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const g2 = cv.getContext('2d', { willReadFrequently: true })
  const norm = (s) => {
    if (!s || s === 'none') return null
    if (/^rgba?\(/.test(s)) return s
    g2.clearRect(0, 0, 1, 1); g2.fillStyle = '#010203'; g2.fillStyle = s
    if (g2.fillStyle === '#010203' && !/#010203/i.test(s)) return null
    g2.fillRect(0, 0, 1, 1)
    const d = g2.getImageData(0, 0, 1, 1).data
    return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${+(d[3] / 255).toFixed(3)})`
  }
  const s = getComputedStyle(e)
  let bgEl = e.parentElement; let bg = 'rgba(255, 255, 255, 1)'
  for (; bgEl; bgEl = bgEl.parentElement) { const c = getComputedStyle(bgEl).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break } }
  const parts = []
  for (let x = e; x && x.nodeType === 1 && parts.length < 4; x = x.parentElement) {
    if (x.id) { parts.unshift('#' + CSS.escape(x.id)); break }
    let p = x.localName; const cls = [...x.classList].filter((c) => !/^(is-|has-)/.test(c)).slice(0, 2)
    if (cls.length) p += '.' + cls.map((c) => CSS.escape(c)).join('.')
    parts.unshift(p); if (x === document.body) break
  }
  return {
    selector: parts.join(' > '),
    focused: document.activeElement === e,
    outlineStyle: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth), outlineColor: norm(s.outlineColor),
    boxShadow: s.boxShadow, borderColor: norm(s.borderBottomColor), borderWidth: parseFloat(s.borderBottomWidth),
    background: norm(s.backgroundColor), color: norm(s.color), textDecoration: s.textDecorationLine, outerBg: norm(bg),
  }
}
