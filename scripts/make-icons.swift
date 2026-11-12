// Renders Streak's PNG app icons from public/icons/streak-logo.svg – run: swift scripts/make-icons.swift public/icons
// iOS and Android round the corners themselves, so the PNGs are full bleed; the maskable one keeps the flame in the safe zone.
import AppKit
let dir = CommandLine.arguments[1]
let svg = try! String(contentsOfFile: "\(dir)/streak-logo.svg", encoding: .utf8)

func render(_ source: String, size: Int, name: String) {
  let img = NSImage(data: source.data(using: .utf8)!)!
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  img.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(dir)/\(name)"))
}
let square = svg.replacingOccurrences(of: " rx=\"42\"", with: "")
let maskable = square.replacingOccurrences(of: "scale(1.3)", with: "scale(1)")
render(square, size: 192, name: "streak-192.png")
render(square, size: 512, name: "streak-512.png")
render(maskable, size: 512, name: "streak-maskable-512.png")
render(square, size: 180, name: "streak-touch-180.png")
render(svg, size: 64, name: "streak-favicon.png")
print("icons written")
