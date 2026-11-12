package org.driversagainstflock.tv

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** Lucide paths from design/TvApp.dc.html, shared by every TV screen. */
internal object TvIcons {
    private fun icon(name: String, vararg paths: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        paths.forEach { addPath(PathParser().parsePathString(it).toNodes(), stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) }
    }.build()
    val Moon = icon("Moon", "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z")
    val Shield = icon("Shield", "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z", "m9 12 2 2 4-4")
    val Wifi = icon("Wifi", "M12 20h.01", "M2 8.82a15 15 0 0 1 20 0", "M5 12.859a10 10 0 0 1 14 0", "M8.5 16.429a5 5 0 0 1 7 0")
    val Phone = icon("Phone", "M7.0 2.0 H17.0 Q19.0 2.0 19.0 4.0 V20.0 Q19.0 22.0 17.0 22.0 H7.0 Q5.0 22.0 5.0 20.0 V4.0 Q5.0 2.0 7.0 2.0 Z", "M12 18h.01")
    val Home = icon("Home", "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22 9 12 15 12 15 22")
    val Area = icon("Area", "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M9.0 10.0 a3.0 3.0 0 1 0 6.0 0 a3.0 3.0 0 1 0 -6.0 0")
    val Settings = icon("Settings", "M21 4 L14 4", "M10 4 L3 4", "M21 12 L12 12", "M8 12 L3 12", "M21 20 L16 20", "M12 20 L3 20", "M14 2 L14 6", "M8 10 L8 14", "M16 18 L16 22")
    val Bell = icon("Bell", "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0")
    val Radius = icon("Radius", "M2.0 12.0 a10.0 10.0 0 1 0 20.0 0 a10.0 10.0 0 1 0 -20.0 0", "M22 12 L18 12", "M6 12 L2 12", "M12 6 L12 2", "M12 22 L12 18")
    val Drawn = icon("Drawn", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4")
    val Camera = icon("Camera", "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", "M9.0 13.0 a3.0 3.0 0 1 0 6.0 0 a3.0 3.0 0 1 0 -6.0 0")
    val Removed = icon("Removed", "M2.0 12.0 a10.0 10.0 0 1 0 20.0 0 a10.0 10.0 0 1 0 -20.0 0", "m15 9-6 6", "m9 9 6 6")
    val Chevron = icon("Chevron", "m9 18 6-6-6-6")
    val Back = icon("Back", "m12 19-7-7 7-7", "M19 12H5")
}
