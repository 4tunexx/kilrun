class_name ProfileAvatarWidget
extends Control

signal upgrade_pressed(upgrade_key: String)
signal vip_purchase_requested()
signal vip_trial_requested()

const UPGRADE_KEYS := ["health", "energy", "speed", "jump", "visibility"]
const AVATAR_SIZE := 72.0
const COMPACT_AVATAR_SIZE := 82.0
const GAME_FONT_PATH := "res://font/Viper/ViperCommandExpandedItalic-Jp6YB.otf"

var compact_mode: bool = false
var _ring: XpProgressRing
var _avatar: TextureRect
var _compact_avatar_back: ColorRect
var _level_label: Label
var _compact_badge: ColorRect
var _xp_label: Label
var _xp_sub_label: Label
var _points_label: Label
var _hero_caption_label: Label
var _title_label: Label
var _upgrade_buttons: Dictionary = {}
var _metric_value_labels: Dictionary = {}
var _combat_value_labels: Dictionary = {}
var _combat_bars: Dictionary = {}
var _upgrade_ring_widgets: Dictionary = {}
var _upgrade_rank_labels: Dictionary = {}
var _vip_trial_button: Button
var _vip_buy_button: Button
var _interactive: bool = true
@onready var _game_font: FontFile = _load_font_from_file(GAME_FONT_PATH)




