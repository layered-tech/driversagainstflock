package org.driversagainstflock.tv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.*
import java.time.format.DateTimeFormatter
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec

@Composable
internal fun FocusCard(modifier: Modifier = Modifier, initial: Boolean = false, onFocus: () -> Unit = {},
    padding: PaddingValues = PaddingValues(16.dp), radius: Int = 18, plain: Boolean = false,
    onClick: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val requester = remember { FocusRequester() }
    val shape = RoundedCornerShape(radius.dp)
    Column(modifier.graphicsLayer { scaleX = if (focused) 1.035f else 1f; scaleY = scaleX }
        .focusRequester(requester).onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocus() }
        .focusHalo(focused, radius.toFloat()).border(1.dp, if (plain && !focused) Color.Transparent else Border, shape)
        .background(if (plain && !focused) Color.Transparent else Card, shape)
        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
        .padding(padding), content = content)
    LaunchedEffect(Unit) { if (initial) requester.requestFocus() }
}

@Composable
private fun Glyph(icon: ImageVector, description: String? = null, color: Color = Ink, size: Int = 24) {
    Image(icon, description, Modifier.size(size.dp), colorFilter = ColorFilter.tint(color))
}

@Composable
private fun Rail(screen: TvScreen, store: TvStore, navigate: (TvScreen) -> Unit) {
    val areasScreen = screen == TvScreen.Areas || screen == TvScreen.AreaFeed
    var expanded by remember { mutableStateOf(areasScreen) }
    val selected = if (screen == TvScreen.AreaFeed || screen == TvScreen.Camera) TvScreen.Areas else screen
    val railBorder = Border
    Column(Modifier.width(if (expanded) 232.dp else 72.dp).fillMaxHeight().background(LocalTvPalette.current.sheet)
        .drawBehind { drawLine(railBorder, androidx.compose.ui.geometry.Offset(size.width, 0f), androidx.compose.ui.geometry.Offset(size.width, size.height), 1.dp.toPx()) }
        .onFocusChanged { expanded = it.hasFocus || areasScreen }.padding(start = 12.dp, end = 12.dp, top = 22.dp, bottom = 18.dp)) {
        Row(Modifier.padding(horizontal = 10.dp).padding(bottom = 22.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Image(painterResource(R.drawable.app_logo), "DAF", Modifier.size(30.dp))
            if (expanded) Label("Drivers Against Flock", 16, display = true, lineHeight = 20.8f, modifier = Modifier.weight(1f))
        }
        val entries = listOf(TvScreen.Home to TvIcons.Home, TvScreen.Areas to TvIcons.Area, TvScreen.Ambient to TvIcons.Moon, TvScreen.Settings to TvIcons.Settings)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            entries.forEach { (destination, icon) ->
                var focus by remember { mutableStateOf(false) }
                val active = destination == selected
                val color = if (active) BrandText else if (expanded) Secondary else Tertiary
                Row(Modifier.fillMaxWidth().height(48.dp).onFocusChanged { focus = it.isFocused }
                    .focusHalo(focus, 10f).background(if (active || focus) BrandSoft else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable { navigate(destination) }.padding(horizontal = if (expanded) 14.dp else 13.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Glyph(icon, destination.name, color, 22)
                    if (expanded) Label(destination.name, 17, color, weight = if (active) FontWeight.Bold else FontWeight.SemiBold)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        Row(Modifier.padding(horizontal = 14.dp).heightIn(min = if (expanded) 33.dp else 48.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box {
                Glyph(TvIcons.Phone, if (store.paired) "Phone paired" else "Phone not paired", Tertiary, 20)
                if (store.paired) Box(Modifier.align(Alignment.TopEnd).offset(x = 3.dp, y = (-3).dp).size(9.dp)
                    .background(Brand, CircleShape).border(2.dp, LocalTvPalette.current.sheet, CircleShape))
            }
            if (expanded) Column {
                Label(if (store.paired) "Phone paired" else "Phone not paired", 13, weight = FontWeight.SemiBold)
                if (store.paired) Label(store.syncLabel().replace("Synced from your phone", "synced").replace("Synced", "synced"), 11.5, Tertiary, mono = true, maxLines = 2)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun TvContent(session: TvSession, store: TvStore, now: Long) {
    val navigate: (TvScreen) -> Unit = { session.navigate(it) }
    val changes = store.area?.let(store::visibleChanges).orEmpty()
    Box(Modifier.fillMaxSize().background(Page)) {
        if (session.screen in listOf(TvScreen.Home, TvScreen.Camera, TvScreen.Ambient) && (store.area?.mappedCameras?.isNotEmpty() == true || changes.any { it.latitude.isFinite() && it.longitude.isFinite() })) {
            TvMap(store.area?.mappedCameras.orEmpty(), changes, store.selected, Modifier.fillMaxSize(), leftInset = if (session.screen == TvScreen.Camera) 496 else if (session.screen == TvScreen.Home) 320 else 0,
                ambient = session.screen == TvScreen.Ambient)
        }
        when (session.screen) {
            TvScreen.Home -> {
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Page, .34f to Page, .78f to Page.copy(alpha = 0f))))
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Page.copy(alpha = 0f), .45f to Page.copy(alpha = 0f), 1f to Page)))
                CompositionLocalProvider(LocalBringIntoViewSpec provides remember { object : BringIntoViewSpec {
                    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = when {
                        offset < 0 -> offset
                        offset + size > containerSize - 27 -> offset + size - containerSize + 27
                        else -> 0f
                    }
                } }) { Home(store, now, navigate) }
            }
            TvScreen.Areas -> MyAreas(store, navigate)
            TvScreen.AreaFeed -> AreaFeed(store, navigate)
            TvScreen.Camera -> CameraDetail(store) { session.back() }
            TvScreen.Ambient -> Ambient(store, now)
            TvScreen.Settings -> Column(Modifier.padding(start = 280.dp, top = 70.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Label("Settings", 34, display = true)
                Label(if (store.paired) "Phone paired" else "Phone not paired", 20)
                if (store.paired) Action("Unpair phone", initial = true) { store.unpair() }
                else Action("Pair your phone", initial = true) { navigate(TvScreen.Pairing) }
                Action(if (store.darkTheme) "Theme: Dark" else "Theme: Light") { store.changeTheme(!store.darkTheme) }
                if (store.hiddenFeedIds.isNotEmpty()) Action("Show hidden feed items") { store.restoreHiddenFeed() }
            }
            else -> Unit
        }
        if (store.notice.isNotBlank() && session.screen != TvScreen.Ambient) {
            Label(store.notice, 16, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 40.dp).background(Card, RoundedCornerShape(16.dp)).padding(16.dp))
            LaunchedEffect(store.notice) { kotlinx.coroutines.delay(4000); store.notice = "" }
        }
        if (session.screen != TvScreen.Ambient) Rail(session.screen, store, navigate)
    }
}

@Composable
private fun Eyebrow(text: String) = Label(text, 12, Tertiary, mono = true, weight = FontWeight.SemiBold, tracking = .96f)

private fun openArea(store: TvStore, index: Int, navigate: (TvScreen) -> Unit) {
    store.selectArea(index)
    navigate(TvScreen.AreaFeed)
}

@Composable
private fun AreaIcon(area: TvArea, large: Boolean = false) {
    Box(Modifier.size(if (large) 44.dp else 34.dp).background(BrandSoft, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
        Glyph(when (area.kind) { "radius" -> TvIcons.Radius; "drawn" -> TvIcons.Drawn; else -> TvIcons.Area }, color = BrandText, size = if (large) 22 else 18)
    }
}

@Composable
private fun Cadence(area: TvArea, size: Number = 11) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (area.cadence.isNotBlank()) Glyph(TvIcons.Bell, color = Tertiary, size = 12)
        Label(area.cadence, size, Tertiary, mono = true, maxLines = 1)
    }
}

@Composable
private fun AreaCounts(area: TvArea, compact: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 2.dp)) {
        Box(Modifier.height(if (compact) 30.dp else 34.dp), contentAlignment = Alignment.CenterStart) {
            if (!area.feedAvailable) Label("Unavailable", if (compact) 15 else 17, Secondary)
            else if (area.added + area.removed == 0) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 7.dp)) {
                    Glyph(TvIcons.Shield, color = BrandText, size = if (compact) 20 else 22)
                    Label(if (compact) "Quiet" else "Quiet week", if (compact) 17 else 20, BrandText, display = true, lineHeight = if (compact) 22.1f else 26f)
                }
            } else Row(verticalAlignment = Alignment.Bottom) {
                if (area.added > 0) {
                    Label("+", if (compact) 16 else 18, Alert, mono = true, weight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
                    Label(area.added.toString(), if (compact) 30 else 34, Alert, mono = true, bold = true, lineHeight = if (compact) 30f else 34f, modifier = Modifier.alignByBaseline())
                }
                if (area.removed > 0) {
                    if (area.added > 0) Spacer(Modifier.width(10.dp))
                    Label("−", if (compact) 16 else 18, Secondary, mono = true, weight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
                    Label(area.removed.toString(), if (compact) 30 else 34, Secondary, mono = true, bold = true, lineHeight = if (compact) 30f else 34f, modifier = Modifier.alignByBaseline())
                }
            }
        }
        Label(if (!area.feedAvailable) "sync your phone" else if (compact) "this week" else if (area.added + area.removed == 0) "zero new boxes" else "cameras this week", if (compact) 12 else 12.5, Secondary)
    }
}

