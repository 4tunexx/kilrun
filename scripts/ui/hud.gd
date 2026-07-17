extends CanvasLayer

const STATE_COUNTDOWN := 1
const STATE_PLAYING := 2
const ROLE_RUNNER := 0
const LOBBY_SCENE := "res://scenes/ui/lobby.tscn"
const HELPER_FADE_DELAY: float = 4.2
const HELPER_MIN_ALPHA: float = 0.14
const HELPER_FADE_SPEED: float = 0.3
const PANEL_FADE_SPEED: float = 6.0
const MOTION_FADE_SPEED_REF: float = 9.0
const ENERGY_WARNING_HINT_TIME: float = 0.95
const ENERGY_WARNING_FADE_SPEED: float = 2.8
const DOUBLE_JUMP_RECHARGE_DEFAULT: float = 20.0
const SHINE_WIDTH: float = 42.0
const BAR_SHINE_WIDTH: float = 20.0
const RUN_HINT_TRIGGER_TIME: float = 5.0
const RUN_HINT_TYPE_SPEED: float = 42.0
const RUN_HINT_HOLD_TIME: float = 3.8
const SCOREBOARD_REFRESH_INTERVAL: float = 0.18
const BHOP_RING_ROTATION_SPEED: float = 54.0
const DEFAULT_HELPER_TEXT := "LMB Shoot   RMB Aim   R Reload   Q Swap   F Inspect   X Upgrades   V VIP   M Admin   I Helper   Shift Sprint   Ctrl Crouch   C Slide   B Role Power   Tab Scoreboard   T Toggle HUD   Esc Pause"
const RUN_HINT_MESSAGE := "Sprint and bunny-hop in short bursts, then let Energy recover above 50 before the next push."
const AVATAR_SIZE: float = 72.0
const DEBUG_START_POS := Vector3(0.0, 1.0, -12.0)
const DEBUG_TUNNEL_POS := Vector3(0.0, 1.0, -74.0)
const DEBUG_MID_POS := Vector3(0.0, 1.0, -216.0)
const DEBUG_FINAL_POS := Vector3(0.0, 1.1, -392.0)
const RPG_UPGRADES := ["health", "energy", "speed", "jump", "visibility"]
const GAME_FONT_PATH := "res://font/Viper/ViperCommandExpandedItalic-Jp6YB.otf"
const MENU_FONT_PATH := "res://font/Viper/ViperCommandTitle-R9jmM.otf"
const FEEDBACK_POPUP_STAGGER: float = 0.025
const FEEDBACK_POPUP_MAX_ACTIVE: int = 2
const PROGRESSION_TOGGLE_DEBOUNCE_MS: int = 450
const ADMIN_PANEL_REFRESH_INTERVAL: float = 0.2
const ADMIN_GRAVITY_STEP: float = 0.25
const WEAPON_SNIPER := 4
# QUALITY-3: weapon prices are now defined once in GameManager.HORDE_WEAPON_COSTS.
# Use game_manager.get("HORDE_WEAPON_COSTS") at call sites instead of a local const.
const HORDE_AMMO_PRICE := 30
const HORDE_HEALTH_PRICE := 24

@onready var top_hud: Control = $TopHud
@onready var role_panel: PanelContainer = $TopHud/RolePanel
@onready var time_panel: PanelContainer = $TopHud/TimePanel
@onready var player_panel: PanelContainer = $TopHud/PlayerPanel
@onready var role_label: Label = $TopHud/RolePanel/MarginContainer/RoleLabel
@onready var time_caption_label: Label = $TopHud/TimePanel/MarginContainer/VBoxContainer/CaptionLabel
@onready var timer_label: Label = $TopHud/TimePanel/MarginContainer/VBoxContainer/TimerLabel
@onready var player_label: Label = $TopHud/PlayerPanel/MarginContainer/PlayerLabel
@onready var bottom_hud: Control = $BottomHud
@onready var left_panel: PanelContainer = $BottomHud/LeftPanel
@onready var right_panel: PanelContainer = $BottomHud/RightPanel
@onready var health_bar: ProgressBar = $BottomHud/LeftPanel/BarsContainer/HealthBar
@onready var health_bar_shine: ColorRect = $BottomHud/LeftPanel/BarsContainer/HealthBar/BarShine
@onready var health_label: Label = $BottomHud/LeftPanel/BarsContainer/HealthLabel
@onready var stamina_bar: ProgressBar = $BottomHud/LeftPanel/BarsContainer/StaminaBar
@onready var stamina_bar_shine: ColorRect = $BottomHud/LeftPanel/BarsContainer/StaminaBar/BarShine
@onready var stamina_label: Label = $BottomHud/LeftPanel/BarsContainer/StaminaLabel
@onready var double_jump_bar: ProgressBar = $BottomHud/LeftPanel/BarsContainer/DoubleJumpBar
@onready var double_jump_bar_shine: ColorRect = $BottomHud/LeftPanel/BarsContainer/DoubleJumpBar/BarShine
@onready var weapon_label: Label = $BottomHud/RightPanel/MarginContainer/VBoxContainer/WeaponLabel
@onready var ammo_label: Label = $BottomHud/RightPanel/MarginContainer/VBoxContainer/AmmoLabel
@onready var ammo_state_label: Label = $BottomHud/RightPanel/MarginContainer/VBoxContainer/AmmoStateLabel
@onready var hint_label: Label = $HintLabel
@onready var run_hint_panel: PanelContainer = $RunHintPanel
@onready var run_hint_title: Label = $RunHintPanel/MarginContainer/VBoxContainer/TitleLabel
@onready var run_hint_body: Label = $RunHintPanel/MarginContainer/VBoxContainer/BodyLabel
@onready var scoreboard_panel: PanelContainer = $ScoreboardPanel
@onready var scoreboard_rows: VBoxContainer = $ScoreboardPanel/MarginContainer/VBoxContainer/RowsContainer
@onready var bhop_lockout_indicator: Control = $BhopLockoutIndicator
@onready var bhop_lockout_ring: Control = $BhopLockoutIndicator/Ring
@onready var bhop_lockout_time_label: Label = $BhopLockoutIndicator/Ring/TimeLabel
@onready var bhop_lockout_title_label: Label = $BhopLockoutIndicator/TitleLabel
@onready var wall_slide_indicator: Control = $WallSlideIndicator
@onready var wall_slide_ring: Control = $WallSlideIndicator/Ring
@onready var wall_slide_time_label: Label = $WallSlideIndicator/Ring/TimeLabel
@onready var wall_slide_title_label: Label = $WallSlideIndicator/TitleLabel
@onready var back_jump_indicator: Control = $RunnerBackJumpIndicator
@onready var back_jump_ring: Control = $RunnerBackJumpIndicator/Ring
@onready var back_jump_time_label: Label = $RunnerBackJumpIndicator/Ring/TimeLabel
@onready var back_jump_title_label: Label = $RunnerBackJumpIndicator/TitleLabel
@onready var bug_swarm_indicator: Control = $BugSwarmIndicator
@onready var bug_swarm_ring: Control = $BugSwarmIndicator/Ring
@onready var bug_swarm_time_label: Label = $BugSwarmIndicator/Ring/TimeLabel
@onready var bug_swarm_title_label: Label = $BugSwarmIndicator/TitleLabel
@onready var grapple_indicator: Control = $GrappleIndicator
@onready var grapple_ring: Control = $GrappleIndicator/Ring
@onready var grapple_time_label: Label = $GrappleIndicator/Ring/TimeLabel
@onready var grapple_title_label: Label = $GrappleIndicator/TitleLabel
@onready var crosshair: Control = $Crosshair
@onready var crosshair_top: ColorRect = $Crosshair/Top
@onready var crosshair_bottom: ColorRect = $Crosshair/Bottom
@onready var crosshair_left: ColorRect = $Crosshair/Left
@onready var crosshair_right: ColorRect = $Crosshair/Right
@onready var crosshair_center_dot: ColorRect = $Crosshair/CenterDot
@onready var hit_marker: Control = $HitMarker
@onready var sprint_blur: ColorRect = $SprintBlur
@onready var damage_flash: ColorRect = $DamageFlash
@onready var win_panel: PanelContainer = $WinPanel
@onready var win_label: Label = $WinPanel/WinLabel
@onready var countdown_label: Label = $CountdownLabel
@onready var pause_panel: PanelContainer = $PausePanel
@onready var pause_content_box: VBoxContainer = $PausePanel/VBoxContainer
@onready var pause_title_label: Label = $PausePanel/VBoxContainer/Label
@onready var pause_dev_label: Label = $PausePanel/VBoxContainer/DevLabel
@onready var pause_map_label: Label = $PausePanel/VBoxContainer/MapLabel
@onready var resume_button: Button = $PausePanel/VBoxContainer/ResumeButton
@onready var restart_button: Button = $PausePanel/VBoxContainer/RestartButton
@onready var swap_team_button: Button = $PausePanel/VBoxContainer/SwapTeamButton
@onready var lane_narrow_button: Button = $PausePanel/VBoxContainer/LaneNarrowButton
@onready var lane_wide_button: Button = $PausePanel/VBoxContainer/LaneWideButton
@onready var pipe_narrow_button: Button = $PausePanel/VBoxContainer/PipeNarrowButton
@onready var pipe_wide_button: Button = $PausePanel/VBoxContainer/PipeWideButton
@onready var auto_slower_button: Button = $PausePanel/VBoxContainer/AutoSlowerButton
@onready var auto_faster_button: Button = $PausePanel/VBoxContainer/AutoFasterButton
@onready var release_bugs_button: Button = $PausePanel/VBoxContainer/ReleaseBugsButton
@onready var skip_wave_button: Button = $PausePanel/VBoxContainer/SkipWaveButton
@onready var rebuild_map_button: Button = $PausePanel/VBoxContainer/RebuildMapButton
@onready var load_testmap_button: Button = $PausePanel/VBoxContainer/LoadTestMapButton
@onready var load_demomap_button: Button = $PausePanel/VBoxContainer/LoadDemoMapButton
@onready var main_menu_button: Button = $PausePanel/VBoxContainer/MainMenuButton
@onready var quit_button: Button = $PausePanel/VBoxContainer/QuitButton
@onready var game_manager: Node = get_node("/root/GameManager")
@onready var network_manager: Node = get_node("/root/NetworkManager")
@onready var profile_service: Node = get_node("/root/ProfileService")

var _local_player: Node = null
var _damage_flash_strength: float = 0.0
var _pause_open: bool = false
var _target_health: float = 100.0
var _display_health: float = 100.0
var _target_stamina: float = 100.0
var _display_stamina: float = 100.0
var _target_double_jump_charge: float = DOUBLE_JUMP_RECHARGE_DEFAULT
var _display_double_jump_charge: float = DOUBLE_JUMP_RECHARGE_DEFAULT
var _double_jump_ready: bool = true
var _stamina_exhausted: bool = false
var _stamina_warning_strength: float = 0.0
var _top_display_alpha: float = 0.92
var _bottom_display_alpha: float = 0.92
var _crosshair_alpha: float = 0.88
var _crosshair_spread_display: float = 0.16
var _helper_alpha: float = 1.0
var _helper_idle_time: float = 0.0
var _helper_override_time: float = 0.0
var _hit_marker_strength: float = 0.0
var _hit_marker_lethal: bool = false
var _trap_flash_strength: float = 0.0
var _trap_flash_color: Color = Color(1.0, 0.22, 0.18, 1.0)
var _top_hud_hidden: bool = false
var _top_hud_tween: Tween
var _fx_time: float = 0.0
var _display_sprint_blur_strength: float = 0.0
var _display_zoom_darken_strength: float = 0.0
var _text_shines: Array = []
var _running_hint_time: float = 0.0
var _run_hint_visible_chars: float = 0.0
var _run_hint_hold_timer: float = 0.0
var _run_hint_active: bool = false
var _run_hint_seen: bool = false
var _run_hint_tween: Tween
var _scoreboard_open: bool = false
var _scoreboard_refresh_timer: float = 0.0
var _current_map: Node = null
var _progression_panel: Panel
var _profile_widget: ProfileAvatarWidget
var _mini_profile_widget: ProfileAvatarWidget
var _admin_panel: Panel
var _admin_frame: Control
var _admin_scroll: ScrollContainer
var _admin_scroll_content: VBoxContainer
var _admin_status_label: Label
var _admin_summary_label: Label
var _admin_world_label: Label
var _admin_ban_reason_input: LineEdit
var _admin_snapshot_note_label: Label
var _admin_player_list_box: VBoxContainer
var _admin_active_bans_box: VBoxContainer
var _admin_audit_box: VBoxContainer
var _vip_panel: Panel
var _vip_frame: Panel
var _vip_status_label: Label
var _vip_timer_label: Label
var _vip_detail_label: Label
var _vip_name_label: Label
var _vip_source_label: Label
var _vip_benefits_label: Label
var _vip_trial_button: Button
var _vip_extend_button: Button
var _account_status_panel: PanelContainer
var _account_status_label: Label
var _profile_service: Node
var _pending_steam_id: String = ""
var _profile_view_steam_id: String = ""
var _last_progression_level: int = -1
var _last_upgrade_points: int = -1
var _feedback_layer: Control
var _feedback_popups: Array = []
var _feedback_popup_queue: Array = []
var _feedback_popup_delay: float = 0.0
var _feedback_popup_lane_cursor: int = 0
var _hit_combo_count: int = 0
var _hit_combo_timer: float = 0.0
var _upgrade_prompt_active: bool = false
var _scoreboard_profile_peer_id: int = -1
var _game_font: FontFile
var _menu_font: FontFile
var _pause_menu_glitch_targets: Array[Control] = []
var _progression_glitch_targets: Array[Control] = []
var _pause_scroll: ScrollContainer
var _progression_frame: Panel
var _progression_scroll: ScrollContainer
var _progression_scroll_content: Control
var _last_progression_toggle_ms: int = -10000
var _admin_panel_open: bool = false
var _admin_refresh_timer: float = 0.0
var _admin_snapshot_request_timer: float = 0.0
var _admin_last_player_count: int = -1
var _vip_panel_open: bool = false
var _shop_panel: Panel
var _shop_frame: Panel
var _shop_title_label: Label
var _shop_coin_label: Label
var _shop_status_label: Label
var _shop_buttons: Dictionary = {}
var _scope_overlay: Control

var _scope_reticle: Array[ColorRect] = []
var _kill_streak_indicator: Control = null
var _damage_streak: int = 0
var _damage_streak_label: Label = null
var _was_in_warmup: bool = false
var _kill_announcement_label: Label = null
var _kill_announcement_timer: float = 0.0
var _kill_announcement_text: String = ""
# ---- Per-frame player property cache (PERF-1) ----
# Populated once at the top of _process; all helpers read from here
# instead of calling _local_player.get() multiple times per frame.
var _pc_velocity: Vector3  = Vector3.ZERO
var _pc_sprint:   float    = 0.0
var _pc_slide:    float    = 0.0
var _pc_zoom:     float    = 0.0
var _pc_spread:   float    = 0.12
var _pc_weapon:   int      = -1
var _coin_panel: PanelContainer
var _coin_title_label: Label
var _coin_icon_label: Label
var _coin_count_label: Label
var _wave_status_panel: PanelContainer
var _wave_status_title_label: Label
var _wave_status_label: Label
var _progression_shop_button: Button
var _progression_coin_label: Label
var _helper_panel: PanelContainer
var _helper_panel_label: Label
var _helper_panel_tween: Tween
var _helper_panel_open: bool = false
var _helper_panel_hidden: bool = false
var _admin_menu_glitch_targets: Array[Control] = []
var _vip_menu_glitch_targets: Array[Control] = []




func _players() -> Dictionary:
	return game_manager.get("players") as Dictionary


func _setup_feedback_layer() -> void:
	_feedback_layer = Control.new()
	_feedback_layer.name = "FeedbackLayer"
	_feedback_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_feedback_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_feedback_layer)


func queue_popup_text(text: String, color: Color = Color.WHITE, lifetime: float = 0.95) -> void:
	var center := get_viewport().get_visible_rect().size * 0.5
	_spawn_feedback_popup(
		text,
		color,
		center + Vector2(0.0, -84.0),
		center + Vector2(0.0, -156.0),
		0.95,
		1.08,
		lifetime
	)


func _toggle_x_context_panel() -> void:
	if _pause_open:
		_toggle_pause_menu(false)
	if _shop_panel != null and _shop_panel.visible:
		_set_shop_panel_open(false)
		return
	if _progression_panel != null and _progression_panel.visible:
		_set_progression_panel_open(false)
		return
	# BLANK-PANEL FIX: reset scoreboard peer when toggling X menu directly
	_scoreboard_profile_peer_id = -1
	_toggle_progression_panel()


func _is_horde_shop_available() -> bool:
	return game_manager != null and game_manager.has_method("can_open_horde_shop") and bool(game_manager.call("can_open_horde_shop"))


func _build_shop_panel() -> void:
	_shop_panel = Panel.new()
	_shop_panel.name = "ShopPanel"
	_shop_panel.visible = false
	_shop_panel.z_index = 100
	_shop_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_shop_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_shop_panel)
	_shop_frame = Panel.new()
	_shop_frame.name = "ShopFrame"
	_shop_frame.set_anchors_preset(Control.PRESET_CENTER)
	_shop_panel.add_child(_shop_frame)
	var content := VBoxContainer.new()
	content.name = "ShopContent"
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.offset_left = 18.0
	content.offset_top = 18.0
	content.offset_right = -18.0
	content.offset_bottom = -18.0
	content.add_theme_constant_override("separation", 10)
	_shop_frame.add_child(content)
	_shop_title_label = Label.new()
	_shop_title_label.text = "HORDE SHOP"
	content.add_child(_shop_title_label)
	_shop_coin_label = Label.new()
	_shop_coin_label.text = "COINS: 0"
	content.add_child(_shop_coin_label)
	_shop_status_label = Label.new()
	_shop_status_label.text = "Warmup and wave breaks only."
	_shop_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_shop_status_label)
	
	# Wrap items inside a ScrollContainer to prevent overflow
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.add_child(scroll)
	
	var list_vbox := VBoxContainer.new()
	list_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_vbox.add_theme_constant_override("separation", 10)
	scroll.add_child(list_vbox)
	
	for item_id in ["PISTOL", "REVOLVER", "SMG", "SHOTGUN", "AK", "SNIPER", "AMMO", "HEALTH"]:
		var button := Button.new()
		button.name = "%sButton" % item_id
		button.custom_minimum_size.y = 46.0
		button.pressed.connect(func() -> void:
			_on_shop_item_pressed(item_id)
		)
		list_vbox.add_child(button)
		_shop_buttons[item_id] = button


func _build_horde_hud_widgets() -> void:
	_coin_panel = PanelContainer.new()
	_coin_panel.name = "CoinPanel"
	_coin_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom_hud.add_child(_coin_panel)
	var coin_margin := MarginContainer.new()
	coin_margin.add_theme_constant_override("margin_left", 12)
	coin_margin.add_theme_constant_override("margin_top", 8)
	coin_margin.add_theme_constant_override("margin_right", 12)
	coin_margin.add_theme_constant_override("margin_bottom", 8)
	_coin_panel.add_child(coin_margin)
	var coin_vbox := VBoxContainer.new()
	coin_vbox.add_theme_constant_override("separation", 2)
	coin_margin.add_child(coin_vbox)
	_coin_title_label = Label.new()
	_coin_title_label.text = "COINS"
	_coin_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	coin_vbox.add_child(_coin_title_label)
	var coin_box := HBoxContainer.new()
	coin_box.name = "CoinBox"
	coin_box.alignment = BoxContainer.ALIGNMENT_CENTER
	coin_box.add_theme_constant_override("separation", 6)
	coin_vbox.add_child(coin_box)
	_coin_icon_label = Label.new()
	_coin_icon_label.text = "$"
	coin_box.add_child(_coin_icon_label)
	_coin_count_label = Label.new()
	_coin_count_label.text = "0"
	coin_box.add_child(_coin_count_label)

	_wave_status_panel = PanelContainer.new()
	_wave_status_panel.name = "WaveStatusPanel"
	_wave_status_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_hud.add_child(_wave_status_panel)
	var wave_margin := MarginContainer.new()
	wave_margin.add_theme_constant_override("margin_left", 12)
	wave_margin.add_theme_constant_override("margin_top", 8)
	wave_margin.add_theme_constant_override("margin_right", 12)
	wave_margin.add_theme_constant_override("margin_bottom", 8)
	_wave_status_panel.add_child(wave_margin)
	var wave_box := VBoxContainer.new()
	wave_box.add_theme_constant_override("separation", 4)
	wave_margin.add_child(wave_box)
	_wave_status_title_label = Label.new()
	_wave_status_title_label.text = "HORDE STATUS"
	wave_box.add_child(_wave_status_title_label)
	_wave_status_label = Label.new()
	_wave_status_label.text = ""
	_wave_status_label.custom_minimum_size = Vector2(250.0, 0.0)
	_wave_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	wave_box.add_child(_wave_status_label)


func _build_helper_panel() -> void:
	_helper_panel = PanelContainer.new()
	_helper_panel.name = "HelperPanel"
	_helper_panel.visible = false
	_helper_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_helper_panel.anchor_left = 0.0
	_helper_panel.anchor_top = 0.0
	_helper_panel.anchor_right = 0.0
	_helper_panel.anchor_bottom = 0.0
	_helper_panel.offset_left = 18.0
	_helper_panel.offset_top = 72.0
	_helper_panel.offset_right = 314.0
	_helper_panel.offset_bottom = 158.0
	add_child(_helper_panel)
	var helper_margin := MarginContainer.new()
	helper_margin.add_theme_constant_override("margin_left", 12)
	helper_margin.add_theme_constant_override("margin_top", 8)
	helper_margin.add_theme_constant_override("margin_right", 12)
	helper_margin.add_theme_constant_override("margin_bottom", 8)
	_helper_panel.add_child(helper_margin)
	var helper_box := VBoxContainer.new()
	helper_box.add_theme_constant_override("separation", 4)
	helper_margin.add_child(helper_box)
	var helper_title := Label.new()
	helper_title.text = "HELPER // I TOGGLE"
	helper_box.add_child(helper_title)
	_helper_panel_label = Label.new()
	_helper_panel_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_helper_panel_label.custom_minimum_size = Vector2(250.0, 0.0)
	helper_box.add_child(_helper_panel_label)