func _ready() -> void:
	if compact_mode:
		custom_minimum_size = Vector2(COMPACT_AVATAR_SIZE + 18.0, COMPACT_AVATAR_SIZE + 18.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
	else:
		custom_minimum_size = Vector2(760.0, 840.0)
		mouse_filter = Control.MOUSE_FILTER_PASS
	_build_layout()


func _build_layout() -> void:
	if compact_mode:
		_build_compact_layout()
	else:
		_build_full_layout()


func _build_compact_layout() -> void:
	var compact_avatar_size := COMPACT_AVATAR_SIZE
	var avatar_stack := Control.new()
	avatar_stack.custom_minimum_size = Vector2(compact_avatar_size + 18.0, compact_avatar_size + 18.0)
	avatar_stack.set_anchors_preset(Control.PRESET_TOP_LEFT)
	add_child(avatar_stack)

	_ring = XpProgressRing.new()
	_ring.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ring.progress = 0.0
	_ring.line_width = 6.5
	_ring.track_color = Color(0.16, 0.18, 0.22, 0.82)
	_ring.fill_color = Color(0.92, 0.18, 0.18, 0.98)
	_ring.glow_color = Color(0.86, 0.88, 0.92, 0.95)
	avatar_stack.add_child(_ring)

	var avatar_back := ColorRect.new()
	avatar_back.color = Color(0.32, 0.34, 0.38, 0.98)
	avatar_back.set_anchors_preset(Control.PRESET_CENTER)
	avatar_back.offset_left = -compact_avatar_size * 0.5
	avatar_back.offset_right = compact_avatar_size * 0.5
	avatar_back.offset_top = -compact_avatar_size * 0.5
	avatar_back.offset_bottom = compact_avatar_size * 0.5
	avatar_back.material = _make_circle_color_material()
	avatar_stack.add_child(avatar_back)
	_compact_avatar_back = avatar_back

	_avatar = TextureRect.new()
	_avatar.set_anchors_preset(Control.PRESET_CENTER)
	_avatar.custom_minimum_size = Vector2(compact_avatar_size, compact_avatar_size)
	_avatar.offset_left = -compact_avatar_size * 0.5
	_avatar.offset_right = compact_avatar_size * 0.5
	_avatar.offset_top = -compact_avatar_size * 0.5
	_avatar.offset_bottom = compact_avatar_size * 0.5
	_avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_avatar.material = _make_circle_texture_material()
	avatar_stack.add_child(_avatar)

	var badge := ColorRect.new()
	badge.custom_minimum_size = Vector2(28.0, 28.0)
	badge.set_anchors_preset(Control.PRESET_CENTER)
	badge.offset_left = compact_avatar_size * 0.5 - 20.0
	badge.offset_top = compact_avatar_size * 0.5 - 20.0
	badge.offset_right = compact_avatar_size * 0.5 + 8.0
	badge.offset_bottom = compact_avatar_size * 0.5 + 8.0
	badge.color = Color(0.32, 0.34, 0.38, 0.9)
	badge.material = _make_compact_badge_material()
	avatar_stack.add_child(badge)
	_compact_badge = badge

	_level_label = _make_label("1", 13, Color(0.95, 0.18, 0.18, 1.0), true)
	_level_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	_level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge.add_child(_level_label)


func _build_full_layout() -> void:
	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 0.0
	root.offset_top = 0.0
	root.offset_right = 0.0
	root.offset_bottom = 0.0
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 14)
	add_child(root)

	var header_panel := _make_panel()
	header_panel.custom_minimum_size = Vector2(740.0, 276.0)
	root.add_child(header_panel)
	var header_margin := _make_margin_container(18, 18, 18, 18)
	header_panel.add_child(header_margin)
	var header_row := HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 18)
	header_margin.add_child(header_row)

	var hero_stack := Control.new()
	hero_stack.custom_minimum_size = Vector2(250.0, 240.0)
	header_row.add_child(hero_stack)

	_ring = XpProgressRing.new()
	_ring.set_anchors_preset(Control.PRESET_CENTER)
	_ring.custom_minimum_size = Vector2(220.0, 220.0)
	_ring.offset_left = -110.0
	_ring.offset_right = 110.0
	_ring.offset_top = -110.0
	_ring.offset_bottom = 110.0
	_ring.line_width = 11.5
	_ring.track_color = Color(0.12, 0.16, 0.22, 0.92)
	_ring.fill_color = Color(0.96, 0.26, 0.22, 1.0)
	_ring.glow_color = Color(1.0, 0.9, 0.72, 1.0)
	hero_stack.add_child(_ring)

	var hero_avatar_back := ColorRect.new()
	hero_avatar_back.color = Color(0.08, 0.1, 0.14, 0.98)
	hero_avatar_back.set_anchors_preset(Control.PRESET_CENTER)
	hero_avatar_back.offset_left = -74.0
	hero_avatar_back.offset_right = 74.0
	hero_avatar_back.offset_top = -74.0
	hero_avatar_back.offset_bottom = 74.0
	hero_avatar_back.material = _make_circle_color_material()
	hero_stack.add_child(hero_avatar_back)

	_avatar = TextureRect.new()
	_avatar.set_anchors_preset(Control.PRESET_CENTER)
	_avatar.custom_minimum_size = Vector2(148.0, 148.0)
	_avatar.offset_left = -74.0
	_avatar.offset_right = 74.0
	_avatar.offset_top = -74.0
	_avatar.offset_bottom = 74.0
	_avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_avatar.material = _make_circle_texture_material()
	hero_stack.add_child(_avatar)

	var hero_badge := ColorRect.new()
	hero_badge.set_anchors_preset(Control.PRESET_CENTER)
	hero_badge.offset_left = 36.0
	hero_badge.offset_right = 92.0
	hero_badge.offset_top = 32.0
	hero_badge.offset_bottom = 88.0
	hero_badge.color = Color(0.12, 0.16, 0.22, 0.96)
	hero_badge.material = _make_circle_color_material()
	hero_stack.add_child(hero_badge)

	_level_label = _make_label("1", 26, Color(1.0, 0.92, 0.72, 1.0), false)
	_level_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	_level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	hero_badge.add_child(_level_label)

	_hero_caption_label = _make_label("0% TO NEXT", 14, Color(0.86, 0.93, 1.0, 0.86), false)
	_hero_caption_label.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_hero_caption_label.offset_top = -26.0
	_hero_caption_label.offset_bottom = -4.0
	_hero_caption_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero_stack.add_child(_hero_caption_label)

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 10)
	header_row.add_child(info)

	_title_label = _make_label("OPERATIVE PROFILE", 28, Color(1.0, 0.95, 0.78, 1.0), false)
	info.add_child(_title_label)

	_xp_label = _make_label("XP 0 / 120", 21, Color(0.98, 0.98, 1.0, 1.0), false)
	info.add_child(_xp_label)

	_xp_sub_label = _make_label("NEXT LEVEL IN 120 XP", 14, Color(0.72, 0.9, 1.0, 0.88), false)
	info.add_child(_xp_sub_label)

	_points_label = _make_label("UPGRADE POINTS 0", 16, Color(1.0, 0.75, 0.42, 1.0), false)
	info.add_child(_points_label)

	var metric_grid := GridContainer.new()
	metric_grid.columns = 3
	metric_grid.add_theme_constant_override("h_separation", 10)
	metric_grid.add_theme_constant_override("v_separation", 10)
	info.add_child(metric_grid)
	_add_metric_card(metric_grid, "kills", "KILLS")
	_add_metric_card(metric_grid, "deaths", "DEATHS")
	_add_metric_card(metric_grid, "finishes", "FINISH")
	_add_metric_card(metric_grid, "bug_kills", "BUGS")
	_add_metric_card(metric_grid, "rounds_won", "WINS")
	_add_metric_card(metric_grid, "kd_ratio", "K / D")

	var content_row := HBoxContainer.new()
	content_row.add_theme_constant_override("separation", 14)
	root.add_child(content_row)

	var combat_panel := _make_panel()
	combat_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	combat_panel.custom_minimum_size = Vector2(364.0, 228.0)
	content_row.add_child(combat_panel)
	var combat_margin := _make_margin_container(16, 16, 16, 16)
	combat_panel.add_child(combat_margin)
	var combat_box := VBoxContainer.new()
	combat_box.add_theme_constant_override("separation", 12)
	combat_margin.add_child(combat_box)
	combat_box.add_child(_make_label("COMBAT FLOW", 19, Color(0.96, 0.95, 0.78, 1.0), false))
	_add_stat_bar_row(combat_box, "damage_done", "DAMAGE DONE", Color(1.0, 0.36, 0.24, 1.0))
	_add_stat_bar_row(combat_box, "damage_taken", "DAMAGE TAKEN", Color(0.32, 0.76, 1.0, 1.0))
	_add_stat_bar_row(combat_box, "win_rate", "WIN RATE", Color(1.0, 0.82, 0.32, 1.0))
	_add_stat_bar_row(combat_box, "finish_rate", "FINISH RATE", Color(0.58, 1.0, 0.72, 1.0))

	var augment_panel := _make_panel()
	augment_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	augment_panel.custom_minimum_size = Vector2(364.0, 228.0)
	content_row.add_child(augment_panel)
	var augment_margin := _make_margin_container(16, 16, 16, 16)
	augment_panel.add_child(augment_margin)
	var augment_box := VBoxContainer.new()
	augment_box.add_theme_constant_override("separation", 10)
	augment_margin.add_child(augment_box)
	augment_box.add_child(_make_label("AUGMENT RINGS", 19, Color(0.96, 0.95, 0.78, 1.0), false))
	var ring_grid := GridContainer.new()
	ring_grid.columns = 3
	ring_grid.add_theme_constant_override("h_separation", 10)
	ring_grid.add_theme_constant_override("v_separation", 10)
	augment_box.add_child(ring_grid)
	for upgrade_key in UPGRADE_KEYS:
		_add_upgrade_card(ring_grid, upgrade_key)

	var button_panel := _make_panel()
	button_panel.custom_minimum_size = Vector2(740.0, 188.0)
	root.add_child(button_panel)
	var button_margin := _make_margin_container(16, 16, 16, 16)
	button_panel.add_child(button_margin)
	var button_box := VBoxContainer.new()
	button_box.add_theme_constant_override("separation", 10)
	button_margin.add_child(button_box)
	button_box.add_child(_make_label("UPGRADE CONTROLS", 18, Color(0.96, 0.95, 0.78, 1.0), false))
	var button_grid := GridContainer.new()
	button_grid.columns = 2
	button_grid.add_theme_constant_override("h_separation", 10)
	button_grid.add_theme_constant_override("v_separation", 10)
	button_box.add_child(button_grid)
	for upgrade_key in UPGRADE_KEYS:
		var button := Button.new()
		button.text = _format_upgrade_name(upgrade_key).to_upper()
		button.custom_minimum_size = Vector2(328.0, 36.0)
		_apply_font(button, 14)
		button.pressed.connect(func(key: String = upgrade_key) -> void:
			upgrade_pressed.emit(key)
		)
		button_grid.add_child(button)
		_upgrade_buttons[upgrade_key] = button
		_add_hover_effect(button)
	var vip_row := HBoxContainer.new()
	vip_row.add_theme_constant_override("separation", 10)
	button_box.add_child(vip_row)
	_vip_trial_button = Button.new()
	_vip_trial_button.text = "START VIP TRIAL"
	_vip_trial_button.custom_minimum_size = Vector2(328.0, 36.0)
	_apply_font(_vip_trial_button, 14)
	_vip_trial_button.pressed.connect(func() -> void:
		vip_trial_requested.emit()
	)
	vip_row.add_child(_vip_trial_button)
	_add_hover_effect(_vip_trial_button)
	_vip_buy_button = Button.new()
	_vip_buy_button.text = "ORDER VIP"
	_vip_buy_button.custom_minimum_size = Vector2(328.0, 36.0)
	_apply_font(_vip_buy_button, 14)
	_vip_buy_button.pressed.connect(func() -> void:
		vip_purchase_requested.emit()
	)
	vip_row.add_child(_vip_buy_button)
	_add_hover_effect(_vip_buy_button)


