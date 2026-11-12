package org.driversagainstflock.tv

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Semantic colors from the shared design system's light and dark tokens. */
data class TvPalette(val dark: Boolean) {
    val page = Color(if (dark) 0xFF0B0E12 else 0xFFF5F7F9)
    val card = Color(if (dark) 0xFF161B22 else 0xFFFFFFFF)
    val sheet = Color(if (dark) 0xFF11151B else 0xFFFFFFFF)
    val ink = Color(if (dark) 0xFFF5F7F9 else 0xFF11151B)
    val secondary = Color(if (dark) 0xFFA9B2BD else 0xFF4A5562)
    val border = Color(if (dark) 0xFF262E37 else 0xFFE7EAEE)
    val textBrand = Color(if (dark) 0xFF2FC177 else 0xFF0F7D45)
    val tertiary = Color(0xFF828D9B)
    val borderStrong = Color(if (dark) 0xFF3A434E else 0xFFD4D9DF)
    val brandSoft = if (dark) Color(0xFF1FBF6B).copy(alpha = .16f) else Color(0xFFE6F9EF)
    val mapLand = if (dark) "#1A1D23" else "#EAEDF0"
    val mapWater = if (dark) "#15313F" else "#BBD7EE"
    val mapPark = if (dark) "#1B2A20" else "#DCEBD6"
    val mapBuilding = if (dark) "#21262E" else "#E1E5E9"
    val mapRoad = if (dark) "#2E353F" else "#FFFFFF"
    val mapInk = if (dark) "#8A94A2" else "#5A6573"
}

internal val LocalTvPalette = staticCompositionLocalOf { TvPalette(true) }
internal val Page: Color @Composable get() = LocalTvPalette.current.page
internal val Card: Color @Composable get() = LocalTvPalette.current.card
internal val Ink: Color @Composable get() = LocalTvPalette.current.ink
internal val Secondary: Color @Composable get() = LocalTvPalette.current.secondary
internal val Border: Color @Composable get() = LocalTvPalette.current.border
internal val BrandText: Color @Composable get() = LocalTvPalette.current.textBrand
internal val Green = Color(0xFF2FC177)
internal val Brand = Color(0xFF1FBF6B)

internal val Tertiary: Color @Composable get() = LocalTvPalette.current.tertiary
internal val BrandSoft: Color @Composable get() = LocalTvPalette.current.brandSoft
internal val Alert = Color(0xFFFF4D4F)