@Composable
private fun HistoryBars(area: TvArea) {
    val history = area.historyBars()
    val max = history.filterNotNull().maxOrNull()?.coerceAtLeast(1) ?: 1
    val strong = LocalTvPalette.current.borderStrong
    Row(Modifier.width(72.dp).height(22.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
        history.forEachIndexed { index, count ->
            val shape = RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp, bottomStart = 1.dp, bottomEnd = 1.dp)
            Box(Modifier.weight(1f).height(if (count == null) 3.dp else maxOf(3f, 22f * count / max).dp)
                .then(if (count == null) Modifier.border(1.dp, strong, shape) else Modifier.background(if (count == 0) strong else if (index == 7) Alert else Tertiary, shape)))
        }
    }
}

@Composable
private fun Home(store: TvStore, now: Long, navigate: (TvScreen) -> Unit) {
    val area = store.area
    Column(Modifier.fillMaxSize().padding(start = 104.dp, top = 34.dp)
        .verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(start = 8.dp, end = 48.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Eyebrow(if (store.preview) "WEDNESDAY · 8:24 PM · SYNCED FROM YOUR PHONE 2 MIN AGO" else "${java.time.Instant.ofEpochMilli(now).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEEE · h:mm a")).uppercase()} · ${store.syncLabel(now).uppercase()}")
            Label(if (area == null) "Your areas, on the big screen." else "${area.name.substringBefore(',')} had ${area.added + area.removed} ${if (area.added + area.removed == 1) "change" else "changes"} this week.", 34, display = true, tracking = -.68f, modifier = Modifier.width(471.dp), maxLines = 2)
            val quietArea = store.areas.firstOrNull { it.id != area?.id && it.feedAvailable && it.added + it.removed == 0 }
            Label(if (area == null) if (store.paired) "Add an Area on your phone, then sync it to the TV." else "Pair your phone to see what changed in the areas you watch." else "${area.added} cameras added, ${area.removed} taken down." + (quietArea?.let { " ${it.name} stayed quiet." } ?: ""), 17, Secondary, maxLines = 2)
            if (area == null && !store.paired) Action("Pair your phone", initial = true) { navigate(TvScreen.Pairing) }
        }
        if (area != null) {
            Spacer(Modifier.height(20.dp))
            Box(Modifier.padding(start = 8.dp)) { Eyebrow("YOUR AREAS") }
            Spacer(Modifier.height(6.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(start = 12.dp, end = 48.dp, top = 10.dp, bottom = 10.dp)) {
                itemsIndexed(store.areas, key = { _, item -> item.id }) { index, item ->
                    FocusCard(Modifier.width(254.dp).height(168.dp), initial = index == store.areaIndex,
                        padding = PaddingValues(horizontal = 17.dp, vertical = 15.dp),
                        onFocus = { store.selectArea(index) }, onClick = { openArea(store, index, navigate) }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            AreaIcon(item)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Label(item.name, 19, display = true, lineHeight = 21.85f, maxLines = 1)
                                Label(item.subtitle(), 11, Tertiary, mono = true, maxLines = 1)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                            AreaCounts(item)
                            HistoryBars(item)
                        }
                        Spacer(Modifier.height(12.dp))
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Border))
                        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Label(if (item.weeklyChanges.size == 8) "8 weeks" else "This week", 11, Tertiary, mono = true)
                            Cadence(item)
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Box(Modifier.padding(start = 8.dp)) { Eyebrow("THIS WEEK IN ${area.name.substringBefore(',').uppercase()}") }
            Spacer(Modifier.height(2.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(start = 12.dp, end = 48.dp, top = 8.dp, bottom = 10.dp)) {
                itemsIndexed(store.visibleChanges(area), key = { _, c -> c.id }) { _, camera ->
                    FocusCard(Modifier.width(214.dp).heightIn(min = 123.dp), padding = PaddingValues(horizontal = 15.dp, vertical = 13.dp),
                        onClick = { store.selected = camera; navigate(TvScreen.Camera) }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(30.dp).background(if (camera.kind == "removed") Page else Color(0xFFFFDCDC), CircleShape), contentAlignment = Alignment.Center) {
                                Glyph(if (camera.kind == "removed") TvIcons.Removed else TvIcons.Camera, color = if (camera.kind == "removed") Secondary else Color(0xFFE5383B), size = 16)
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Label(camera.kind.uppercase(), 11, if (camera.kind == "removed") Secondary else Alert, mono = true, bold = true, tracking = .66f)
                                Label(camera.dayLabel(), 11, Tertiary, mono = true)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Label(camera.street, 15.5, weight = FontWeight.SemiBold, lineHeight = 19.375f, maxLines = 2)
                        Spacer(Modifier.height(6.dp))
                        Label(camera.summary(), 11.5, Tertiary, mono = true, maxLines = 2)
                    }
                }
                item { FocusCard(Modifier.width(172.dp).height(123.dp), onClick = { navigate(TvScreen.AreaFeed) }) {
                    Spacer(Modifier.weight(1f))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Label("All ${store.visibleChanges(area).size} on the map", 15, BrandText, bold = true, modifier = Modifier.weight(1f))
                        Glyph(TvIcons.Chevron, color = BrandText, size = 18)
                    }
                    Spacer(Modifier.weight(1f))
                } }
            }
            Spacer(Modifier.height(27.dp))
        }
    }
}