func set_avatar_texture(texture: Texture2D) -> void:
	if _avatar != null:
		_avatar.texture = texture


func set_interactive(active: bool) -> void:
	_interactive = active
	for upgrade_key in _upgrade_buttons:
		var button: Button = _upgrade_buttons[upgrade_key]
		button.visible = active
		if not active:
			button.disabled = true


func set_progression(level: int, xp: int, xp_to_next: int, upgrade_points: int, upgrades: Dictionary, stats: Dictionary = {}, _player_name: String = "", account_profile: Dictionary = {}) -> void:
	if _level_label == null or _ring == null:
		return
	_level_label.text = str(level)
	var progress_ratio := 0.0 if xp_to_next <= 0 else clampf(float(xp) / float(xp_to_next), 0.0, 1.0)
	_ring.progress = progress_ratio
	var pulse_time := float(Time.get_ticks_msec()) * 0.008
	var pulse := 0.7 + 0.3 * sin(pulse_time)
	var near_level_up := progress_ratio >= 0.7
	if compact_mode:
		_level_label.self_modulate = Color(1.0, 0.24 + 0.26 * pulse, 0.24 + 0.26 * pulse, 1.0) if near_level_up else Color(0.95, 0.18, 0.18, 1.0)
		_level_label.add_theme_color_override("font_outline_color", Color(1.0, 0.94, 0.94, 1.0) if near_level_up else Color(0.96, 0.97, 1.0, 0.92))
		if _compact_badge:
			_compact_badge.color = Color(0.5 + 0.18 * pulse, 0.12, 0.12, 0.98) if near_level_up else Color(0.32, 0.34, 0.38, 0.98)
		if _compact_avatar_back:
			_compact_avatar_back.color = _compact_badge.color if _compact_badge else Color(0.32, 0.34, 0.38, 0.98)
		_ring.fill_color = Color(1.0, 0.3 + 0.2 * pulse, 0.3 + 0.2 * pulse, 1.0) if near_level_up else Color(0.92, 0.18, 0.18, 0.98)
		_ring.glow_color = Color(1.0, 0.3 + 0.2 * pulse, 0.3 + 0.2 * pulse, 1.0) if near_level_up else Color(0.86, 0.88, 0.92, 0.95)
		_ring.queue_redraw()
	else:
		var account_role := str(account_profile.get("account_role", "normal")).to_upper()
		var vip_status := str(account_profile.get("vip_status", "inactive")).to_upper()
		var title_color: Color = Color(1.0, 1.0, 1.0, 1.0)
		var name_color_value: Variant = account_profile.get("name_color", null)
		if name_color_value is Color:
			title_color = name_color_value
		_title_label.text = "OPERATIVE PROFILE"
		_title_label.self_modulate = title_color
		_xp_label.text = "XP %d / %d" % [xp, xp_to_next]
		_xp_sub_label.text = "NEXT LEVEL IN %d XP" % max(xp_to_next - xp, 0)
		_points_label.text = "UPGRADE POINTS %d" % upgrade_points if _interactive else "VIEW MODE // STATS ONLY"
		_hero_caption_label.text = "%d%% TO NEXT" % int(round(progress_ratio * 100.0))
		_level_label.self_modulate = Color(1.0, 0.42 + pulse * 0.2, 0.28 + pulse * 0.12, 1.0) if near_level_up else Color(1.0, 0.92, 0.72, 1.0)
		_ring.fill_color = Color(1.0, 0.34 + 0.2 * pulse, 0.24 + 0.16 * pulse, 1.0) if near_level_up else Color(0.96, 0.26, 0.22, 1.0)
		_ring.glow_color = Color(1.0, 0.72 + 0.2 * pulse, 0.5 + 0.16 * pulse, 1.0) if near_level_up else Color(1.0, 0.9, 0.72, 1.0)
		if _vip_trial_button != null:
			var vip_trial_used := bool(account_profile.get("vip_trial_used", false))
			var has_vip := vip_status in ["TRIAL", "ACTIVE"] or account_role == "VIP"
			_vip_trial_button.visible = _interactive and not has_vip
			_vip_trial_button.disabled = vip_trial_used
			_vip_trial_button.text = "VIP TRIAL USED" if vip_trial_used else "START VIP TRIAL"
		if _vip_buy_button != null:
			_vip_buy_button.visible = _interactive and account_role != "ADMIN"
			_vip_buy_button.disabled = false
			_vip_buy_button.text = "VIP ACTIVE" if vip_status == "ACTIVE" or account_role == "VIP" else "ORDER VIP"
		_update_stat_displays(stats)
	_update_upgrade_visuals(upgrades, upgrade_points)


