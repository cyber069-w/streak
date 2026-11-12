// Renders Streak's app icons (a gold Koban coin with a flame on warm leather) – run: swift scripts/make-icons.swift public/icons
import AppKit
let out = CommandLine.arguments[1]

func flame(in r: NSRect) -> NSBezierPath {
  func p(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: r.minX + x * r.width, y: r.minY + y * r.height) }
  let f = NSBezierPath()
  f.move(to: p(0.5, 0.04))
  f.curve(to: p(0.14, 0.38), controlPoint1: p(0.26, 0.04), controlPoint2: p(0.12, 0.2))
  f.curve(to: p(0.52, 0.98), controlPoint1: p(0.16, 0.62), controlPoint2: p(0.46, 0.7))
  f.curve(to: p(0.86, 0.4), controlPoint1: p(0.62, 0.74), controlPoint2: p(0.9, 0.62))
  f.curve(to: p(0.5, 0.04), controlPoint1: p(0.84, 0.18), controlPoint2: p(0.72, 0.04))
  f.close()
  return f
}

func icon(size: Int, padding: CGFloat, name: String) {
  let s = CGFloat(size)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  // leather backdrop (full bleed – iOS and Android round the corners themselves)
  let bg = NSGradient(starting: NSColor(red: 0.74, green: 0.47, blue: 0.33, alpha: 1), ending: NSColor(red: 0.5, green: 0.29, blue: 0.18, alpha: 1))!
  bg.draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -60)
  // coin
  let d = s * (1 - 2 * padding)
  let coin = NSRect(x: (s - d) / 2, y: (s - d) / 2, width: d, height: d)
  NSGraphicsContext.current!.cgContext.setShadow(offset: CGSize(width: 0, height: -s * 0.02), blur: s * 0.05, color: NSColor(white: 0, alpha: 0.35).cgColor)
  let gold = NSGradient(colors: [NSColor(red: 1, green: 0.95, blue: 0.72, alpha: 1), NSColor(red: 1, green: 0.82, blue: 0.34, alpha: 1), NSColor(red: 0.79, green: 0.56, blue: 0.07, alpha: 1)], atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)!
  gold.draw(in: NSBezierPath(ovalIn: coin), relativeCenterPosition: NSPoint(x: -0.3, y: 0.4))
  NSGraphicsContext.current!.cgContext.setShadow(offset: .zero, blur: 0, color: nil)
  NSColor(red: 0.6, green: 0.4, blue: 0.04, alpha: 0.55).setStroke()
  let rim = NSBezierPath(ovalIn: coin.insetBy(dx: d * 0.07, dy: d * 0.07))
  rim.lineWidth = d * 0.025
  rim.stroke()
  // flame
  let fw = d * 0.42, fh = d * 0.52
  let fr = NSRect(x: coin.midX - fw / 2, y: coin.midY - fh / 2 - d * 0.01, width: fw, height: fh)
  NSColor(red: 0.23, green: 0.14, blue: 0.02, alpha: 1).setFill()
  flame(in: fr).fill()
  NSColor(red: 1, green: 0.86, blue: 0.45, alpha: 1).setFill()
  flame(in: NSRect(x: fr.minX + fw * 0.3, y: fr.minY + fh * 0.1, width: fw * 0.4, height: fh * 0.45)).fill()
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/\(name)"))
}
icon(size: 192, padding: 0.12, name: "streak-192.png")
icon(size: 512, padding: 0.12, name: "streak-512.png")
icon(size: 512, padding: 0.22, name: "streak-maskable-512.png")
icon(size: 180, padding: 0.12, name: "streak-touch-180.png")
icon(size: 64, padding: 0.04, name: "streak-favicon.png")
print("icons written")