@Composable
private fun MyAreas(store: TvStore, navigate: (TvScreen) -> Unit) {
    Column(Modifier.fillMaxSize().padding(start = 232.dp)) {
        Column(Modifier.padding(start = 40.dp, end = 48.dp, top = 30.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Label("My areas", 30, display = true, lineHeight = 33f)
            Label(listOfNotNull("${store.areas.size} areas", store.householdChangeCount()?.let { "$it changes this week" }, if (store.preview) "synced from your phone 2 min ago" else store.syncLabel().lowercase()).joinToString(" · "), 12.5, Tertiary, mono = true)
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(start = 40.dp, end = 48.dp, top = 12.dp, bottom = 16.dp)) {
            itemsIndexed(store.areas, key = { _, area -> area.id }) { index, area ->
                FocusCard(Modifier.fillMaxWidth(), initial = index == store.areaIndex, padding = PaddingValues(start = 15.dp, end = 19.dp, top = 15.dp, bottom = 15.dp), onClick = { openArea(store, index, navigate) }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        AreaIcon(area, large = true)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Label(area.name, 21, display = true, lineHeight = 24.15f, maxLines = 2)
                            Label(area.subtitle(full = true), 12, Tertiary, mono = true, maxLines = 3)
                        }
                        Box(Modifier.width(112.dp)) { AreaCounts(area, compact = true) }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            HistoryBars(area)
                            Label(if (area.weeklyChanges.size == 8) "8 weeks" else "This week", 11, Tertiary, mono = true)
                        }
                        Box(Modifier.width(88.dp), contentAlignment = Alignment.CenterEnd) { Cadence(area, 11.5) }
                        Glyph(TvIcons.Chevron, color = Tertiary, size = 20)
                    }
                }
            }
            if (store.areas.isEmpty()) item {
                Label(if (store.paired) "Add an Area on your phone, then sync it." else "Pair your phone to sync your areas.", 18, Secondary)
                if (!store.paired) Action("Pair your phone", initial = true) { navigate(TvScreen.Pairing) }
            }
        }
        Row(Modifier.padding(start = 40.dp, end = 48.dp, bottom = 27.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Glyph(TvIcons.Phone, color = Tertiary, size = 15)
            Label("Areas are added, drawn and deleted on your phone. Changes show up here within a minute.", 12, Tertiary, mono = true)
        }
    }
}