func _update_stat_displays(stats: Dictionary) -> void:
	var kills: int = int(stats.get("kills", 0))
	var deaths: int = int(stats.get("deaths", 0))
	var finishes: int = int(stats.get("finishes", 0))
	var bug_kills: int = int(stats.get("bug_kills", 0))
	var rounds_won: int = int(stats.get("rounds_won", 0))
	var rounds_played: int = int(stats.get("rounds_played", 0))
	var damage_done: int = int(stats.get("damage_done", 0))
	var damage_taken: int = int(stats.get("damage_taken", 0))
	var kd_ratio: float = float(kills) if deaths <= 0 else float(kills) / float(deaths)
	var win_rate: float = 0.0 if rounds_played <= 0 else float(rounds_won) / float(rounds_played)
	var finish_rate: float = 0.0 if rounds_played <= 0 else float(finishes) / float(rounds_played)
	_set_metric_value("kills", str(kills))
	_set_metric_value("deaths", str(deaths))
	_set_metric_value("finishes", str(finishes))
	_set_metric_value("bug_kills", str(bug_kills))
	_set_metric_value("rounds_won", "%d/%d" % [rounds_won, rounds_played])
	_set_metric_value("kd_ratio", "%.2f" % kd_ratio)
	_set_combat_row("damage_done", damage_done, max(max(damage_done, damage_taken), 100), "%d DMG" % damage_done)
	_set_combat_row("damage_taken", damage_taken, max(max(damage_done, damage_taken), 100), "%d DMG" % damage_taken)
	_set_combat_row("win_rate", int(round(win_rate * 100.0)), 100, "%d%%" % int(round(win_rate * 100.0)))
	_set_combat_row("finish_rate", int(round(finish_rate * 100.0)), 100, "%d%%" % int(round(finish_rate * 100.0)))