func _default_helper_text() -> String:
	if _upgrade_prompt_active:
		return "+ UPGRADE READY // PRESS X"
	return DEFAULT_HELPER_TEXT


func _restore_default_helper_text() -> void:
	hint_label.text = _default_helper_text()


func _is_horde_scene_active() -> bool:
	return _current_map != null and is_instance_valid(_current_map) and _current_map.has_method("get_wave_status")


func _current_horde_wave_status() -> Dictionary:
	if not _is_horde_scene_active():
		return {}
	return _current_map.call("get_wave_status") as Dictionary


func _refresh_mode_copy() -> void:
	var horde_active := _is_horde_scene_active()
	pause_title_label.text = "HORDE PAUSED" if horde_active else "MATCH PAUSED"
	pause_dev_label.text = "HORDE DEV TOOLS" if horde_active else "MATCH DEV TOOLS"
	pause_map_label.text = "HORDE MAPS" if horde_active else "MAP SELECT"
	resume_button.text = "RESUME HORDE" if horde_active else "RESUME MATCH"
	restart_button.text = "RESTART HORDE" if horde_active else "RESTART ROUND"
	swap_team_button.visible = not horde_active
	if _progression_shop_button != null:
		_progression_shop_button.text = "OPEN HORDE SHOP" if horde_active else "SHOP UNAVAILABLE"


func _update_horde_hud() -> void:
	var coin_total := _current_coin_total()
	var run_hint_visible := run_hint_panel != null and run_hint_panel.visible
	if _coin_count_label != null:
		_coin_count_label.text = str(coin_total)
	if _coin_panel != null:
		_coin_panel.visible = _is_horde_scene_active() and not _pause_open
		_coin_panel.anchor_left = 1.0
		_coin_panel.anchor_top = 0.0
		_coin_panel.anchor_right = 1.0
		_coin_panel.anchor_bottom = 0.0
		_coin_panel.offset_left = -214.0
		_coin_panel.offset_top = 142.0 if run_hint_visible else 128.0
		_coin_panel.offset_right = -20.0
		_coin_panel.offset_bottom = 196.0 if run_hint_visible else 182.0
		_coin_panel.pivot_offset = _coin_panel.size * 0.5
		_coin_panel.rotation = deg_to_rad(-5.0)
	if _wave_status_panel == null or _wave_status_title_label == null or _wave_status_label == null:
		return
	_wave_status_panel.visible = _is_horde_scene_active() and not _pause_open and not run_hint_visible
	if not _wave_status_panel.visible:
		return
	_wave_status_panel.anchor_left = 1.0
	_wave_status_panel.anchor_top = 0.0
	_wave_status_panel.anchor_right = 1.0
	_wave_status_panel.anchor_bottom = 0.0
	_wave_status_panel.offset_left = -302.0
	_wave_status_panel.offset_top = 76.0
	_wave_status_panel.offset_right = -18.0
	_wave_status_panel.offset_bottom = 130.0
	_wave_status_panel.pivot_offset = _wave_status_panel.size * 0.5
	_wave_status_panel.rotation = deg_to_rad(-4.0)
	var wave_status := _current_horde_wave_status()
	var wave_number := int(wave_status.get("wave", 0))
	var max_wave_number := int(wave_status.get("max_waves", 0))
	var total := int(wave_status.get("total", 0))
	var alive := int(wave_status.get("alive", 0))
	var spawned := int(wave_status.get("spawned", 0))
	var scheduled := int(wave_status.get("scheduled", 0))
	var break_time := float(wave_status.get("break_time", 0.0))
	if not bool(wave_status.get("active", false)) and wave_number >= max_wave_number and break_time > 0.0:
		_wave_status_title_label.text = "HORDE // CLEAR"
		_wave_status_label.text = "All waves cleared.\nRound ends in %.1fs." % break_time
		return
	if bool(wave_status.get("active", false)):
		_wave_status_title_label.text = "HORDE // LIVE"
		_wave_status_label.text = "Wave %d/%d\nBugs left %d  |  Spawned %d/%d  |  Incoming %d" % [wave_number, max_wave_number, alive, spawned, total, scheduled]
	else:
		_wave_status_title_label.text = "HORDE // BREAK"
		_wave_status_label.text = "Next wave %d/%d\nBugs %d  |  Starts in %.1fs" % [mini(wave_number + 1, max_wave_number), max_wave_number, total, break_time]


func _set_helper_panel_open(active: bool, immediate: bool = false) -> void:
	if _helper_panel == null:
		return
	_helper_panel_open = active
	if _helper_panel_tween and _helper_panel_tween.is_valid():
		_helper_panel_tween.kill()
	var hidden_position := Vector2(-320.0, 0.0)
	var shown_position := Vector2.ZERO
	if immediate:
		_helper_panel.visible = active
		_helper_panel.position = shown_position if active else hidden_position
		_helper_panel.modulate = Color(1.0, 1.0, 1.0, 1.0 if active else 0.0)
		return
	if active:
		_helper_panel.visible = true
		_helper_panel.position = hidden_position
		_helper_panel.modulate = Color(1.0, 1.0, 1.0, 0.0)
		_helper_panel_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_helper_panel_tween.tween_property(_helper_panel, "position", shown_position, 0.3)
		_helper_panel_tween.parallel().tween_property(_helper_panel, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.24)
		return
	_helper_panel_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_helper_panel_tween.tween_property(_helper_panel, "position", hidden_position, 0.24)
	_helper_panel_tween.parallel().tween_property(_helper_panel, "modulate", Color(1.0, 1.0, 1.0, 0.0), 0.2)
	_helper_panel_tween.finished.connect(func() -> void:
		if is_instance_valid(_helper_panel):
			_helper_panel.visible = false
	)


func _sync_helper_panel() -> void:
	if _helper_panel == null or _helper_panel_label == null:
		return
	_helper_panel_label.text = hint_label.text
	_helper_panel.pivot_offset = _helper_panel.size * 0.5
	_helper_panel.rotation = deg_to_rad(5.0)
	var target_visible := not _pause_open and bottom_hud.visible and not _helper_panel_hidden and not hint_label.text.is_empty() and (run_hint_panel == null or not run_hint_panel.visible)
	if target_visible != _helper_panel_open:
		_set_helper_panel_open(target_visible)


func _sync_mini_profile_visibility() -> void:
	if _mini_profile_widget == null:
		return
	var overlay_open := (_progression_panel != null and _progression_panel.visible) or (_shop_panel != null and _shop_panel.visible) or (_admin_panel != null and _admin_panel.visible) or (_vip_panel != null and _vip_panel.visible)
	_mini_profile_widget.visible = not _pause_open and not overlay_open and bottom_hud.visible


func _open_horde_shop_from_progression() -> void:
	if not _is_horde_scene_active():
		return
	if not _is_horde_shop_available():
		queue_popup_text("SHOP CLOSED // WARMUP OR BREAK ONLY", Color(1.0, 0.44, 0.34, 1.0), 1.15)
		return
	_set_progression_panel_open(false)
	_set_shop_panel_open(true)


func _set_shop_panel_open(active: bool) -> void:
	if _shop_panel == null:
		return
	if active:
		_pause_open = false
		pause_panel.visible = false
		_set_main_hud_visible(true)
		_set_scoreboard_open(false)
		_set_progression_panel_open(false)
	_shop_panel.visible = active
	if active:
		_shop_panel.move_to_front()
		_shop_frame.move_to_front()
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	if _local_player != null and is_instance_valid(_local_player) and _local_player.has_method("set_menu_open"):
		_local_player.call("set_menu_open", _shop_panel.visible or _pause_open)
	_sync_mini_profile_visibility()


func _current_coin_total() -> int:
	if game_manager == null or not game_manager.has_method("get_player_coins"):
		return 0
	return int(game_manager.call("get_player_coins"))


func _shop_button_text(item_id: String, owned: bool) -> String:
	var weapon_costs: Dictionary = game_manager.get("HORDE_WEAPON_COSTS") as Dictionary
	if item_id in weapon_costs:
		var cost := int(weapon_costs[item_id])
		if owned:
			return "%s // OWNED" % item_id
		return "%s // %d COINS" % [item_id, cost]
	if item_id == "AMMO":
		return "BULLETS // %d COINS" % HORDE_AMMO_PRICE
	return "HEALTH POTION // %d COINS" % HORDE_HEALTH_PRICE


func _update_shop_panel() -> void:
	if _shop_panel == null:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	if _shop_frame != null:
		var frame_width: float = minf(520.0, maxf(viewport_size.x - 48.0, 300.0))
		var frame_height: float = minf(520.0, maxf(viewport_size.y - 48.0, 280.0))
		_shop_frame.offset_left = -frame_width * 0.5
		_shop_frame.offset_top = -frame_height * 0.5
		_shop_frame.offset_right = frame_width * 0.5
		_shop_frame.offset_bottom = frame_height * 0.5
	if _shop_panel.visible and not _is_horde_shop_available():
		_set_shop_panel_open(false)
		return
	if not _shop_panel.visible:
		return
	var coins := _current_coin_total()
	_shop_coin_label.text = "COINS: %d" % coins
	_shop_status_label.text = "Warmup shop is open." if _is_horde_shop_available() else "Shop opens during warmup and between waves."
	for item_id in _shop_buttons.keys():
		var button := _shop_buttons[item_id] as Button
		if button == null:
			continue
		var owned: bool = false
		var weapon_costs: Dictionary = game_manager.get("HORDE_WEAPON_COSTS") as Dictionary
		if item_id in weapon_costs and _local_player != null and is_instance_valid(_local_player) and _local_player.has_method("has_weapon_unlocked_by_name"):
			owned = bool(_local_player.call("has_weapon_unlocked_by_name", item_id))
		button.text = _shop_button_text(item_id, owned)
		var price := int(weapon_costs[item_id]) if item_id in weapon_costs else (HORDE_AMMO_PRICE if item_id == "AMMO" else HORDE_HEALTH_PRICE)
		button.disabled = not _is_horde_shop_available() or owned or coins < price


func _on_shop_item_pressed(item_id: String) -> void:
	if game_manager != null and game_manager.has_method("purchase_horde_item"):
		game_manager.call("purchase_horde_item", item_id)


func _on_coins_changed(peer_id: int, coins: int) -> void:
	if multiplayer.multiplayer_peer == null or peer_id != multiplayer.get_unique_id():
		return
	if _shop_coin_label != null:
		_shop_coin_label.text = "COINS: %d" % coins
	if _coin_count_label != null:
		_coin_count_label.text = str(coins)


func _on_shop_notice(peer_id: int, text: String, positive: bool) -> void:
	if multiplayer.multiplayer_peer == null or peer_id != multiplayer.get_unique_id():
		return
	if not positive:
		GameManager.call("play_effect", "not-coins-or-other-errors")
	queue_popup_text(text, Color(0.5, 1.0, 0.62, 1.0) if positive else Color(1.0, 0.44, 0.34, 1.0), 1.0)


func _setup_scope_overlay() -> void:
	_scope_overlay = ColorRect.new()
	_scope_overlay.name = "ScopeOverlay"
	_scope_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_scope_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scope_overlay.visible = false
	add_child(_scope_overlay)
	
	var shader := Shader.new()
	shader.code = "shader_type canvas_item;\n\tuniform float circle_radius = 200.0;\n\tuniform vec2 center = vec2(0.5, 0.5);\n\tvoid fragment() {\n\t\tvec2 uv_pixels = UV * (1.0 / SCREEN_PIXEL_SIZE);\n\t\tvec2 center_pixels = center * (1.0 / SCREEN_PIXEL_SIZE);\n\t\tfloat dist = distance(uv_pixels, center_pixels);\n\t\tif (dist < circle_radius - 2.0) {\n\t\t\tdiscard;\n\t\t} else if (dist < circle_radius) {\n\t\t\tCOLOR = vec4(1.0, 0.1, 0.1, 0.8);\n\t\t} else {\n\t\t\tCOLOR = vec4(0.0, 0.0, 0.0, 0.96);\n\t\t}\n\t}"
	var mat := ShaderMaterial.new()
	mat.shader = shader
	_scope_overlay.material = mat

	for is_vertical in [true, false]:
		var rect := ColorRect.new()
		rect.color = Color(0.92, 0.98, 1.0, 0.9)
		rect.size = Vector2(2.0, 86.0) if is_vertical else Vector2(86.0, 2.0)
		_scope_overlay.add_child(rect)
		_scope_reticle.append(rect)


func _is_scope_active() -> bool:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return false
	return _pc_weapon == WEAPON_SNIPER and _pc_zoom > 0.45


func _is_any_zoom_active() -> bool:
	# Returns true when the player is zoomed in regardless of weapon type
	# Used to hide crosshair during right-click aim-down-sights for non-sniper weapons
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return false
	return _pc_zoom > 0.45


func _update_scope_overlay() -> void:
	if _scope_overlay == null:
		return
	var active := _is_scope_active() and not _pause_open
	_scope_overlay.visible = active
	if not active and not _is_any_zoom_active():
		crosshair.visible = not _pause_open
	if not active:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	var zoom_value: float = _pc_zoom
	var opening_size := lerpf(250.0, 170.0, clampf((zoom_value - 0.72) / 0.28, 0.0, 1.0))
	var half_opening := opening_size * 0.5
	var center := viewport_size * 0.5
	
	var mat: ShaderMaterial = _scope_overlay.material as ShaderMaterial
	if mat:
		mat.set_shader_parameter("circle_radius", half_opening)
		mat.set_shader_parameter("center", center / viewport_size)
		
	_scope_reticle[0].position = center - Vector2(1.0, 43.0)
	_scope_reticle[1].position = center - Vector2(43.0, 1.0)

func _ready() -> void:
	# Setup Kill Streak Indicator
	var kill_streak_script = load("res://scripts/ui/kill_streak_indicator.gd")
	if kill_streak_script:
		_kill_streak_indicator = Control.new()
		_kill_streak_indicator.set_script(kill_streak_script)
		_kill_streak_indicator.name = "KillStreakIndicator"
		
		_kill_streak_indicator.anchor_left = 0.0
		_kill_streak_indicator.anchor_top = 1.0
		_kill_streak_indicator.anchor_right = 0.0
		_kill_streak_indicator.anchor_bottom = 1.0
		_kill_streak_indicator.offset_left = 50.0
		_kill_streak_indicator.offset_top = -310.0
		_kill_streak_indicator.offset_right = 132.0
		_kill_streak_indicator.offset_bottom = -210.0
		add_child(_kill_streak_indicator)
		_kill_streak_indicator.visible = false
		
	# Setup Kill Streak Announcement Label (Center screen above crosshair)
	_kill_announcement_label = Label.new()
	_kill_announcement_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_kill_announcement_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_kill_announcement_label.text = ""
	_kill_announcement_label.modulate = Color(1, 1, 1, 0.0)
	_kill_announcement_label.add_theme_font_size_override("font_size", 28)
	_kill_announcement_label.add_theme_constant_override("outline_size", 4)
	_kill_announcement_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	add_child(_kill_announcement_label)

	# Enforce top-level display order for menus (Z-Index override)
	if has_node("PausePanel"): $PausePanel.z_index = 100
	if has_node("WinPanel"): $WinPanel.z_index = 100

	# Setup Damage Streak Label above bottom-left HUD Avatar
	_damage_streak_label = Label.new()
	
	_damage_streak_label.anchor_left = 0.0
	_damage_streak_label.anchor_top = 1.0
	_damage_streak_label.anchor_right = 0.0
	_damage_streak_label.anchor_bottom = 1.0
	_damage_streak_label.offset_left = 150.0
	_damage_streak_label.offset_top = -162.0
	_damage_streak_label.offset_right = 350.0
	_damage_streak_label.offset_bottom = -132.0
	_damage_streak_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_damage_streak_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_damage_streak_label.text = ""
	_damage_streak_label.modulate = Color(1.0, 1.0, 1.0, 0.0)
	_damage_streak_label.add_theme_font_size_override("font_size", 16)
	_damage_streak_label.add_theme_constant_override("outline_size", 2)
	_damage_streak_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.5))
	_damage_streak_label.rotation_degrees = -5.8
	add_child(_damage_streak_label)

	game_manager.connect("state_changed", Callable(self, "_on_state_changed"))
	game_manager.connect("round_ended", Callable(self, "_on_round_ended"))
	if game_manager.has_signal("progression_changed"):
		game_manager.connect("progression_changed", Callable(self, "_on_progression_changed"))
	if game_manager.has_signal("level_up"):
		game_manager.connect("level_up", Callable(self, "_on_level_up"))
	if game_manager.has_signal("xp_gained"):
		game_manager.connect("xp_gained", Callable(self, "_on_xp_gained"))
	if game_manager.has_signal("coins_changed"):
		game_manager.connect("coins_changed", Callable(self, "_on_coins_changed"))
	if game_manager.has_signal("shop_notice"):
		game_manager.connect("shop_notice", Callable(self, "_on_shop_notice"))
	if game_manager.has_signal("world_settings_changed"):
		game_manager.connect("world_settings_changed", Callable(self, "_on_world_settings_changed"))
	win_panel.visible = false
	countdown_label.visible = false
	pause_panel.visible = false
	_setup_feedback_layer()
	_setup_scope_overlay()
	damage_flash.color = Color(1.0, 0.1, 0.08, 0.0)
	crosshair_top.visible = true
	crosshair_bottom.visible = true
	crosshair_left.visible = true
	crosshair_right.visible = true
	_apply_crosshair_layout(_crosshair_spread_display)
	var blur_material := sprint_blur.material as ShaderMaterial
	if blur_material:
		blur_material.set_shader_parameter("strength", 0.0)
		blur_material.set_shader_parameter("darken_strength", 0.0)
	health_bar.max_value = 100.0
	health_bar.value = 100.0
	stamina_bar.max_value = 100.0
	stamina_bar.value = 100.0
	double_jump_bar.max_value = DOUBLE_JUMP_RECHARGE_DEFAULT
	health_bar_shine.visible = true
	stamina_bar_shine.visible = true
	double_jump_bar_shine.visible = true
	double_jump_bar.value = DOUBLE_JUMP_RECHARGE_DEFAULT
	hint_label.text = ""
	hit_marker.modulate = Color(1.0, 1.0, 1.0, 0.0)
	run_hint_body.text = ""
	run_hint_panel.visible = false
	run_hint_panel.position = Vector2(320.0, 0.0)
	scoreboard_panel.visible = false
	bhop_lockout_indicator.visible = false
	bhop_lockout_indicator.modulate = Color(1.0, 1.0, 1.0, 0.0)
	back_jump_indicator.visible = false
	back_jump_indicator.modulate = Color(1.0, 1.0, 1.0, 0.0)
	bug_swarm_indicator.visible = false
	bug_swarm_indicator.modulate = Color(1.0, 1.0, 1.0, 0.0)
	grapple_indicator.visible = false
	grapple_indicator.modulate = Color(1.0, 1.0, 1.0, 0.0)
	_game_font = game_manager.call("load_font_from_file", GAME_FONT_PATH) as FontFile
	_setup_pause_menu_scroll()
	_build_progression_panel()
	_build_admin_panel()
	_build_vip_panel()
	_build_shop_panel()
	_build_horde_hud_widgets()
	_build_helper_panel()
	_menu_font = game_manager.call("load_font_from_file", MENU_FONT_PATH) as FontFile
	_apply_game_font(self)
	if _menu_font != null:
		_apply_specific_font(pause_panel, _menu_font)
		_apply_specific_font(_progression_panel, _menu_font)
	_apply_square_panel_styles()
	_apply_menu_font_sizes()
	_setup_menu_glitch_targets()
	_refresh_ui_copy()
	call_deferred("_configure_bottom_hud_geometry")
	resume_button.pressed.connect(_on_resume_button_pressed)
	restart_button.pressed.connect(_on_restart_button_pressed)
	swap_team_button.pressed.connect(_on_swap_team_button_pressed)
	lane_narrow_button.pressed.connect(func() -> void: _request_debug_teleport(DEBUG_START_POS))
	lane_wide_button.pressed.connect(_on_refill_button_pressed)
	pipe_narrow_button.pressed.connect(func() -> void: _request_debug_teleport(DEBUG_TUNNEL_POS))
	pipe_wide_button.pressed.connect(func() -> void: _request_debug_teleport(DEBUG_MID_POS))
	auto_slower_button.pressed.connect(func() -> void: _request_debug_teleport(DEBUG_FINAL_POS))
	auto_faster_button.pressed.connect(_on_trigger_trap_wave_button_pressed)
	release_bugs_button.pressed.connect(_on_release_bugs_button_pressed)
	rebuild_map_button.pressed.connect(_on_rebuild_map_button_pressed)
	skip_wave_button.pressed.connect(_on_skip_wave_button_pressed)
	load_testmap_button.pressed.connect(_on_load_testmap_button_pressed)
	load_demomap_button.pressed.connect(_on_load_demomap_button_pressed)
	main_menu_button.pressed.connect(_on_main_menu_button_pressed)
	quit_button.pressed.connect(_on_quit_button_pressed)
	# _setup_text_shines() # Removed
	hint_label.visible = false
	_restore_default_helper_text()
	_helper_panel_hidden = int(game_manager.get("state")) != STATE_COUNTDOWN
	_set_helper_panel_open(false, true)
	_bind_local_player()
	_bind_current_map()
	# Also catch any local_player nodes added after _ready fires
	get_tree().node_added.connect(_on_scene_node_added)
	_on_local_player_health_changed(100.0, 100.0)
	_on_local_player_stamina_changed(100.0, 100.0, false)
	_on_local_player_double_jump_charge_changed(DOUBLE_JUMP_RECHARGE_DEFAULT, DOUBLE_JUMP_RECHARGE_DEFAULT, true)
	_on_local_player_ammo_changed(12, 60, false)
	_on_local_player_weapon_changed("PISTOL")
	_refresh_account_status_hud()
	if int(game_manager.get("state")) == STATE_COUNTDOWN:
		_start_countdown_tip()
		_show_helper_hint()
	else:
		_sync_helper_panel()
	_helper_alpha = 1.0