private fun changeDetail(camera: TvCamera): String = listOfNotNull(
    camera.changedAt?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE")) },
    camera.detail.takeIf { it.isNotBlank() },
).joinToString(" · ").ifBlank { "Community mapped" }

@Composable
private fun AreaFeed(store: TvStore, navigate: (TvScreen) -> Unit) {
    val area = store.area
    Column(Modifier.padding(start = 272.dp, end = 48.dp, top = 30.dp, bottom = 24.dp).fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Label(area?.name ?: "Your areas", 30, display = true, lineHeight = 33f, maxLines = 2)
                Label(area?.let { "${it.subtitle()} mapped · ${it.added + it.removed} changes this week" } ?: "Add an Area on your phone, then sync it.", 12.5, Tertiary, mono = true)
            }
            area?.cadence?.takeIf { it.isNotBlank() }?.let { cadence ->
                Row(Modifier.background(BrandSoft, CircleShape).padding(horizontal = 13.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Glyph(TvIcons.Bell, color = BrandText, size = 14)
                    Label(when (cadence) { "Instant" -> "Instant alerts"; "Daily" -> "Daily digest"; "Weekly" -> "Weekly digest"; "In-app" -> "In-app only"; else -> cadence }, 13, BrandText, bold = true)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        if (area == null) { if (!store.paired) Action("Pair your phone", initial = true) { navigate(TvScreen.Pairing) }; return@Column }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.width(372.dp).fillMaxHeight().clip(RoundedCornerShape(18.dp)).border(1.dp, Border, RoundedCornerShape(18.dp)).background(Card), contentAlignment = Alignment.Center) {
                if (area.mappedCameras.isNotEmpty() || store.visibleChanges(area).any { it.latitude.isFinite() && it.longitude.isFinite() })
                    TvMap(area.mappedCameras, store.visibleChanges(area), store.selected, Modifier.fillMaxSize())
                else Label("No mapped changes this week", 17, Secondary)
            }
            Column(Modifier.weight(1f)) {
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp)) {
                    itemsIndexed(store.visibleChanges(area), key = { _, c -> c.id }) { index, camera ->
                        FocusCard(Modifier.fillMaxWidth(), initial = camera.id == (store.selected?.id ?: store.visibleChanges(area).firstOrNull()?.id),
                            padding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), radius = 14, plain = true,
                            onFocus = { store.selected = camera }, onClick = { store.selected = camera; navigate(TvScreen.Camera) }) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Box(Modifier.size(12.dp).background(if (camera.kind == "removed") Secondary else Alert, CircleShape))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Label(camera.street, 17, if (camera.kind == "removed") Secondary else Ink, weight = FontWeight.SemiBold, lineHeight = 22.1f)
                                    Label("${camera.kind.replaceFirstChar { it.uppercase() }} · ${changeDetail(camera)}", 12, Tertiary, mono = true)
                                }
                                Glyph(TvIcons.Chevron, color = Tertiary, size = 16)
                            }
                        }
                    }
                    if (store.visibleChanges(area).isEmpty()) item { Label(if (area.feedAvailable) "No changes this week." else "Changes are unavailable. Reconnect your phone.", 18) }
                }
                Label("Moving down the list moves the map. OK opens the camera.", 12, Tertiary, mono = true, modifier = Modifier.padding(horizontal = 16.dp))
            }
        }
    }
}