func _update_upgrade_visuals(upgrades: Dictionary, upgrade_points: int) -> void:
	var highest_rank: int = 1
	for upgrade_key in UPGRADE_KEYS:
		highest_rank = max(highest_rank, int(upgrades.get(upgrade_key, 0)))
	for upgrade_key in UPGRADE_KEYS:
		var rank: int = int(upgrades.get(upgrade_key, 0))
		if _upgrade_rank_labels.has(upgrade_key):
			(_upgrade_rank_labels[upgrade_key] as Label).text = "RANK %d" % rank
		if _upgrade_ring_widgets.has(upgrade_key):
			var upgrade_ring: XpProgressRing = _upgrade_ring_widgets[upgrade_key]
			upgrade_ring.progress = clampf(float(rank) / float(max(highest_rank, 4)), 0.0, 1.0)
			var ring_pulse := 0.74 + 0.26 * sin(float(Time.get_ticks_msec()) * 0.005 + float(rank))
			upgrade_ring.fill_color = Color(1.0, 0.42 + 0.24 * ring_pulse, 0.2 + 0.14 * ring_pulse, 1.0)
			upgrade_ring.glow_color = Color(1.0, 0.86, 0.62 + 0.2 * ring_pulse, 1.0)
		if not _upgrade_buttons.has(upgrade_key):
			continue
		var button: Button = _upgrade_buttons[upgrade_key]
		var can_upgrade := _interactive and upgrade_points > 0
		var glow_phase := 0.75 + 0.25 * sin(float(Time.get_ticks_msec()) * 0.01 + float(rank))
		var upgrade_name := _format_upgrade_name(upgrade_key).to_upper()
		button.text = "+ %s  %d" % [upgrade_name, rank] if can_upgrade else "%s  %d" % [upgrade_name, rank]
		button.modulate = Color(1.0, 0.42 + 0.45 * glow_phase, 0.28 + 0.2 * glow_phase, 1.0) if can_upgrade else Color(1.0, 1.0, 1.0, 1.0)
		button.disabled = not _interactive or upgrade_points <= 0