func _process(delta: float) -> void:
	# _bind_local_player is now also driven by node_added signal; call here handles
	# invalidated nodes (e.g. player freed on map reload) and scene changes.
	if _local_player != null and not is_instance_valid(_local_player):
		_local_player = null
	if _local_player == null:
		_bind_local_player()
	# Cache player properties once per frame (PERF-1).
	# Eliminates repeated _local_player.get() reflection calls in helpers.
	if _local_player != null:
		var _v = _local_player.get("velocity")
		_pc_velocity = _v if _v is Vector3 else Vector3.ZERO
		var _s = _local_player.get("sprint_visual_strength")
		_pc_sprint   = clamp(float(_s) if _s != null else 0.0, 0.0, 1.0)
		var _sl = _local_player.get("slide_visual_strength")
		_pc_slide    = clamp(float(_sl) if _sl != null else 0.0, 0.0, 1.0)
		var _z = _local_player.get("zoom_visual_strength")
		_pc_zoom     = clamp(float(_z) if _z != null else 0.0, 0.0, 1.0)
		var _sp = _local_player.get("crosshair_spread_visual_strength")
		_pc_spread   = clamp(float(_sp) if _sp != null else 0.12, 0.0, 1.0)
		var _w = _local_player.get("current_weapon")
		_pc_weapon   = int(_w) if _w != null else -1
	else:
		_pc_velocity = Vector3.ZERO
		_pc_sprint   = 0.0
		_pc_slide    = 0.0
		_pc_zoom     = 0.0
		_pc_spread   = 0.12
		_pc_weapon   = -1
	_bind_current_map()
	_update_animated_bars(delta)
	_update_motion_visibility(delta)
	_update_crosshair(delta)
	_update_energy_warning_visuals(delta)
	_update_helper_fade(delta)
	_update_hit_marker(delta)
	_update_panel_fx(delta)
	_update_bhop_lockout_indicator()
	
	# Animate Kill Streak Announcement Label
	if _kill_announcement_label != null:
		if _kill_announcement_timer > 0.0:
			_kill_announcement_timer = max(_kill_announcement_timer - delta, 0.0)
			var center := get_viewport().get_visible_rect().size * 0.5
			
			# Pivot center sizing offset
			_kill_announcement_label.size = Vector2(500.0, 40.0)
			_kill_announcement_label.position = center + Vector2(0.0, -180.0) - _kill_announcement_label.size * 0.5
			_kill_announcement_label.pivot_offset = _kill_announcement_label.size * 0.5
			_kill_announcement_label.scale = _kill_announcement_label.scale.lerp(Vector2.ONE, delta * 8.0)
			
			var age := 10.0 - _kill_announcement_timer
			if age < 6.0:
				_kill_announcement_label.modulate = Color(1.0, 0.95, 0.45, 0.9) # Bright yellow
			else:
				var t_red := clampf((age - 6.0) / 4.0, 0.0, 1.0)
				_kill_announcement_label.modulate = Color(
					lerpf(1.0, 0.85, t_red),
					lerpf(0.95, 0.1, t_red),
					lerpf(0.45, 0.1, t_red),
					lerpf(0.9, 0.38, t_red) # transparent red
				)
			if _kill_announcement_timer <= 0.0:
				_kill_announcement_label.text = ""
				_kill_announcement_label.modulate.a = 0.0
	if _damage_streak_label != null:
		_damage_streak_label.scale = _damage_streak_label.scale.lerp(Vector2.ONE, delta * 12.0)
		if _damage_streak <= 1:
			_damage_streak_label.modulate.a = lerpf(_damage_streak_label.modulate.a, 0.0, delta * 6.0)
			
	# Dynamic Warmup UI Hiding Logic
	var in_warmup := false
	if _local_player != null and is_instance_valid(_local_player):
		if _local_player.has_method("_is_warmup_free_fly_active") and _local_player.call("_is_warmup_free_fly_active"):
			in_warmup = true
			
	if in_warmup:
		if has_node("TopHud"): $TopHud.visible = false
		if has_node("BottomHud"): $BottomHud.visible = false
		if has_node("HintLabel"): $HintLabel.visible = false
		if has_node("RunHintPanel"): $RunHintPanel.visible = false
		_was_in_warmup = true
		_sync_mini_profile_visibility()
	elif _was_in_warmup:
		_was_in_warmup = false
		if has_node("TopHud"): $TopHud.visible = true
		if has_node("BottomHud"): $BottomHud.visible = true
		if has_node("HintLabel"): $HintLabel.visible = true
		if has_node("RunHintPanel"): $RunHintPanel.visible = true
		_sync_mini_profile_visibility()
	_update_role_power_indicators()
	_update_damage_flash(delta)
	_update_labels()
	_sync_helper_panel()
	_update_run_hint(delta)
	_update_scoreboard(delta)
	_update_progression_panel()
	_update_shop_panel()
	_update_horde_hud()
	_update_feedback_popups(delta)
	_update_menu_scroll_layouts()
	_update_menu_glitch_fx()
	_update_admin_panel(delta)
	_update_vip_panel()
	_update_scope_overlay()
	if _hit_combo_timer > 0.0:
		_hit_combo_timer = max(_hit_combo_timer - delta, 0.0)
		if _hit_combo_timer <= 0.0:
			_hit_combo_count = 0


func _unhandled_input(event: InputEvent) -> void:
	if not event is InputEventKey:
		return
	var key_event := event as InputEventKey
	if key_event.keycode == KEY_TAB or key_event.physical_keycode == KEY_TAB:
		if not key_event.echo:
			_set_scoreboard_open(key_event.pressed)
		return
	if not key_event.pressed or key_event.echo:
		return
	if _handle_menu_scroll_input(key_event):
		return
	if key_event.keycode == KEY_ESCAPE or key_event.physical_keycode == KEY_ESCAPE:
		_toggle_pause_menu()
	elif key_event.keycode == KEY_X or key_event.physical_keycode == KEY_X:
		_toggle_x_context_panel()
	elif key_event.keycode == KEY_M or key_event.physical_keycode == KEY_M:
		if _is_local_admin():
			_toggle_admin_panel()
		else:
			hint_label.text = "ADMIN ACCESS ONLY"
			_helper_override_time = 1.8
			_show_helper_hint()
	elif key_event.keycode == KEY_V or key_event.physical_keycode == KEY_V:
		_toggle_vip_panel()
	elif key_event.keycode == KEY_T or key_event.physical_keycode == KEY_T:
		_toggle_top_hud()
		_show_helper_hint()
	elif key_event.keycode == KEY_I or key_event.physical_keycode == KEY_I:
		_helper_panel_hidden = not _helper_panel_hidden
		_sync_helper_panel()


func _update_labels() -> void:
	var state: int = int(game_manager.get("state"))
	match state:
		STATE_PLAYING:
			var t: float = float(game_manager.get("round_timer"))
			timer_label.text = "%d:%02d" % [int(t / 60.0), int(t) % 60]
		STATE_COUNTDOWN:
			var c: int = ceili(float(game_manager.get("countdown_timer")))
			countdown_label.text = str(c)
		_:
			timer_label.text = "--:--"

	if _is_horde_scene_active():
		var wave_status := _current_horde_wave_status()
		var wave_number := int(wave_status.get("wave", 0))
		var max_wave_number := int(wave_status.get("max_waves", 0))
		var wave_live := bool(wave_status.get("active", false))
		var alive := int(wave_status.get("alive", 0))
		role_label.text = "HORDE"
		time_caption_label.text = "WAVE %d/%d" % [wave_number, max_wave_number] if wave_live else "BREAK"
		if not wave_live and wave_number >= max_wave_number:
			player_label.text = "ALL CLEAR"
		elif wave_live:
			player_label.text = "BUGS LEFT: %d" % alive
		else:
			player_label.text = "NEXT: %d/%d" % [mini(wave_number + 1, max_wave_number), max_wave_number]
	else:
		time_caption_label.text = "TIME"
		var role_str: String = "RUNNER"
		if bool(game_manager.call("is_trapper")):
			role_str = "TRAPPER"
		role_label.text = role_str
		var alive: int = 0
		var players := _players()
		for id in players:
			if players[id]["alive"] and players[id]["role"] == ROLE_RUNNER:
				alive += 1
		player_label.text = "RUNNERS LEFT: %d" % alive
	role_label.modulate = Color(1, 1, 1, 1)
	player_label.modulate = Color(1, 1, 1, 1)
	if not _local_player or not is_instance_valid(_local_player):
		health_label.text = "---"
		stamina_label.text = "---"
		weapon_label.text = "--"
		ammo_label.text = "-- / --"
		ammo_state_label.text = "SYNCING"
		ammo_state_label.modulate = Color(1, 1, 1, 1)
	_refresh_account_status_hud()


func _on_state_changed(new_state: int) -> void:
	countdown_label.visible = (new_state == STATE_COUNTDOWN)
	win_panel.visible = false
	_running_hint_time = 0.0
	_run_hint_visible_chars = 0.0
	_run_hint_hold_timer = 0.0
	_run_hint_active = false
	_run_hint_seen = false
	_stamina_warning_strength = 0.0
	_helper_override_time = 0.0
	# Show helper during countdown (warmup), otherwise keep helper hidden by default
	if new_state == STATE_COUNTDOWN:
		_restore_default_helper_text()
		_helper_alpha = 1.0
		_helper_panel_hidden = false
	else:
		_restore_default_helper_text()
		_helper_panel_hidden = true
	run_hint_body.text = ""
	_set_run_hint_open(false, true)
	_sync_helper_panel()
	_set_scoreboard_open(false)
	if new_state == STATE_COUNTDOWN:
		_start_countdown_tip()
	if new_state == STATE_PLAYING and _shop_panel != null and _shop_panel.visible and not _is_horde_shop_available():
		_set_shop_panel_open(false)
	if new_state != STATE_PLAYING and _shop_panel != null and _shop_panel.visible:
		_set_shop_panel_open(false)


func _on_round_ended(winner: String) -> void:
	win_panel.visible = true
	if winner == "runners":
		win_label.text = "RUNNERS ESCAPE!"
	else:
		win_label.text = "TRAPPER DOMINATES!"


func _on_progression_changed(_peer_id: int) -> void:
	_update_progression_panel()
	_refresh_account_status_hud()


func _on_world_settings_changed(_settings: Dictionary) -> void:
	_refresh_account_status_hud()
	if _admin_panel_open:
		_refresh_admin_panel_content()


func _on_scene_node_added(node: Node) -> void:
	if _local_player == null and node.is_in_group("local_player"):
		_bind_local_player()


func _bind_local_player() -> void:
	if _local_player and not is_instance_valid(_local_player):
		_local_player = null
	if _local_player and is_instance_valid(_local_player):
		return
	_local_player = get_tree().get_first_node_in_group("local_player")
	if _local_player == null:
		return
	if not _local_player.is_connected("health_changed", Callable(self, "_on_local_player_health_changed")):
		_local_player.connect("health_changed", Callable(self, "_on_local_player_health_changed"))
	if not _local_player.is_connected("stamina_changed", Callable(self, "_on_local_player_stamina_changed")):
		_local_player.connect("stamina_changed", Callable(self, "_on_local_player_stamina_changed"))
	if not _local_player.is_connected("double_jump_charge_changed", Callable(self, "_on_local_player_double_jump_charge_changed")):
		_local_player.connect("double_jump_charge_changed", Callable(self, "_on_local_player_double_jump_charge_changed"))
	if not _local_player.is_connected("energy_denied", Callable(self, "_on_local_player_energy_denied")):
		_local_player.connect("energy_denied", Callable(self, "_on_local_player_energy_denied"))
	if not _local_player.is_connected("ammo_changed", Callable(self, "_on_local_player_ammo_changed")):
		_local_player.connect("ammo_changed", Callable(self, "_on_local_player_ammo_changed"))
	if not _local_player.is_connected("weapon_changed", Callable(self, "_on_local_player_weapon_changed")):
		_local_player.connect("weapon_changed", Callable(self, "_on_local_player_weapon_changed"))
	if not _local_player.is_connected("hit_marker", Callable(self, "_on_local_player_hit_marker")):
		_local_player.connect("hit_marker", Callable(self, "_on_local_player_hit_marker"))
	if not _local_player.is_connected("damage_feedback", Callable(self, "_on_local_player_damage_feedback")):
		_local_player.connect("damage_feedback", Callable(self, "_on_local_player_damage_feedback"))
	if _local_player.has_signal("damage_dealt") and not _local_player.is_connected("damage_dealt", Callable(self, "_on_local_player_damage_dealt")):
		_local_player.connect("damage_dealt", Callable(self, "_on_local_player_damage_dealt"))
	if _local_player.has_signal("kill_streak_changed") and not _local_player.is_connected("kill_streak_changed", Callable(self, "_on_local_player_kill_streak_changed")):
		_local_player.connect("kill_streak_changed", Callable(self, "_on_local_player_kill_streak_changed"))
	_on_local_player_health_changed(float(_local_player.get("health")), 100.0)
	_on_local_player_stamina_changed(float(_local_player.get("stamina")), 100.0, bool(_local_player.get("is_exhausted")))
	_on_local_player_double_jump_charge_changed(float(_local_player.get("double_jump_charge")), DOUBLE_JUMP_RECHARGE_DEFAULT, bool(_local_player.get("double_jump_ready")))
	_on_local_player_ammo_changed(int(_local_player.get("current_ammo")), int(_local_player.get("reserve_ammo")), bool(_local_player.get("is_reloading")))
	_on_local_player_weapon_changed(str(_local_player.call("get_weapon_name")))


func _bind_current_map() -> void:
	var current_scene: Node = get_tree().current_scene
	if current_scene == _current_map:
		return
	_current_map = current_scene
	_refresh_mode_copy()
	if _current_map == null:
		return
	if _current_map.has_signal("red_light_state_changed") and not _current_map.is_connected("red_light_state_changed", Callable(self, "_on_map_red_light_state_changed")):
		_current_map.connect("red_light_state_changed", Callable(self, "_on_map_red_light_state_changed"))
	if _current_map.has_signal("bug_swarm_released") and not _current_map.is_connected("bug_swarm_released", Callable(self, "_on_map_bug_swarm_released")):
		_current_map.connect("bug_swarm_released", Callable(self, "_on_map_bug_swarm_released"))


func _build_progression_panel() -> void:
	# Clear stale glitch target cache — the profile widget subtree is about
	# to be rebuilt, so old Control references would be invalid (PERF-4).
	_progression_glitch_targets.clear()
	_progression_panel = Panel.new()
	_progression_panel.name = "ProgressionPanel"
	_progression_panel.visible = false
	_progression_panel.z_index = 100
	_progression_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_progression_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_progression_panel)
	_progression_frame = Panel.new()
	_progression_frame.name = "ProgressionFrame"
	_progression_frame.set_anchors_preset(Control.PRESET_CENTER)
	_progression_frame.mouse_filter = Control.MOUSE_FILTER_STOP
	_progression_panel.add_child(_progression_frame)
	_setup_progression_scroll()
	_progression_coin_label = Label.new()
	_progression_coin_label.name = "ProgressionCoinLabel"
	_progression_coin_label.text = "COINS: 0"
	_progression_coin_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progression_frame.add_child(_progression_coin_label)
	_progression_shop_button = Button.new()
	_progression_shop_button.name = "ProgressionShopButton"
	_progression_shop_button.text = "OPEN HORDE SHOP"
	_progression_shop_button.custom_minimum_size = Vector2(200.0, 40.0)
	_progression_shop_button.pressed.connect(_open_horde_shop_from_progression)
	_progression_frame.add_child(_progression_shop_button)
	_create_progression_profile_widget()

	# compact avatar + XP ring docked inside the left HUD cluster
	_mini_profile_widget = ProfileAvatarWidget.new()
	_mini_profile_widget.compact_mode = true
	_mini_profile_widget.name = "MiniProfileAvatarWidget"
	_mini_profile_widget.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_mini_profile_widget.custom_minimum_size = Vector2(100.0, 100.0)
	_mini_profile_widget.offset_left = 14.0
	_mini_profile_widget.offset_top = 20.0
	_mini_profile_widget.offset_right = 114.0
	_mini_profile_widget.offset_bottom = 120.0
	_mini_profile_widget.rotation_degrees = -7.0
	_mini_profile_widget.pivot_offset = _mini_profile_widget.custom_minimum_size * 0.5
	var bars_container: Control = left_panel.get_node("BarsContainer") as Control
	bars_container.add_child(_mini_profile_widget)

	_profile_service = profile_service
	if _profile_service and _profile_service.has_signal("avatar_ready"):
		if not _profile_service.is_connected("avatar_ready", Callable(self, "_on_profile_avatar_ready")):
			_profile_service.connect("avatar_ready", Callable(self, "_on_profile_avatar_ready"))


