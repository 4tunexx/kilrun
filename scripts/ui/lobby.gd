extends Control

# Lobby UI - Host or join a server

@onready var menu_box: VBoxContainer = $VBox
@onready var name_input: LineEdit = $VBox/NameInput
@onready var address_input: LineEdit = $VBox/AddressInput
@onready var status_label: Label = $VBox/StatusLabel
@onready var host_btn: Button = $VBox/HostBtn
@onready var join_btn: Button = $VBox/JoinBtn
@onready var horde_btn: Button = $VBox/HordeBtn
@onready var vmf_btn: Button = $VBox/VmfBtn
@onready var start_btn: Button = $VBox/StartBtn
@onready var game_manager: Node = get_node("/root/GameManager")
@onready var network_manager: Node = get_node("/root/NetworkManager")
@onready var steam_service: Node = get_node_or_null("/root/SteamService")
@onready var backend_service: Node = get_node_or_null("/root/BackendService")

const TEST_MAP_SCENE := "res://scenes/maps/test_map.tscn"
const HORDE_MAP_SCENE := "res://scenes/maps/horde_map.tscn"
const DDD_MAP_SCENE := "res://scenes/maps/ddd_map.tscn"
const GAME_FONT_PATH := "res://font/Viper/ViperCommandTitle-R9jmM.otf"

var _bg_root: Control
var _grid_lines: Array[Line2D] = []
var _fly_time: float = 0.0
var auth_status_label: Label
var steam_login_btn: Button
var _game_font: FontFile
var _menu_glitch_targets: Array[Control] = []
var _menu_backing: PanelContainer
var _menu_scroll: ScrollContainer

var _verify_box: HBoxContainer
var _code_input: LineEdit
var _verify_code_btn: Button
var _verification_code: String = ""
var _target_email: String = ""
var _email_form_box: VBoxContainer
var _email_status_box: VBoxContainer
var _email_confirmed_lbl: Label
var _change_email_btn: Button

var _loading_overlay: PanelContainer = null
var _loading_spinner: Control = null
var _loading_label: Label = null
var _loading_sublabel: Label = null
var _startup_loading_done: bool = false


func _players() -> Dictionary:
	return game_manager.get("players") as Dictionary


func _player_name() -> String:
	return str(network_manager.get("player_name"))


func _ready() -> void:
	_build_menu_background()
	_game_font = game_manager.call("load_font_from_file", GAME_FONT_PATH) as FontFile
	_style_menu()
	auth_status_label = Label.new()
	auth_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	auth_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	auth_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	auth_status_label.custom_minimum_size.y = 56.0
	menu_box.add_child(auth_status_label)
	menu_box.move_child(auth_status_label, 2)
	
	# Add STEAM LOGIN button dynamically
	steam_login_btn = Button.new()
	steam_login_btn.name = "SteamLoginBtn"
	steam_login_btn.text = "LOGIN WITH STEAM"
	menu_box.add_child(steam_login_btn)
	_style_button(steam_login_btn)
	menu_box.move_child(steam_login_btn, 3)
	steam_login_btn.pressed.connect(func():
		OS.shell_open("steam://open/main")
		if steam_service != null and steam_service.has_method("retry_init"):
			steam_service.call("retry_init")
	)
	
	_apply_game_font(self)
	_setup_menu_glitch_targets()
	network_manager.connect("server_created", Callable(self, "_on_server_created"))
	network_manager.connect("joined_server", Callable(self, "_on_joined_server"))
	network_manager.connect("connection_failed", Callable(self, "_on_connection_failed"))
	network_manager.connect("player_connected", Callable(self, "_on_player_list_changed"))
	network_manager.connect("player_disconnected", Callable(self, "_on_player_list_changed"))
	if steam_service != null and steam_service.has_signal("auth_state_changed"):
		steam_service.connect("auth_state_changed", Callable(self, "_refresh_auth_ui"))
	if backend_service != null and backend_service.has_signal("state_changed"):
		backend_service.connect("state_changed", Callable(self, "_refresh_auth_ui"))
	start_btn.visible = false
	name_input.editable = false
	status_label.text = "AUTH CHECK // WAITING FOR STEAM"
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	_show_loading("AUTHENTICATING VIA STEAM", "Initializing cognitive interface...")
	get_tree().create_timer(1.2).timeout.connect(func():
		_startup_loading_done = true
		_refresh_auth_ui()
	)
	_refresh_auth_ui()
	
	# Add SETTINGS button dynamically
	var settings_btn := Button.new()
	settings_btn.name = "SettingsBtn"
	settings_btn.text = "SETTINGS"
	menu_box.add_child(settings_btn)
	_style_button(settings_btn)
	settings_btn.pressed.connect(func(): _show_settings_panel(true))
	_build_settings_panel()

	# Add EXIT button dynamically
	var exit_btn := Button.new()
	exit_btn.name = "ExitBtn"
	exit_btn.text = "EXIT"
	menu_box.add_child(exit_btn)
	_style_button(exit_btn)
	exit_btn.pressed.connect(func(): get_tree().quit())

	if DisplayServer.get_name() == "headless":
		get_tree().create_timer(3.0).timeout.connect(func():
			print("Headless mode detected: Creating server and loading Horde Mode...")
			network_manager.call("create_server")
			get_tree().create_timer(1.5).timeout.connect(func():
				rpc("_load_map", HORDE_MAP_SCENE)
				_load_map(HORDE_MAP_SCENE)
				get_tree().create_timer(2.0).timeout.connect(func():
					var players_list = get_tree().get_nodes_in_group("player")
					if players_list.size() > 0:
						var player = players_list[0]
						var ap = player.get_node_or_null("WorldModel/AnimationPlayer")
						if ap:
							var anim = ap.get_animation("run")
							if anim:
								print("Headless active play run check - Run Animation Bip01 Position Track:")
								for i in range(anim.get_track_count()):
									var path = anim.track_get_path(i)
									if str(path).ends_with(":Bip01"):
										var keys = anim.track_get_key_count(i)
										print("Track %d keys: %d" % [i, keys])
										if keys > 0:
											print("  Key 0: ", anim.track_get_key_value(i, 0))
											print("  Last Key: ", anim.track_get_key_value(i, keys - 1))
				)
			)
		)

	# Move both before the status label
	menu_box.move_child(settings_btn, menu_box.get_child_count() - 3)
	menu_box.move_child(exit_btn, menu_box.get_child_count() - 2)