func _add_metric_card(parent: GridContainer, key: String, title: String) -> void:
	var card := _make_panel()
	card.custom_minimum_size = Vector2(140.0, 82.0)
	parent.add_child(card)
	var margin := _make_margin_container(12, 10, 12, 10)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	margin.add_child(box)
	var value_label := _make_label("0", 24, Color(1.0, 0.94, 0.76, 1.0), false)
	box.add_child(value_label)
	box.add_child(_make_label(title, 12, Color(0.7, 0.88, 1.0, 0.84), false))
	_metric_value_labels[key] = value_label
	card.tooltip_text = title + " OVER ALL MATCHES"
	_add_hover_effect(card)


func _add_stat_bar_row(parent: VBoxContainer, key: String, title: String, tint: Color) -> void:
	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	parent.add_child(row)
	var header := HBoxContainer.new()
	row.add_child(header)
	var title_label := _make_label(title, 12, Color(0.76, 0.92, 1.0, 0.9), false)
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_label)
	var value_label := _make_label("0", 13, Color(1.0, 0.94, 0.76, 1.0), false)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	header.add_child(value_label)
	var bar := ProgressBar.new()
	bar.min_value = 0.0
	bar.max_value = 100.0
	bar.value = 0.0
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0.0, 16.0)
	bar.modulate = tint
	row.add_child(bar)
	_combat_value_labels[key] = value_label
	_combat_bars[key] = bar
	row.tooltip_text = title + " PROGRESSION"
	_add_hover_effect(row)


func _add_upgrade_card(parent: GridContainer, upgrade_key: String) -> void:
	var card := _make_panel()
	card.custom_minimum_size = Vector2(108.0, 126.0)
	parent.add_child(card)
	var margin := _make_margin_container(10, 10, 10, 10)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	margin.add_child(box)
	var ring_holder := Control.new()
	ring_holder.custom_minimum_size = Vector2(72.0, 72.0)
	box.add_child(ring_holder)
	var ring := XpProgressRing.new()
	ring.set_anchors_preset(Control.PRESET_CENTER)
	ring.custom_minimum_size = Vector2(70.0, 70.0)
	ring.offset_left = -35.0
	ring.offset_right = 35.0
	ring.offset_top = -35.0
	ring.offset_bottom = 35.0
	ring.line_width = 7.0
	ring.track_color = Color(0.14, 0.17, 0.22, 0.88)
	ring.fill_color = Color(1.0, 0.46, 0.24, 1.0)
	ring.glow_color = Color(1.0, 0.88, 0.72, 1.0)
	ring_holder.add_child(ring)
	var center_label := _make_label(_format_upgrade_name(upgrade_key).substr(0, 3).to_upper(), 12, Color(0.98, 0.97, 1.0, 1.0), false)
	center_label.set_anchors_preset(Control.PRESET_CENTER)
	center_label.offset_left = -26.0
	center_label.offset_right = 26.0
	center_label.offset_top = -10.0
	center_label.offset_bottom = 10.0
	center_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ring_holder.add_child(center_label)
	var title_label := _make_label(_format_upgrade_name(upgrade_key).to_upper(), 12, Color(0.72, 0.9, 1.0, 0.92), false)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title_label)
	var rank_label := _make_label("RANK 0", 12, Color(1.0, 0.94, 0.76, 1.0), false)
	rank_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(rank_label)
	_upgrade_ring_widgets[upgrade_key] = ring
	_upgrade_rank_labels[upgrade_key] = rank_label
	card.tooltip_text = _format_upgrade_name(upgrade_key).to_upper() + " UPGRADE"
	_add_hover_effect(card)