func _build_admin_panel() -> void:
	_admin_panel = Panel.new()
	_admin_panel.name = "AdminPanel"
	_admin_panel.visible = false
	_admin_panel.z_index = 100
	_admin_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_admin_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var bg_style := StyleBoxFlat.new()
	bg_style.bg_color = Color(0.0, 0.0, 0.0, 0.65)
	_admin_panel.add_theme_stylebox_override("panel", bg_style)
	add_child(_admin_panel)
	
	_admin_frame = Control.new()
	_admin_frame.name = "AdminFrame"
	_admin_frame.set_anchors_preset(Control.PRESET_CENTER)
	_admin_frame.custom_minimum_size = Vector2(880.0, 680.0)
	_admin_frame.mouse_filter = Control.MOUSE_FILTER_STOP
	_admin_panel.add_child(_admin_frame)
	
	var frame_bg := Panel.new()
	frame_bg.name = "FrameBG"
	frame_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	frame_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var frame_style := StyleBoxFlat.new()
	frame_style.bg_color = Color(0.04, 0.08, 0.14, 0.92)
	frame_style.border_width_left = 2
	frame_style.border_width_top = 2
	frame_style.border_width_right = 2
	frame_style.border_width_bottom = 2
	frame_style.border_color = Color(0.35, 0.65, 1.0, 0.5)
	frame_style.corner_radius_top_left = 6
	frame_style.corner_radius_top_right = 6
	frame_style.corner_radius_bottom_right = 6
	frame_style.corner_radius_bottom_left = 6
	frame_bg.add_theme_stylebox_override("panel", frame_style)
	_admin_frame.add_child(frame_bg)
	
	var content := VBoxContainer.new()
	content.name = "Content"
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.offset_left = 14.0
	content.offset_top = 12.0
	content.offset_right = -14.0
	content.offset_bottom = -12.0
	content.add_theme_constant_override("separation", 8)
	_admin_frame.add_child(content)
	
	_admin_status_label = Label.new()
	_admin_status_label.name = "AdminStatusLabel"
	_admin_status_label.text = "ADMIN CONSOLE // SERVER MODERATION"
	_admin_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_admin_status_label.modulate = Color(0.5, 0.8, 1.0, 1.0)
	_admin_status_label.add_theme_font_size_override("font_size", 18)
	content.add_child(_admin_status_label)
	
	_admin_scroll = ScrollContainer.new()
	_admin_scroll.name = "AdminScroll"
	_admin_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_admin_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_admin_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_admin_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_admin_scroll.clip_contents = true
	_admin_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	content.add_child(_admin_scroll)
	
	_admin_scroll_content = VBoxContainer.new()
	_admin_scroll_content.name = "AdminScrollContent"
	_admin_scroll_content.add_theme_constant_override("separation", 10)
	_admin_scroll_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_admin_scroll.add_child(_admin_scroll_content)

	var action_title := Label.new()
	action_title.text = "> SERVER ACTIONS"
	action_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	action_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(action_title)

	_admin_summary_label = Label.new()
	_admin_summary_label.name = "AdminSummaryLabel"
	_admin_summary_label.text = "ADMIN SUMMARY // LOADING"
	_admin_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_admin_summary_label.modulate = Color(0.75, 0.9, 1.0, 0.9)
	_admin_summary_label.add_theme_font_size_override("font_size", 12)
	_admin_scroll_content.add_child(_admin_summary_label)

	var actions := [
		{"text": "RESTART ROUND", "action": Callable(self, "_on_admin_restart_round_pressed")},
		{"text": "RESET TO LOBBY", "action": Callable(self, "_on_admin_force_lobby_pressed")},
		{"text": "LOAD TEST MAP", "action": Callable(self, "_on_admin_load_test_map_pressed")},
		{"text": "LOAD HORDE MAP", "action": Callable(self, "_on_admin_load_horde_map_pressed")},
		{"text": "LOAD DEMO MAP", "action": Callable(self, "_on_admin_load_demo_map_pressed")},
		{"text": "SWAP MY ROLE", "action": Callable(self, "_on_admin_swap_role_pressed")}
	]
	for action_data in actions:
		var button := Button.new()
		button.text = str(action_data["text"])
		button.custom_minimum_size = Vector2(0.0, 32.0)
		button.pressed.connect(action_data["action"])
		var btn_style := StyleBoxFlat.new()
		btn_style.bg_color = Color(0.12, 0.2, 0.32, 0.7)
		btn_style.border_width_left = 1
		btn_style.border_width_top = 1
		btn_style.border_width_right = 1
		btn_style.border_width_bottom = 1
		btn_style.border_color = Color(0.4, 0.65, 0.95, 0.6)
		btn_style.corner_radius_top_left = 3
		btn_style.corner_radius_top_right = 3
		btn_style.corner_radius_bottom_right = 3
		btn_style.corner_radius_bottom_left = 3
		button.add_theme_stylebox_override("normal", btn_style)
		var hover_style := StyleBoxFlat.new()
		hover_style.bg_color = Color(0.16, 0.28, 0.45, 0.85)
		hover_style.border_width_left = 1
		hover_style.border_width_top = 1
		hover_style.border_width_right = 1
		hover_style.border_width_bottom = 1
		hover_style.border_color = Color(0.6, 0.85, 1.0, 0.8)
		hover_style.corner_radius_top_left = 3
		hover_style.corner_radius_top_right = 3
		hover_style.corner_radius_bottom_right = 3
		hover_style.corner_radius_bottom_left = 3
		button.add_theme_stylebox_override("hover", hover_style)
		button.add_theme_color_override("font_color", Color(0.8, 0.9, 1.0, 1.0))
		button.add_theme_font_size_override("font_size", 11)
		_admin_scroll_content.add_child(button)
	
	var world_title := Label.new()
	world_title.text = "> WORLD CONTROL"
	world_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	world_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(world_title)
	
	_admin_world_label = Label.new()
	_admin_world_label.text = "GRAVITY // 100%"
	_admin_world_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_admin_world_label.modulate = Color(0.75, 0.9, 1.0, 0.9)
	_admin_world_label.add_theme_font_size_override("font_size", 12)
	_admin_scroll_content.add_child(_admin_world_label)
	
	var gravity_row := HBoxContainer.new()
	gravity_row.add_theme_constant_override("separation", 4)
	_admin_scroll_content.add_child(gravity_row)
	gravity_row.add_child(_make_admin_action_button("MOON", func() -> void:
		game_manager.call("admin_set_gravity_scale", 0.5)
		_log_admin_action("set_gravity", "", "", {"gravity_scale": 0.5})
		_admin_refresh_timer = 0.0
	))
	gravity_row.add_child(_make_admin_action_button("-25%", func() -> void:
		game_manager.call("admin_adjust_gravity", -ADMIN_GRAVITY_STEP)
		_log_admin_action("adjust_gravity", "", "", {"delta": -ADMIN_GRAVITY_STEP})
		_admin_refresh_timer = 0.0
	))
	gravity_row.add_child(_make_admin_action_button("RESET", func() -> void:
		game_manager.call("admin_set_gravity_scale", 1.0)
		_log_admin_action("set_gravity", "", "", {"gravity_scale": 1.0})
		_admin_refresh_timer = 0.0
	))
	gravity_row.add_child(_make_admin_action_button("+25%", func() -> void:
		game_manager.call("admin_adjust_gravity", ADMIN_GRAVITY_STEP)
		_log_admin_action("adjust_gravity", "", "", {"delta": ADMIN_GRAVITY_STEP})
		_admin_refresh_timer = 0.0
	))
	gravity_row.add_child(_make_admin_action_button("HEAVY", func() -> void:
		game_manager.call("admin_set_gravity_scale", 1.5)
		_log_admin_action("set_gravity", "", "", {"gravity_scale": 1.5})
		_admin_refresh_timer = 0.0
	))
	
	var reason_title := Label.new()
	reason_title.text = "> BAN REASON"
	reason_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	reason_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(reason_title)
	
	_admin_ban_reason_input = LineEdit.new()
	_admin_ban_reason_input.placeholder_text = "Enter ban reason"
	_admin_ban_reason_input.clear_button_enabled = true
	_admin_ban_reason_input.text = "BANNED FROM ADMIN CONSOLE"
	_admin_ban_reason_input.custom_minimum_size = Vector2(0.0, 30.0)
	_admin_scroll_content.add_child(_admin_ban_reason_input)

	var player_title := Label.new()
	player_title.text = "> PLAYER CONTROL"
	player_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	player_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(player_title)
	
	_admin_player_list_box = VBoxContainer.new()
	_admin_player_list_box.name = "AdminPlayerListBox"
	_admin_player_list_box.add_theme_constant_override("separation", 4)
	_admin_scroll_content.add_child(_admin_player_list_box)
	
	
	var bans_title := Label.new()
	bans_title.text = "> ACTIVE BANS"
	bans_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	bans_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(bans_title)
	
	_admin_snapshot_note_label = Label.new()
	_admin_snapshot_note_label.text = "MODERATION SNAPSHOT // LOADING"
	_admin_snapshot_note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_admin_snapshot_note_label.modulate = Color(0.75, 0.85, 0.95, 0.85)
	_admin_snapshot_note_label.add_theme_font_size_override("font_size", 11)
	_admin_scroll_content.add_child(_admin_snapshot_note_label)
	
	_admin_active_bans_box = VBoxContainer.new()
	_admin_active_bans_box.name = "AdminActiveBansBox"
	_admin_active_bans_box.add_theme_constant_override("separation", 4)
	_admin_scroll_content.add_child(_admin_active_bans_box)
	
	var audit_title := Label.new()
	audit_title.text = "> RECENT ADMIN ACTIONS"
	audit_title.modulate = Color(1.0, 0.75, 0.3, 1.0)
	audit_title.add_theme_font_size_override("font_size", 14)
	_admin_scroll_content.add_child(audit_title)
	
	_admin_audit_box = VBoxContainer.new()
	_admin_audit_box.name = "AdminAuditBox"
	_admin_audit_box.add_theme_constant_override("separation", 4)
	_admin_scroll_content.add_child(_admin_audit_box)


func _build_vip_panel() -> void:
	_vip_panel = Panel.new()
	_vip_panel.name = "VipPanel"
	_vip_panel.visible = false
	_vip_panel.z_index = 100
	_vip_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vip_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_vip_panel)
	_vip_frame = Panel.new()
	_vip_frame.name = "VipFrame"
	_vip_frame.set_anchors_preset(Control.PRESET_CENTER)
	_vip_frame.mouse_filter = Control.MOUSE_FILTER_STOP
	_vip_panel.add_child(_vip_frame)
	var content := VBoxContainer.new()
	content.name = "VipContent"
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.offset_left = 18.0
	content.offset_top = 18.0
	content.offset_right = -18.0
	content.offset_bottom = -12.0
	content.add_theme_constant_override("separation", 10)
	_vip_frame.add_child(content)
	_vip_status_label = Label.new()
	_vip_status_label.text = "VIP ACCESS // CONNECTING"
	_vip_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_status_label)
	_vip_name_label = Label.new()
	_vip_name_label.text = "PLAYER // --"
	_vip_name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_name_label)
	_vip_timer_label = Label.new()
	_vip_timer_label.text = "TRIAL TIMER // --"
	_vip_timer_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_timer_label)
	_vip_detail_label = Label.new()
	_vip_detail_label.text = "PRESS V TO CLOSE"
	_vip_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_detail_label)
	_vip_source_label = Label.new()
	_vip_source_label.text = "SOURCE // --"
	_vip_source_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_source_label)
	_vip_benefits_label = Label.new()
	_vip_benefits_label.text = "BENEFITS // PURPLE NAME // CROWN TAG // VIP ACCESS"
	_vip_benefits_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_vip_benefits_label)
	_vip_trial_button = Button.new()
	_vip_trial_button.text = "START VIP TRIAL"
	_vip_trial_button.custom_minimum_size = Vector2(0.0, 42.0)
	_vip_trial_button.pressed.connect(_on_vip_trial_requested)
	content.add_child(_vip_trial_button)
	_vip_extend_button = Button.new()
	_vip_extend_button.text = "EXTEND VIP"
	_vip_extend_button.custom_minimum_size = Vector2(0.0, 42.0)
	_vip_extend_button.pressed.connect(_on_vip_purchase_requested)
	content.add_child(_vip_extend_button)