func _process(delta: float) -> void:
	_fly_time += delta
	_update_menu_background()
	_update_menu_layout()
	_update_menu_glitch_fx()


func _on_host_btn_pressed() -> void:
	if not _can_start_session():
		_refresh_auth_ui()
		return
	_show_loading("creating lobby", "initializing multiplayer node...")
	network_manager.call("refresh_local_identity")
	network_manager.call("create_server")


func _on_join_btn_pressed() -> void:
	if not _can_start_session():
		_refresh_auth_ui()
		return
	var address := address_input.text.strip_edges()
	if address.is_empty():
		address = "127.0.0.1"
	_show_loading("connecting to lobby", "handshaking with server at " + address + "...")
	network_manager.call("refresh_local_identity")
	network_manager.call("join_server", address)


func _on_server_created() -> void:
	status_label.text = "MATCH LIVE // PLAYERS: 1"
	host_btn.disabled = true
	join_btn.disabled = true
	start_btn.visible = true
	horde_btn.visible = true
	vmf_btn.visible = true
	_hide_loading()


func _on_joined_server() -> void:
	status_label.text = "CONNECTED // WAITING FOR HOST"
	host_btn.disabled = true
	join_btn.disabled = true
	_hide_loading()


func _on_connection_failed() -> void:
	_hide_loading()
	if not _can_start_session():
		status_label.text = "STEAM REQUIRED // PROFILE NOT READY"
		return
	status_label.text = "CONNECTION FAILED // CHECK ADDRESS"


func _on_player_list_changed(_peer_id: int) -> void:
	GameManager.call("play_effect", "Notification-bell-delayed-ding")
	var count: int = _players().size()
	if multiplayer.is_server():
		status_label.text = "MATCH LIVE // PLAYERS: %d" % count
	else:
		status_label.text = "CONNECTED // PLAYERS: %d" % count


func _on_start_btn_pressed() -> void:
	if not multiplayer.is_server():
		return
	# Load map on server and all clients
	rpc("_load_map", TEST_MAP_SCENE)
	_load_map(TEST_MAP_SCENE)

func _on_horde_btn_pressed() -> void:
	if not multiplayer.is_server():
		return
	rpc("_load_map", HORDE_MAP_SCENE)
	_load_map(HORDE_MAP_SCENE)

func _on_vmf_btn_pressed() -> void:
	if not multiplayer.is_server():
		return
	rpc("_load_map", DDD_MAP_SCENE)
	_load_map(DDD_MAP_SCENE)

@rpc("authority", "call_remote", "reliable")
func _load_map(map_path: String = TEST_MAP_SCENE) -> void:
	_show_loading("loading sector", "deploying assets and initializing level data...")
	var tree: SceneTree = get_tree()
	var local_multiplayer: MultiplayerAPI = multiplayer
	var manager: Node = game_manager
	var should_start_countdown: bool = local_multiplayer != null and local_multiplayer.is_server()
	tree.change_scene_to_file(map_path)
	if should_start_countdown:
		manager.call_deferred("start_countdown_after_scene_load")


func _build_menu_background() -> void:
	_bg_root = Control.new()
	_bg_root.name = "AnimatedMapBackground"
	_bg_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bg_root)
	move_child(_bg_root, 0)

	var base := ColorRect.new()
	base.name = "Base"
	base.set_anchors_preset(Control.PRESET_FULL_RECT)
	base.color = Color(0.012, 0.017, 0.024, 1.0)
	_bg_root.add_child(base)

	for i in range(18):
		var line := Line2D.new()
		line.width = 1.2 if i % 3 != 0 else 2.0
		line.default_color = Color(0.38, 0.62, 0.86, 0.16 if i % 3 != 0 else 0.28)
		_bg_root.add_child(line)
		_grid_lines.append(line)

	for i in range(10):
		var light := ColorRect.new()
		light.name = "RunLight_%d" % i
		light.color = Color(0.9, 0.16, 0.1, 0.14)
		light.custom_minimum_size = Vector2(120.0, 2.0)
		_bg_root.add_child(light)


func _update_menu_background() -> void:
	if _bg_root == null:
		return
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 1.0 or viewport_size.y <= 1.0:
		return
	var center := viewport_size * 0.5 + Vector2(sin(_fly_time * 0.35) * 34.0, -26.0)
	var horizon_y := viewport_size.y * 0.38
	for i in range(_grid_lines.size()):
		var line := _grid_lines[i]
		var lane_offset := float(i - 9) / 9.0
		var sway := sin(_fly_time * 0.9 + float(i) * 0.4) * 18.0
		if i < 9:
			line.points = PackedVector2Array([
				Vector2(center.x + lane_offset * 48.0, horizon_y),
				Vector2(center.x + lane_offset * viewport_size.x * 0.95 + sway, viewport_size.y)
			])
		else:
			var depth := fposmod(_fly_time * 90.0 + float(i) * 64.0, viewport_size.y * 0.68)
			var y := horizon_y + depth
			var span := lerpf(100.0, viewport_size.x * 1.2, depth / max(viewport_size.y * 0.68, 1.0))
			line.points = PackedVector2Array([
				Vector2(center.x - span * 0.5, y),
				Vector2(center.x + span * 0.5, y)
			])
	for child in _bg_root.get_children():
		if child is ColorRect and str(child.name).begins_with("RunLight"):
			var index := int(str(child.name).split("_")[-1])
			var depth := fposmod(_fly_time * 115.0 + float(index) * 92.0, viewport_size.y * 0.72)
			var y := horizon_y + depth
			var side := -1.0 if index % 2 == 0 else 1.0
			var x := center.x + side * lerpf(80.0, viewport_size.x * 0.45, depth / max(viewport_size.y * 0.72, 1.0))
			child.position = Vector2(x - 60.0, y)
			child.size = Vector2(120.0 + depth * 0.35, 2.0)
			child.modulate = Color(1.0, 1.0, 1.0, lerpf(0.18, 0.72, depth / max(viewport_size.y * 0.72, 1.0)))