func _set_metric_value(key: String, value: String) -> void:
	if _metric_value_labels.has(key):
		(_metric_value_labels[key] as Label).text = value


func _set_combat_row(key: String, value: int, max_value: int, label_text: String) -> void:
	if _combat_value_labels.has(key):
		(_combat_value_labels[key] as Label).text = label_text
	if _combat_bars.has(key):
		var bar: ProgressBar = _combat_bars[key]
		bar.max_value = max(max_value, 1)
		bar.value = clamp(value, 0, max(max_value, 1))


func _make_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.018, 0.028, 0.045, 0.92)
	style.border_color = Color(0.34, 0.62, 0.96, 0.22)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.34)
	style.shadow_size = 10
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _make_margin_container(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	return margin


func _make_label(text_value: String, size_value: int, color: Color, outline: bool) -> Label:
	var label := Label.new()
	label.text = text_value
	_apply_font(label, size_value)
	label.self_modulate = color
	if outline:
		label.add_theme_color_override("font_outline_color", Color(0.96, 0.97, 1.0, 0.92))
		label.add_theme_constant_override("outline_size", 1)
	return label


func _apply_font(control: Control, font_size: int) -> void:
	if _game_font != null:
		control.add_theme_font_override("font", _game_font)
	control.add_theme_font_size_override("font_size", font_size)


func _make_circle_texture_material() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = "shader_type canvas_item; void fragment(){ vec2 uv = UV - vec2(0.5); float d = length(uv); vec4 tex = texture(TEXTURE, UV); if(d > 0.5){ tex.a = 0.0; } COLOR = tex; }"
	var shader_material := ShaderMaterial.new()
	shader_material.shader = shader
	return shader_material


func _make_circle_color_material() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = "shader_type canvas_item; void fragment(){ vec2 uv = UV - vec2(0.5); float d = length(uv); vec4 base = COLOR; if(d > 0.5){ base.a = 0.0; } COLOR = base; }"
	var shader_material := ShaderMaterial.new()
	shader_material.shader = shader
	return shader_material


func _make_compact_badge_material() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = "shader_type canvas_item; void fragment(){ vec2 uv = UV - vec2(0.5); float d = length(uv); vec4 base = COLOR; vec3 ring_rgb = mix(vec3(0.16, 0.18, 0.22), base.rgb, 0.25); if(d > 0.5){ base.a = 0.0; } else if(d > 0.34){ base.rgb = ring_rgb; base.a = 0.95; } COLOR = base; }"
	var shader_material := ShaderMaterial.new()
	shader_material.shader = shader
	return shader_material


func _format_upgrade_name(upgrade_key: String) -> String:
	match upgrade_key:
		"health":
			return "max health"
		"energy":
			return "energy"
		"speed":
			return "speed"
		"jump":
			return "jump"
		"visibility":
			return "stealth"
		_:
			return upgrade_key.replace("_", " ")


func _count_control_nodes(root: Node) -> int:
	var total: int = 1 if root is Control else 0
	for child in root.get_children():
		total += _count_control_nodes(child)
	return total


func _count_label_nodes(root: Node) -> int:
	var total: int = 1 if root is Label else 0
	for child in root.get_children():
		total += _count_label_nodes(child)
	return total


func _load_font_from_file(font_path: String) -> FontFile:
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(font_path)
	return font if not font.data.is_empty() else null


func _add_hover_effect(control: Control) -> void:
	if not control.has_meta("hover_connected"):
		control.set_meta("hover_connected", true)
		
		# Enable pivot center for scaling
		control.pivot_offset = control.size * 0.5
		control.resized.connect(func(): control.pivot_offset = control.size * 0.5)
		
		control.mouse_entered.connect(func():
			var tween := create_tween()
			tween.tween_property(control, "scale", Vector2(1.05, 1.05), 0.1).set_trans(Tween.TRANS_SINE)
			tween.parallel().tween_property(control, "modulate", Color(1.2, 1.2, 1.2, 1.0), 0.1)
		)
		control.mouse_exited.connect(func():
			var tween := create_tween()
			tween.tween_property(control, "scale", Vector2(1.0, 1.0), 0.1).set_trans(Tween.TRANS_SINE)
			tween.parallel().tween_property(control, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.1)
		)