func _build_account_status_panel() -> void:
	_account_status_panel = PanelContainer.new()
	_account_status_panel.name = "AccountStatusPanel"
	_account_status_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_account_status_panel.offset_left = -360.0
	_account_status_panel.offset_top = 12.0
	_account_status_panel.offset_right = -12.0
	_account_status_panel.offset_bottom = 58.0
	top_hud.add_child(_account_status_panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_account_status_panel.add_child(margin)
	_account_status_label = Label.new()
	_account_status_label.text = "VIP INACTIVE // GRAV 100%"
	_account_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	margin.add_child(_account_status_label)


func _create_progression_profile_widget() -> void:
	if _progression_scroll_content == null:
		return
	if _profile_widget != null and is_instance_valid(_profile_widget):
		_profile_widget.visible = _progression_panel != null and _progression_panel.visible
		return
	_profile_widget = ProfileAvatarWidget.new()
	_profile_widget.name = "ProfileAvatarWidget"
	_profile_widget.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_profile_widget.position = Vector2(18.0, 22.0)
	_progression_scroll_content.add_child(_profile_widget)
	_profile_widget.visible = _progression_panel != null and _progression_panel.visible
	_profile_widget.upgrade_pressed.connect(_on_profile_upgrade_pressed)
	_profile_widget.vip_purchase_requested.connect(_on_vip_purchase_requested)
	_profile_widget.vip_trial_requested.connect(_on_vip_trial_requested)
	if _menu_font != null:
		_apply_specific_font(_profile_widget, _menu_font)


func _ensure_progression_widget_ready() -> void:
	if _progression_scroll_content == null:
		return
	if _profile_widget == null or not is_instance_valid(_profile_widget):
		_create_progression_profile_widget()


func _on_profile_upgrade_pressed(upgrade_key: String) -> void:
	game_manager.call("spend_upgrade_point", upgrade_key)


func _on_vip_purchase_requested() -> void:
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("create_vip_checkout"):
		return
	backend_service.call("create_vip_checkout")
	hint_label.text = "OPENING VIP CHECKOUT"
	_helper_override_time = 2.0
	_show_helper_hint()


func _on_vip_trial_requested() -> void:
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("start_vip_trial"):
		return
	backend_service.call("start_vip_trial")
	hint_label.text = "STARTING VIP TRIAL"
	_helper_override_time = 2.0
	_show_helper_hint()


func _update_admin_panel(delta: float) -> void:
	if _admin_panel == null or not _admin_panel.visible:
		return
	if not _is_local_admin():
		_set_admin_panel_open(false)
		return
	_admin_snapshot_request_timer = max(_admin_snapshot_request_timer - delta, 0.0)
	if _admin_snapshot_request_timer <= 0.0:
		_request_admin_snapshot()
		_admin_snapshot_request_timer = 1.2
	_admin_refresh_timer = max(_admin_refresh_timer - delta, 0.0)
	if _admin_refresh_timer > 0.0:
		return
	_admin_refresh_timer = ADMIN_PANEL_REFRESH_INTERVAL
	_refresh_admin_panel_content()


func _update_vip_panel() -> void:
	if _vip_panel == null or not _vip_panel.visible:
		return
	_refresh_vip_panel_content()


func _on_profile_avatar_ready(steam_id: String, texture: Texture2D) -> void:
	if _profile_widget and steam_id == _profile_view_steam_id:
		_profile_widget.set_avatar_texture(texture)
	if _mini_profile_widget:
		var my_progression: Dictionary = game_manager.call("get_progression", multiplayer.get_unique_id()) if multiplayer.multiplayer_peer != null and game_manager.has_method("get_progression") else {}
		if steam_id == str(my_progression.get("steam_id", "")):
			_mini_profile_widget.set_avatar_texture(texture)


func _configure_bottom_hud_geometry() -> void:
	left_panel.pivot_offset = Vector2(0.0, left_panel.size.y)
	right_panel.pivot_offset = Vector2(right_panel.size.x, right_panel.size.y)
	if _mini_profile_widget:
		_mini_profile_widget.pivot_offset = _mini_profile_widget.size * 0.5


func _on_local_player_health_changed(current_health: float, max_health: float) -> void:
	health_bar.max_value = max_health
	_target_health = current_health
	if absf(_display_health - current_health) > max_health:
		_display_health = current_health
	health_label.text = "%03d" % int(round(current_health))


func _on_local_player_stamina_changed(current_stamina: float, max_stamina: float, exhausted: bool) -> void:
	stamina_bar.max_value = max_stamina
	_target_stamina = current_stamina
	_stamina_exhausted = exhausted
	if absf(_display_stamina - current_stamina) > max_stamina:
		_display_stamina = current_stamina
	stamina_label.text = "%03d" % int(round(current_stamina))
	stamina_label.modulate = _stamina_base_color()


func _on_local_player_double_jump_charge_changed(current_charge: float, max_charge: float, is_ready: bool) -> void:
	double_jump_bar.max_value = max_charge
	_target_double_jump_charge = current_charge
	_double_jump_ready = is_ready
	if absf(_display_double_jump_charge - current_charge) > max_charge:
		_display_double_jump_charge = current_charge


func _on_local_player_energy_denied(source: String) -> void:
	_stamina_warning_strength = 1.0
	_helper_override_time = ENERGY_WARNING_HINT_TIME
	hint_label.text = _energy_warning_text(source)
	_show_helper_hint()


func _on_local_player_ammo_changed(current_ammo: int, reserve_ammo: int, reloading: bool) -> void:
	ammo_label.text = "%02d / %02d" % [current_ammo, reserve_ammo]
	if reloading:
		ammo_state_label.text = "RELOADING"
		ammo_state_label.modulate = Color(1, 1, 1, 1)
	elif current_ammo <= 0 and reserve_ammo <= 0:
		ammo_state_label.text = "EMPTY"
		ammo_state_label.modulate = Color(1, 0.3, 0.24)
	else:
		ammo_state_label.text = "READY"
		ammo_state_label.modulate = Color(1, 1, 1, 1)


func _on_local_player_weapon_changed(weapon_name: String) -> void:
	weapon_label.text = weapon_name
	weapon_label.modulate = Color(1, 1, 1, 1)
	var is_knife := weapon_name.to_upper() == "KNIFE"
	ammo_label.visible = not is_knife
	ammo_state_label.visible = not is_knife
	if is_knife:
		ammo_label.text = ""
		ammo_state_label.text = ""


func _get_kill_streak_name(kills: int) -> String:
	match kills:
		1: return "First Kill"
		2: return "Double Kill"
		3: return "Triple Kill"
		5: return "Combo King"
		6: return "Ultra Kill"
		10: return "Multi Kill"
		12: return "Dominating"
		14: return "Godlike"
		16: return "Killing Spree"
		18: return "Ludicrous Kill"
		19: return "Mega Kill"
		20: return "Rampage"
		25: return "Monster Kill"
	return ""

func _on_local_player_kill_streak_changed(kills: int) -> void:
	if _kill_streak_indicator != null:
		if kills > 0:
			_kill_streak_indicator.visible = true
			_kill_streak_indicator.call("set_streak", kills)
		else:
			_kill_streak_indicator.visible = false
			
	var ks_name := _get_kill_streak_name(kills)
	if not ks_name.is_empty() and _kill_announcement_label != null:
		var p_name := "Player"
		if game_manager != null and game_manager.players.has(multiplayer.get_unique_id()):
			p_name = str(game_manager.players[multiplayer.get_unique_id()].get("name", "Player"))
		_kill_announcement_text = "%s %s" % [p_name, ks_name]
		_kill_announcement_label.text = _kill_announcement_text
		_kill_announcement_timer = 10.0
		_kill_announcement_label.scale = Vector2(1.6, 1.6)

func _on_local_player_damage_feedback(intensity: float, lethal: bool) -> void:
	_damage_streak = 0
	_damage_flash_strength = max(_damage_flash_strength, intensity if not lethal else 0.9)
	_hit_combo_count = 0
	_hit_combo_timer = 0.0


func _on_local_player_hit_marker(lethal: bool) -> void:
	_hit_marker_strength = 1.0
	_hit_marker_lethal = lethal
	_hit_combo_count += 1
	_hit_combo_timer = 1.35
	var combo_text := "DIRECT HIT"
	if _hit_combo_count >= 2:
		combo_text = "CHAIN x%d" % _hit_combo_count
	if lethal:
		combo_text = "TARGET DOWN"
	_spawn_feedback_popup(
		combo_text,
		Color(0.34, 0.86, 1.0, 1.0),
		Vector2(get_viewport().get_visible_rect().size.x * 0.5 - 90.0, get_viewport().get_visible_rect().size.y * 0.61),
		Vector2(get_viewport().get_visible_rect().size.x * 0.5, get_viewport().get_visible_rect().size.y * 0.53),
		0.9,
		1.08,
		0.7
	)


func _on_local_player_damage_dealt(amount: float, lethal: bool) -> void:
	_damage_streak += 1
	if _damage_streak_label != null:
		_damage_streak_label.text = "DMG STREAK x%d" % _damage_streak
		_damage_streak_label.modulate = Color(1.0, 1.0, 1.0, 0.45) # transparent barely visible white (HP bar color)
		_damage_streak_label.scale = Vector2(1.5, 1.5)
	var center := get_viewport().get_visible_rect().size * 0.5
	var popup_text := "%d DMG" % int(round(amount))
	var popup_color := Color(0.34, 0.86, 1.0, 1.0)
	if lethal:
		popup_text = "FINISHER %d" % int(round(amount))
		popup_color = Color(0.48, 0.94, 1.0, 1.0)
	_spawn_feedback_popup(
		popup_text,
		popup_color,
		center + Vector2(-360.0, 52.0),
		center + Vector2(-260.0, -4.0),
		0.82,
		1.06,
		1.2
	)


func _update_animated_bars(delta: float) -> void:
	_display_health = _approach_bar(_display_health, _target_health, delta, 10.0)
	_display_stamina = _approach_bar(_display_stamina, _target_stamina, delta, 12.0)
	_display_double_jump_charge = _approach_bar(_display_double_jump_charge, _target_double_jump_charge, delta, 5.0)
	health_bar.value = _display_health
	stamina_bar.value = _display_stamina
	double_jump_bar.value = _display_double_jump_charge
	var double_jump_ratio: float = _display_double_jump_charge / max(double_jump_bar.max_value, 0.001)
	double_jump_bar.modulate = Color(1.0, 1.0, 1.0, lerpf(0.52, 1.0, double_jump_ratio))


func _update_motion_visibility(delta: float) -> void:
	var speed_factor: float = _get_motion_factor()
	var top_target: float = 0.0 if _top_hud_hidden else lerpf(1.0, 0.4, speed_factor)
	var bottom_target: float = 1.0
	var crosshair_target: float = lerpf(0.9, 0.6, speed_factor)
	_top_display_alpha = lerpf(_top_display_alpha, top_target, min(delta * PANEL_FADE_SPEED, 1.0))
	_bottom_display_alpha = lerpf(_bottom_display_alpha, bottom_target, min(delta * PANEL_FADE_SPEED, 1.0))
	_crosshair_alpha = lerpf(_crosshair_alpha, crosshair_target, min(delta * PANEL_FADE_SPEED, 1.0))
	top_hud.modulate = Color(1.0, 1.0, 1.0, _top_display_alpha)
	bottom_hud.modulate = Color(1.0, 1.0, 1.0, _bottom_display_alpha)
	crosshair.modulate = Color(1.0, 1.0, 1.0, _crosshair_alpha)
	var hint_tint: Color = Color(1.0, 0.3, 0.24) if _helper_override_time > 0.0 else Color(0.78, 0.85, 0.93)
	hint_label.modulate = Color(hint_tint.r, hint_tint.g, hint_tint.b, _helper_alpha * lerpf(0.9, 0.45, speed_factor))
	if _helper_panel_label != null:
		_helper_panel_label.modulate = hint_label.modulate
	if _helper_panel != null:
		_helper_panel.modulate.a = hint_label.modulate.a
	var blur_material := sprint_blur.material as ShaderMaterial
	if blur_material:
		var sprint_strength: float = _get_sprint_strength()
		var slide_strength: float = _get_slide_strength()
		var zoom_strength: float = _get_zoom_strength()
		var target_blur_strength: float = max(max(sprint_strength * lerpf(0.25, 1.0, speed_factor), slide_strength * 0.72), zoom_strength * 0.42)
		_display_sprint_blur_strength = lerpf(_display_sprint_blur_strength, target_blur_strength, min(delta * 4.0, 1.0))
		_display_zoom_darken_strength = lerpf(_display_zoom_darken_strength, zoom_strength * 0.9, min(delta * 6.0, 1.0))
		blur_material.set_shader_parameter("strength", _display_sprint_blur_strength)
		blur_material.set_shader_parameter("darken_strength", _display_zoom_darken_strength)


func _get_motion_factor() -> float:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return 0.0
	return clamp(Vector2(_pc_velocity.x, _pc_velocity.z).length() / MOTION_FADE_SPEED_REF, 0.0, 1.0)


func _get_sprint_strength() -> float:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return 0.0
	return _pc_sprint


func _get_slide_strength() -> float:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return 0.0
	return _pc_slide


func _get_zoom_strength() -> float:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return 0.0
	return _pc_zoom


func _get_crosshair_spread_strength() -> float:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return 0.12
	return _pc_spread


func _get_crosshair_visible() -> bool:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return true
	var visible_value: Variant = _local_player.get("crosshair_visible")
	if visible_value is bool:
		return visible_value
	return true


func _get_crosshair_dot_visible() -> bool:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		return true
	var dot_value: Variant = _local_player.get("crosshair_dot_visible")
	if dot_value is bool:
		return dot_value
	return true


func _get_crosshair_alpha() -> float:
	if _local_player != null and is_instance_valid(_local_player):
		var alpha_value: Variant = _local_player.get("crosshair_alpha")
		if alpha_value is float or alpha_value is int:
			return clamp(float(alpha_value), 0.0, 1.0)
	return _crosshair_alpha


func _update_crosshair(delta: float) -> void:
	var target_spread: float = _get_crosshair_spread_strength()
	_crosshair_spread_display = lerpf(_crosshair_spread_display, target_spread, min(delta * 11.0, 1.0))
	_apply_crosshair_layout(_crosshair_spread_display)


func _apply_crosshair_layout(spread_strength: float) -> void:
	var player_thickness: float = 2.0
	var player_gap: float = 4.0
	var player_size: float = 6.0
	if _local_player != null and is_instance_valid(_local_player):
		if "crosshair_thickness" in _local_player:
			player_thickness = float(_local_player.get("crosshair_thickness"))
		if "crosshair_gap" in _local_player:
			player_gap = float(_local_player.get("crosshair_gap"))
		if "crosshair_size" in _local_player:
			player_size = float(_local_player.get("crosshair_size"))

	var gap: float = lerpf(player_gap, player_gap + 10.0, spread_strength)
	var arm_length: float = lerpf(player_size, player_size + 3.0, spread_strength)
	var arm_thickness: float = lerpf(player_thickness, player_thickness + 1.0, spread_strength)
	crosshair_top.position = Vector2(12.0 - arm_thickness * 0.5, 12.0 - gap - arm_length)
	crosshair_top.size = Vector2(arm_thickness, arm_length)
	crosshair_bottom.position = Vector2(12.0 - arm_thickness * 0.5, 12.0 + gap)
	crosshair_bottom.size = Vector2(arm_thickness, arm_length)
	crosshair_left.position = Vector2(12.0 - gap - arm_length, 12.0 - arm_thickness * 0.5)
	crosshair_left.size = Vector2(arm_length, arm_thickness)
	crosshair_right.position = Vector2(12.0 + gap, 12.0 - arm_thickness * 0.5)
	crosshair_right.size = Vector2(arm_length, arm_thickness)
	var center_size: float = lerpf(4.0, 2.4, spread_strength)
	crosshair_center_dot.position = Vector2(12.0 - center_size * 0.5, 12.0 - center_size * 0.5)
	crosshair_center_dot.size = Vector2.ONE * center_size
	var arm_color := Color(0.94, 0.98, 1.0, 0.7 + _get_crosshair_alpha() * 0.3)
	var dot_color := Color(0.42, 0.92, 1.0, 0.92)
	if _local_player != null and is_instance_valid(_local_player):
		var player_cross_color: Variant = _local_player.get("crosshair_color")
		if player_cross_color is Color:
			arm_color = Color(player_cross_color.r, player_cross_color.g, player_cross_color.b, 0.7 + _get_crosshair_alpha() * 0.3)
			dot_color = Color(player_cross_color.r, player_cross_color.g, player_cross_color.b, player_cross_color.a)
	if _hit_marker_strength > 0.08:
		dot_color = Color(1.0, 0.5 + 0.25 * float(_hit_marker_lethal), 0.42 + 0.2 * float(_hit_marker_lethal), 0.98)
	crosshair.visible = _get_crosshair_visible() and not _is_scope_active() and not _is_any_zoom_active()
	crosshair_top.color = arm_color
	crosshair_bottom.color = arm_color
	crosshair_left.color = arm_color
	crosshair_right.color = arm_color
	crosshair_center_dot.color = dot_color
	crosshair_center_dot.visible = _get_crosshair_dot_visible()


func _update_helper_fade(delta: float) -> void:
	if _pause_open or int(game_manager.get("state")) == STATE_COUNTDOWN:
		_helper_alpha = 1.0
		_helper_idle_time = 0.0
		return
	if _upgrade_prompt_active and _helper_override_time <= 0.0:
		hint_label.text = _default_helper_text()
		_helper_alpha = 1.0
		_helper_idle_time = 0.0
		return
	_helper_idle_time += delta
	if _helper_idle_time <= HELPER_FADE_DELAY:
		return
	_helper_alpha = max(_helper_alpha - delta * HELPER_FADE_SPEED, HELPER_MIN_ALPHA)


func _update_energy_warning_visuals(delta: float) -> void:
	_stamina_warning_strength = max(_stamina_warning_strength - delta * ENERGY_WARNING_FADE_SPEED, 0.0)
	if _helper_override_time > 0.0:
		_helper_override_time = max(_helper_override_time - delta, 0.0)
		if _helper_override_time <= 0.0:
			_restore_default_helper_text()
	stamina_label.modulate = _stamina_base_color()
	stamina_bar.modulate = Color(1.0, lerpf(1.0, 0.34, _stamina_warning_strength), lerpf(1.0, 0.34, _stamina_warning_strength), 1.0)


func _stamina_base_color() -> Color:
	return Color(0.388235, 0.866667, 1.0, 1.0)



func _energy_warning_text(source: String) -> String:
	match source:
		"slide":
			return "LOW ENERGY // BUILD STAMINA TO SLIDE"
		"bhop":
			return "LOW ENERGY // BHOP COSTS ENERGY"
		"back_jump":
			return "LOW ENERGY // BUILD STAMINA TO BACK JUMP"
		_:
			return "LOW ENERGY // RECOVER BEFORE SPRINTING"


func _show_helper_hint() -> void:
	if hint_label.text.is_empty():
		_restore_default_helper_text()
	_helper_alpha = 1.0
	_helper_idle_time = 0.0
	_sync_helper_panel()


func _spawn_feedback_popup(text: String, color: Color, start_pos: Vector2, end_pos: Vector2, scale_from: float, scale_to: float, lifetime: float) -> void:
	if _feedback_layer == null:
		return
	# Cap the queue to prevent unbounded growth during rapid kill streaks
	const FEEDBACK_POPUP_QUEUE_MAX := 8
	if _feedback_popup_queue.size() >= FEEDBACK_POPUP_QUEUE_MAX:
		_feedback_popup_queue.pop_front()
	_feedback_popup_queue.append({
		"text": text,
		"color": color,
		"start": start_pos,
		"end": end_pos,
		"scale_from": scale_from,
		"scale_to": scale_to,
		"life": lifetime,
	})
	_try_start_next_feedback_popup()


func _try_start_next_feedback_popup() -> void:
	if _feedback_layer == null or _feedback_popup_delay > 0.0 or _feedback_popup_queue.is_empty():
		return
	while _feedback_popups.size() < FEEDBACK_POPUP_MAX_ACTIVE and not _feedback_popup_queue.is_empty():
		var popup: Dictionary = _feedback_popup_queue.pop_front()
		var label := Label.new()
		label.text = str(popup.get("text", ""))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.custom_minimum_size = Vector2(220.0, 34.0)
		label.size = label.custom_minimum_size
		if _game_font != null:
			label.add_theme_font_override("font", _game_font)
		var current_streak: int = 0
		var main_hud = get_node_or_null(".")
		if main_hud and "_damage_streak" in main_hud:
			current_streak = main_hud.get("_damage_streak")
		var out_size = 2 + min(current_streak, 6)
		var extra_size = min(current_streak, 8)
		var glow = min(float(current_streak) / 8.0, 1.0)
		var out_color = Color(0.05 + glow * 0.4, 0.06, 0.08 + glow * 0.9, 0.95)
		
		label.add_theme_font_size_override("font_size", 26 + extra_size)
		label.add_theme_constant_override("outline_size", out_size)
		label.add_theme_color_override("font_outline_color", out_color)
		label.add_theme_color_override("font_color", popup.get("color", Color.WHITE))
		var start_pos: Vector2 = popup.get("start", Vector2.ZERO)
		var end_pos: Vector2 = popup.get("end", start_pos)
		var lane_offsets := [-18.0, 16.0, -34.0, 30.0]
		var lane_offset_y: float = lane_offsets[_feedback_popup_lane_cursor % lane_offsets.size()]
		_feedback_popup_lane_cursor += 1
		start_pos.y += lane_offset_y
		end_pos.y += lane_offset_y * 0.72
		label.position = start_pos - label.size * 0.5
		label.pivot_offset = label.size * 0.5
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_feedback_layer.add_child(label)
		_feedback_popups.append({
			"label": label,
			"age": 0.0,
			"life": popup.get("life", 0.8),
			"start": start_pos,
			"end": end_pos,
			"mid": start_pos.lerp(end_pos, 0.6) + Vector2(18.0, -10.0),
			"scale_from": popup.get("scale_from", 1.0),
			"scale_to": popup.get("scale_to", 1.0),
		})
		_feedback_popup_delay = FEEDBACK_POPUP_STAGGER


func _update_feedback_popups(delta: float) -> void:
	_feedback_popup_delay = max(_feedback_popup_delay - delta, 0.0)
	for index in range(_feedback_popups.size() - 1, -1, -1):
		var popup: Dictionary = _feedback_popups[index]
		var label: Label = popup.get("label") as Label
		if not is_instance_valid(label):
			_feedback_popups.remove_at(index)
			continue
		var age: float = float(popup.get("age", 0.0)) + delta
		var life: float = max(float(popup.get("life", 0.8)), 0.01)
		var t := clampf(age / life, 0.0, 1.0)
		var eased := 1.0 - pow(1.0 - t, 3.0)
		var start_pos: Vector2 = popup.get("start", Vector2.ZERO)
		var mid_pos: Vector2 = popup.get("mid", start_pos)
		var end_pos: Vector2 = popup.get("end", start_pos)
		var first_leg_t: float = clampf(t / 0.55, 0.0, 1.0)
		var second_leg_t: float = clampf((t - 0.55) / 0.45, 0.0, 1.0)
		var current_pos: Vector2 = start_pos.lerp(mid_pos, 1.0 - pow(1.0 - first_leg_t, 3.0))
		if t > 0.55:
			current_pos = mid_pos.lerp(end_pos, 1.0 - pow(1.0 - second_leg_t, 2.0))
		label.position = current_pos - label.size * 0.5
		var scale_from: float = float(popup.get("scale_from", 1.0))
		var scale_to: float = float(popup.get("scale_to", 1.0))
		label.scale = Vector2.ONE * lerpf(scale_from, scale_to, eased)
		label.modulate.a = 0.58 * (1.0 - smoothstep(0.7, 1.0, t))
		popup["age"] = age
		_feedback_popups[index] = popup
		if age >= life:
			label.queue_free()
			_feedback_popups.remove_at(index)
	if _feedback_popups.size() < FEEDBACK_POPUP_MAX_ACTIVE:
		_try_start_next_feedback_popup()


func _on_xp_gained(peer_id: int, amount: int) -> void:
	if multiplayer.multiplayer_peer == null or peer_id != multiplayer.get_unique_id():
		return
	var center := get_viewport().get_visible_rect().size * 0.5
	_spawn_feedback_popup(
		"XP +%d" % amount,
		Color(0.95, 0.2, 0.2, 1.0),
		center + Vector2(-112.0, 84.0),
		center + Vector2(0.0, 12.0),
		0.84,
		1.06,
		1.15
	)


func _on_level_up(peer_id: int, new_level: int) -> void:
	if multiplayer.multiplayer_peer == null or peer_id != multiplayer.get_unique_id():
		return
	var center := get_viewport().get_visible_rect().size * 0.5
	_spawn_feedback_popup(
		"LEVEL UP // %d" % new_level,
		Color(1.0, 0.34, 0.34, 1.0),
		center + Vector2(-118.0, 36.0),
		center + Vector2(0.0, -26.0),
		0.92,
		1.16,
		1.2
	)
	hint_label.text = "UPGRADE READY // PRESS X"
	_helper_override_time = 2.8
	_show_helper_hint()


func _on_map_red_light_state_changed(active: bool) -> void:
	if _pause_open or int(game_manager.get("state")) != STATE_PLAYING:
		return
	var center := get_viewport().get_visible_rect().size * 0.5
	if active:
		_spawn_feedback_popup(
			"RED LIGHT",
			Color(1.0, 0.34, 0.3, 1.0),
			center + Vector2(-124.0, -58.0),
			center + Vector2(0.0, -104.0),
			1.02,
			1.18,
			0.88
		)
		hint_label.text = "FREEZE // RED LIGHT"
		_helper_override_time = 1.4
		_trap_flash_color = Color(1.0, 0.22, 0.16, 1.0)
		_trap_flash_strength = max(_trap_flash_strength, 1.0)
	else:
		_spawn_feedback_popup(
			"GREEN LIGHT",
			Color(0.56, 1.0, 0.68, 1.0),
			center + Vector2(-124.0, -48.0),
			center + Vector2(0.0, -92.0),
			0.98,
			1.1,
			0.72
		)
		hint_label.text = "MOVE // GREEN LIGHT"
		_helper_override_time = 0.95
		_trap_flash_color = Color(0.4, 1.0, 0.58, 1.0)
		_trap_flash_strength = max(_trap_flash_strength, 0.62)
	_show_helper_hint()


func _on_map_bug_swarm_released(owner_peer_id: int, total_bugs: int) -> void:
	if _pause_open or int(game_manager.get("state")) != STATE_PLAYING:
		return
	var center := get_viewport().get_visible_rect().size * 0.5
	var is_trapper: bool = multiplayer.multiplayer_peer != null and owner_peer_id == multiplayer.get_unique_id()
	var popup_text: String = "SWARM RELEASED" if is_trapper else "BUG SWARM x%d" % total_bugs
	var popup_color: Color = Color(1.0, 0.72, 0.34, 1.0) if is_trapper else Color(1.0, 0.5, 0.32, 1.0)
	_spawn_feedback_popup(
		popup_text,
		popup_color,
		center + Vector2(-118.0, -8.0),
		center + Vector2(0.0, -54.0),
		0.96,
		1.1,
		0.94
	)
	hint_label.text = "BUG SWARM // KEEP RUNNING"
	_helper_override_time = 1.2
	_trap_flash_color = Color(1.0, 0.54, 0.22, 1.0)
	_trap_flash_strength = max(_trap_flash_strength, 0.72)
	_show_helper_hint()


func _update_hit_marker(delta: float) -> void:
	_hit_marker_strength = max(_hit_marker_strength - delta * 3.6, 0.0)
	var alpha: float = _hit_marker_strength * 0.95
	if _hit_marker_lethal:
		hit_marker.modulate = Color(1.0, 0.72, 0.42, alpha)
	else:
		hit_marker.modulate = Color(0.94, 0.98, 1.0, alpha)
	var scale_amount: float = 1.0 + _hit_marker_strength * 0.18
	hit_marker.scale = Vector2.ONE * scale_amount


func _update_panel_fx(delta: float) -> void:
	_fx_time += delta
	_pulse_canvas_item(role_label, 0.0, 0.88, 1.06)
	_pulse_canvas_item(timer_label, 0.35, 0.92, 1.08)
	_pulse_canvas_item(player_label, 0.9, 0.86, 1.04)
	_pulse_canvas_item(health_label, 0.2, 0.92, 1.08)
	_pulse_canvas_item(stamina_label, 0.7, 0.9, 1.1)
	_pulse_canvas_item(weapon_label, 1.15, 0.9, 1.06)
	_pulse_canvas_item(ammo_label, 1.5, 0.92, 1.1)
	_pulse_canvas_item(ammo_state_label, 1.8, 0.84, 1.02)
	_pulse_canvas_item(health_bar, 0.1, 0.94, 1.06)
	_pulse_canvas_item(stamina_bar, 0.8, 0.94, 1.08)
	if run_hint_panel.visible:
		_pulse_canvas_item(run_hint_title, 0.5, 0.92, 1.04)
		_pulse_canvas_item(run_hint_body, 0.9, 0.9, 1.02)
	if wall_slide_indicator.visible:
		_pulse_canvas_item(wall_slide_time_label, 1.25, 0.92, 1.06)
		_pulse_canvas_item(wall_slide_title_label, 1.55, 0.84, 1.0)
	if bhop_lockout_indicator.visible:
		_pulse_canvas_item(bhop_lockout_time_label, 2.15, 0.92, 1.06)
		_pulse_canvas_item(bhop_lockout_title_label, 2.55, 0.84, 1.0)
	if back_jump_indicator.visible:
		_pulse_canvas_item(back_jump_time_label, 2.85, 0.92, 1.06)
		_pulse_canvas_item(back_jump_title_label, 3.15, 0.84, 1.0)
	if bug_swarm_indicator.visible:
		_pulse_canvas_item(bug_swarm_time_label, 3.45, 0.92, 1.06)
		_pulse_canvas_item(bug_swarm_title_label, 3.75, 0.84, 1.0)
	if grapple_indicator.visible:
		_pulse_canvas_item(grapple_time_label, 3.45, 0.92, 1.06)
		_pulse_canvas_item(grapple_title_label, 3.75, 0.84, 1.0)
	# _animate_text_shines() # Removed
	_animate_bar_shine(health_bar, health_bar_shine, 94.0, 8.0, 0.16)
	var stamina_ratio := 0.0 if stamina_bar.max_value <= 0.0 else clampf(_display_stamina / stamina_bar.max_value, 0.0, 1.0)
	var electric_pulse := 0.55 + 0.45 * sin(_fx_time * 9.4)
	stamina_bar_shine.color = Color(0.52, 0.96, 1.0, 1.0)
	_animate_bar_shine(stamina_bar, stamina_bar_shine, 182.0 if stamina_ratio >= 0.985 else 108.0, 28.0, 0.44 + 0.22 * electric_pulse if stamina_ratio >= 0.985 else 0.18)
	if stamina_ratio >= 0.985:
		stamina_bar.modulate = Color(0.96 + 0.04 * electric_pulse, 0.98 + 0.02 * electric_pulse, 1.0, 1.0)
	_animate_bar_shine(double_jump_bar, double_jump_bar_shine, 86.0, 14.0, 0.16 if _double_jump_ready else 0.08)


func _update_bhop_lockout_indicator() -> void:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		_hide_cooldown_indicator(bhop_lockout_indicator, bhop_lockout_ring)
		return
	_update_cooldown_indicator(bhop_lockout_indicator, bhop_lockout_ring, bhop_lockout_time_label, _local_player.get("bhop_lockout_time"), _local_player.get("bhop_lockout_total"))


func _update_role_power_indicators() -> void:
	if _pause_open or _local_player == null or not is_instance_valid(_local_player):
		_hide_cooldown_indicator(back_jump_indicator, back_jump_ring)
		_hide_cooldown_indicator(bug_swarm_indicator, bug_swarm_ring)
		_hide_cooldown_indicator(grapple_indicator, grapple_ring)
		_hide_cooldown_indicator(wall_slide_indicator, wall_slide_ring)
		return
	
	_update_cooldown_indicator(grapple_indicator, grapple_ring, grapple_time_label, _local_player.get("grapple_cooldown_time"), _local_player.get("grapple_cooldown_total"))
	
	var is_trapper: bool = bool(game_manager.call("is_trapper"))
	if is_trapper:
		_hide_cooldown_indicator(back_jump_indicator, back_jump_ring)
		_hide_cooldown_indicator(wall_slide_indicator, wall_slide_ring)
		_update_cooldown_indicator(bug_swarm_indicator, bug_swarm_ring, bug_swarm_time_label, _local_player.get("bug_swarm_cooldown_time"), _local_player.get("bug_swarm_cooldown_total"))
		return
	_hide_cooldown_indicator(bug_swarm_indicator, bug_swarm_ring)
	_update_cooldown_indicator(back_jump_indicator, back_jump_ring, back_jump_time_label, _local_player.get("back_jump_cooldown_time"), _local_player.get("back_jump_cooldown_total"))
	_update_cooldown_indicator(wall_slide_indicator, wall_slide_ring, wall_slide_time_label, _local_player.get("wall_run_cooldown_time"), _local_player.get("wall_run_cooldown_total"))


func _hide_cooldown_indicator(indicator: Control, ring: Control) -> void:
	indicator.visible = false
	ring.set("progress", 0.0)


func _update_cooldown_indicator(indicator: Control, ring: Control, time_label: Label, remaining_value: Variant, duration_value: Variant) -> void:
	if not (remaining_value is float or remaining_value is int):
		_hide_cooldown_indicator(indicator, ring)
		return
	var remaining: float = max(float(remaining_value), 0.0)
	if remaining <= 0.0:
		_hide_cooldown_indicator(indicator, ring)
		return
	var duration: float = 1.0
	if duration_value is float or duration_value is int:
		duration = max(float(duration_value), 0.001)
	var progress: float = clamp(remaining / duration, 0.0, 1.0)
	indicator.visible = true
	indicator.modulate = Color(1.0, 1.0, 1.0, lerpf(0.55, 0.98, progress))
	ring.set("progress", progress)
	ring.set("rotation_offset_degrees", _fx_time * BHOP_RING_ROTATION_SPEED)
	time_label.text = str(int(ceili(remaining)))


func _pulse_glow(glow: ColorRect, phase: float, tint: Color) -> void:
	var pulse: float = 0.5 + 0.5 * sin(_fx_time * 2.35 + phase)
	glow.color = Color(tint.r, tint.g, tint.b, 0.08 + pulse * 0.14)


func _pulse_canvas_item(item: CanvasItem, phase: float, min_alpha: float, max_alpha: float) -> void:
	var pulse: float = 0.5 + 0.5 * sin(_fx_time * 2.2 + phase)
	var alpha: float = lerpf(min_alpha, max_alpha, pulse)
	var brightness: float = lerpf(0.96, 1.08, pulse)
	item.self_modulate = Color(brightness, brightness, brightness, alpha)
	if item is Control:
		var control := item as Control
		control.pivot_offset = control.size * 0.5
		control.scale = Vector2.ONE * lerpf(0.994, 1.018, pulse)


func _setup_text_shines() -> void:
	_register_text_shine(role_label, 70.0, 0.0, 0.08)
	_register_text_shine(timer_label, 92.0, 18.0, 0.12)
	_register_text_shine(player_label, 74.0, 34.0, 0.08)
	_register_text_shine(health_label, 88.0, 12.0, 0.11)
	_register_text_shine(stamina_label, 96.0, 28.0, 0.11)
	_register_text_shine(weapon_label, 86.0, 20.0, 0.08)
	_register_text_shine(ammo_label, 102.0, 42.0, 0.12)
	_register_text_shine(ammo_state_label, 82.0, 52.0, 0.08)


func _register_text_shine(label: Control, speed: float, phase: float, alpha: float) -> void:
	label.clip_contents = true
	var shine := ColorRect.new()
	shine.name = "TextShine"
	shine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shine.offset_left = -18.0
	shine.offset_top = -2.0
	shine.offset_right = 0.0
	shine.anchor_bottom = 1.0
	shine.offset_bottom = 2.0
	shine.rotation = -0.18
	shine.color = Color(1.0, 1.0, 1.0, alpha)
	label.add_child(shine)
	_text_shines.append({
		"label": label,
		"shine": shine,
		"speed": speed,
		"phase": phase,
		"alpha": alpha,
	})


func _animate_text_shines() -> void:
	for entry in _text_shines:
		var label: Control = entry["label"] as Control
		var shine: ColorRect = entry["shine"] as ColorRect
		if not is_instance_valid(label) or not is_instance_valid(shine) or label.size.x <= 1.0:
			continue
		var alpha: float = float(entry["alpha"])
		var speed: float = float(entry["speed"])
		var phase: float = float(entry["phase"])
		var travel: float = label.size.x + 40.0
		var shine_offset: float = fposmod(_fx_time * speed + phase, travel)
		shine.position.x = shine_offset - 18.0
		shine.modulate = Color(1.0, 1.0, 1.0, alpha * (0.85 + 0.15 * sin(_fx_time * 1.6 + phase * 0.08)))


func _animate_shine(panel: Control, shine: ColorRect, speed: float, phase: float, alpha: float) -> void:
	if panel.size.x <= 1.0:
		return
	var travel: float = panel.size.x + SHINE_WIDTH + 26.0
	var shine_offset: float = fposmod(_fx_time * speed + phase, travel)
	shine.position.x = shine_offset - SHINE_WIDTH
	shine.modulate = Color(1.0, 1.0, 1.0, alpha)


func _animate_bar_shine(bar: Control, shine: ColorRect, speed: float, phase: float, alpha: float) -> void:
	if bar.size.x <= 1.0:
		return
	var travel: float = bar.size.x + BAR_SHINE_WIDTH + 16.0
	var shine_offset: float = fposmod(_fx_time * speed + phase, travel)
	shine.position.x = shine_offset - BAR_SHINE_WIDTH
	shine.modulate = Color(1.0, 1.0, 1.0, alpha)


func _update_run_hint(delta: float) -> void:
	if _pause_open:
		return
	if not _run_hint_active:
		return
	_run_hint_visible_chars = min(_run_hint_visible_chars + delta * RUN_HINT_TYPE_SPEED, float(RUN_HINT_MESSAGE.length()))
	run_hint_body.text = RUN_HINT_MESSAGE.substr(0, int(_run_hint_visible_chars))


func _start_countdown_tip() -> void:
	_run_hint_seen = true
	_run_hint_active = true
	_run_hint_visible_chars = 0.0
	_run_hint_hold_timer = 0.0
	run_hint_body.text = ""
	_set_run_hint_open(true)


func _set_run_hint_open(active: bool, immediate: bool = false) -> void:
	if _run_hint_tween and _run_hint_tween.is_valid():
		_run_hint_tween.kill()
	var hidden_position := Vector2(320.0, 0.0)
	var shown_position := Vector2.ZERO
	if immediate:
		run_hint_panel.visible = active
		run_hint_panel.position = shown_position if active else hidden_position
		run_hint_panel.modulate = Color(1.0, 1.0, 1.0, 1.0 if active else 0.0)
		return
	if active:
		run_hint_panel.visible = true
		run_hint_panel.position = hidden_position
		run_hint_panel.modulate = Color(1.0, 1.0, 1.0, 0.0)
		_run_hint_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_run_hint_tween.tween_property(run_hint_panel, "position", shown_position, 0.34)
		_run_hint_tween.parallel().tween_property(run_hint_panel, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.28)
		return
	_run_hint_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_run_hint_tween.tween_property(run_hint_panel, "position", hidden_position, 0.28)
	_run_hint_tween.parallel().tween_property(run_hint_panel, "modulate", Color(1.0, 1.0, 1.0, 0.0), 0.22)
	_run_hint_tween.finished.connect(func() -> void:
		if is_instance_valid(run_hint_panel):
			run_hint_panel.visible = false
	)


func _approach_bar(current_value: float, target_value: float, delta: float, speed: float) -> float:
	if absf(current_value - target_value) < 0.05:
		return target_value
	return lerpf(current_value, target_value, min(delta * speed, 1.0))


func _update_damage_flash(delta: float) -> void:
	_damage_flash_strength = max(_damage_flash_strength - delta * 1.5, 0.0)
	_trap_flash_strength = max(_trap_flash_strength - delta * 1.85, 0.0)
	var damage_alpha: float = _damage_flash_strength * 0.32
	var trap_alpha: float = _trap_flash_strength * 0.22
	var flash_alpha: float = max(damage_alpha, trap_alpha)
	var flash_color: Color = Color(1.0, 0.08, 0.08, 1.0) if damage_alpha >= trap_alpha else _trap_flash_color
	damage_flash.color = Color(flash_color.r, flash_color.g, flash_color.b, flash_alpha)


func _toggle_pause_menu(force_open: bool = not _pause_open) -> void:
	_pause_open = force_open
	if _pause_open:
		_set_progression_panel_open(false)
		_set_shop_panel_open(false)
		_set_admin_panel_open(false)
		_set_vip_panel_open(false)
	pause_panel.visible = _pause_open
	_set_main_hud_visible(not _pause_open)
	if _pause_open:
		_set_scoreboard_open(false)
	# keep helper state as-is when toggling pause menu
	if _local_player and is_instance_valid(_local_player):
		_local_player.call("set_menu_open", _pause_open)
	if _pause_open:
		resume_button.grab_focus()
	_sync_mini_profile_visibility()


func _set_main_hud_visible(hud_visible: bool) -> void:
	top_hud.visible = hud_visible
	bottom_hud.visible = hud_visible
	hint_label.visible = false
	run_hint_panel.visible = hud_visible and _run_hint_active
	if _helper_panel != null and not hud_visible and _helper_panel_open:
		_set_helper_panel_open(false, true)
	elif _helper_panel != null and hud_visible:
		_sync_helper_panel()
	if not _is_scope_active() and not _is_any_zoom_active():
		crosshair.visible = hud_visible and _get_crosshair_visible()
	hit_marker.visible = hud_visible
	bhop_lockout_indicator.visible = hud_visible and bhop_lockout_indicator.modulate.a > 0.01
	back_jump_indicator.visible = hud_visible and back_jump_indicator.modulate.a > 0.01
	wall_slide_indicator.visible = hud_visible and wall_slide_indicator.modulate.a > 0.01
	bug_swarm_indicator.visible = hud_visible and bug_swarm_indicator.modulate.a > 0.01
	grapple_indicator.visible = hud_visible and grapple_indicator.modulate.a > 0.01
	if _scope_overlay != null:
		_scope_overlay.visible = hud_visible and _is_scope_active()
	_sync_mini_profile_visibility()


func _toggle_top_hud() -> void:
	_top_hud_hidden = not _top_hud_hidden
	if _top_hud_tween and _top_hud_tween.is_valid():
		_top_hud_tween.kill()
	_top_hud_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	var target_position: Vector2 = Vector2(0.0, -86.0) if _top_hud_hidden else Vector2.ZERO
	_top_hud_tween.tween_property(top_hud, "position", target_position, 0.26)


func _set_scoreboard_open(active: bool) -> void:
	if active:
		_set_admin_panel_open(false)
		_set_vip_panel_open(false)
	_scoreboard_open = active and not _pause_open
	scoreboard_panel.visible = _scoreboard_open
	_scoreboard_refresh_timer = 0.0
	if not _scoreboard_open:
		_scoreboard_profile_peer_id = -1
	if _scoreboard_open:
		_rebuild_scoreboard()
	# show mouse cursor when scoreboard open so player can interact
	if _scoreboard_open:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func _toggle_progression_panel() -> void:
	if _progression_panel == null:
		return
	var now_ms: int = Time.get_ticks_msec()
	if now_ms - _last_progression_toggle_ms < PROGRESSION_TOGGLE_DEBOUNCE_MS:
		return
	_last_progression_toggle_ms = now_ms
	_set_progression_panel_open(not _progression_panel.visible)


func _set_progression_panel_open(active: bool) -> void:
	if active:
		_pause_open = false
		pause_panel.visible = false
		_set_main_hud_visible(true)
		_set_scoreboard_open(false)
		_set_shop_panel_open(false)
		_set_admin_panel_open(false)
		_set_vip_panel_open(false)
		_create_progression_profile_widget()
	_progression_panel.visible = active
	if active:
		_progression_panel.move_to_front()
		if _progression_frame != null:
			_progression_frame.move_to_front()
	if _profile_widget:
		_profile_widget.visible = active
	if active:
		_upgrade_prompt_active = false
		# BLANK-PANEL FIX: always reset scoreboard peer when opening progression panel
		_scoreboard_profile_peer_id = -1
	elif _scoreboard_open:
		_scoreboard_profile_peer_id = -1
	if active:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	if _local_player != null and is_instance_valid(_local_player):
		if _local_player.has_method("set_menu_open"):
			_local_player.call("set_menu_open", _progression_panel.visible or _pause_open or _admin_panel_open or _vip_panel_open)
	_sync_mini_profile_visibility()


func _toggle_admin_panel() -> void:
	_set_admin_panel_open(not _admin_panel_open)


func _set_admin_panel_open(active: bool) -> void:
	if _admin_panel == null:
		return
	if active and not _is_local_admin():
		active = false
	_admin_panel_open = active
	if active:
		_pause_open = false
		pause_panel.visible = false
		_set_main_hud_visible(true)
		_set_scoreboard_open(false)
		_set_progression_panel_open(false)
		_set_shop_panel_open(false)
		_set_vip_panel_open(false)
		_request_admin_snapshot()
		_admin_last_player_count = -1
		_refresh_admin_panel_content()
	_admin_panel.visible = active
	if active:
		_admin_panel.move_to_front()
		if _admin_frame != null:
			_admin_frame.move_to_front()
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
		_admin_refresh_timer = 0.0
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	if _local_player != null and is_instance_valid(_local_player) and _local_player.has_method("set_menu_open"):
		_local_player.call("set_menu_open", _progression_panel.visible or _pause_open or _admin_panel_open or _vip_panel_open)
	_sync_mini_profile_visibility()


func _refresh_admin_panel_content() -> void:
	if _admin_status_label == null or _admin_player_list_box == null:
		return
	var mode_text := "HORDE" if _is_horde_scene_active() else "RUNNER VS TRAPPER"
	var gravity_percent := int(game_manager.call("get_world_gravity_percent")) if game_manager.has_method("get_world_gravity_percent") else 100
	_admin_status_label.text = "ADMIN CONSOLE // %s // PRESS M TO CLOSE" % mode_text
	var players := _players()
	var current_player_count := players.size()
	if _admin_summary_label != null:
		var local_profile: Dictionary = game_manager.call("get_progression", multiplayer.get_unique_id()) as Dictionary if multiplayer.multiplayer_peer != null and game_manager.has_method("get_progression") else {}
		_admin_summary_label.text = "ADMIN SUMMARY // %s // PLAYERS %d // GRAVITY %d%%" % [
			str(local_profile.get("display_name", "ADMIN")),
			current_player_count,
			gravity_percent
		]
	if _admin_world_label != null:
		_admin_world_label.text = "WORLD CONTROL // GRAVITY %d%% // LIVE ON SERVER" % gravity_percent
	# Only do the expensive node rebuild when player count changes
	if current_player_count == _admin_last_player_count:
		return
	_admin_last_player_count = current_player_count
	for child in _admin_player_list_box.get_children():
		child.queue_free()
	var local_id := multiplayer.get_unique_id() if multiplayer.multiplayer_peer != null else -1
	var ids := players.keys()
	ids.sort()
	for id in ids:
		var peer_id := int(id)
		var player_data: Dictionary = players[peer_id]
		var profile_data: Dictionary = game_manager.call("get_progression", peer_id) if game_manager.has_method("get_progression") else {}
		var player_box := VBoxContainer.new()
		player_box.add_theme_constant_override("separation", 6)
		_admin_player_list_box.add_child(player_box)
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_BEGIN
		row.add_theme_constant_override("separation", 8)
		player_box.add_child(row)
		var name_label := Label.new()
		var display_name := str(profile_data.get("display_name", player_data.get("name", "PLAYER")))
		if display_name.is_empty():
			display_name = "PLAYER %d" % peer_id
		var level_text := "LV %d" % int(profile_data.get("level", 1))
		var muted_suffix := " // MUTED" if bool(player_data.get("muted", false)) else ""
		name_label.text = "[%d] %s // %s%s" % [peer_id, display_name, level_text, muted_suffix]
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_label.self_modulate = profile_data.get("name_color", Color(1.0, 1.0, 1.0))
		row.add_child(name_label)
		if peer_id == local_id:
			var self_label := Label.new()
			self_label.text = "SELF"
			row.add_child(self_label)
			continue
		var action_row_a := HBoxContainer.new()
		action_row_a.add_theme_constant_override("separation", 6)
		player_box.add_child(action_row_a)
		action_row_a.add_child(_make_admin_action_button("MUTE" if not bool(player_data.get("muted", false)) else "UNMUTE", func() -> void:
			game_manager.call("admin_toggle_player_mute", peer_id)
			_log_admin_action("mute_toggle", str(profile_data.get("steam_id", "")), display_name, {
				"muted": not bool(player_data.get("muted", false))
			})
			_admin_refresh_timer = 0.0
		))
		action_row_a.add_child(_make_admin_action_button("KICK", func() -> void:
			game_manager.call("admin_kick_player", peer_id)
			_log_admin_action("kick", str(profile_data.get("steam_id", "")), display_name, {})
			_admin_refresh_timer = 0.0
		))
		action_row_a.add_child(_make_admin_action_button("BAN", func() -> void:
			game_manager.call("admin_ban_player", peer_id)
			_persist_admin_ban(str(profile_data.get("steam_id", "")), display_name, _current_ban_reason())
			_admin_refresh_timer = 0.0
		))
		var action_row_b := HBoxContainer.new()
		action_row_b.add_theme_constant_override("separation", 6)
		player_box.add_child(action_row_b)
		action_row_b.add_child(_make_admin_action_button("+100 XP", func() -> void:
			game_manager.call("admin_add_player_xp", peer_id, 100)
			_log_admin_action("grant_xp", str(profile_data.get("steam_id", "")), display_name, {"amount": 100})
			_admin_refresh_timer = 0.0
		))
		action_row_b.add_child(_make_admin_action_button("+1 LVL", func() -> void:
			game_manager.call("admin_add_player_level", peer_id, 1)
			_log_admin_action("grant_level", str(profile_data.get("steam_id", "")), display_name, {"amount": 1})
			_admin_refresh_timer = 0.0
		))
		var is_target_admin := str(profile_data.get("account_role", "normal")).to_lower() == "admin"
		var has_vip := str(profile_data.get("vip_status", "inactive")).to_lower() in ["trial", "active"] or str(profile_data.get("account_role", "normal")).to_lower() == "vip"
		action_row_b.add_child(_make_admin_action_button("VIP OFF" if has_vip else "VIP ON", func() -> void:
			game_manager.call("admin_set_player_vip", peer_id, not has_vip)
			_persist_admin_target_profile(str(profile_data.get("steam_id", "")), {
				"account_role": "normal" if has_vip and not is_target_admin else ("vip" if not has_vip else "admin"),
				"vip_status": "inactive" if has_vip else "active",
				"vip_expires_at": null,
				"vip_last_purchase_source": "admin_remove" if has_vip else "admin_grant",
			})
			_log_admin_action("toggle_vip", str(profile_data.get("steam_id", "")), display_name, {"enabled": not has_vip})
			_admin_refresh_timer = 0.0
		))
		action_row_b.add_child(_make_admin_action_button("ADMIN OFF" if is_target_admin else "ADMIN ON", func() -> void:
			game_manager.call("admin_set_player_admin", peer_id, not is_target_admin)
			_persist_admin_target_profile(str(profile_data.get("steam_id", "")), {
				"account_role": "normal" if is_target_admin and not has_vip else ("admin" if not is_target_admin else "vip"),
				"vip_status": profile_data.get("vip_status", "inactive"),
				"vip_expires_at": profile_data.get("vip_expires_at", null),
				"vip_last_purchase_source": profile_data.get("vip_last_purchase_source", ""),
			})
			_log_admin_action("toggle_admin", str(profile_data.get("steam_id", "")), display_name, {"enabled": not is_target_admin})
			_admin_refresh_timer = 0.0
		))
		var action_row_c := HBoxContainer.new()
		action_row_c.add_theme_constant_override("separation", 6)
		player_box.add_child(action_row_c)
		action_row_c.add_child(_make_admin_action_button("RUNNER", func() -> void:
			game_manager.call("admin_force_player_role", peer_id, "runner")
			_log_admin_action("force_role", str(profile_data.get("steam_id", "")), display_name, {"role": "runner"})
			_admin_refresh_timer = 0.0
		))
		action_row_c.add_child(_make_admin_action_button("TRAPPER", func() -> void:
			game_manager.call("admin_force_player_role", peer_id, "trapper")
			_log_admin_action("force_role", str(profile_data.get("steam_id", "")), display_name, {"role": "trapper"})
			_admin_refresh_timer = 0.0
		))
		action_row_c.add_child(_make_admin_action_button("+7D VIP", func() -> void:
			game_manager.call("admin_extend_player_vip", peer_id, 7)
			_persist_admin_target_profile(str(profile_data.get("steam_id", "")), _build_vip_extension_updates(profile_data, 7))
			_log_admin_action("extend_vip", str(profile_data.get("steam_id", "")), display_name, {"days": 7})
			_admin_refresh_timer = 0.0
		))
		action_row_c.add_child(_make_admin_action_button("+30D VIP", func() -> void:
			game_manager.call("admin_extend_player_vip", peer_id, 30)
			_persist_admin_target_profile(str(profile_data.get("steam_id", "")), _build_vip_extension_updates(profile_data, 30))
			_log_admin_action("extend_vip", str(profile_data.get("steam_id", "")), display_name, {"days": 30})
			_admin_refresh_timer = 0.0
		))
	_refresh_admin_snapshot_lists()


func _make_admin_action_button(text_value: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text_value
	button.custom_minimum_size = Vector2(88.0, 28.0)
	button.pressed.connect(action)
	# Any admin action should force a full panel rebuild on the next refresh tick
	button.pressed.connect(func() -> void: _admin_last_player_count = -1)
	var btn_style := StyleBoxFlat.new()
	btn_style.bg_color = Color(0.12, 0.2, 0.32, 0.7)
	btn_style.border_width_left = 1
	btn_style.border_width_top = 1
	btn_style.border_width_right = 1
	btn_style.border_width_bottom = 1
	btn_style.border_color = Color(0.4, 0.65, 0.95, 0.6)
	btn_style.corner_radius_top_left = 3
	btn_style.corner_radius_top_right = 3
	btn_style.corner_radius_bottom_right = 3
	btn_style.corner_radius_bottom_left = 3
	button.add_theme_stylebox_override("normal", btn_style)
	var hover_style := StyleBoxFlat.new()
	hover_style.bg_color = Color(0.16, 0.28, 0.45, 0.85)
	hover_style.border_width_left = 1
	hover_style.border_width_top = 1
	hover_style.border_width_right = 1
	hover_style.border_width_bottom = 1
	hover_style.border_color = Color(0.6, 0.85, 1.0, 0.8)
	hover_style.corner_radius_top_left = 3
	hover_style.corner_radius_top_right = 3
	hover_style.corner_radius_bottom_right = 3
	hover_style.corner_radius_bottom_left = 3
	button.add_theme_stylebox_override("hover", hover_style)
	button.add_theme_color_override("font_color", Color(0.8, 0.9, 1.0, 1.0))
	button.add_theme_font_size_override("font_size", 10)
	return button


func _request_admin_snapshot() -> void:
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("load_admin_snapshot"):
		return
	backend_service.call("load_admin_snapshot")


func _current_ban_reason() -> String:
	if _admin_ban_reason_input == null:
		return "BANNED FROM ADMIN CONSOLE"
	var reason := _admin_ban_reason_input.text.strip_edges()
	return reason if not reason.is_empty() else "BANNED FROM ADMIN CONSOLE"


func _build_vip_extension_updates(profile_data: Dictionary, extra_days: int) -> Dictionary:
	var days_to_add := maxi(extra_days, 0)
	var now_unix := int(Time.get_unix_time_from_system())
	var current_expiry_unix := 0
	var expiry_value: Variant = profile_data.get("vip_expires_at", null)
	if expiry_value != null and not str(expiry_value).strip_edges().is_empty():
		current_expiry_unix = int(Time.get_unix_time_from_datetime_string(str(expiry_value)))
	var base_unix := maxi(current_expiry_unix, now_unix)
	var extended_unix := base_unix + days_to_add * 86400
	return {
		"account_role": "admin" if str(profile_data.get("account_role", "normal")).to_lower() == "admin" else "vip",
		"vip_status": "active",
		"vip_expires_at": Time.get_datetime_string_from_unix_time(extended_unix, true),
		"vip_last_purchase_source": "admin_extend_%dd" % days_to_add,
	}


func _refresh_admin_snapshot_lists() -> void:
	if _admin_active_bans_box == null or _admin_audit_box == null:
		return
	var backend_service := get_node_or_null("/root/BackendService")
	var snapshot: Dictionary = {}
	if backend_service != null and backend_service.has_method("get_admin_snapshot"):
		snapshot = backend_service.call("get_admin_snapshot") as Dictionary
	var active_bans := snapshot.get("active_bans", []) as Array
	var recent_logs := snapshot.get("recent_logs", []) as Array
	if _admin_snapshot_note_label != null:
		_admin_snapshot_note_label.text = "MODERATION SNAPSHOT // %d ACTIVE BANS // %d LOGS" % [active_bans.size(), recent_logs.size()]
	for child in _admin_active_bans_box.get_children():
		child.queue_free()
	if active_bans.is_empty():
		var empty_bans := Label.new()
		empty_bans.text = "NO ACTIVE PERSISTENT BANS"
		_admin_active_bans_box.add_child(empty_bans)
	else:
		for ban_entry_variant in active_bans:
			if not ban_entry_variant is Dictionary:
				continue
			var ban_entry := ban_entry_variant as Dictionary
			var banned_steam_id := str(ban_entry.get("steam_id", ""))
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 8)
			_admin_active_bans_box.add_child(row)
			var label := Label.new()
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			label.text = "%s // %s" % [
				str(ban_entry.get("steam_name", ban_entry.get("steam_id", "UNKNOWN"))),
				str(ban_entry.get("reason", "NO REASON"))
			]
			row.add_child(label)
			var unban_button := _make_admin_action_button("UNBAN", func() -> void:
				_unban_player_persistently(banned_steam_id)
			)
			row.add_child(unban_button)
	for child in _admin_audit_box.get_children():
		child.queue_free()
	if recent_logs.is_empty():
		var empty_logs := Label.new()
		empty_logs.text = "NO ADMIN ACTIONS LOGGED YET"
		_admin_audit_box.add_child(empty_logs)
	else:
		var log_count := mini(recent_logs.size(), 10)
		for index in range(log_count):
			var log_entry_variant = recent_logs[index]
			if not log_entry_variant is Dictionary:
				continue
			var log_entry := log_entry_variant as Dictionary
			var log_box := VBoxContainer.new()
			log_box.add_theme_constant_override("separation", 2)
			_admin_audit_box.add_child(log_box)
			var log_title := Label.new()
			log_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			log_title.text = "%s // %s -> %s" % [
				str(log_entry.get("action_type", "action")).to_upper(),
				str(log_entry.get("actor_name", "ADMIN")),
				str(log_entry.get("target_name", log_entry.get("target_steam_id", "SERVER")))
			]
			log_box.add_child(log_title)
			var log_detail := Label.new()
			log_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			log_detail.self_modulate = Color(0.8, 0.84, 0.92, 0.9)
			log_detail.text = _format_admin_log_detail(log_entry)
			log_box.add_child(log_detail)


func _unban_player_persistently(target_steam_id: String) -> void:
	if target_steam_id.strip_edges().is_empty():
		return
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("admin_unban_player"):
		return
	backend_service.call("admin_unban_player", target_steam_id)


func _format_admin_log_detail(log_entry: Dictionary) -> String:
	var timestamp_text := _format_admin_log_timestamp(str(log_entry.get("created_at", "")))
	var details: Variant = log_entry.get("details", {})
	var detail_parts: Array[String] = []
	if details is Dictionary:
		for key in (details as Dictionary).keys():
			detail_parts.append("%s=%s" % [str(key), str((details as Dictionary)[key])])
	var detail_text := " // ".join(detail_parts)
	if detail_text.is_empty():
		detail_text = "no extra details"
	return "%s // %s" % [timestamp_text, detail_text]


func _format_admin_log_timestamp(timestamp_text: String) -> String:
	var clean := timestamp_text.strip_edges()
	if clean.is_empty():
		return "time unknown"
	var unix_time := int(Time.get_unix_time_from_datetime_string(clean))
	if unix_time <= 0:
		return clean
	var utc_time := Time.get_datetime_dict_from_unix_time(unix_time)
	return "%04d-%02d-%02d %02d:%02d (UTC)" % [
		int(utc_time.get("year", 0)),
		int(utc_time.get("month", 0)),
		int(utc_time.get("day", 0)),
		int(utc_time.get("hour", 0)),
		int(utc_time.get("minute", 0))
	]


func _persist_admin_target_profile(target_steam_id: String, updates: Dictionary) -> void:
	if target_steam_id.strip_edges().is_empty() or updates.is_empty():
		return
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("admin_update_player"):
		return
	backend_service.call("admin_update_player", target_steam_id, updates)


func _persist_admin_ban(target_steam_id: String, target_name: String, reason: String) -> void:
	if target_steam_id.strip_edges().is_empty():
		return
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("admin_ban_player"):
		return
	backend_service.call("admin_ban_player", target_steam_id, target_name, reason, null)


func _log_admin_action(action_type: String, target_steam_id: String = "", target_name: String = "", details: Dictionary = {}) -> void:
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("admin_log_action"):
		return
	backend_service.call("admin_log_action", action_type, target_steam_id, target_name, details)


func _toggle_vip_panel() -> void:
	_set_vip_panel_open(not _vip_panel_open)


func _set_vip_panel_open(active: bool) -> void:
	if _vip_panel == null:
		return
	_vip_panel_open = active
	if active:
		_pause_open = false
		pause_panel.visible = false
		_set_main_hud_visible(true)
		_set_scoreboard_open(false)
		_set_progression_panel_open(false)
		_set_admin_panel_open(false)
		_set_shop_panel_open(false)
		_refresh_vip_panel_content()
	_vip_panel.visible = active
	if active:
		_vip_panel.move_to_front()
		if _vip_frame != null:
			_vip_frame.move_to_front()
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	if _local_player != null and is_instance_valid(_local_player) and _local_player.has_method("set_menu_open"):
		_local_player.call("set_menu_open", _progression_panel.visible or _pause_open or _admin_panel_open or _vip_panel_open)
	_sync_mini_profile_visibility()


func _refresh_vip_panel_content() -> void:
	if _vip_status_label == null:
		return
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("get_profile"):
		_vip_status_label.text = "VIP ACCESS // BACKEND UNAVAILABLE"
		return
	var profile := backend_service.call("get_profile") as Dictionary
	var role_text := str(profile.get("account_role", "normal")).to_upper()
	var vip_status := str(profile.get("vip_status", "inactive")).to_upper()
	var vip_expires_at: Variant = profile.get("vip_expires_at", null)
	var steam_name := str(profile.get("steam_name", profile.get("name", "PLAYER"))).strip_edges()
	var purchase_source := str(profile.get("vip_last_purchase_source", "")).strip_edges()
	var name_color := _account_color_for_profile(str(profile.get("account_role", "normal")), str(profile.get("vip_status", "inactive")))
	_vip_status_label.text = "VIP ACCESS // ROLE %s // STATUS %s" % [role_text, vip_status]
	_vip_status_label.self_modulate = name_color
	if _vip_name_label != null:
		_vip_name_label.text = "PLAYER // %s" % (steam_name.to_upper() if not steam_name.is_empty() else "UNKNOWN")
		_vip_name_label.self_modulate = name_color
	_vip_timer_label.text = "VIP TIMER // %s" % _format_vip_expiry(vip_status, vip_expires_at)
	var vip_trial_used := bool(profile.get("vip_trial_used", false))
	var can_trial := not vip_trial_used and vip_status == "INACTIVE"
	_vip_detail_label.text = "FREE TRIAL AVAILABLE // PURPLE NAME + CROWN ACTIVE DURING VIP" if can_trial else "PRESS V TO CLOSE // USE EXTEND VIP TO OPEN CHECKOUT"
	if _vip_source_label != null:
		_vip_source_label.text = "SOURCE // %s" % (purchase_source.to_upper() if not purchase_source.is_empty() else "NONE")
	if _vip_benefits_label != null:
		_vip_benefits_label.text = "BENEFITS // PURPLE NICKNAME // CROWN TAG // PERSISTENT VIP STATE"
	if _vip_trial_button != null:
		_vip_trial_button.disabled = not can_trial
		_vip_trial_button.text = "START VIP TRIAL" if can_trial else "TRIAL USED"
	if _vip_extend_button != null:
		_vip_extend_button.disabled = false
		_vip_extend_button.text = "EXTEND VIP" if vip_status in ["ACTIVE", "TRIAL"] else "ORDER VIP"


func _format_vip_expiry(vip_status: String, vip_expires_at: Variant) -> String:
	if vip_expires_at == null or str(vip_expires_at).is_empty():
		return "ACTIVE UNTIL CANCELED" if vip_status == "ACTIVE" else "NO ACTIVE VIP TIMER"
	var expiry_text := str(vip_expires_at)
	var expiry_unix := int(Time.get_unix_time_from_datetime_string(expiry_text))
	if expiry_unix <= 0:
		return expiry_text
	var remaining_seconds: int = maxi(expiry_unix - int(Time.get_unix_time_from_system()), 0)
	var days := int(remaining_seconds / 86400.0)
	var hours := int((remaining_seconds % 86400) / 3600.0)
	var minutes := int((remaining_seconds % 3600) / 60.0)
	return "%dd %dh %dm LEFT" % [days, hours, minutes]


func _refresh_account_status_hud() -> void:
	if _account_status_label == null:
		return
	var backend_service := get_node_or_null("/root/BackendService")
	if backend_service == null or not backend_service.has_method("get_profile"):
		_account_status_label.text = "PROFILE SYNC // WAITING"
		return
	var profile := backend_service.call("get_profile") as Dictionary
	var vip_status := str(profile.get("vip_status", "inactive")).to_upper()
	var gravity_percent := int(game_manager.call("get_world_gravity_percent")) if game_manager.has_method("get_world_gravity_percent") else 100
	_account_status_label.text = "VIP %s // GRAV %d%%" % [vip_status, gravity_percent]
	var account_color := _account_color_for_profile(str(profile.get("account_role", "normal")), str(profile.get("vip_status", "inactive")))
	_account_status_label.self_modulate = account_color


func _account_color_for_profile(account_role: String, vip_status: String) -> Color:
	var normalized_role := account_role.to_lower()
	var normalized_vip := vip_status.to_lower()
	if normalized_role == "admin":
		return Color(1.0, 0.28, 0.28, 1.0)
	if normalized_role == "vip" or normalized_vip in ["trial", "active"]:
		return Color(0.74, 0.48, 1.0, 1.0)
	return Color(0.95, 0.98, 1.0, 1.0)


func _update_scoreboard(delta: float) -> void:
	if not _scoreboard_open:
		return
	_scoreboard_refresh_timer -= delta
	if _scoreboard_refresh_timer > 0.0:
		return
	_scoreboard_refresh_timer = SCOREBOARD_REFRESH_INTERVAL
	_rebuild_scoreboard()


func _update_progression_panel() -> void:
	_ensure_progression_widget_ready()
	if _profile_widget == null or multiplayer.multiplayer_peer == null:
		return
	var my_id := multiplayer.get_unique_id()
	var target_id: int = _scoreboard_profile_peer_id if _scoreboard_profile_peer_id > 0 else my_id
	var progression: Dictionary = {}
	if game_manager.has_method("get_progression"):
		progression = game_manager.call("get_progression", target_id)
	if progression.is_empty():
		return
	var level: int = int(progression.get("level", 1))
	var xp: int = int(progression.get("xp", 0))
	var points: int = int(progression.get("upgrade_points", 0))
	var coins: int = _current_coin_total()
	var next_xp: int = 120
	if game_manager.has_method("get_xp_to_next_level"):
		next_xp = int(game_manager.call("get_xp_to_next_level", level))
	var upgrades: Dictionary = progression.get("upgrades", {})
	var stats: Dictionary = progression.get("stats", {})
	var player_name: String = str(progression.get("name", ""))
	var account_profile := {
		"display_name": progression.get("display_name", player_name),
		"name_color": progression.get("name_color", Color(1.0, 1.0, 1.0, 1.0)),
		"account_role": progression.get("account_role", "normal"),
		"vip_status": progression.get("vip_status", "inactive"),
		"vip_trial_used": progression.get("vip_trial_used", false),
		"vip_expires_at": progression.get("vip_expires_at", null)
	}
	var viewing_self: bool = target_id == my_id
	_profile_widget.set_interactive(viewing_self)
	_profile_widget.set_progression(level, xp, next_xp, points, upgrades, stats, player_name, account_profile)
	if _mini_profile_widget:
		_mini_profile_widget.set_progression(level, xp, next_xp, points, upgrades, {}, player_name, account_profile)
	if _progression_coin_label != null:
		_progression_coin_label.text = "COINS: %d" % coins
	if _progression_shop_button != null:
		_progression_shop_button.visible = _is_horde_scene_active()
		_progression_shop_button.disabled = false
		_progression_shop_button.text = "OPEN HORDE SHOP" if _is_horde_shop_available() else "SHOP CLOSED"
		_progression_shop_button.tooltip_text = "Shop opens during warmup and between waves." if not _is_horde_shop_available() else "Open the horde buy menu."
		_progression_shop_button.move_to_front()

	# detect level up and show helper text only when player levels up
	if _last_progression_level == -1:
		_last_progression_level = level
		_last_upgrade_points = points
	elif level > _last_progression_level:
		_last_progression_level = level
	if _last_upgrade_points != -1 and points > _last_upgrade_points:
		hint_label.text = "+ UPGRADE READY // PRESS X"
		_helper_override_time = 2.6
		_show_helper_hint()
	_last_upgrade_points = points
	if points > 0 and not _progression_panel.visible and _helper_override_time <= 0.0:
		_upgrade_prompt_active = true
		hint_label.text = "+ UPGRADE READY // PRESS X"
		_show_helper_hint()
	elif points <= 0:
		_upgrade_prompt_active = false
	var steam_id: String = str(progression.get("steam_id", ""))
	if steam_id.is_empty():
		return
	_profile_view_steam_id = steam_id
	_pending_steam_id = steam_id if viewing_self else _pending_steam_id
	if _profile_service and _profile_service.has_method("request_avatar"):
		var cached = _profile_service.call("get_cached_avatar", steam_id)
		if cached is Texture2D:
			_profile_widget.set_avatar_texture(cached)
			if _mini_profile_widget and viewing_self:
				_mini_profile_widget.set_avatar_texture(cached)
		else:
			_profile_service.call("request_avatar", steam_id)


func _rebuild_scoreboard() -> void:
	for child in scoreboard_rows.get_children():
		child.queue_free()
	var players := _players()
	var ids: Array = players.keys()
	ids.sort_custom(func(a: Variant, b: Variant) -> bool:
		var a_data: Dictionary = players.get(a, {}) as Dictionary
		var b_data: Dictionary = players.get(b, {}) as Dictionary
		var a_kills: int = int(a_data.get("kills", 0))
		var b_kills: int = int(b_data.get("kills", 0))
		if a_kills != b_kills:
			return a_kills > b_kills
		var a_finishes: int = int(a_data.get("finishes", 0))
		var b_finishes: int = int(b_data.get("finishes", 0))
		if a_finishes != b_finishes:
			return a_finishes > b_finishes
		var a_deaths: int = int(a_data.get("deaths", 0))
		var b_deaths: int = int(b_data.get("deaths", 0))
		if a_deaths != b_deaths:
			return a_deaths < b_deaths
		return str(a_data.get("name", a)).to_lower() < str(b_data.get("name", b)).to_lower()
	)
	for id in ids:
		var player_data: Dictionary = players.get(id, {}) as Dictionary
		var profile_data: Dictionary = game_manager.call("get_progression", int(id)) if game_manager.has_method("get_progression") else {}
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var local_player_row: bool = multiplayer.multiplayer_peer != null and int(id) == multiplayer.get_unique_id()
		var alive: bool = bool(player_data.get("alive", true))
		row.modulate = Color(1.0, 1.0, 1.0, 1.0 if alive else 0.56)
		scoreboard_rows.add_child(row)
		_add_scoreboard_avatar(row, str(player_data.get("steam_id", "")))
		var player_name: String = str(profile_data.get("display_name", player_data.get("name", "Player")))
		if local_player_row:
			player_name += "  YOU"
		_add_scoreboard_name_cell(row, player_name, int(id), local_player_row, profile_data.get("name_color", Color(0.94, 0.98, 1.0)))
		var role_text: String = "TRP" if int(player_data.get("role", ROLE_RUNNER)) != ROLE_RUNNER else "RUN"
		_add_scoreboard_cell(row, role_text, 46.0, HORIZONTAL_ALIGNMENT_CENTER, Color(1.0, 0.8, 0.72) if role_text == "TRP" else Color(0.76, 0.9, 1.0))
		_add_scoreboard_cell(row, str(int(player_data.get("kills", 0))), 36.0, HORIZONTAL_ALIGNMENT_CENTER, Color(0.95, 0.98, 1.0))
		_add_scoreboard_cell(row, str(int(player_data.get("deaths", 0))), 36.0, HORIZONTAL_ALIGNMENT_CENTER, Color(0.95, 0.98, 1.0))
		_add_scoreboard_cell(row, str(int(player_data.get("finishes", 0))), 36.0, HORIZONTAL_ALIGNMENT_CENTER, Color(0.72, 0.92, 1.0))
		_add_scoreboard_cell(row, "L%d" % int(player_data.get("level", 1)), 42.0, HORIZONTAL_ALIGNMENT_CENTER, Color(1.0, 0.84, 0.54))


func _add_scoreboard_cell(parent: HBoxContainer, text: String, min_width: float, alignment: HorizontalAlignment, color: Color, expand: bool = false) -> void:
	var label := Label.new()
	label.text = text
	label.custom_minimum_size = Vector2(min_width, 0.0)
	label.horizontal_alignment = alignment
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.self_modulate = color
	if _game_font != null:
		label.add_theme_font_override("font", _game_font)
	label.add_theme_font_size_override("font_size", 13)
	if expand:
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(label)


func _add_scoreboard_name_cell(parent: HBoxContainer, text: String, peer_id: int, local_player_row: bool, name_color: Variant = Color(0.94, 0.98, 1.0)) -> void:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(180.0, 0.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.flat = true
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	if _game_font != null:
		button.add_theme_font_override("font", _game_font)
	button.add_theme_font_size_override("font_size", 13)
	var resolved_name_color: Color = name_color if name_color is Color else Color(0.94, 0.98, 1.0)
	button.add_theme_color_override("font_color", resolved_name_color)
	button.add_theme_color_override("font_focus_color", resolved_name_color.lightened(0.15))
	button.add_theme_color_override("font_hover_color", resolved_name_color.lightened(0.15))
	button.tooltip_text = "View your progression" if local_player_row else "View player progression"
	button.pressed.connect(func() -> void:
		_scoreboard_profile_peer_id = peer_id
		_set_progression_panel_open(true)
	)
	parent.add_child(button)


func _apply_game_font(node: Node) -> void:
	if _game_font == null:
		return
	if node is Control:
		(node as Control).add_theme_font_override("font", _game_font)
	for child in node.get_children():
		_apply_game_font(child)


func _apply_specific_font(node: Node, font: Font) -> void:
	if node == null:
		return
	if node is Control:
		(node as Control).add_theme_font_override("font", font)
	for child in node.get_children():
		_apply_specific_font(child, font)


func _setup_pause_menu_scroll() -> void:
	_pause_scroll = ScrollContainer.new()
	_pause_scroll.name = "PauseScroll"
	_pause_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_pause_scroll.clip_contents = true
	_pause_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	pause_panel.add_child(_pause_scroll)
	pause_content_box.reparent(_pause_scroll)
	pause_content_box.set_anchors_preset(Control.PRESET_TOP_LEFT)
	pause_content_box.position = Vector2.ZERO


func _setup_progression_scroll() -> void:
	_progression_scroll = ScrollContainer.new()
	_progression_scroll.name = "ProgressionScroll"
	_progression_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_progression_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_progression_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_progression_scroll.clip_contents = true
	_progression_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_progression_frame.add_child(_progression_scroll)
	_progression_scroll_content = Control.new()
	_progression_scroll_content.name = "ProgressionScrollContent"
	_progression_scroll_content.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_progression_scroll.add_child(_progression_scroll_content)


func _apply_square_panel_styles() -> void:
	var square_style := StyleBoxFlat.new()
	square_style.bg_color = Color(0.027, 0.043, 0.067, 0.92)
	square_style.content_margin_left = 18.0
	square_style.content_margin_top = 16.0
	square_style.content_margin_right = 18.0
	square_style.content_margin_bottom = 16.0
	square_style.border_width_left = 1
	square_style.border_width_top = 1
	square_style.border_width_right = 1
	square_style.border_width_bottom = 1
	square_style.border_color = Color(0.855, 0.914, 0.992, 0.19)
	square_style.shadow_color = Color(0.0, 0.0, 0.0, 0.31)
	square_style.shadow_size = 14
	pause_panel.add_theme_stylebox_override("panel", square_style)
	var progression_overlay_style := StyleBoxFlat.new()
	progression_overlay_style.bg_color = Color(0.006, 0.012, 0.022, 0.72)
	_progression_panel.add_theme_stylebox_override("panel", progression_overlay_style)
	if _admin_panel != null:
		_admin_panel.add_theme_stylebox_override("panel", progression_overlay_style.duplicate())
	if _vip_panel != null:
		_vip_panel.add_theme_stylebox_override("panel", progression_overlay_style.duplicate())
	var progression_style := square_style.duplicate()
	progression_style.bg_color = Color(0.015, 0.024, 0.04, 0.9)
	_progression_frame.add_theme_stylebox_override("panel", progression_style)
	if _admin_frame != null:
		_admin_frame.add_theme_stylebox_override("panel", progression_style.duplicate())
	if _vip_frame != null:
		_vip_frame.add_theme_stylebox_override("panel", progression_style.duplicate())
	_shop_panel.add_theme_stylebox_override("panel", progression_overlay_style.duplicate())
	_shop_frame.add_theme_stylebox_override("panel", progression_style.duplicate())
	var hud_chip_style := StyleBoxEmpty.new()
	if _coin_panel != null:
		_coin_panel.add_theme_stylebox_override("panel", hud_chip_style.duplicate())
	if _wave_status_panel != null:
		_wave_status_panel.add_theme_stylebox_override("panel", hud_chip_style.duplicate())
	if _helper_panel != null:
		_helper_panel.add_theme_stylebox_override("panel", hud_chip_style.duplicate())
	if run_hint_panel != null:
		run_hint_panel.add_theme_stylebox_override("panel", hud_chip_style.duplicate())
	if _account_status_panel != null:
		var account_style := square_style.duplicate()
		account_style.bg_color = Color(0.02, 0.03, 0.06, 0.8)
		account_style.content_margin_left = 10.0
		account_style.content_margin_top = 6.0
		account_style.content_margin_right = 10.0
		account_style.content_margin_bottom = 6.0
		account_style.shadow_size = 10
		_account_status_panel.add_theme_stylebox_override("panel", account_style)


func _apply_menu_font_sizes() -> void:
	pause_title_label.add_theme_font_size_override("font_size", 36)
	pause_dev_label.add_theme_font_size_override("font_size", 24)
	pause_map_label.add_theme_font_size_override("font_size", 16)
	for button in [
		resume_button,
		restart_button,
		swap_team_button,
		lane_narrow_button,
		lane_wide_button,
		pipe_narrow_button,
		pipe_wide_button,
		auto_slower_button,
		auto_faster_button,
		rebuild_map_button,
		load_testmap_button,
		load_demomap_button,
		main_menu_button,
		quit_button,
	]:
		button.add_theme_font_size_override("font_size", 18)
		button.custom_minimum_size.y = max(button.custom_minimum_size.y, 42.0)
	for item_id in _shop_buttons.keys():
		var button := _shop_buttons[item_id] as Button
		if button == null:
			continue
		button.add_theme_font_size_override("font_size", 18)
	if _shop_title_label != null:
		_shop_title_label.add_theme_font_size_override("font_size", 34)
	if _shop_coin_label != null:
		_shop_coin_label.add_theme_font_size_override("font_size", 22)
	if _coin_title_label != null:
		_coin_title_label.add_theme_font_size_override("font_size", 11)
		_coin_title_label.add_theme_color_override("font_color", Color(0.68, 0.83, 0.95, 0.88))
	if _coin_icon_label != null:
		_coin_icon_label.add_theme_font_size_override("font_size", 22)
		_coin_icon_label.add_theme_color_override("font_color", Color(1.0, 0.83, 0.3))
	if _coin_count_label != null:
		_coin_count_label.add_theme_font_size_override("font_size", 26)
	if _wave_status_title_label != null:
		_wave_status_title_label.add_theme_font_size_override("font_size", 11)
		_wave_status_title_label.add_theme_color_override("font_color", Color(0.68, 0.83, 0.95, 0.88))
	if _wave_status_label != null:
		_wave_status_label.add_theme_font_size_override("font_size", 14)
	if _progression_coin_label != null:
		_progression_coin_label.add_theme_font_size_override("font_size", 18)
	if _progression_shop_button != null:
		_progression_shop_button.add_theme_font_size_override("font_size", 16)
	if _admin_status_label != null:
		_admin_status_label.add_theme_font_size_override("font_size", 18)
	if _admin_summary_label != null:
		_admin_summary_label.add_theme_font_size_override("font_size", 14)
	if _admin_world_label != null:
		_admin_world_label.add_theme_font_size_override("font_size", 14)
	if _admin_ban_reason_input != null:
		_admin_ban_reason_input.add_theme_font_size_override("font_size", 14)
	if _admin_snapshot_note_label != null:
		_admin_snapshot_note_label.add_theme_font_size_override("font_size", 13)
	if _vip_status_label != null:
		_vip_status_label.add_theme_font_size_override("font_size", 20)
	if _vip_name_label != null:
		_vip_name_label.add_theme_font_size_override("font_size", 18)
	if _vip_timer_label != null:
		_vip_timer_label.add_theme_font_size_override("font_size", 18)
	if _vip_detail_label != null:
		_vip_detail_label.add_theme_font_size_override("font_size", 16)
	if _vip_source_label != null:
		_vip_source_label.add_theme_font_size_override("font_size", 14)
	if _vip_benefits_label != null:
		_vip_benefits_label.add_theme_font_size_override("font_size", 15)
	if _vip_trial_button != null:
		_vip_trial_button.add_theme_font_size_override("font_size", 16)
	if _vip_extend_button != null:
		_vip_extend_button.add_theme_font_size_override("font_size", 16)
	if _account_status_label != null:
		_account_status_label.add_theme_font_size_override("font_size", 13)


func _update_menu_scroll_layouts() -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	_update_pause_menu_scroll_layout(viewport_size)
	_update_progression_scroll_layout(viewport_size)
	_update_admin_panel_layout(viewport_size)
	_update_vip_panel_layout(viewport_size)


func _update_pause_menu_scroll_layout(viewport_size: Vector2) -> void:
	if _pause_scroll == null:
		return
	var panel_width: float = minf(440.0, maxf(viewport_size.x - 24.0, 280.0))
	var panel_height: float = minf(480.0, maxf(viewport_size.y - 24.0, 260.0))
	pause_panel.offset_left = -panel_width * 0.5
	pause_panel.offset_top = -panel_height * 0.5
	pause_panel.offset_right = panel_width * 0.5
	pause_panel.offset_bottom = panel_height * 0.5
	_pause_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_pause_scroll.offset_left = 14.0
	_pause_scroll.offset_top = 14.0
	_pause_scroll.offset_right = -14.0
	_pause_scroll.offset_bottom = -26.0
	pause_content_box.custom_minimum_size.x = minf(412.0, maxf(panel_width - 28.0, 230.0))


func _update_progression_scroll_layout(viewport_size: Vector2) -> void:
	_ensure_progression_widget_ready()
	if _progression_frame == null or _progression_scroll == null or _progression_scroll_content == null or _profile_widget == null:
		return
	var frame_width: float = minf(860.0, maxf(viewport_size.x - 56.0, 320.0))
	var frame_height: float = minf(760.0, maxf(viewport_size.y - 40.0, 280.0))
	_progression_frame.offset_left = -frame_width * 0.5
	_progression_frame.offset_top = -frame_height * 0.5
	_progression_frame.offset_right = frame_width * 0.5
	_progression_frame.offset_bottom = frame_height * 0.5
	_progression_scroll.offset_left = 16.0
	_progression_scroll.offset_top = 66.0
	_progression_scroll.offset_right = -16.0
	_progression_scroll.offset_bottom = -16.0
	if _progression_coin_label != null:
		_progression_coin_label.position = Vector2(22.0, 18.0)
	if _progression_shop_button != null:
		_progression_shop_button.position = Vector2(frame_width - _progression_shop_button.custom_minimum_size.x - 28.0, 16.0)
	_profile_widget.size = _profile_widget.custom_minimum_size
	var content_width: float = maxf(_profile_widget.custom_minimum_size.x + 36.0, _progression_scroll.size.x)
	_progression_scroll_content.custom_minimum_size = Vector2(content_width, maxf(viewport_size.y, 420.0))
	var target_x: float = 18.0
	_profile_widget.position = Vector2(target_x, 22.0)
	var widget_bottom: float = _profile_widget.position.y + maxf(_profile_widget.size.y, _profile_widget.custom_minimum_size.y)
	_progression_scroll_content.custom_minimum_size.y = maxf(widget_bottom + 120.0, _progression_scroll.size.y + 1.0)
	_progression_scroll_content.size = _progression_scroll_content.custom_minimum_size


func _update_admin_panel_layout(viewport_size: Vector2) -> void:
	if _admin_frame == null or _admin_scroll == null or _admin_scroll_content == null:
		return
	var frame_width: float = minf(920.0, maxf(viewport_size.x - 56.0, 340.0))
	var frame_height: float = minf(720.0, maxf(viewport_size.y - 40.0, 280.0))
	_admin_frame.offset_left = -frame_width * 0.5
	_admin_frame.offset_top = -frame_height * 0.5
	_admin_frame.offset_right = frame_width * 0.5
	_admin_frame.offset_bottom = frame_height * 0.5
	_admin_scroll.offset_left = 16.0
	_admin_scroll.offset_top = 64.0
	_admin_scroll.offset_right = -16.0
	_admin_scroll.offset_bottom = -16.0
	if _admin_status_label != null:
		_admin_status_label.position = Vector2(22.0, 18.0)
	if _admin_summary_label != null:
		_admin_summary_label.position = Vector2(22.0, 42.0)
	_admin_scroll_content.custom_minimum_size = Vector2(maxf(frame_width - 48.0, 280.0), maxf(_admin_scroll.size.y + 1.0, 420.0))


func _update_vip_panel_layout(viewport_size: Vector2) -> void:
	if _vip_frame == null:
		return
	var frame_width: float = minf(560.0, maxf(viewport_size.x - 56.0, 320.0))
	var frame_height: float = minf(460.0, maxf(viewport_size.y - 40.0, 280.0))
	_vip_frame.offset_left = -frame_width * 0.5
	_vip_frame.offset_top = -frame_height * 0.5
	_vip_frame.offset_right = frame_width * 0.5
	_vip_frame.offset_bottom = frame_height * 0.5


func _setup_menu_glitch_targets() -> void:
	_pause_menu_glitch_targets = _collect_label_targets(pause_panel)
	_progression_glitch_targets = _collect_label_targets(_profile_widget)
	_admin_menu_glitch_targets = _collect_label_targets(_admin_frame)
	_vip_menu_glitch_targets = _collect_label_targets(_vip_frame)


func _update_menu_glitch_fx() -> void:
	if _pause_open:
		_apply_glitch_to_targets(_pause_menu_glitch_targets, 0.0, 1.0)
	if _progression_panel != null and _progression_panel.visible:
		if _progression_glitch_targets.is_empty():
			_progression_glitch_targets = _collect_label_targets(_profile_widget)
		_apply_glitch_to_targets(_progression_glitch_targets, 1.8, 0.8)
	if _admin_panel != null and _admin_panel.visible:
		if _admin_menu_glitch_targets.is_empty():
			_admin_menu_glitch_targets = _collect_label_targets(_admin_frame)
		_apply_glitch_to_targets(_admin_menu_glitch_targets, 2.6, 0.7)
	if _vip_panel != null and _vip_panel.visible:
		if _vip_menu_glitch_targets.is_empty():
			_vip_menu_glitch_targets = _collect_label_targets(_vip_frame)
		_apply_glitch_to_targets(_vip_menu_glitch_targets, 3.1, 0.6)


func _apply_glitch_to_targets(targets: Array[Control], phase_offset: float, strength: float) -> void:
	for index in range(targets.size()):
		var target: Control = targets[index]
		if target == null or not is_instance_valid(target) or not target.visible:
			continue
		var phase: float = phase_offset + float(index) * 0.46
		var pulse: float = 0.5 + 0.5 * sin(_fx_time * 6.4 + phase)
		var glitch_gate: float = 0.5 + 0.5 * sin(_fx_time * 22.0 + phase * 1.8)
		var glitch_amount: float = 0.0 if glitch_gate < 0.94 else 0.16 * strength
		target.pivot_offset = target.size * 0.5
		target.scale = Vector2.ONE * lerpf(0.998, 1.012 + glitch_amount * 0.02, pulse)
		target.rotation = sin(_fx_time * 7.2 + phase) * (0.0015 + glitch_amount * 0.009)
		target.self_modulate = Color(
			1.0,
			0.94 + pulse * 0.06 - glitch_amount * 0.06,
			0.97 + pulse * 0.03 - glitch_amount * 0.1,
			0.93 + pulse * 0.06
		)


func _collect_label_targets(root: Node) -> Array[Control]:
	var targets: Array[Control] = []
	if root == null:
		return targets
	for child in root.get_children():
		if child is Label:
			targets.append(child as Control)
		targets.append_array(_collect_label_targets(child))
	return targets


func _handle_menu_scroll_input(key_event: InputEventKey) -> bool:
	var scroll_target: ScrollContainer = null
	if _pause_open:
		scroll_target = _pause_scroll
	elif _progression_panel != null and _progression_panel.visible:
		scroll_target = _progression_scroll
	elif _admin_panel != null and _admin_panel.visible:
		scroll_target = _admin_scroll
	if scroll_target == null:
		return false
	if key_event.keycode == KEY_DOWN or key_event.physical_keycode == KEY_DOWN or key_event.keycode == KEY_PAGEDOWN:
		scroll_target.scroll_vertical += 56
		return true
	if key_event.keycode == KEY_UP or key_event.physical_keycode == KEY_UP or key_event.keycode == KEY_PAGEUP:
		scroll_target.scroll_vertical -= 56
		return true
	return false


func _refresh_ui_copy() -> void:
	run_hint_title.text = "MOVEMENT TIP"
	bhop_lockout_title_label.text = "BHOP"
	back_jump_title_label.text = "BACK JUMP"
	bug_swarm_title_label.text = "BUG SWARM"
	swap_team_button.text = "SWAP ROLE"
	lane_narrow_button.text = "TELEPORT START"
	lane_wide_button.text = "FULL RESTORE"
	pipe_narrow_button.text = "TELEPORT TUNNEL"
	pipe_wide_button.text = "TELEPORT MID"
	auto_slower_button.text = "TELEPORT FINAL"
	auto_faster_button.text = "TRIGGER SWARM"
	release_bugs_button.text = "RELEASE 5 BUGS"
	skip_wave_button.text = "SKIP HORDE WAVE"
	rebuild_map_button.text = "REBUILD MAP"
	load_testmap_button.text = "LOAD TEST COURSE"
	load_demomap_button.text = "LOAD DEMO COURSE"
	main_menu_button.text = "RETURN TO LOBBY"
	quit_button.text = "EXIT GAME"
	_restore_default_helper_text()
	_refresh_mode_copy()


func _add_scoreboard_avatar(parent: HBoxContainer, steam_id: String) -> void:
	if _profile_service == null or not _profile_service.has_method("get_cached_avatar") or steam_id.is_empty():
		return
	var avatar_texture = _profile_service.call("get_cached_avatar", steam_id)
	if not avatar_texture is Texture2D and _profile_service.has_method("request_avatar"):
		_profile_service.call("request_avatar", steam_id)
	if not avatar_texture is Texture2D:
		return
	var avatar := TextureRect.new()
	avatar.custom_minimum_size = Vector2(22.0, 22.0)
	avatar.texture = avatar_texture
	avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var avatar_shader := Shader.new()
	avatar_shader.code = "shader_type canvas_item; void fragment(){ vec2 uv = UV - vec2(0.5); float d = length(uv); vec4 tex = texture(TEXTURE, UV); if(d > 0.5){ tex.a = 0.0; } COLOR = tex; }"
	var avatar_material := ShaderMaterial.new()
	avatar_material.shader = avatar_shader
	avatar.material = avatar_material
	parent.add_child(avatar)


func _on_resume_button_pressed() -> void:
	_toggle_pause_menu(false)


func _on_restart_button_pressed() -> void:
	_toggle_pause_menu(false)
	game_manager.call("debug_restart_round")


func _on_swap_team_button_pressed() -> void:
	_request_team_swap()


func _request_team_swap() -> void:
	if _is_local_admin():
		game_manager.call("admin_toggle_role")
		return
	game_manager.call("debug_toggle_my_role")


func _on_admin_restart_round_pressed() -> void:
	game_manager.call("admin_restart_round")
	_log_admin_action("restart_round")
	_show_admin_hint("ADMIN // RESTART ROUND")


func _on_admin_force_lobby_pressed() -> void:
	game_manager.call("admin_force_lobby")
	_log_admin_action("force_lobby")
	_show_admin_hint("ADMIN // RESET TO LOBBY")


func _on_admin_load_test_map_pressed() -> void:
	game_manager.call("admin_load_map", "res://scenes/maps/test_map.tscn")
	_log_admin_action("load_map", "", "", {"scene": "res://scenes/maps/test_map.tscn"})
	_show_admin_hint("ADMIN // LOAD TEST MAP")


func _on_admin_load_horde_map_pressed() -> void:
	game_manager.call("admin_load_map", "res://scenes/maps/horde_map.tscn")
	_log_admin_action("load_map", "", "", {"scene": "res://scenes/maps/horde_map.tscn"})
	_show_admin_hint("ADMIN // LOAD HORDE MAP")


func _on_admin_load_demo_map_pressed() -> void:
	game_manager.call("admin_load_map", "res://scenes/maps/demo_map.tscn")
	_log_admin_action("load_map", "", "", {"scene": "res://scenes/maps/demo_map.tscn"})
	_show_admin_hint("ADMIN // LOAD DEMO MAP")


func _on_admin_swap_role_pressed() -> void:
	game_manager.call("admin_toggle_role")
	_log_admin_action("swap_admin_role")
	_show_admin_hint("ADMIN // SWAP ROLE")


func _show_admin_hint(text_value: String) -> void:
	hint_label.text = text_value
	_helper_override_time = 1.8
	_show_helper_hint()


func _is_local_admin() -> bool:
	return game_manager != null and game_manager.has_method("is_local_admin") and bool(game_manager.call("is_local_admin"))


func _get_map_root() -> Node:
	var current_scene := get_tree().current_scene
	if current_scene != null and (
		current_scene.has_method("dev_trigger_trap_wave")
		or current_scene.has_method("dev_release_bug_pack")
		or current_scene.has_method("dev_rebuild_map")
	):
		return current_scene
	if _current_map != null and is_instance_valid(_current_map):
		return _current_map
	var test_map := get_tree().root.find_child("TestMap", true, false)
	if test_map != null:
		return test_map
	return get_tree().root.find_child("DemoMap", true, false)


func _invoke_map_debug_action(method_name: String, args: Array = []) -> bool:
	var candidates: Array[Node] = []
	var current_scene := get_tree().current_scene
	if current_scene != null:
		candidates.append(current_scene)
	if _current_map != null and is_instance_valid(_current_map) and not candidates.has(_current_map):
		candidates.append(_current_map)
	var test_map := get_tree().root.find_child("TestMap", true, false)
	if test_map != null and not candidates.has(test_map):
		candidates.append(test_map)
	var demo_map := get_tree().root.find_child("DemoMap", true, false)
	if demo_map != null and not candidates.has(demo_map):
		candidates.append(demo_map)
	for candidate in candidates:
		if candidate == null:
			continue
		if method_name == "dev_release_bug_pack":
			if multiplayer.multiplayer_peer == null or multiplayer.is_server():
				if candidate.has_method("_release_debug_bug_pack"):
					candidate.callv("_release_debug_bug_pack", args)
					return true
			else:
				if candidate.has_method("_server_dev_release_bug_pack"):
					candidate.rpc_id(1, "_server_dev_release_bug_pack", args[0] if not args.is_empty() else 5)
					return true
		elif method_name == "dev_trigger_trap_wave":
			if multiplayer.multiplayer_peer == null or multiplayer.is_server():
				if candidate.has_method("_trigger_trap_wave"):
					candidate.call("_trigger_trap_wave")
					return true
			else:
				if candidate.has_method("_server_dev_trigger_trap_wave"):
					candidate.rpc_id(1, "_server_dev_trigger_trap_wave")
					return true
		elif method_name == "dev_rebuild_map":
			if multiplayer.multiplayer_peer == null or multiplayer.is_server():
				if candidate.has_method("_rebuild_runtime_map"):
					candidate.call("_rebuild_runtime_map")
					return true
		if candidate.has_method(method_name):
			candidate.callv(method_name, args)
			return true
	return false


func _request_debug_teleport(target_pos: Vector3) -> void:
	if _local_player == null or not is_instance_valid(_local_player):
		return
	if _local_player.has_method("debug_request_teleport"):
		_local_player.call("debug_request_teleport", target_pos)
	_toggle_pause_menu(false)


func _on_refill_button_pressed() -> void:
	if _local_player and is_instance_valid(_local_player) and _local_player.has_method("debug_request_restore"):
		_local_player.call("debug_request_restore")
	_toggle_pause_menu(false)


func _on_trigger_trap_wave_button_pressed() -> void:
	_invoke_map_debug_action("dev_trigger_trap_wave")
	_toggle_pause_menu(false)


func _on_release_bugs_button_pressed() -> void:
	_toggle_pause_menu(false)
	# RELEASE-BUGS FIX: always route through _invoke_map_debug_action for horde map
	if _is_horde_scene_active():
		_invoke_map_debug_action("dev_release_bug_pack", [5])
	elif game_manager != null and game_manager.has_method("debug_release_bug_pack"):
		game_manager.call("debug_release_bug_pack", 5)
	else:
		_invoke_map_debug_action("dev_release_bug_pack", [5])


func _on_rebuild_map_button_pressed() -> void:
	_invoke_map_debug_action("dev_rebuild_map")

func _on_skip_wave_button_pressed() -> void:
	_toggle_pause_menu(false)
	# Skip wave is a server-only operation; clients have no authority to end waves
	if multiplayer.multiplayer_peer != null and not multiplayer.is_server():
		return
	var current_scene := get_tree().current_scene
	if current_scene != null and current_scene.has_method("_start_next_wave"):
		var wt = current_scene.get("wave_timer")
		if wt != null and is_instance_valid(wt) and not wt.is_stopped():
			wt.stop()
			wt.timeout.emit()
		else:
			# If a wave is active, kill all bugs to end it
			var bugs = get_tree().get_nodes_in_group("bugs")
			for bug in bugs:
				if bug.has_method("server_apply_damage"):
					bug.server_apply_damage(9999.0, -1)


func _on_load_testmap_button_pressed() -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	game_manager.call("debug_load_map", "res://scenes/maps/test_map.tscn")


func _on_load_demomap_button_pressed() -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	game_manager.call("debug_load_map", "res://scenes/maps/demo_map.tscn")


func _on_main_menu_button_pressed() -> void:
	_toggle_pause_menu(false)
	network_manager.call("disconnect_from_game")
	get_tree().change_scene_to_file(LOBBY_SCENE)


func _on_quit_button_pressed() -> void:
	get_tree().quit()