func _style_menu() -> void:
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.025, 0.038, 0.056, 0.88)
	panel_style.border_color = Color(0.55, 0.76, 1.0, 0.24)
	panel_style.border_width_left = 1
	panel_style.border_width_top = 1
	panel_style.border_width_right = 1
	panel_style.border_width_bottom = 1
	panel_style.corner_radius_top_left = 0
	panel_style.corner_radius_top_right = 0
	panel_style.corner_radius_bottom_left = 0
	panel_style.corner_radius_bottom_right = 0
	var backing := PanelContainer.new()
	backing.name = "MenuBacking"
	backing.mouse_filter = Control.MOUSE_FILTER_IGNORE
	backing.add_theme_stylebox_override("panel", panel_style)
	add_child(backing)
	move_child(backing, 1)
	_menu_backing = backing
	_menu_scroll = ScrollContainer.new()
	_menu_scroll.name = "MenuScroll"
	_menu_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_menu_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_menu_scroll.clip_contents = true
	add_child(_menu_scroll)
	move_child(_menu_scroll, 2)
	menu_box.reparent(_menu_scroll)
	menu_box.set_anchors_preset(Control.PRESET_TOP_LEFT)
	menu_box.position = Vector2.ZERO
	menu_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_box.add_theme_constant_override("separation", 14)
	for child in menu_box.get_children():
		if child is Button:
			_style_button(child as Button)
		elif child is LineEdit:
			_style_input(child as LineEdit)
		elif child is Label:
			(child as Label).self_modulate = Color(0.86, 0.93, 1.0, 1.0)
	(menu_box.get_node("Title") as Label).text = "KILL RUN"
	(menu_box.get_node("Title") as Label).add_theme_font_size_override("font_size", 60)
	(menu_box.get_node("Title") as Label).self_modulate = Color(1.0, 0.94, 0.84, 1.0)
	status_label.add_theme_font_size_override("font_size", 18)
	name_input.placeholder_text = "Steam display name"
	name_input.editable = false
	address_input.placeholder_text = "Server IP // blank = localhost"
	host_btn.text = "HOST MATCH"
	join_btn.text = "JOIN MATCH"
	horde_btn.text = "HORDE MODE"
	start_btn.text = "LAUNCH RUN"
	if auth_status_label != null:
		auth_status_label.add_theme_font_size_override("font_size", 15)
		auth_status_label.self_modulate = Color(0.82, 0.9, 1.0, 0.94)


func _style_button(button: Button) -> void:
	button.custom_minimum_size.y = 54.0
	if _game_font != null:
		button.add_theme_font_override("font", _game_font)
	button.add_theme_font_size_override("font_size", 18)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.09, 0.14, 0.18, 0.94)
	normal.border_color = Color(0.7, 0.9, 1.0, 0.25)
	normal.border_width_left = 1
	normal.border_width_top = 1
	normal.border_width_right = 1
	normal.border_width_bottom = 1
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.16, 0.22, 0.26, 0.98)
	hover.border_color = Color(1.0, 0.56, 0.36, 0.56)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)


func _style_input(input: LineEdit) -> void:
	input.custom_minimum_size.y = 48.0
	if _game_font != null:
		input.add_theme_font_override("font", _game_font)
	input.add_theme_font_size_override("font_size", 17)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.03, 0.043, 0.86)
	style.border_color = Color(0.65, 0.82, 1.0, 0.18)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	input.add_theme_stylebox_override("normal", style)
	input.add_theme_stylebox_override("focus", style)


func _apply_game_font(node: Node) -> void:
	if _game_font == null:
		return
	if node is Control:
		(node as Control).add_theme_font_override("font", _game_font)
	for child in node.get_children():
		_apply_game_font(child)


func _setup_menu_glitch_targets() -> void:
	_menu_glitch_targets = _collect_label_targets(menu_box)


