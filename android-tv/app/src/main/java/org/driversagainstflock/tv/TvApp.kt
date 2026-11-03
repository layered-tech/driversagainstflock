package org.driversagainstflock.tv

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import kotlinx.coroutines.delay

internal val Display = FontFamily(Font(R.font.geist_bold, FontWeight.Bold))
internal val Body = FontFamily(Font(R.font.hanken_regular), Font(R.font.hanken_semibold, FontWeight.SemiBold), Font(R.font.hanken_bold, FontWeight.Bold))
internal val Mono = FontFamily(Font(R.font.jetbrains_regular), Font(R.font.jetbrains_semibold, FontWeight.SemiBold), Font(R.font.jetbrains_bold, FontWeight.Bold))

@Composable
internal fun Label(value: String, size: Number = 16, color: Color = Ink, bold: Boolean = false, mono: Boolean = false, display: Boolean = false, modifier: Modifier = Modifier, lineHeight: Float? = null, weight: FontWeight? = null, tracking: Float? = null, maxLines: Int = Int.MAX_VALUE) {
    val fontSize = size.toFloat()
    val leading = lineHeight ?: (fontSize * if (display) 1.08f else 1.3f)
    var lines by remember(value) { mutableIntStateOf(1) }
    // CSS line boxes can be shorter than the font's ascent/descent. Compose's minimum
    // text height cannot; center the glyphs in the design line box without clipping them.
    BasicText(value, modifier.layout { measurable, constraints ->
        val placeable = measurable.measure(constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity))
        val height = constraints.constrainHeight((leading.sp.toPx() * lines).toInt())
        layout(placeable.width, height) { placeable.placeRelative(0, (height - placeable.height) / 2) }
    }, onTextLayout = { lines = it.lineCount }, maxLines = maxLines, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        style = TextStyle(color = color, fontSize = fontSize.sp, lineHeight = leading.sp,
        letterSpacing = (tracking ?: if (display) -fontSize * .012f else 0f).sp,
        lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(androidx.compose.ui.text.style.LineHeightStyle.Alignment.Center, androidx.compose.ui.text.style.LineHeightStyle.Trim.None),
        platformStyle = androidx.compose.ui.text.PlatformTextStyle(includeFontPadding = false),
        fontFamily = if (mono) Mono else if (display) Display else Body,
        fontWeight = weight ?: if (bold || display) FontWeight.Bold else FontWeight.Normal))
}

internal fun Modifier.focusHalo(focused: Boolean, radius: Float) = drawBehind {
    if (focused) {
        drawRoundRect(Green.copy(alpha = .22f), Offset(-5.dp.toPx(), -5.dp.toPx()),
            Size(size.width + 10.dp.toPx(), size.height + 10.dp.toPx()), CornerRadius((radius + 5).dp.toPx()), style = Stroke(4.dp.toPx()))
        drawRoundRect(Green, Offset(-1.5.dp.toPx(), -1.5.dp.toPx()),
            Size(size.width + 3.dp.toPx(), size.height + 3.dp.toPx()), CornerRadius((radius + 1.5f).dp.toPx()), style = Stroke(3.dp.toPx()))
    }
}

@Composable
internal fun Action(label: String, modifier: Modifier = Modifier, initial: Boolean = false, primary: Boolean = false,
    icon: ImageVector? = null, compact: Boolean = false, action: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val requester = remember { FocusRequester() }
    val foreground = if (primary) Color(0xFF0B0E12) else Ink
    Row(modifier.graphicsLayer { scaleX = if (focused) 1.035f else 1f; scaleY = scaleX }
        .focusRequester(requester).onFocusChanged { focused = it.isFocused }.focusHalo(focused, 28f)
        .border(1.dp, Border, RoundedCornerShape(28.dp))
        .background(if (primary) Brand else Card, RoundedCornerShape(28.dp)).clickable(onClick = action)
        .height(if (compact) 44.dp else 52.dp).padding(horizontal = if (compact) 12.dp else 22.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        if (icon != null) {
            Image(icon, null, Modifier.size(if (compact) 18.dp else 20.dp), colorFilter = ColorFilter.tint(foreground))
            Spacer(Modifier.width(if (compact) 6.dp else 10.dp))
        }
        Label(label, if (compact) 14 else 17, color = foreground, bold = true)
    }
    LaunchedEffect(Unit) { if (initial) requester.requestFocus() }
}

@Composable
fun TvApp(session: TvSession, store: TvStore) {
    var elapsed by remember { mutableLongStateOf(android.os.SystemClock.elapsedRealtime()) }
    var wallTime by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(session) { while (true) { delay(1000); session.tick(); elapsed = android.os.SystemClock.elapsedRealtime(); wallTime = System.currentTimeMillis() } }
    CompositionLocalProvider(LocalTvPalette provides TvPalette(store.darkTheme)) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Page)) {
        val density = LocalDensity.current
        val scale = maxWidth.value / 960f
        CompositionLocalProvider(LocalDensity provides Density(density.density * scale, density.fontScale)) {
            key(session.screen, store.darkTheme) {
                if (session.screen == TvScreen.Pairing) Pairing(session, store, elapsed)
                else TvContent(session, store, wallTime)
            }
        }
    }
    }
}

