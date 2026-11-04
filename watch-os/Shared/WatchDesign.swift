import SwiftUI

enum WatchDesign {
    static let brand = Color(red: 31 / 255, green: 191 / 255, blue: 107 / 255)
    static let amber = Color(red: 1, green: 176 / 255, blue: 46 / 255)
    static let muted = Color(red: 179 / 255, green: 179 / 255, blue: 179 / 255)
    static let card = Color.white.opacity(0.14)
    static let inset: CGFloat = 10
    static let gap: CGFloat = 6
    static let alert = Color(red: 1, green: 77 / 255, blue: 79 / 255)
    static let violet = Color(red: 122 / 255, green: 92 / 255, blue: 1)
    static func sans(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold) }
    static func mono(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold, design: .monospaced) }
}

struct WatchCardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .background(configuration.isPressed ? WatchDesign.brand.opacity(0.22) : WatchDesign.card,
                        in: RoundedRectangle(cornerRadius: 22))
            .contentShape(RoundedRectangle(cornerRadius: 22))
    }
}

struct ManeuverGlyph: View {
    let kind: String
    var exit: Int? = nil
    var size: CGFloat = 48
    var color: Color = WatchDesign.brand

    var body: some View {
        ZStack {
            Image("maneuver-\(kind)").renderingMode(.template).resizable().scaledToFit()
            if kind == "roundabout", let exit, exit > 0 {
                Text(String(exit)).font(WatchDesign.mono(size * (exit < 10 ? 0.26 : 0.2)))
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(color)
        .accessibilityLabel(kind == "roundabout" && exit != nil
            ? "Roundabout, exit \(exit!)" : kind.replacingOccurrences(of: "-", with: " "))
    }
}