func _update_menu_glitch_fx() -> void:
	for index in range(_menu_glitch_targets.size()):
		var target: Control = _menu_glitch_targets[index]
		if target == null or not is_instance_valid(target) or not target.visible:
			continue
		var phase: float = float(index) * 0.6
		var pulse: float = 0.5 + 0.5 * sin(_fly_time * 6.8 + phase)
		var glitch_gate: float = 0.5 + 0.5 * sin(_fly_time * 23.0 + phase * 1.7)
		var glitch_amount: float = 0.0 if glitch_gate < 0.93 else 0.18
		target.pivot_offset = target.size * 0.5
		target.scale = Vector2.ONE * lerpf(0.996, 1.014 + glitch_amount * 0.02, pulse)
		target.rotation = sin(_fly_time * 8.5 + phase) * (0.002 + glitch_amount * 0.01)
		target.self_modulate = Color(
			1.0,
			0.92 + pulse * 0.08 - glitch_amount * 0.08,
			0.96 + pulse * 0.04 - glitch_amount * 0.14,
			0.92 + pulse * 0.08
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


func _update_menu_layout() -> void:
	if _menu_backing == null or _menu_scroll == null:
		return
	var viewport_size := get_viewport_rect().size
	var panel_width: float = minf(492.0, maxf(viewport_size.x - 24.0, 280.0))
	var panel_height: float = minf(504.0, maxf(viewport_size.y - 24.0, 280.0))
	_menu_backing.set_anchors_preset(Control.PRESET_CENTER)
	_menu_backing.offset_left = -panel_width * 0.5
	_menu_backing.offset_top = -panel_height * 0.5
	_menu_backing.offset_right = panel_width * 0.5
	_menu_backing.offset_bottom = panel_height * 0.5
	_menu_scroll.set_anchors_preset(Control.PRESET_CENTER)
	_menu_scroll.offset_left = -panel_width * 0.5 + 14.0
	_menu_scroll.offset_top = -panel_height * 0.5 + 14.0
	_menu_scroll.offset_right = panel_width * 0.5 - 14.0
	_menu_scroll.offset_bottom = panel_height * 0.5 - 18.0
	menu_box.custom_minimum_size.x = maxf(panel_width - 28.0, 240.0)
	menu_box.size.x = menu_box.custom_minimum_size.x
	if _settings_box != null:
		_settings_box.custom_minimum_size.x = maxf(panel_width - 28.0, 240.0)
		_settings_box.size.x = _settings_box.custom_minimum_size.x


func _refresh_auth_ui() -> void:
	var steam_ready := steam_service != null and steam_service.has_method("is_authenticated") and bool(steam_service.call("is_authenticated"))
	var profile_ready := backend_service != null and backend_service.has_method("is_profile_ready") and bool(backend_service.call("is_profile_ready"))
	var can_start := steam_ready and profile_ready
	
	if steam_login_btn != null:
		steam_login_btn.visible = not steam_ready
		
	var display_name := ""
	if steam_ready and steam_service.has_method("get_display_name"):
		display_name = str(steam_service.call("get_display_name"))
	elif backend_service != null and backend_service.has_method("get_profile"):
		var profile := backend_service.call("get_profile") as Dictionary
		display_name = str(profile.get("steam_name", ""))
	name_input.text = display_name
	var status_lines: Array[String] = []
	if steam_service != null and steam_service.has_method("get_status_text"):
		var steam_status = str(steam_service.call("get_status_text"))
		if not steam_status.is_empty():
			status_lines.append(steam_status)
	if backend_service != null and backend_service.has_method("get_status_text"):
		var backend_status := str(backend_service.call("get_status_text"))
		if not backend_status.is_empty() and not status_lines.has(backend_status):
			status_lines.append(backend_status)
	if auth_status_label != null:
		auth_status_label.text = "\n".join(status_lines)
	if multiplayer.multiplayer_peer == null:
		host_btn.disabled = not can_start
		join_btn.disabled = not can_start
		if can_start:
			status_label.text = "READY // HOST A MATCH OR JOIN A SERVER"
		elif steam_ready:
			status_label.text = "PROFILE SYNC // WAITING FOR SUPABASE"
		else:
			status_label.text = "STEAM REQUIRED // SIGN IN TO CONTINUE"
			
	# Update loading overlay visibility based on auth states
	if not _startup_loading_done:
		return # Enforce minimum loading screen time on startup

	if can_start:
		_hide_loading()
	elif steam_ready:
		_show_loading("database syncing", "establishing connection with supabase database...")
	else:
		_hide_loading()


func _can_start_session() -> bool:
	return steam_service != null \
		and backend_service != null \
		and steam_service.has_method("is_authenticated") \
		and backend_service.has_method("is_profile_ready") \
		and bool(steam_service.call("is_authenticated")) \
		and bool(backend_service.call("is_profile_ready"))


var _settings_box: VBoxContainer
var _music_slider: HSlider
var _sfx_slider: HSlider
var _music_label: Label
var _sfx_label: Label
var _nick_chk: CheckBox
var _nick_input: LineEdit
var _avatar_chk: CheckBox
var _avatar_input: LineEdit
var _email_input: LineEdit
var _pass_input: LineEdit
var _sync_status: Label

func _create_settings_separator(container: VBoxContainer) -> void:
	var sep := ColorRect.new()
	sep.custom_minimum_size.y = 1.0
	sep.color = Color(0.55, 0.76, 1.0, 0.16)
	container.add_child(sep)

func _build_settings_panel() -> void:
	_settings_box = VBoxContainer.new()
	_settings_box.name = "SettingsBox"
	_settings_box.visible = false
	_settings_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_settings_box.add_theme_constant_override("separation", 10)
	
	# Title
	var title_lbl := Label.new()
	title_lbl.text = "SETTINGS"
	title_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_lbl.add_theme_font_size_override("font_size", 24)
	_settings_box.add_child(title_lbl)
	_create_settings_separator(_settings_box)
	
	# Audio Section
	var audio_sec := Label.new()
	audio_sec.text = "AUDIO OPTIONS"
	audio_sec.add_theme_font_size_override("font_size", 16)
	audio_sec.self_modulate = Color(1.0, 0.84, 0.4, 1.0)
	_settings_box.add_child(audio_sec)
	
	var music_hbox := HBoxContainer.new()
	music_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	music_hbox.add_theme_constant_override("separation", 10)
	_music_label = Label.new()
	_music_label.custom_minimum_size.x = 120.0
	_music_slider = HSlider.new()
	_music_slider.min_value = 0
	_music_slider.max_value = 100
	_music_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_music_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	music_hbox.add_child(_music_label)
	music_hbox.add_child(_music_slider)
	_settings_box.add_child(music_hbox)
	
	var sfx_hbox := HBoxContainer.new()
	sfx_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sfx_hbox.add_theme_constant_override("separation", 10)
	_sfx_label = Label.new()
	_sfx_label.custom_minimum_size.x = 120.0
	_sfx_slider = HSlider.new()
	_sfx_slider.min_value = 0
	_sfx_slider.max_value = 100
	_sfx_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sfx_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sfx_hbox.add_child(_sfx_label)
	sfx_hbox.add_child(_sfx_slider)
	_settings_box.add_child(sfx_hbox)
	
	# Custom styling for HSliders
	var slider_style := StyleBoxFlat.new()
	slider_style.bg_color = Color(0.02, 0.03, 0.043, 0.9)
	slider_style.content_margin_top = 4.0
	slider_style.content_margin_bottom = 4.0
	slider_style.border_color = Color(0.55, 0.76, 1.0, 0.16)
	slider_style.border_width_left = 1
	slider_style.border_width_top = 1
	slider_style.border_width_right = 1
	slider_style.border_width_bottom = 1
	
	var grabber_style := StyleBoxFlat.new()
	grabber_style.bg_color = Color(1.0, 0.56, 0.36, 0.8) # Premium Orange Accent
	grabber_style.content_margin_top = 4.0
	grabber_style.content_margin_bottom = 4.0
	
	_music_slider.add_theme_stylebox_override("slider", slider_style)
	_music_slider.add_theme_stylebox_override("grabber_area", grabber_style)
	_music_slider.add_theme_stylebox_override("grabber_area_highlight", grabber_style)
	
	_sfx_slider.add_theme_stylebox_override("slider", slider_style)
	_sfx_slider.add_theme_stylebox_override("grabber_area", grabber_style)
	_sfx_slider.add_theme_stylebox_override("grabber_area_highlight", grabber_style)

	# Connect sliders
	_music_slider.value_changed.connect(func(val):
		_music_label.text = "MUSIC: %d%%" % int(val)
		var settings = game_manager.call("get_settings")
		settings["music_volume"] = val
		game_manager.call("apply_audio_settings")
	)
	_sfx_slider.value_changed.connect(func(val):
		_sfx_label.text = "SFX: %d%%" % int(val)
		var settings = game_manager.call("get_settings")
		settings["sfx_volume"] = val
		game_manager.call("apply_audio_settings")
	)
	
	_create_settings_separator(_settings_box)
	
	# Profile Override Section
	var profile_sec := Label.new()
	profile_sec.text = "PROFILE OVERRIDES"
	profile_sec.add_theme_font_size_override("font_size", 16)
	profile_sec.self_modulate = Color(1.0, 0.84, 0.4, 1.0)
	_settings_box.add_child(profile_sec)
	
	_nick_chk = CheckBox.new()
	_nick_chk.text = "OVERRIDE STEAM NICKNAME"
	_settings_box.add_child(_nick_chk)
	
	_nick_input = LineEdit.new()
	_nick_input.placeholder_text = "ENTER CUSTOM NICKNAME"
	_nick_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_settings_box.add_child(_nick_input)
	_style_input(_nick_input)
	_nick_input.custom_minimum_size.y = 36.0
	_nick_input.add_theme_font_size_override("font_size", 14)
	
	_avatar_chk = CheckBox.new()
	_avatar_chk.text = "USE CUSTOM AVATAR"
	_settings_box.add_child(_avatar_chk)
	
	var avatar_hbox := HBoxContainer.new()
	avatar_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	avatar_hbox.add_theme_constant_override("separation", 10)
	_avatar_input = LineEdit.new()
	_avatar_input.placeholder_text = "AVATAR FILE PATH OR URL"
	_avatar_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var file_btn := Button.new()
	file_btn.text = "BROWSE..."
	file_btn.custom_minimum_size.x = 100.0
	avatar_hbox.add_child(_avatar_input)
	avatar_hbox.add_child(file_btn)
	_settings_box.add_child(avatar_hbox)
	_style_input(_avatar_input)
	_avatar_input.custom_minimum_size.y = 36.0
	_avatar_input.add_theme_font_size_override("font_size", 14)
	_style_button(file_btn)
	file_btn.custom_minimum_size.y = 36.0
	file_btn.add_theme_font_size_override("font_size", 14)
	
	file_btn.pressed.connect(func():
		var file_dialog := FileDialog.new()
		file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
		file_dialog.access = FileDialog.ACCESS_FILESYSTEM
		file_dialog.filters = PackedStringArray(["*.png ; PNG Images", "*.jpg,*.jpeg ; JPEG Images", "*.webp ; WebP Images"])
		file_dialog.file_selected.connect(func(path):
			_avatar_input.text = path
		)
		add_child(file_dialog)
		file_dialog.popup_centered(Vector2i(600, 400))
	)
	
	_create_settings_separator(_settings_box)
	
	# Email Sync Section
	var email_sec := Label.new()
	email_sec.text = "ACCOUNT SYNC"
	email_sec.add_theme_font_size_override("font_size", 16)
	email_sec.self_modulate = Color(1.0, 0.84, 0.4, 1.0)
	_settings_box.add_child(email_sec)
	
	# Form Box (for register / sync inputs)
	_email_form_box = VBoxContainer.new()
	_email_form_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_email_form_box.add_theme_constant_override("separation", 10)
	_settings_box.add_child(_email_form_box)
	
	_email_input = LineEdit.new()
	_email_input.placeholder_text = "EMAIL ADDRESS"
	_email_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_email_form_box.add_child(_email_input)
	_style_input(_email_input)
	_email_input.custom_minimum_size.y = 36.0
	_email_input.add_theme_font_size_override("font_size", 14)
	
	_pass_input = LineEdit.new()
	_pass_input.placeholder_text = "PASSWORD"
	_pass_input.secret = true
	_pass_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_email_form_box.add_child(_pass_input)
	_style_input(_pass_input)
	_pass_input.custom_minimum_size.y = 36.0
	_pass_input.add_theme_font_size_override("font_size", 14)
	
	var sync_hbox := HBoxContainer.new()
	sync_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sync_hbox.add_theme_constant_override("separation", 10)
	var reg_btn := Button.new()
	reg_btn.text = "REGISTER"
	reg_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var sync_btn := Button.new()
	sync_btn.text = "SIGN IN / SYNC"
	sync_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sync_hbox.add_child(reg_btn)
	sync_hbox.add_child(sync_btn)
	_email_form_box.add_child(sync_hbox)
	_style_button(reg_btn)
	reg_btn.custom_minimum_size.y = 36.0
	reg_btn.add_theme_font_size_override("font_size", 14)
	_style_button(sync_btn)
	sync_btn.custom_minimum_size.y = 36.0
	sync_btn.add_theme_font_size_override("font_size", 14)
	
	# Status Box (when email is already confirmed)
	_email_status_box = VBoxContainer.new()
	_email_status_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_email_status_box.add_theme_constant_override("separation", 10)
	_settings_box.add_child(_email_status_box)
	
	_email_confirmed_lbl = Label.new()
	_email_confirmed_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_email_confirmed_lbl.text = "EMAIL CONFIRMED"
	_email_confirmed_lbl.self_modulate = Color(0.4, 1.0, 0.4)
	_email_confirmed_lbl.add_theme_font_size_override("font_size", 14)
	_email_status_box.add_child(_email_confirmed_lbl)
	
	_change_email_btn = Button.new()
	_change_email_btn.text = "CHANGE EMAIL ADDRESS"
	_change_email_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_email_status_box.add_child(_change_email_btn)
	_style_button(_change_email_btn)
	_change_email_btn.custom_minimum_size.y = 36.0
	_change_email_btn.add_theme_font_size_override("font_size", 14)
	
	_change_email_btn.pressed.connect(func():
		_email_form_box.visible = true
		_email_status_box.visible = false
		_email_input.text = ""
		_pass_input.text = ""
		_sync_status.text = "STATUS // READY"
		_sync_status.self_modulate = Color(0.86, 0.93, 1.0, 0.8)
	)
	
	_sync_status = Label.new()
	_sync_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sync_status.text = "STATUS // READY"
	_sync_status.add_theme_font_size_override("font_size", 13)
	_settings_box.add_child(_sync_status)
	
	reg_btn.pressed.connect(func(): _on_register_pressed(_email_input, _pass_input, _sync_status))
	sync_btn.pressed.connect(func(): _on_signin_pressed(_email_input, _pass_input, _sync_status))

	# Verification Box
	_verify_box = HBoxContainer.new()
	_verify_box.name = "VerifyBox"
	_verify_box.visible = false
	_verify_box.add_theme_constant_override("separation", 10)
	
	_code_input = LineEdit.new()
	_code_input.placeholder_text = "ENTER 6-DIGIT CODE"
	_code_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_code_input.max_length = 6
	_verify_box.add_child(_code_input)
	_style_input(_code_input)
	_code_input.custom_minimum_size.y = 36.0
	_code_input.add_theme_font_size_override("font_size", 14)
	
	_verify_code_btn = Button.new()
	_verify_code_btn.text = "VERIFY CODE"
	_verify_code_btn.custom_minimum_size.x = 120.0
	_verify_box.add_child(_verify_code_btn)
	_style_button(_verify_code_btn)
	_verify_code_btn.custom_minimum_size.y = 36.0
	_verify_code_btn.add_theme_font_size_override("font_size", 14)
	
	_settings_box.add_child(_verify_box)
	_settings_box.move_child(_verify_box, _settings_box.get_child_count() - 3) # place above status and footer

	_verify_code_btn.pressed.connect(func():
		var entered := _code_input.text.strip_edges()
		if entered == _verification_code and not entered.is_empty():
			var settings = game_manager.call("get_settings")
			settings["email"] = _target_email
			settings["email_confirmed"] = true
			game_manager.call("save_settings")
			_sync_status.text = "CONFIRMED // SYNCED!"
			_sync_status.self_modulate = Color(0.4, 1.0, 0.4)
			_verify_box.visible = false
		else:
			_sync_status.text = "ERROR // INVALID CODE"
			_sync_status.self_modulate = Color(1.0, 0.3, 0.3)
	)
	
	_create_settings_separator(_settings_box)
	
	# Footer
	var footer_hbox := HBoxContainer.new()
	footer_hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer_hbox.add_theme_constant_override("separation", 10)
	var save_btn := Button.new()
	save_btn.text = "SAVE & CLOSE"
	save_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var cancel_btn := Button.new()
	cancel_btn.text = "CANCEL"
	cancel_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer_hbox.add_child(save_btn)
	footer_hbox.add_child(cancel_btn)
	_settings_box.add_child(footer_hbox)
	_style_button(save_btn)
	save_btn.custom_minimum_size.y = 38.0
	save_btn.add_theme_font_size_override("font_size", 15)
	_style_button(cancel_btn)
	cancel_btn.custom_minimum_size.y = 38.0
	cancel_btn.add_theme_font_size_override("font_size", 15)
	
	save_btn.pressed.connect(func():
		var settings = game_manager.call("get_settings")
		settings["use_custom_nickname"] = _nick_chk.button_pressed
		settings["custom_nickname"] = _nick_input.text.strip_edges()
		settings["use_custom_avatar"] = _avatar_chk.button_pressed
		settings["custom_avatar_path"] = _avatar_input.text.strip_edges()
		game_manager.call("save_settings")
		
		# Refresh local identity
		network_manager.call("refresh_local_identity")
		_refresh_auth_ui()
		
		var profile_service = get_node_or_null("/root/ProfileService")
		if profile_service != null:
			profile_service.call("request_avatar", network_manager.get("steam_id"))
			
		_show_settings_panel(false)
	)
	
	cancel_btn.pressed.connect(func():
		game_manager.call("load_settings")
		game_manager.call("apply_audio_settings")
		_show_settings_panel(false)
	)
	
	_menu_scroll.add_child(_settings_box)
	_apply_game_font(_settings_box)
	
	# Style controls
	for child in _settings_box.get_children():
		if child is CheckBox:
			child.add_theme_font_override("font", _game_font)
			child.add_theme_font_size_override("font_size", 15)
			child.self_modulate = Color(0.86, 0.93, 1.0, 1.0)
		elif child is Label and child != title_lbl and child != audio_sec and child != profile_sec and child != email_sec:
			child.self_modulate = Color(0.86, 0.93, 1.0, 0.8)

func _show_settings_panel(should_show: bool) -> void:
	if should_show:
		var settings = game_manager.call("get_settings")
		_music_slider.value = settings.get("music_volume", 80.0)
		_sfx_slider.value = settings.get("sfx_volume", 80.0)
		_music_label.text = "MUSIC: %d%%" % int(_music_slider.value)
		_sfx_label.text = "SFX: %d%%" % int(_sfx_slider.value)
		
		_nick_chk.button_pressed = settings.get("use_custom_nickname", false)
		_nick_input.text = settings.get("custom_nickname", "")
		_avatar_chk.button_pressed = settings.get("use_custom_avatar", false)
		_avatar_input.text = settings.get("custom_avatar_path", "")
		
		var has_confirmed_email = settings.get("email_confirmed", false) and not str(settings.get("email", "")).strip_edges().is_empty()
		if has_confirmed_email:
			_email_form_box.visible = false
			_email_status_box.visible = true
			_email_confirmed_lbl.text = "EMAIL CONFIRMED // " + str(settings.get("email", "")).to_upper()
		else:
			_email_form_box.visible = true
			_email_status_box.visible = false
			_email_input.text = settings.get("email", "")
			
		_pass_input.text = ""
		_sync_status.text = "STATUS // READY"
		_sync_status.self_modulate = Color(0.86, 0.93, 1.0, 0.8)
		_verify_box.visible = false
		
		menu_box.visible = false
		_settings_box.visible = true
	else:
		_settings_box.visible = false
		menu_box.visible = true

func _on_register_pressed(email_input: LineEdit, pass_input: LineEdit, status_lbl: Label) -> void:
	var email := email_input.text.strip_edges()
	var password := pass_input.text.strip_edges()
	if email.is_empty() or password.is_empty():
		status_lbl.text = "ERROR // EMAIL & PASSWORD REQUIRED"
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)
		return
		
	# Generate code
	var code_val := randi_range(100000, 999999)
	_verification_code = str(code_val)
	_target_email = email
	
	status_lbl.text = "SENDING VERIFICATION EMAIL..."
	status_lbl.self_modulate = Color(1.0, 0.8, 0.4)
	_show_loading("sending verification key", "dispatching code via security systems...")
	
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_brevo_request_completed.bind(http, status_lbl))
	
	var url := "https://api.brevo.com/v3/smtp/email"
	var brevo_key: String = str(ProjectSettings.get_setting("killrun/backend/brevo_api_key", ""))
	var headers := PackedStringArray([
		"accept: application/json",
		"api-key: " + brevo_key,
		"content-type: application/json"
	])
	
	var html_body := """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KILL RUN // SECURITY KEY</title>
  <style>
    body { background-color: #030508; color: #d1e2ff; font-family: 'Courier New', Courier, monospace; margin: 0; padding: 40px 20px; text-align: center; }
    .container { background-color: #0a0e17; border: 1px solid #346296; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 4px; }
    .header { font-size: 28px; font-weight: 900; letter-spacing: 4px; color: #ff9d6c; margin-bottom: 10px; }
    .subheader { font-size: 11px; color: #8cbfff; letter-spacing: 2px; margin-bottom: 30px; text-transform: uppercase; }
    .notice { font-size: 14px; line-height: 1.6; color: #a5c7eb; margin-bottom: 30px; }
    .code-box { background-color: #020305; border: 1px solid #ff9d6c; font-size: 36px; font-weight: 900; letter-spacing: 6px; color: #ff9d6c; padding: 15px; margin: 20px 0; display: inline-block; border-radius: 4px; }
    .footer { font-size: 10px; color: #5d7594; margin-top: 40px; border-top: 1px solid #1a2536; padding-top: 20px; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="container">
	<div class="header">KILL RUN</div>
	<div class="subheader">Security Authentication</div>
	<div class="notice">
      [SYSTEM NOTIFICATION] A request was received to synchronize this email with your in-game KILL RUN profile.
    </div>
	<div class="notice">
      Use the following confirmation code to complete authorization:
    </div>
	<div class="code-box">""" + _verification_code + """</div>
	<div class="notice" style="font-size: 11px; color: #ff9d6c; margin-top: 10px;">
      This key is valid for 15 minutes. If you did not initiate this request, ignore this email.
    </div>
	<div class="footer">
      SYSTEM SECURED // COGNITIVE INTEGRATION TERMINAL
    </div>
  </div>
</body>
</html>"""

	var payload := {
		"sender": {
			"name": "KILL RUN TERMINAL",
			"email": "airijuz@gmail.com"
		},
		"to": [
			{
				"email": email
			}
		],
		"subject": "KILL RUN // SECURITY KEY AUTHORIZATION",
		"htmlContent": html_body
	}
	
	var err := http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		status_lbl.text = "ERROR // COULD NOT START REQUEST"
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)
		http.queue_free()