@Composable
private fun Pairing(session: TvSession, store: TvStore, elapsed: Long) {
    Row(Modifier.fillMaxSize().padding(start = 56.dp, top = 48.dp, end = 48.dp, bottom = 40.dp), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Center) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Image(painterResource(R.drawable.app_logo), "DAF", Modifier.size(32.dp))
                Label("Drivers Against Flock", 16, display = true)
                Label("TV", 12, Secondary, mono = true, modifier = Modifier.border(1.dp, Border, CircleShape).padding(horizontal = 9.dp, vertical = 3.dp))
            }
            Spacer(Modifier.height(18.dp))
            BasicText("Bring your phone\nover.", style = TextStyle(color = Ink, fontSize = 40.sp, lineHeight = 42.4.sp, fontFamily = Display, fontWeight = FontWeight.Bold, letterSpacing = (-1.2).sp))
            Spacer(Modifier.height(18.dp))
            Label("The TV shows the areas you watch on your phone and what changed in them — nothing else. It gets that from your phone over your home Wi-Fi; nothing goes through us, and nothing leaves the house.", 18, Secondary, lineHeight = 27f)
            Spacer(Modifier.height(24.dp))
            PairingLine(TvIcons.Shield, "No account, no sign-in. Pairing is the whole setup.")
            Spacer(Modifier.height(12.dp))
            PairingLine(TvIcons.Wifi, "Both on the same Wi-Fi. Unpair from either side, any time.")
            Spacer(Modifier.height(12.dp))
            PairingLine(TvIcons.Phone, "On your phone: Settings › Pair a TV, then scan the code.")
            Spacer(Modifier.height(28.dp))
        }
        Column(Modifier.width(340.dp).fillMaxHeight().border(1.dp, Border, RoundedCornerShape(18.dp))
            .background(Card, RoundedCornerShape(18.dp)).padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            val uri = store.pairingUri
            if (uri != null && !store.paired) {
                PairingQr("$uri&code=${session.pairingCode}")
                Spacer(Modifier.height(18.dp))
                Label(session.pairingCode.chunked(3).joinToString(" "), 40, mono = true)
                Spacer(Modifier.height(18.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(10.dp).background(Brand, CircleShape))
                Label(if (store.paired) "Phone paired" else store.pairingStatus, 15, Secondary)
            }
            Spacer(Modifier.height(14.dp))
            val remaining = ((session.pairingExpiresAt - elapsed) / 1000).coerceAtLeast(0)
            if (uri != null && !store.paired) Label("Code expires in ${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')}", 12, Secondary, mono = true)

        }
    }
}

@Composable
private fun PairingQr(uri: String) {
    val bitmap = remember(uri) {
        val matrix = com.google.zxing.MultiFormatWriter().encode(uri, com.google.zxing.BarcodeFormat.QR_CODE, 336, 336)
        android.graphics.Bitmap.createBitmap(336, 336, android.graphics.Bitmap.Config.ARGB_8888).apply {
            for (y in 0 until 336) for (x in 0 until 336) setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    Image(bitmap.asImageBitmap(), "Scan to pair this TV", Modifier.size(168.dp).clip(RoundedCornerShape(10.dp)))
}

@Composable
private fun PairingLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(icon, null, Modifier.size(22.dp), colorFilter = ColorFilter.tint(BrandText))
        Label(text, 16, modifier = Modifier.weight(1f))
    }
}