@Composable
private fun CameraFact(title: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Label(title, 11.5, Tertiary, mono = true, tracking = .69f)
        Label(value.ifBlank { "Not mapped" }, 16, weight = FontWeight.SemiBold, lineHeight = 20.8f)
    }
}

@Composable
private fun CameraDetail(store: TvStore, back: () -> Unit) {
    val camera = store.selected ?: return
    val area = store.area
    Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Color(0xFF0B0E12).copy(alpha = .38f), .6f to Color.Transparent)))
    Column(Modifier.padding(start = 104.dp, top = 27.dp, bottom = 27.dp).width(392.dp).fillMaxHeight()
        .background(LocalTvPalette.current.sheet.copy(alpha = if (LocalTvPalette.current.dark) .82f else .8f), RoundedCornerShape(24.dp))
        .border(1.dp, Ink.copy(alpha = .1f), RoundedCornerShape(24.dp)).padding(start = 26.dp, end = 26.dp, top = 26.dp, bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(10.dp).background(if (camera.kind == "removed") Secondary else Alert, CircleShape))
                Label("${camera.kind.uppercase()} ${camera.dayLabel().uppercase()} · ALPR CAMERA", 12, if (camera.kind == "removed") Secondary else Alert, mono = true, bold = true, tracking = .96f)
            }
            Label(camera.street, 28, display = true, lineHeight = 30.8f)
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    CameraFact("FACES", camera.direction, Modifier.weight(1f))
                    CameraFact("VERIFIED BY", camera.verification, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    CameraFact("MODEL", camera.model, Modifier.weight(1f))
                    CameraFact("IN YOUR AREA", area?.let { "${it.name} · ${it.cameraCount} mapped" }.orEmpty(), Modifier.weight(1f))
                }
            }
        }
        Action("Back to the feed", initial = true, primary = true, icon = TvIcons.Back, action = back)
    }
}

@Composable
private fun Ambient(store: TvStore, now: Long) {
    val area = store.area
    Box(Modifier.fillMaxSize().background(Color(0xFF0B0E12).copy(alpha = .42f))) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Transparent, .5f to Color.Transparent, 1f to Color(0xFF0B0E12).copy(alpha = .75f))))
        Image(painterResource(R.drawable.app_logo), null, Modifier.align(Alignment.TopEnd).padding(end = 48.dp, top = 27.dp).size(34.dp).alpha(.5f))
        Column(Modifier.align(Alignment.BottomStart).padding(start = 48.dp, bottom = 34.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Label(java.time.Instant.ofEpochMilli(now).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("h:mm")), 72, Color(0xFFF5F7F9), mono = true, lineHeight = 72f, tracking = -1.44f)
            Label(area?.let { "${it.name.substringBefore(',')} · ${it.added} camera${if (it.added == 1) "" else "s"} added this week" } ?: "Your areas, on the big screen", 19, Color(0xFFF5F7F9), weight = FontWeight.SemiBold)
            Label((if (area?.added == 0) "Nothing new tonight. " else "") + "Press any button to wake up.", 15, Color(0xFFF5F7F9).copy(alpha = .66f))
        }
    }
}