func _on_brevo_request_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest, status_lbl: Label) -> void:
	_hide_loading()
	if is_instance_valid(http):
		http.queue_free()
	var response_text := body.get_string_from_utf8()
	if response_code >= 200 and response_code < 300:
		status_lbl.text = "CODE SENT! Enter the 6-digit code below."
		status_lbl.self_modulate = Color(0.4, 1.0, 0.4)
		_verify_box.visible = true
		_code_input.text = ""
		_code_input.grab_focus()
	else:
		var parsed = JSON.parse_string(response_text)
		var err_msg := "SEND FAILED (HTTP %d)" % response_code
		if parsed is Dictionary and parsed.has("message"):
			err_msg = str(parsed["message"]).to_upper()
		status_lbl.text = "ERROR // " + err_msg
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)

func _on_signin_pressed(email_input: LineEdit, pass_input: LineEdit, status_lbl: Label) -> void:
	var email := email_input.text.strip_edges()
	var password := pass_input.text.strip_edges()
	if email.is_empty() or password.is_empty():
		status_lbl.text = "ERROR // EMAIL & PASSWORD REQUIRED"
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)
		return
		
	var sb_url = ProjectSettings.get_setting("killrun/backend/supabase_url", "")
	var sb_key = ProjectSettings.get_setting("killrun/backend/supabase_anon_key", "")
	if str(sb_url).is_empty() or str(sb_key).is_empty():
		status_lbl.text = "OFFLINE SYNCED // NO BACKEND KEY DEFINED"
		status_lbl.self_modulate = Color(0.4, 0.8, 1.0)
		var settings = game_manager.call("get_settings")
		settings["email"] = email
		settings["email_confirmed"] = true
		game_manager.call("save_settings")
		return
		
	status_lbl.text = "SIGNING IN & SYNCHRONIZING..."
	status_lbl.self_modulate = Color(1.0, 0.8, 0.4)
	_show_loading("signing in", "authenticating secure credentials...")
	
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_signin_request_completed.bind(http, status_lbl, email))
	
	var url := "%s/auth/v1/token?grant_type=password" % [str(sb_url).trim_suffix("/")]
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: %s" % sb_key
	])
	var payload := {
		"email": email,
		"password": password
	}
	var err := http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		status_lbl.text = "ERROR // COULD NOT START REQUEST"
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)
		http.queue_free()

func _on_signin_request_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest, status_lbl: Label, email: String) -> void:
	_hide_loading()
	if is_instance_valid(http):
		http.queue_free()
	var response_text: String = body.get_string_from_utf8()
	if response_code >= 200 and response_code < 300:
		var parsed = JSON.parse_string(response_text)
		if parsed is Dictionary and parsed.has("access_token"):
			var settings = game_manager.call("get_settings")
			settings["email"] = email
			settings["email_confirmed"] = true
			game_manager.call("save_settings")
			status_lbl.text = "SYNCED WITH CLOUD // SESSION ACTIVE"
			status_lbl.self_modulate = Color(0.4, 1.0, 0.4)
		else:
			status_lbl.text = "ERROR // INVALID RESPONSE"
			status_lbl.self_modulate = Color(1.0, 0.3, 0.3)
	else:
		var err_msg := "SIGN IN FAILED"
		var parsed = JSON.parse_string(response_text)
		if parsed is Dictionary and parsed.has("error_description"):
			err_msg = str(parsed["error_description"]).to_upper()
		elif parsed is Dictionary and parsed.has("error"):
			err_msg = str(parsed["error"]).to_upper()
		status_lbl.text = "ERROR // " + err_msg
		status_lbl.self_modulate = Color(1.0, 0.3, 0.3)


func _ensure_loading_overlay() -> void:
	if _loading_overlay != null and is_instance_valid(_loading_overlay):
		return
		
	_loading_overlay = PanelContainer.new()
	_loading_overlay.name = "LoadingOverlay"
	_loading_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_loading_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Translucent background style
	var bg_style := StyleBoxFlat.new()
	bg_style.bg_color = Color(0.012, 0.017, 0.024, 0.88)
	_loading_overlay.add_theme_stylebox_override("panel", bg_style)
	
	var center_container := CenterContainer.new()
	center_container.set_anchors_preset(Control.PRESET_FULL_RECT)
	_loading_overlay.add_child(center_container)
	
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 20)
	center_container.add_child(vbox)
	
	# Spinner container
	var spinner_center := CenterContainer.new()
	vbox.add_child(spinner_center)
	
	_loading_spinner = Control.new()
	_loading_spinner.custom_minimum_size = Vector2(100, 100)
	spinner_center.add_child(_loading_spinner)
	
		# Custom drawing script for spinner
	var spinner_script := GDScript.new()
	spinner_script.source_code = """extends Control
var time := 0.0
func _process(delta: float) -> void:
	time += delta
	queue_redraw()
func _draw() -> void:
	var center = size * 0.5
	var r1 = min(size.x, size.y) * 0.48
	var r2 = r1 * 0.82
	var r3 = r1 * 0.58
	# Outer thick dashed ring
	draw_arc(center, r1, time * 0.8, time * 0.8 + PI * 1.4, 64, Color(0.38, 0.62, 0.86, 0.35), 4.0, true)
	# Middle fast counter-rotating arc
	draw_arc(center, r2, -time * 3.5, -time * 3.5 + PI * 0.9, 48, Color(1.0, 0.56, 0.36, 0.7), 3.0, true)
	# Inner slow rotating arc
	draw_arc(center, r3, time * 1.5, time * 1.5 + PI * 1.1, 32, Color(0.38, 0.62, 0.86, 0.95), 2.0, true)
"""
	spinner_script.reload()
	_loading_spinner.set_script(spinner_script)
	
	# Text container
	var text_vbox := VBoxContainer.new()
	text_vbox.add_theme_constant_override("separation", 6)
	vbox.add_child(text_vbox)
	
	_loading_label = Label.new()
	_loading_label.text = "LOADING SYSTEM..."
	_loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_label.add_theme_font_size_override("font_size", 22)
	_loading_label.self_modulate = Color(1.0, 0.94, 0.84, 1.0)
	text_vbox.add_child(_loading_label)
	
	_loading_sublabel = Label.new()
	_loading_sublabel.text = "Cognitive processing in progress..."
	_loading_sublabel.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_sublabel.add_theme_font_size_override("font_size", 14)
	_loading_sublabel.self_modulate = Color(0.55, 0.76, 1.0, 0.72)
	text_vbox.add_child(_loading_sublabel)
	
	# Add a premium custom scanner/progress bar
	var bar_panel := PanelContainer.new()
	bar_panel.custom_minimum_size = Vector2(320, 6)
	text_vbox.add_child(bar_panel)
	
	var bar_style := StyleBoxFlat.new()
	bar_style.bg_color = Color(0.05, 0.08, 0.12, 0.6)
	bar_style.border_color = Color(0.55, 0.76, 1.0, 0.16)
	bar_style.border_width_left = 1
	bar_style.border_width_top = 1
	bar_style.border_width_right = 1
	bar_style.border_width_bottom = 1
	bar_panel.add_theme_stylebox_override("panel", bar_style)
	
	var bar_progress := ColorRect.new()
	bar_progress.color = Color(1.0, 0.56, 0.36, 0.9)
	bar_panel.add_child(bar_progress)
	
	var progress_script := GDScript.new()
	progress_script.source_code = """extends ColorRect
var time := 0.0
func _process(delta: float) -> void:
	time += delta * 1.5
	var parent_width = get_parent().size.x
	size.y = get_parent().size.y
	# Indeterminate scanning bounce
	var w = parent_width * 0.35
	size.x = w
	var bounce = 0.5 + 0.5 * sin(time)
	position.x = bounce * (parent_width - w)
"""
	progress_script.reload()
	bar_progress.set_script(progress_script)
	
	add_child(_loading_overlay)
	if _game_font != null:
		_apply_game_font(_loading_overlay)

func _show_loading(text: String, subtext: String = "") -> void:
	_ensure_loading_overlay()
	_loading_label.text = text.to_upper()
	_loading_sublabel.text = subtext
	_loading_overlay.visible = true
	_loading_overlay.move_to_front()
	_loading_overlay.modulate.a = 0.0
	
	# Smooth fade-in tween
	var tween = create_tween()
	tween.tween_property(_loading_overlay, "modulate:a", 1.0, 0.25).set_trans(Tween.TRANS_SINE)

func _hide_loading() -> void:
	if _loading_overlay == null or not is_instance_valid(_loading_overlay) or not _loading_overlay.visible:
		return
	var tween = create_tween()
	tween.tween_property(_loading_overlay, "modulate:a", 0.0, 0.2).set_trans(Tween.TRANS_SINE)
	tween.tween_callback(func(): _loading_overlay.visible = false)
