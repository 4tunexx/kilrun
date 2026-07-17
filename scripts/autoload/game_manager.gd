extends Node

# GameManager - Autoload singleton
# Manages global game state, round flow, and role assignment

enum GameState {
	LOBBY,
	COUNTDOWN,
	PLAYING,
	ROUND_OVER
}

enum Role {
	RUNNER,
	TRAPPER
}

const MAX_PLAYERS := 16
const COUNTDOWN_TIME := 10.0
const ROUND_TIME := 180.0
const MENU_MUSIC_LOOP_AT: float = 73.0    # Update if mainmenu-music.mp3 duration changes
const MENU_MUSIC_FADEOUT_AT: float = 69.0 # Fade begins this many seconds before loop
const XP_KILL := 15
const XP_FINISH := 20
const XP_ROUND_WIN := 40
const XP_BUG_KILL := 3
const UPGRADE_KEYS := ["health", "energy", "speed", "jump", "visibility"]
const UPGRADE_STORAGE_CAP := 999
const HORDE_WEAPON_COSTS := {
	"PISTOL": 25,
	"SMG": 80,
	"AK": 140,
	"SNIPER": 220,
	"SHOTGUN": 120,
	"REVOLVER": 65,
	"PERK_DOUBLE_JUMP": 60,
	"PERK_DASH": 75,
	"PERK_ARMOR": 45,
	"PERK_REGEN": 90
}
const HORDE_BULLET_PACK_COST := 30
const HORDE_BULLET_PACK_AMOUNT := 36
const HORDE_HEALTH_POTION_COST := 24
const HORDE_HEALTH_POTION_HEAL := 35.0
const DEFAULT_WORLD_GRAVITY_SCALE := 1.0
const MIN_WORLD_GRAVITY_SCALE := 0.25
const MAX_WORLD_GRAVITY_SCALE := 2.5

var state: GameState = GameState.LOBBY
var round_timer: float = 0.0
var countdown_timer: float = 0.0
var trapper_id: int = -1
var players: Dictionary = {}  # peer_id -> {role, alive, name, kills, deaths, finishes}
var runners_finished: int = 0
var _pending_local_profile: Dictionary = {}
var muted_players: Dictionary = {}
var banned_steam_ids: Dictionary = {}
var world_settings: Dictionary = {
	"gravity_scale": DEFAULT_WORLD_GRAVITY_SCALE
}

signal state_changed(new_state: GameState)
signal round_started()
signal round_ended(winner: String)  # "runners" or "trapper"
signal player_died(peer_id: int)
signal player_finished(peer_id: int)
signal progression_changed(peer_id: int)
signal level_up(peer_id: int, new_level: int)
signal xp_gained(peer_id: int, amount: int)
signal coins_changed(peer_id: int, coins: int)
signal shop_notice(peer_id: int, text: String, positive: bool)
signal moderation_changed(peer_id: int)
signal world_settings_changed(settings: Dictionary)


func _backend_service() -> Node:
	return get_node_or_null("/root/BackendService")


func _steam_service() -> Node:
	return get_node_or_null("/root/SteamService")


func _local_peer_id() -> int:
	if not multiplayer.has_multiplayer_peer():
		return -1
	return multiplayer.get_unique_id()


func _is_local_peer(peer_id: int) -> bool:
	return peer_id == _local_peer_id()


func _process(delta: float) -> void:
	_process_menu_music(delta)
	if not multiplayer.has_multiplayer_peer():
		return
	if not multiplayer.is_server():
		return

	match state:
		GameState.COUNTDOWN:
			countdown_timer -= delta
			if countdown_timer <= 0.0:
				_start_round()

		GameState.PLAYING:
			round_timer -= delta
			if round_timer <= 0.0:
				_expire_round()


func get_world_settings() -> Dictionary:
	return world_settings.duplicate(true)


func get_world_gravity_scale() -> float:
	return clampf(float(world_settings.get("gravity_scale", DEFAULT_WORLD_GRAVITY_SCALE)), MIN_WORLD_GRAVITY_SCALE, MAX_WORLD_GRAVITY_SCALE)


func get_world_gravity_percent() -> int:
	return int(round(get_world_gravity_scale() * 100.0))


func start_countdown() -> void:
	if not multiplayer.is_server():
		return
	if players.is_empty():
		push_warning("Need at least 1 player to start.")
		return
	if players.size() == 1:
		_assign_solo_roles()
	else:
		_assign_roles()
	countdown_timer = COUNTDOWN_TIME
	_set_state(GameState.COUNTDOWN)
	rpc("_sync_countdown", countdown_timer, trapper_id, _get_role_map())


func start_countdown_after_scene_load() -> void:
	if not multiplayer.is_server():
		return
	var tree := get_tree()
	await tree.process_frame
	await tree.process_frame
	start_countdown()


func _start_round() -> void:
	for peer_id in players:
		_ensure_progression(peer_id)
		var stats: Dictionary = players[peer_id].get("stats", _default_stats())
		stats["rounds_played"] = int(stats.get("rounds_played", 0)) + 1
		players[peer_id]["stats"] = stats
		_sync_progression_for(peer_id)
	round_timer = ROUND_TIME
	runners_finished = 0
	_set_state(GameState.PLAYING)
	rpc("_sync_round_start")
	round_started.emit()


func end_round(winner: String) -> void:
	if state != GameState.PLAYING:
		return
	_award_round_xp(winner)
	_set_state(GameState.ROUND_OVER)
	rpc("_sync_round_end", winner)
	round_ended.emit(winner)
	# Auto-restart after delay with stored reference to prevent issues
	var restart_timer := get_tree().create_timer(5.0)
	restart_timer.timeout.connect(func(): _reset_to_lobby())


func _reset_to_lobby() -> void:
	for id in players:
		players[id]["alive"] = true
	runners_finished = 0
	trapper_id = -1
	_set_state(GameState.LOBBY)
	rpc("_sync_lobby")


func reset_local_state() -> void:
	players.clear()
	state = GameState.LOBBY
	round_timer = 0.0
	countdown_timer = 0.0
	trapper_id = -1
	runners_finished = 0
	muted_players.clear()
	banned_steam_ids.clear()
	world_settings = {"gravity_scale": DEFAULT_WORLD_GRAVITY_SCALE}
	state_changed.emit(state)
	world_settings_changed.emit(get_world_settings())


func debug_restart_round() -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	if players.is_empty():
		return
	for id in players:
		players[id]["alive"] = true
	if players.size() == 1:
		_assign_solo_roles()
	elif trapper_id == -1 or trapper_id not in players:
		_assign_roles()
	runners_finished = 0
	countdown_timer = COUNTDOWN_TIME
	_set_state(GameState.COUNTDOWN)
	rpc("_sync_countdown", countdown_timer, trapper_id, _get_role_map())
	_respawn_players()


func debug_toggle_my_role() -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	var my_id: int = multiplayer.get_unique_id()
	if my_id not in players:
		return
	var make_trapper: bool = int(players[my_id]["role"]) != Role.TRAPPER
	trapper_id = my_id if make_trapper else -1
	for id in players:
		players[id]["role"] = Role.TRAPPER if make_trapper and id == my_id else Role.RUNNER
		players[id]["alive"] = true
	rpc("_sync_roles", _get_role_map(), trapper_id)
	_respawn_players()


func debug_load_map(map_scene_path: String) -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	_set_state(GameState.LOBBY)
	runners_finished = 0
	for id in players:
		players[id]["alive"] = true
	rpc("_sync_lobby")
	rpc("_client_debug_load_map", map_scene_path)
	_load_debug_map_local(map_scene_path, true)


func debug_release_bug_pack(bug_count: int = 5) -> void:
	if multiplayer.multiplayer_peer == null:
		_trigger_debug_bug_pack_local(bug_count)
		return
	if multiplayer.is_server():
		_trigger_debug_bug_pack_local(bug_count)
		return
	rpc_id(1, "_server_debug_release_bug_pack", bug_count)


func _trigger_debug_bug_pack_local(bug_count: int) -> void:
	var current_scene := get_tree().current_scene
	if current_scene != null:
		if current_scene.has_method("_release_debug_bug_pack"):
			current_scene.call("_release_debug_bug_pack", bug_count)
			return
		if current_scene.has_method("dev_release_bug_pack"):
			current_scene.call("dev_release_bug_pack", bug_count)
			return
	var test_map := get_tree().root.find_child("TestMap", true, false)
	if test_map != null:
		if test_map.has_method("_release_debug_bug_pack"):
			test_map.call("_release_debug_bug_pack", bug_count)
			return
		if test_map.has_method("dev_release_bug_pack"):
			test_map.call("dev_release_bug_pack", bug_count)
			return
	var demo_map := get_tree().root.find_child("DemoMap", true, false)
	if demo_map != null:
		if demo_map.has_method("_release_debug_bug_pack"):
			demo_map.call("_release_debug_bug_pack", bug_count)
			return
		if demo_map.has_method("dev_release_bug_pack"):
			demo_map.call("dev_release_bug_pack", bug_count)


func _load_debug_map_local(map_scene_path: String, should_respawn: bool) -> void:
	var tree := get_tree()
	var error := tree.change_scene_to_file(map_scene_path)
	if error != OK:
		push_error("Failed to load map: %s" % map_scene_path)
		return
	await tree.process_frame
	await tree.process_frame
	await tree.process_frame
	if should_respawn:
		_respawn_players()


@rpc("authority", "call_remote", "reliable")
func _client_debug_load_map(map_scene_path: String) -> void:
	_load_debug_map_local(map_scene_path, false)


@rpc("any_peer", "call_remote", "reliable")
func _server_debug_release_bug_pack(bug_count: int = 5) -> void:
	if not multiplayer.is_server():
		return
	_trigger_debug_bug_pack_local(bug_count)


func _respawn_players() -> void:
	var spawner: Node = get_tree().root.find_child("PlayerSpawner", true, false)
	if spawner == null:
		return
	for peer_id in players:
		if spawner.has_method("_spawn_player"):
			spawner.call("_spawn_player", peer_id)


func register_player(peer_id: int, player_name: String, steam_id: String = "", profile_payload: Dictionary = {}) -> void:
	players[peer_id] = {
		"role": Role.RUNNER,
		"alive": true,
		"name": player_name,
		"steam_id": steam_id,
		"kills": 0,
		"deaths": 0,
		"finishes": 0,
		"coins": 0,
		"muted": false,
		"horde_weapons": ["KNIFE"],
		"xp": 0,
		"level": 1,
		"upgrade_points": 0,
		"upgrades": _default_upgrades(),
		"stats": _default_stats()
	}
	if not profile_payload.is_empty():
		_apply_profile_to_player(peer_id, profile_payload)
	if _is_local_peer(peer_id):
		_apply_authenticated_identity(peer_id)
		_apply_pending_local_profile(peer_id)


func unregister_player(peer_id: int) -> void:
	muted_players.erase(peer_id)
	players.erase(peer_id)
	_check_round_end()


func notify_player_died(peer_id: int, attacker_id: int = -1) -> void:
	if not multiplayer.is_server():
		return
	if peer_id in players:
		players[peer_id]["alive"] = false
		players[peer_id]["deaths"] = int(players[peer_id].get("deaths", 0)) + 1
	if attacker_id in players and attacker_id != peer_id:
		players[attacker_id]["kills"] = int(players[attacker_id].get("kills", 0)) + 1
		_add_xp(attacker_id, XP_KILL)
	player_died.emit(peer_id)
	rpc("_sync_player_died", peer_id, attacker_id)
	_check_round_end()


func notify_player_finished(peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	runners_finished += 1
	if peer_id in players:
		players[peer_id]["finishes"] = int(players[peer_id].get("finishes", 0)) + 1
		_add_xp(peer_id, XP_FINISH)
	player_finished.emit(peer_id)
	rpc("_sync_player_finished", peer_id)
	_check_round_end()


func award_bug_kill_xp(peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	if peer_id not in players:
		return
	_ensure_progression(peer_id)
	var stats: Dictionary = players[peer_id].get("stats", _default_stats())
	stats["bug_kills"] = int(stats.get("bug_kills", 0)) + 1
	players[peer_id]["stats"] = stats
	_add_xp(peer_id, XP_BUG_KILL)


func _expire_round() -> void:
	if state != GameState.PLAYING:
		return
	for peer_id in _get_runner_ids():
		if players[peer_id]["alive"]:
			var player_node := get_tree().root.find_child(str(peer_id), true, false)
			if player_node and player_node.has_method("eliminate"):
				player_node.call("eliminate")
			else:
				players[peer_id]["alive"] = false
				rpc("_sync_player_died", peer_id)
	if state == GameState.PLAYING:
		end_round("trapper")


func _check_round_end() -> void:
	if state != GameState.PLAYING:
		return
	var runner_ids := _get_runner_ids()
	if runner_ids.is_empty():
		end_round("trapper")
		return
	var alive_runners := runner_ids.filter(func(id): return players[id]["alive"])
	if alive_runners.is_empty():
		end_round("trapper")
		return
	if runners_finished >= runner_ids.size():
		end_round("runners")


func _assign_roles() -> void:
	var ids := players.keys()
	ids.shuffle()
	trapper_id = ids[0]
	for id in ids:
		players[id]["role"] = Role.TRAPPER if id == trapper_id else Role.RUNNER
		players[id]["alive"] = true


func _assign_solo_roles() -> void:
	trapper_id = -1
	for id in players:
		players[id]["role"] = Role.RUNNER
		players[id]["alive"] = true


func _get_runner_ids() -> Array:
	return players.keys().filter(func(id): return players[id]["role"] == Role.RUNNER)


func _get_role_map() -> Dictionary:
	var map := {}
	for id in players:
		map[id] = players[id]["role"]
	return map


func _vip_expiry_unix_from_player(peer_id: int) -> int:
	if peer_id not in players:
		return 0
	var expiry_value: Variant = players[peer_id].get("vip_expires_at", null)
	if expiry_value == null:
		return 0
	var expiry_text := str(expiry_value).strip_edges()
	if expiry_text.is_empty():
		return 0
	return int(Time.get_unix_time_from_datetime_string(expiry_text))


func _iso_datetime_from_unix(unix_time: int) -> String:
	return Time.get_datetime_string_from_unix_time(unix_time, true)


func _default_upgrades() -> Dictionary:
	return {
		"health": 0,
		"energy": 0,
		"speed": 0,
		"jump": 0,
		"visibility": 0
	}


func _default_stats() -> Dictionary:
	return {
		"damage_done": 0,
		"damage_taken": 0,
		"bug_kills": 0,
		"rounds_played": 0,
		"rounds_won": 0
	}


func _default_account_profile() -> Dictionary:
	return {
		"account_role": "normal",
		"vip_status": "inactive",
		"vip_trial_used": false,
		"vip_expires_at": null,
		"vip_last_purchase_source": ""
	}


func _name_color_for_profile(account_role: String, vip_status: String) -> Color:
	var normalized_role := account_role.to_lower()
	var normalized_vip_status := vip_status.to_lower()
	if normalized_role == "admin":
		return Color(1.0, 0.26, 0.26, 1.0)
	if normalized_role == "vip" or normalized_vip_status in ["trial", "active"]:
		return Color(0.74, 0.48, 1.0, 1.0)
	return Color(1.0, 1.0, 1.0, 1.0)


func _display_name_for_profile(player_name: String, account_role: String, vip_status: String) -> String:
	var display_name := player_name
	if account_role.to_lower() == "vip" or vip_status.to_lower() in ["trial", "active"]:
		display_name = "CROWN %s" % display_name
	return display_name


func _ensure_shop_state(peer_id: int) -> void:
	if peer_id not in players:
		return
	if not players[peer_id].has("coins"):
		players[peer_id]["coins"] = 0
	players[peer_id]["coins"] = max(int(players[peer_id].get("coins", 0)), 0)
	if not players[peer_id].has("horde_weapons") or not players[peer_id]["horde_weapons"] is Array:
		players[peer_id]["horde_weapons"] = ["KNIFE"]
	var owned_weapons := players[peer_id]["horde_weapons"] as Array
	if not owned_weapons.has("KNIFE"):
		owned_weapons.append("KNIFE")
	if not players[peer_id].has("horde_perks") or not players[peer_id]["horde_perks"] is Array:
		players[peer_id]["horde_perks"] = []


func _xp_for_next_level(level: int) -> int:
	var level_index: int = maxi(level - 1, 0)
	var tier: int = int(floor(float(level_index) / 5.0))
	var base_cost: int = 1000 + level_index * 300
	var tier_multiplier := 1.0 + float(tier) * 0.2
	var tier_bonus := float(tier * tier) * 45.0
	return int(round(base_cost * tier_multiplier + tier_bonus))


func _ensure_progression(peer_id: int) -> void:
	if peer_id not in players:
		return
	var data: Dictionary = players[peer_id]
	if not data.has("xp"):
		data["xp"] = 0
	if not data.has("level"):
		data["level"] = 1
	if not data.has("upgrade_points"):
		data["upgrade_points"] = 0
	if not data.has("upgrades") or not data["upgrades"] is Dictionary:
		data["upgrades"] = _default_upgrades()
	if not data.has("stats") or not data["stats"] is Dictionary:
		data["stats"] = _default_stats()
	if not data.has("account_role"):
		data["account_role"] = "normal"
	if not data.has("vip_status"):
		data["vip_status"] = "inactive"
	if not data.has("vip_trial_used"):
		data["vip_trial_used"] = false
	if not data.has("vip_expires_at"):
		data["vip_expires_at"] = null
	if not data.has("vip_last_purchase_source"):
		data["vip_last_purchase_source"] = ""
	data["account_role"] = str(data.get("account_role", "normal")).to_lower()
	data["vip_status"] = str(data.get("vip_status", "inactive")).to_lower()
	var upgrades: Dictionary = data["upgrades"]
	for key in UPGRADE_KEYS:
		if not upgrades.has(key):
			upgrades[key] = 0
		upgrades[key] = clamp(int(upgrades[key]), 0, UPGRADE_STORAGE_CAP)
	var stats: Dictionary = data["stats"]
	for key in _default_stats():
		if not stats.has(key):
			stats[key] = _default_stats()[key]
		stats[key] = max(int(stats[key]), 0)
	_ensure_shop_state(peer_id)


func _stats_payload(peer_id: int) -> Dictionary:
	_ensure_progression(peer_id)
	if peer_id not in players:
		return _default_stats()
	var stats: Dictionary = players[peer_id].get("stats", _default_stats())
	return {
		"damage_done": int(stats.get("damage_done", 0)),
		"damage_taken": int(stats.get("damage_taken", 0)),
		"bug_kills": int(stats.get("bug_kills", 0)),
		"rounds_played": int(stats.get("rounds_played", 0)),
		"rounds_won": int(stats.get("rounds_won", 0)),
		"kills": int(players[peer_id].get("kills", 0)),
		"deaths": int(players[peer_id].get("deaths", 0)),
		"finishes": int(players[peer_id].get("finishes", 0))
	}


func _progression_payload(peer_id: int) -> Dictionary:
	_ensure_progression(peer_id)
	if peer_id not in players:
		return {}
	return {
		"name": str(players[peer_id].get("name", "")),
		"display_name": _display_name_for_profile(str(players[peer_id].get("name", "")), str(players[peer_id].get("account_role", "normal")), str(players[peer_id].get("vip_status", "inactive"))),
		"name_color": _name_color_for_profile(str(players[peer_id].get("account_role", "normal")), str(players[peer_id].get("vip_status", "inactive"))),
		"steam_id": str(players[peer_id].get("steam_id", "")),
		"account_role": str(players[peer_id].get("account_role", "normal")),
		"vip_status": str(players[peer_id].get("vip_status", "inactive")),
		"vip_trial_used": bool(players[peer_id].get("vip_trial_used", false)),
		"vip_expires_at": players[peer_id].get("vip_expires_at", null),
		"vip_last_purchase_source": str(players[peer_id].get("vip_last_purchase_source", "")),
		"xp": int(players[peer_id].get("xp", 0)),
		"level": int(players[peer_id].get("level", 1)),
		"upgrade_points": int(players[peer_id].get("upgrade_points", 0)),
		"upgrades": (players[peer_id].get("upgrades", _default_upgrades()) as Dictionary).duplicate(true),
		"stats": _stats_payload(peer_id)
	}


func export_local_profile(peer_id: int = -1) -> Dictionary:
	var target_id := peer_id
	if target_id == -1:
		target_id = _local_peer_id()
	if target_id == -1 or target_id not in players:
		return {}
	_ensure_progression(target_id)
	var payload := _progression_payload(target_id)
	payload.erase("display_name")
	payload.erase("name_color")
	payload["steam_name"] = str(players[target_id].get("name", ""))
	payload["account_role"] = str(players[target_id].get("account_role", "normal"))
	payload["vip_status"] = str(players[target_id].get("vip_status", "inactive"))
	payload["vip_trial_used"] = bool(players[target_id].get("vip_trial_used", false))
	payload["vip_expires_at"] = players[target_id].get("vip_expires_at", null)
	payload["vip_last_purchase_source"] = str(players[target_id].get("vip_last_purchase_source", ""))
	payload["avatar_url"] = _current_avatar_url()
	payload["coins"] = int(players[target_id].get("coins", 0))
	payload["horde_weapons"] = (players[target_id].get("horde_weapons", ["KNIFE"]) as Array).duplicate()
	return payload


func load_local_profile(profile_payload: Dictionary) -> void:
	_pending_local_profile = profile_payload.duplicate(true)
	var local_id := _local_peer_id()
	if local_id != -1 and local_id in players:
		_apply_profile_to_player(local_id, _pending_local_profile)
		progression_changed.emit(local_id)
		if multiplayer.multiplayer_peer != null:
			if multiplayer.is_server():
				_sync_progression_for(local_id)
			else:
				rpc_id(1, "_server_apply_profile_snapshot", export_local_profile(local_id))



func get_player_level(peer_id: int) -> int:
	_ensure_progression(peer_id)
	if peer_id not in players:
		return 1
	return int(players[peer_id].get("level", 1))


func get_xp_to_next_level(level: int) -> int:
	return _xp_for_next_level(level)
func get_progression(peer_id: int = -1) -> Dictionary:
	var target_id := peer_id
	if target_id == -1 and multiplayer.multiplayer_peer != null:
		target_id = multiplayer.get_unique_id()
	if target_id == -1:
		return {}
	return _progression_payload(target_id)


func get_player_coins(peer_id: int = -1) -> int:
	var target_id := peer_id
	if target_id == -1 and multiplayer.multiplayer_peer != null:
		target_id = multiplayer.get_unique_id()
	if target_id == -1 or target_id not in players:
		return 0
	_ensure_shop_state(target_id)
	return int(players[target_id].get("coins", 0))


func get_horde_owned_weapons(peer_id: int = -1) -> Array:
	var target_id := peer_id
	if target_id == -1 and multiplayer.multiplayer_peer != null:
		target_id = multiplayer.get_unique_id()
	if target_id == -1 or target_id not in players:
		return ["KNIFE"]
	_ensure_shop_state(target_id)
	return (players[target_id].get("horde_weapons", ["KNIFE"]) as Array).duplicate()


func _horde_item_price(item_id: String) -> int:
	if item_id in HORDE_WEAPON_COSTS:
		return int(HORDE_WEAPON_COSTS[item_id])
	if item_id == "AMMO":
		return HORDE_BULLET_PACK_COST
	if item_id == "HEALTH":
		return HORDE_HEALTH_POTION_COST
	return -1


func _is_horde_scene(scene: Node) -> bool:
	return scene != null and scene.has_method("_start_next_wave") and scene.has_method("_client_announce_wave")


func is_horde_mode() -> bool:
	return _is_horde_scene(get_tree().current_scene)


func can_open_horde_shop() -> bool:
	var scene := get_tree().current_scene
	if not _is_horde_scene(scene):
		return false
	if state == GameState.COUNTDOWN:
		return true
	if state != GameState.PLAYING:
		return false
	return not bool(scene.get("wave_active"))


func _sync_player_coins_for(peer_id: int) -> void:
	if peer_id not in players:
		return
	_ensure_shop_state(peer_id)
	var coin_value := int(players[peer_id].get("coins", 0))
	coins_changed.emit(peer_id, coin_value)
	if _is_local_peer(peer_id):
		_queue_local_profile_save(peer_id)
	if multiplayer.multiplayer_peer != null:
		rpc("_sync_player_coins", peer_id, coin_value)


func _emit_shop_notice(peer_id: int, text: String, positive: bool) -> void:
	if multiplayer.multiplayer_peer == null or peer_id == multiplayer.get_unique_id():
		shop_notice.emit(peer_id, text, positive)
		return
	if peer_id > 0:
		rpc_id(peer_id, "_client_shop_notice", peer_id, text, positive)


func _apply_horde_effect_to_local_player(effect_type: String, item_name: String, int_value: int, float_value: float) -> void:
	var local_player := get_tree().get_first_node_in_group("local_player")
	if local_player == null or not is_instance_valid(local_player):
		return
	match effect_type:
		"unlock_weapon":
			if local_player.has_method("grant_weapon_by_name_local"):
				local_player.call("grant_weapon_by_name_local", item_name)
		"unlock_perk":
			if local_player.has_method("unlock_perk_local"):
				local_player.call("unlock_perk_local", item_name)
		"ammo_pack":
			if local_player.has_method("grant_bullet_pack_local"):
				local_player.call("grant_bullet_pack_local", int_value)
		"heal":
			if local_player.has_method("restore_health_local"):
				local_player.call("restore_health_local", float_value)


func _send_horde_effect(peer_id: int, effect_type: String, item_name: String = "", int_value: int = 0, float_value: float = 0.0) -> void:
	if multiplayer.multiplayer_peer == null or peer_id == multiplayer.get_unique_id():
		_apply_horde_effect_to_local_player(effect_type, item_name, int_value, float_value)
		return
	if peer_id > 0:
		rpc_id(peer_id, "_client_apply_horde_effect", effect_type, item_name, int_value, float_value)


func award_horde_loot(peer_id: int, coin_amount: int, health_bonus: float = 0.0, ammo_bonus: int = 0) -> void:
	if not multiplayer.is_server() or peer_id not in players:
		return
	_ensure_shop_state(peer_id)
	var clamped_coins := maxi(coin_amount, 0)
	if clamped_coins > 0:
		players[peer_id]["coins"] = int(players[peer_id].get("coins", 0)) + clamped_coins
		_sync_player_coins_for(peer_id)
	if ammo_bonus > 0:
		_send_horde_effect(peer_id, "ammo_pack", "", ammo_bonus, 0.0)
	if health_bonus > 0.0:
		_send_horde_effect(peer_id, "heal", "", 0, health_bonus)
	var loot_parts: Array[String] = []
	if clamped_coins > 0:
		loot_parts.append("+%d COINS" % clamped_coins)
	if ammo_bonus > 0:
		loot_parts.append("+%d BULLETS" % ammo_bonus)
	if health_bonus > 0.0:
		loot_parts.append("+%d HP" % int(round(health_bonus)))
	if not loot_parts.is_empty():
		_emit_shop_notice(peer_id, " // ".join(loot_parts), true)
		if _is_local_peer(peer_id):
			play_effect("pick-coins")


func purchase_horde_item(item_id: String) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_server_purchase_horde_item(multiplayer.get_unique_id(), item_id)
		return
	rpc_id(1, "_server_request_purchase_horde_item", item_id)


func _server_purchase_horde_item(peer_id: int, item_id: String) -> void:
	if not multiplayer.is_server() or peer_id not in players:
		return
	if not can_open_horde_shop():
		_emit_shop_notice(peer_id, "SHOP CLOSED", false)
		return
	var price := _horde_item_price(item_id)
	if price <= 0:
		_emit_shop_notice(peer_id, "INVALID ITEM", false)
		return
	_ensure_shop_state(peer_id)
	var current_coins := int(players[peer_id].get("coins", 0))
	if current_coins < price:
		_emit_shop_notice(peer_id, "NEED %d COINS" % price, false)
		return
	players[peer_id]["coins"] = current_coins - price
	_sync_player_coins_for(peer_id)
	match item_id:
		"PISTOL", "SMG", "AK", "SNIPER":
			var owned_weapons := players[peer_id].get("horde_weapons", ["KNIFE"]) as Array
			if not owned_weapons.has(item_id):
				owned_weapons.append(item_id)
			_send_horde_effect(peer_id, "unlock_weapon", item_id)
			_emit_shop_notice(peer_id, "%s PURCHASED" % item_id, true)
		"PERK_DOUBLE_JUMP", "PERK_DASH", "PERK_ARMOR", "PERK_REGEN":
			var owned_perks := players[peer_id].get("horde_perks", []) as Array
			if not owned_perks.has(item_id):
				owned_perks.append(item_id)
			players[peer_id]["horde_perks"] = owned_perks
			_send_horde_effect(peer_id, "unlock_perk", item_id)
			_emit_shop_notice(peer_id, "%s UNLOCKED" % item_id.replace("PERK_", ""), true)
		"AMMO":
			_send_horde_effect(peer_id, "ammo_pack", "", HORDE_BULLET_PACK_AMOUNT, 0.0)
			_emit_shop_notice(peer_id, "+%d BULLETS" % HORDE_BULLET_PACK_AMOUNT, true)
		"HEALTH":
			_send_horde_effect(peer_id, "heal", "", 0, HORDE_HEALTH_POTION_HEAL)
			_emit_shop_notice(peer_id, "+%d HP" % int(round(HORDE_HEALTH_POTION_HEAL)), true)
		_:
			players[peer_id]["coins"] = current_coins
			_sync_player_coins_for(peer_id)
			_emit_shop_notice(peer_id, "INVALID ITEM", false)



func get_upgrade_rank(peer_id: int, upgrade_key: String) -> int:
	_ensure_progression(peer_id)
	if peer_id not in players:
		return 0
	var upgrades: Dictionary = players[peer_id].get("upgrades", _default_upgrades())
	return int(upgrades.get(upgrade_key, 0))


func spend_upgrade_point(upgrade_key: String) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_server_spend_upgrade(multiplayer.get_unique_id(), upgrade_key)
		return
	rpc_id(1, "_server_request_spend_upgrade", upgrade_key)


func _server_spend_upgrade(peer_id: int, upgrade_key: String) -> void:
	if not multiplayer.is_server() or peer_id not in players or upgrade_key not in UPGRADE_KEYS:
		return
	_ensure_progression(peer_id)
	var points: int = int(players[peer_id].get("upgrade_points", 0))
	var upgrades: Dictionary = players[peer_id]["upgrades"]
	var current_rank: int = int(upgrades.get(upgrade_key, 0))
	if points <= 0 or current_rank >= UPGRADE_STORAGE_CAP:
		return
	upgrades[upgrade_key] = current_rank + 1
	players[peer_id]["upgrade_points"] = points - 1
	_sync_progression_for(peer_id)


func _add_xp(peer_id: int, amount: int) -> void:
	if peer_id not in players:
		return
	_ensure_progression(peer_id)
	var awarded_amount: int = maxi(amount, 0)
	if awarded_amount <= 0:
		return
	players[peer_id]["xp"] = int(players[peer_id].get("xp", 0)) + awarded_amount
	var level: int = int(players[peer_id].get("level", 1))
	var leveled := false
	while int(players[peer_id]["xp"]) >= _xp_for_next_level(level):
		players[peer_id]["xp"] = int(players[peer_id]["xp"]) - _xp_for_next_level(level)
		level += 1
		players[peer_id]["level"] = level
		players[peer_id]["upgrade_points"] = int(players[peer_id].get("upgrade_points", 0)) + 1
		leveled = true
	_sync_progression_for(peer_id)
	rpc("_notify_xp_gain", peer_id, awarded_amount)
	if leveled:
		level_up.emit(peer_id, level)
		if _is_local_peer(peer_id):
			play_effect("level-up")


func record_damage_dealt(peer_id: int, amount: float) -> void:
	if not multiplayer.is_server() or peer_id not in players:
		return
	var applied_amount: int = int(round(maxf(amount, 0.0)))
	if applied_amount <= 0:
		return
	_ensure_progression(peer_id)
	var stats: Dictionary = players[peer_id].get("stats", _default_stats())
	stats["damage_done"] = int(stats.get("damage_done", 0)) + applied_amount
	players[peer_id]["stats"] = stats
	_sync_progression_for(peer_id)


func record_damage_taken(peer_id: int, amount: float) -> void:
	if not multiplayer.is_server() or peer_id not in players:
		return
	var applied_amount: int = int(round(maxf(amount, 0.0)))
	if applied_amount <= 0:
		return
	_ensure_progression(peer_id)
	var stats: Dictionary = players[peer_id].get("stats", _default_stats())
	stats["damage_taken"] = int(stats.get("damage_taken", 0)) + applied_amount
	players[peer_id]["stats"] = stats
	_sync_progression_for(peer_id)


func _sync_progression_for(peer_id: int) -> void:
	progression_changed.emit(peer_id)
	if _is_local_peer(peer_id):
		_queue_local_profile_save(peer_id)
	rpc("_sync_progression", peer_id, _progression_payload(peer_id))


func _award_round_xp(winner: String) -> void:
	if winner == "runners":
		for peer_id in _get_runner_ids():
			if peer_id in players and bool(players[peer_id].get("alive", false)):
				_ensure_progression(peer_id)
				var runner_stats: Dictionary = players[peer_id].get("stats", _default_stats())
				runner_stats["rounds_won"] = int(runner_stats.get("rounds_won", 0)) + 1
				players[peer_id]["stats"] = runner_stats
				_sync_progression_for(peer_id)
				_add_xp(peer_id, XP_ROUND_WIN)
		return
	if trapper_id in players:
		_ensure_progression(trapper_id)
		var trapper_stats: Dictionary = players[trapper_id].get("stats", _default_stats())
		trapper_stats["rounds_won"] = int(trapper_stats.get("rounds_won", 0)) + 1
		players[trapper_id]["stats"] = trapper_stats
		_sync_progression_for(trapper_id)
		_add_xp(trapper_id, XP_ROUND_WIN)


func _set_state(new_state: GameState) -> void:
	state = new_state
	state_changed.emit(new_state)
	_update_menu_music_for_state(new_state)


func get_my_role() -> Role:
	if multiplayer.multiplayer_peer == null:
		return Role.RUNNER
	var my_id := multiplayer.get_unique_id()
	if my_id in players:
		return players[my_id]["role"]
	return Role.RUNNER


func is_trapper() -> bool:
	if multiplayer.multiplayer_peer == null:
		return false
	return multiplayer.get_unique_id() == trapper_id


func is_admin(peer_id: int) -> bool:
	return peer_id in players and str(players[peer_id].get("account_role", "normal")).to_lower() == "admin"


func is_local_admin() -> bool:
	var local_id := _local_peer_id()
	return local_id != -1 and is_admin(local_id)


func is_player_muted(peer_id: int) -> bool:
	return peer_id in players and bool(players[peer_id].get("muted", false))


func is_steam_banned(steam_id: String) -> bool:
	var normalized_id := steam_id.strip_edges()
	return not normalized_id.is_empty() and banned_steam_ids.has(normalized_id)


func admin_restart_round() -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_restart_round(multiplayer.get_unique_id())
		return
	rpc_id(1, "_server_admin_restart_round")


func admin_load_map(map_scene_path: String) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_load_map(multiplayer.get_unique_id(), map_scene_path)
		return
	rpc_id(1, "_server_admin_load_map", map_scene_path)


func admin_force_lobby() -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_force_lobby(multiplayer.get_unique_id())
		return
	rpc_id(1, "_server_admin_force_lobby")


func admin_toggle_role() -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_toggle_role(multiplayer.get_unique_id())
		return
	rpc_id(1, "_server_admin_toggle_role")


func admin_toggle_player_mute(target_peer_id: int) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_toggle_player_mute(multiplayer.get_unique_id(), target_peer_id)
		return
	rpc_id(1, "_server_admin_toggle_player_mute", target_peer_id)


func admin_ban_player(target_peer_id: int) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_ban_player(multiplayer.get_unique_id(), target_peer_id)
		return
	rpc_id(1, "_server_admin_ban_player", target_peer_id)


func admin_kick_player(target_peer_id: int) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_kick_player(multiplayer.get_unique_id(), target_peer_id)
		return
	rpc_id(1, "_server_admin_kick_player", target_peer_id)


func admin_add_player_xp(target_peer_id: int, amount: int = 100) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_add_player_xp(multiplayer.get_unique_id(), target_peer_id, amount)
		return
	rpc_id(1, "_server_admin_add_player_xp", target_peer_id, amount)


func admin_add_player_level(target_peer_id: int, amount: int = 1) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_add_player_level(multiplayer.get_unique_id(), target_peer_id, amount)
		return
	rpc_id(1, "_server_admin_add_player_level", target_peer_id, amount)


func admin_set_player_admin(target_peer_id: int, enabled: bool) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_set_player_admin(multiplayer.get_unique_id(), target_peer_id, enabled)
		return
	rpc_id(1, "_server_admin_set_player_admin", target_peer_id, enabled)


func admin_set_player_vip(target_peer_id: int, enabled: bool) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_set_player_vip(multiplayer.get_unique_id(), target_peer_id, enabled)
		return
	rpc_id(1, "_server_admin_set_player_vip", target_peer_id, enabled)


func admin_extend_player_vip(target_peer_id: int, extra_days: int) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_extend_player_vip(multiplayer.get_unique_id(), target_peer_id, extra_days)
		return
	rpc_id(1, "_server_admin_extend_player_vip", target_peer_id, extra_days)


func admin_force_player_role(target_peer_id: int, role_name: String) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_force_player_role(multiplayer.get_unique_id(), target_peer_id, role_name)
		return
	rpc_id(1, "_server_admin_force_player_role", target_peer_id, role_name)


func admin_adjust_gravity(delta_scale: float) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_adjust_gravity(multiplayer.get_unique_id(), get_world_gravity_scale() + delta_scale)
		return
	rpc_id(1, "_server_admin_adjust_gravity", get_world_gravity_scale() + delta_scale)


func admin_set_gravity_scale(gravity_scale: float) -> void:
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_admin_adjust_gravity(multiplayer.get_unique_id(), gravity_scale)
		return
	rpc_id(1, "_server_admin_adjust_gravity", gravity_scale)


func _can_admin_peer(actor_peer_id: int) -> bool:
	return actor_peer_id in players and is_admin(actor_peer_id)


func _set_player_muted(target_peer_id: int, muted: bool) -> void:
	if target_peer_id not in players:
		return
	players[target_peer_id]["muted"] = muted
	if muted:
		muted_players[target_peer_id] = true
	else:
		muted_players.erase(target_peer_id)
	moderation_changed.emit(target_peer_id)
	rpc("_sync_player_moderation", target_peer_id, muted)


func _ban_player(target_peer_id: int) -> void:
	if target_peer_id not in players:
		return
	var steam_id := str(players[target_peer_id].get("steam_id", "")).strip_edges()
	if steam_id.is_empty():
		return
	banned_steam_ids[steam_id] = true
	_set_player_muted(target_peer_id, true)
	if multiplayer.multiplayer_peer != null and multiplayer.multiplayer_peer.has_method("disconnect_peer"):
		multiplayer.multiplayer_peer.call("disconnect_peer", target_peer_id)


func _apply_admin_restart_round(actor_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	debug_restart_round()


func _apply_admin_load_map(actor_peer_id: int, map_scene_path: String) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	debug_load_map(map_scene_path)


func _apply_admin_force_lobby(actor_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	_reset_to_lobby()


func _apply_admin_toggle_role(actor_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	var make_trapper: bool = int(players[actor_peer_id]["role"]) != Role.TRAPPER
	trapper_id = actor_peer_id if make_trapper else -1
	for id in players:
		players[id]["role"] = Role.TRAPPER if make_trapper and id == actor_peer_id else Role.RUNNER
		players[id]["alive"] = true
	rpc("_sync_roles", _get_role_map(), trapper_id)
	_respawn_players()


func _apply_admin_toggle_player_mute(actor_peer_id: int, target_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id == actor_peer_id or target_peer_id not in players:
		return
	_set_player_muted(target_peer_id, not is_player_muted(target_peer_id))


func _apply_admin_ban_player(actor_peer_id: int, target_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id == actor_peer_id or target_peer_id not in players:
		return
	_ban_player(target_peer_id)


func _apply_admin_kick_player(actor_peer_id: int, target_peer_id: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id == actor_peer_id or target_peer_id not in players:
		return
	if multiplayer.multiplayer_peer != null and multiplayer.multiplayer_peer.has_method("disconnect_peer"):
		multiplayer.multiplayer_peer.call("disconnect_peer", target_peer_id)


func _apply_admin_add_player_xp(actor_peer_id: int, target_peer_id: int, amount: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	_add_xp(target_peer_id, maxi(amount, 0))


func _apply_admin_add_player_level(actor_peer_id: int, target_peer_id: int, amount: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	_ensure_progression(target_peer_id)
	var applied_amount := maxi(amount, 0)
	if applied_amount <= 0:
		return
	players[target_peer_id]["level"] = int(players[target_peer_id].get("level", 1)) + applied_amount
	players[target_peer_id]["upgrade_points"] = int(players[target_peer_id].get("upgrade_points", 0)) + applied_amount
	_sync_progression_for(target_peer_id)


func _apply_admin_set_player_admin(actor_peer_id: int, target_peer_id: int, enabled: bool) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	var new_role := "admin" if enabled else "normal"
	players[target_peer_id]["account_role"] = new_role
	if not enabled and str(players[target_peer_id].get("vip_status", "inactive")).to_lower() in ["trial", "active"]:
		players[target_peer_id]["account_role"] = "vip"
	_sync_progression_for(target_peer_id)


func _apply_admin_set_player_vip(actor_peer_id: int, target_peer_id: int, enabled: bool) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	if enabled:
		players[target_peer_id]["account_role"] = "vip" if not is_admin(target_peer_id) else "admin"
		players[target_peer_id]["vip_status"] = "active"
		players[target_peer_id]["vip_expires_at"] = null
		players[target_peer_id]["vip_last_purchase_source"] = "admin_grant"
	else:
		if not is_admin(target_peer_id):
			players[target_peer_id]["account_role"] = "normal"
		players[target_peer_id]["vip_status"] = "inactive"
		players[target_peer_id]["vip_expires_at"] = null
		players[target_peer_id]["vip_last_purchase_source"] = "admin_remove"
	_sync_progression_for(target_peer_id)


func _apply_admin_extend_player_vip(actor_peer_id: int, target_peer_id: int, extra_days: int) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	var days_to_add := maxi(extra_days, 0)
	if days_to_add <= 0:
		return
	var current_expiry_unix := _vip_expiry_unix_from_player(target_peer_id)
	var base_unix := maxi(current_expiry_unix, int(Time.get_unix_time_from_system()))
	var extended_unix := base_unix + days_to_add * 86400
	players[target_peer_id]["vip_status"] = "active"
	players[target_peer_id]["vip_expires_at"] = _iso_datetime_from_unix(extended_unix)
	players[target_peer_id]["vip_last_purchase_source"] = "admin_extend_%dd" % days_to_add
	if not is_admin(target_peer_id):
		players[target_peer_id]["account_role"] = "vip"
	_sync_progression_for(target_peer_id)


func _apply_admin_force_player_role(actor_peer_id: int, target_peer_id: int, role_name: String) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	if target_peer_id not in players:
		return
	var normalized_role := role_name.to_lower().strip_edges()
	if normalized_role == "trapper":
		trapper_id = target_peer_id
		for id in players:
			players[id]["role"] = Role.TRAPPER if id == target_peer_id else Role.RUNNER
			players[id]["alive"] = true
	elif normalized_role == "runner":
		if target_peer_id == trapper_id:
			var replacement_trapper := -1
			for id in players.keys():
				if int(id) != target_peer_id:
					replacement_trapper = int(id)
					break
			trapper_id = replacement_trapper
		for id in players:
			players[id]["role"] = Role.TRAPPER if id == trapper_id and trapper_id != -1 else Role.RUNNER
			players[id]["alive"] = true
	else:
		return
	rpc("_sync_roles", _get_role_map(), trapper_id)
	_respawn_players()


func _apply_admin_adjust_gravity(actor_peer_id: int, gravity_scale: float) -> void:
	if not multiplayer.is_server() or not _can_admin_peer(actor_peer_id):
		return
	world_settings["gravity_scale"] = clampf(gravity_scale, MIN_WORLD_GRAVITY_SCALE, MAX_WORLD_GRAVITY_SCALE)
	rpc("_sync_world_settings", get_world_settings())
	world_settings_changed.emit(get_world_settings())


# --- RPCs (client-side sync) -------------------------------------------------

@rpc("authority", "call_local", "reliable")
func _sync_countdown(duration: float, trapper: int, role_map: Dictionary) -> void:
	countdown_timer = duration
	trapper_id = trapper
	for id in role_map:
		if id in players:
			players[id]["role"] = role_map[id]
			players[id]["alive"] = true
	_set_state(GameState.COUNTDOWN)


@rpc("authority", "call_local", "reliable")
func _sync_round_start() -> void:
	round_timer = ROUND_TIME
	_set_state(GameState.PLAYING)
	round_started.emit()
	play_effect("spawn-after-warmup")


@rpc("authority", "call_local", "reliable")
func _sync_round_end(winner: String) -> void:
	_set_state(GameState.ROUND_OVER)
	round_ended.emit(winner)


@rpc("authority", "call_local", "reliable")
func _sync_lobby() -> void:
	for id in players:
		players[id]["alive"] = true
	_set_state(GameState.LOBBY)


@rpc("any_peer", "call_remote", "reliable")
func _server_request_spend_upgrade(upgrade_key: String) -> void:
	if not multiplayer.is_server():
		return
	_server_spend_upgrade(multiplayer.get_remote_sender_id(), upgrade_key)


@rpc("any_peer", "call_remote", "reliable")
func _server_request_purchase_horde_item(item_id: String) -> void:
	if not multiplayer.is_server():
		return
	_server_purchase_horde_item(multiplayer.get_remote_sender_id(), item_id)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_restart_round() -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_restart_round(multiplayer.get_remote_sender_id())


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_load_map(map_scene_path: String) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_load_map(multiplayer.get_remote_sender_id(), map_scene_path)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_force_lobby() -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_force_lobby(multiplayer.get_remote_sender_id())


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_toggle_role() -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_toggle_role(multiplayer.get_remote_sender_id())


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_toggle_player_mute(target_peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_toggle_player_mute(multiplayer.get_remote_sender_id(), target_peer_id)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_ban_player(target_peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_ban_player(multiplayer.get_remote_sender_id(), target_peer_id)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_kick_player(target_peer_id: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_kick_player(multiplayer.get_remote_sender_id(), target_peer_id)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_add_player_xp(target_peer_id: int, amount: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_add_player_xp(multiplayer.get_remote_sender_id(), target_peer_id, amount)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_add_player_level(target_peer_id: int, amount: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_add_player_level(multiplayer.get_remote_sender_id(), target_peer_id, amount)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_set_player_admin(target_peer_id: int, enabled: bool) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_set_player_admin(multiplayer.get_remote_sender_id(), target_peer_id, enabled)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_set_player_vip(target_peer_id: int, enabled: bool) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_set_player_vip(multiplayer.get_remote_sender_id(), target_peer_id, enabled)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_extend_player_vip(target_peer_id: int, extra_days: int) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_extend_player_vip(multiplayer.get_remote_sender_id(), target_peer_id, extra_days)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_force_player_role(target_peer_id: int, role_name: String) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_force_player_role(multiplayer.get_remote_sender_id(), target_peer_id, role_name)


@rpc("any_peer", "call_remote", "reliable")
func _server_admin_adjust_gravity(gravity_scale: float) -> void:
	if not multiplayer.is_server():
		return
	_apply_admin_adjust_gravity(multiplayer.get_remote_sender_id(), gravity_scale)


@rpc("authority", "call_remote", "reliable")
func _sync_progression(peer_id: int, progression: Dictionary) -> void:
	if peer_id not in players:
		return
	players[peer_id]["name"] = str(progression.get("name", players[peer_id].get("name", "")))
	players[peer_id]["steam_id"] = str(progression.get("steam_id", players[peer_id].get("steam_id", "")))
	players[peer_id]["account_role"] = str(progression.get("account_role", players[peer_id].get("account_role", "normal"))).to_lower()
	players[peer_id]["vip_status"] = str(progression.get("vip_status", players[peer_id].get("vip_status", "inactive"))).to_lower()
	players[peer_id]["vip_trial_used"] = bool(progression.get("vip_trial_used", players[peer_id].get("vip_trial_used", false)))
	players[peer_id]["vip_expires_at"] = progression.get("vip_expires_at", players[peer_id].get("vip_expires_at", null))
	players[peer_id]["vip_last_purchase_source"] = str(progression.get("vip_last_purchase_source", players[peer_id].get("vip_last_purchase_source", "")))
	players[peer_id]["xp"] = int(progression.get("xp", 0))
	players[peer_id]["level"] = int(progression.get("level", 1))
	players[peer_id]["upgrade_points"] = int(progression.get("upgrade_points", 0))
	players[peer_id]["upgrades"] = progression.get("upgrades", _default_upgrades())
	players[peer_id]["stats"] = progression.get("stats", _default_stats())
	progression_changed.emit(peer_id)
	if _is_local_peer(peer_id):
		_queue_local_profile_save(peer_id)


@rpc("authority", "call_remote", "reliable")
func _sync_player_coins(peer_id: int, coins: int) -> void:
	if peer_id not in players:
		return
	players[peer_id]["coins"] = max(coins, 0)
	coins_changed.emit(peer_id, int(players[peer_id]["coins"]))
	if _is_local_peer(peer_id):
		_queue_local_profile_save(peer_id)


@rpc("authority", "call_remote", "reliable")
func _sync_player_moderation(peer_id: int, muted: bool) -> void:
	if peer_id not in players:
		return
	players[peer_id]["muted"] = muted
	moderation_changed.emit(peer_id)


@rpc("authority", "call_remote", "reliable")
func _client_apply_horde_effect(effect_type: String, item_name: String, int_value: int, float_value: float) -> void:
	_apply_horde_effect_to_local_player(effect_type, item_name, int_value, float_value)


@rpc("authority", "call_remote", "reliable")
func _client_shop_notice(peer_id: int, text: String, positive: bool) -> void:
	shop_notice.emit(peer_id, text, positive)


@rpc("authority", "call_local", "reliable")
func _notify_xp_gain(peer_id: int, amount: int) -> void:
	xp_gained.emit(peer_id, amount)


@rpc("authority", "call_remote", "reliable")
func _sync_player_died(peer_id: int, attacker_id: int = -1) -> void:
	if peer_id in players:
		players[peer_id]["alive"] = false
		# Server-authoritative: only server should mutate stats
		# Clients receive the sync but don't increment deaths locally
	player_died.emit(peer_id)
	
	if attacker_id == _local_peer_id() and not is_horde_mode():
		var player_node := get_tree().root.find_child(str(_local_peer_id()), true, false)
		if player_node and player_node.has_method("register_deathrun_kill"):
			player_node.call("register_deathrun_kill")


@rpc("authority", "call_remote", "reliable")
func _sync_player_finished(peer_id: int) -> void:
	if peer_id in players:
		players[peer_id]["finishes"] = int(players[peer_id].get("finishes", 0)) + 1
	player_finished.emit(peer_id)


@rpc("authority", "call_local", "reliable")
func _sync_roles(role_map: Dictionary, trapper: int) -> void:
	trapper_id = trapper
	for id in role_map:
		if id in players:
			players[id]["role"] = role_map[id]


@rpc("authority", "call_local", "reliable")
func _sync_world_settings(settings: Dictionary) -> void:
	world_settings = settings.duplicate(true)
	world_settings_changed.emit(get_world_settings())


@rpc("any_peer", "call_remote", "reliable")
func _server_apply_profile_snapshot(profile_payload: Dictionary) -> void:
	if not multiplayer.is_server():
		return
	var sender_id := multiplayer.get_remote_sender_id()
	if sender_id not in players:
		return
	_apply_profile_to_player(sender_id, profile_payload)
	_sync_progression_for(sender_id)


func _apply_authenticated_identity(peer_id: int) -> void:
	if peer_id not in players:
		return
	var steam_service := _steam_service()
	if steam_service == null or not steam_service.has_method("is_authenticated"):
		return
	if not bool(steam_service.call("is_authenticated")):
		return
	var display_name := str(steam_service.call("get_display_name")).strip_edges()
	var authenticated_steam_id := str(steam_service.call("get_steam_id")).strip_edges()
	if not display_name.is_empty():
		players[peer_id]["name"] = display_name
	if not authenticated_steam_id.is_empty():
		players[peer_id]["steam_id"] = authenticated_steam_id
	if _is_local_peer(peer_id) and user_settings.get("use_custom_nickname", false) and not str(user_settings.get("custom_nickname", "")).strip_edges().is_empty():
		players[peer_id]["name"] = str(user_settings.get("custom_nickname", "")).strip_edges()


func _apply_pending_local_profile(peer_id: int) -> void:
	if _pending_local_profile.is_empty():
		return
	_apply_profile_to_player(peer_id, _pending_local_profile)


func _apply_profile_to_player(peer_id: int, profile_payload: Dictionary) -> void:
	if peer_id not in players:
		return
	_apply_authenticated_identity(peer_id)
	var player_data: Dictionary = players[peer_id]
	var steam_name := str(profile_payload.get("steam_name", profile_payload.get("name", player_data.get("name", ""))))
	var steam_id := str(profile_payload.get("steam_id", player_data.get("steam_id", "")))
	if not steam_name.is_empty():
		player_data["name"] = steam_name
	if not steam_id.is_empty():
		player_data["steam_id"] = steam_id
	player_data["xp"] = clampi(int(profile_payload.get("xp", player_data.get("xp", 0))), 0, 9999999)
	player_data["level"] = clampi(int(profile_payload.get("level", player_data.get("level", 1))), 1, 9999)
	player_data["upgrade_points"] = clampi(int(profile_payload.get("upgrade_points", player_data.get("upgrade_points", 0))), 0, 999)
	player_data["coins"] = clampi(int(profile_payload.get("coins", player_data.get("coins", 0))), 0, 9999999)
	if profile_payload.get("upgrades", null) is Dictionary:
		player_data["upgrades"] = (profile_payload.get("upgrades", _default_upgrades()) as Dictionary).duplicate(true)
	if profile_payload.get("stats", null) is Dictionary:
		player_data["stats"] = (profile_payload.get("stats", _default_stats()) as Dictionary).duplicate(true)
	if profile_payload.get("horde_weapons", null) is Array:
		player_data["horde_weapons"] = (profile_payload.get("horde_weapons", ["KNIFE"]) as Array).duplicate()
	var account_defaults := _default_account_profile()
	player_data["account_role"] = str(profile_payload.get("account_role", account_defaults["account_role"])).to_lower()
	player_data["vip_status"] = str(profile_payload.get("vip_status", account_defaults["vip_status"])).to_lower()
	player_data["vip_trial_used"] = bool(profile_payload.get("vip_trial_used", account_defaults["vip_trial_used"]))
	player_data["vip_expires_at"] = profile_payload.get("vip_expires_at", account_defaults["vip_expires_at"])
	player_data["vip_last_purchase_source"] = str(profile_payload.get("vip_last_purchase_source", account_defaults["vip_last_purchase_source"]))
	_ensure_progression(peer_id)
	players[peer_id] = player_data


func _queue_local_profile_save(peer_id: int) -> void:
	if not _is_local_peer(peer_id):
		return
	var backend_service := _backend_service()
	if backend_service == null or not backend_service.has_method("queue_profile_save"):
		return
	backend_service.call("queue_profile_save", export_local_profile(peer_id))


func _current_avatar_url() -> String:
	if user_settings.get("use_custom_avatar", false) and not str(user_settings.get("custom_avatar_path", "")).strip_edges().is_empty():
		return str(user_settings.get("custom_avatar_path", "")).strip_edges()
	var backend_service := _backend_service()
	if backend_service != null and backend_service.has_method("get_avatar_url"):
		return str(backend_service.call("get_avatar_url"))
	var steam_service := _steam_service()
	if steam_service != null and steam_service.has_method("get_avatar_url"):
		return str(steam_service.call("get_avatar_url"))
	return ""

# test

# --- Audio & Settings Management ---
var sfx_volume_db: float = 0.0
var user_settings: Dictionary = {
	"music_volume": 80.0,
	"sfx_volume": 80.0,
	"use_custom_nickname": false,
	"custom_nickname": "",
	"use_custom_avatar": false,
	"custom_avatar_path": "",
	"email": "",
	"email_confirmed": false
}
const SETTINGS_FILE_PATH := "user://settings.json"

func load_settings() -> void:
	if FileAccess.file_exists(SETTINGS_FILE_PATH):
		var file := FileAccess.open(SETTINGS_FILE_PATH, FileAccess.READ)
		if file != null:
			var content := file.get_as_text()
			var parsed = JSON.parse_string(content)
			if parsed is Dictionary:
				for key in parsed:
					user_settings[key] = parsed[key]
	apply_audio_settings()

func save_settings() -> void:
	var file := FileAccess.open(SETTINGS_FILE_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(user_settings, "\t"))
		file.close()

func get_settings() -> Dictionary:
	return user_settings

func apply_audio_settings() -> void:
	var music_val: float = float(user_settings.get("music_volume", 80.0))
	var sfx_val: float = float(user_settings.get("sfx_volume", 80.0))
	
	sfx_volume_db = linear_to_db(sfx_val / 100.0)
	if sfx_val <= 0.0:
		sfx_volume_db = -80.0
		
	menu_music_volume_db = linear_to_db(music_val / 100.0) - 6.0
	if music_val <= 0.0:
		menu_music_volume_db = -80.0
		
	ingame_music_volume_db = linear_to_db(music_val / 100.0) - 6.0
	if music_val <= 0.0:
		ingame_music_volume_db = -80.0
	
	if _menu_music_player != null and _menu_music_player.playing:
		_menu_music_player.volume_db = menu_music_volume_db
	if _ingame_music_player != null and _ingame_music_player.playing:
		_ingame_music_player.volume_db = ingame_music_volume_db

var _audio_streams: Dictionary = {}
var _audio_players: Array = []
var _menu_music_player: AudioStreamPlayer
var menu_music_volume_db: float = -6.0
var _ingame_music_player: AudioStreamPlayer
var ingame_music_volume_db: float = -6.0

# BUG-L3: single canonical font loader used by HUD and Lobby (was duplicated).
func load_font_from_file(font_path: String) -> FontFile:
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(font_path)
	return font if not font.data.is_empty() else null

func _ready() -> void:
	_ready_audio()
	load_settings()

func _ready_audio() -> void:
	var sfx_path := "res://assets/sounds/effects/"
	var kill_path := "res://assets/sounds/killsound/"
	_preload_audio_dir(sfx_path)
	_preload_audio_dir(kill_path)
	for i in range(16):
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_audio_players.append(p)
	
	_menu_music_player = AudioStreamPlayer.new()
	_menu_music_player.bus = "Master"
	var music_path := "res://assets/sounds/mainmenu-music.mp3"
	if ResourceLoader.exists(music_path):
		var stream := ResourceLoader.load(music_path) as AudioStream
		if stream != null:
			_menu_music_player.stream = stream
	add_child(_menu_music_player)

	_ingame_music_player = AudioStreamPlayer.new()
	_ingame_music_player.bus = "Master"
	var ingame_music_path := "res://assets/sounds/ingame-music.mp3"
	if ResourceLoader.exists(ingame_music_path):
		var stream := ResourceLoader.load(ingame_music_path) as AudioStream
		if stream != null:
			_ingame_music_player.stream = stream
	add_child(_ingame_music_player)

	_update_menu_music_for_state(state)
	get_tree().node_added.connect(_on_node_added)
	_hook_buttons_recursive(get_tree().root)

func _on_node_added(node: Node) -> void:
	if node is BaseButton:
		# Some buttons can be restyled/re-added, so guard against duplicate connect.
		if not node.mouse_entered.is_connected(_on_button_hover):
			node.mouse_entered.connect(_on_button_hover)
		if not node.pressed.is_connected(_on_button_pressed):
			node.pressed.connect(_on_button_pressed)

func _hook_buttons_recursive(node: Node) -> void:
	if node is BaseButton:
		_hook_button(node)
	for child in node.get_children():
		_hook_buttons_recursive(child)

func _hook_button(button: BaseButton) -> void:
	if not button.mouse_entered.is_connected(_on_button_hover):
		button.mouse_entered.connect(_on_button_hover)
	if not button.pressed.is_connected(_on_button_pressed):
		button.pressed.connect(_on_button_pressed)

func _on_button_hover() -> void:
	play_effect("hover-over-any-menu-shop-etc")

func _on_button_pressed() -> void:
	play_effect("press-menu")


func _is_map_scene_active() -> bool:
	var current_scene := get_tree().current_scene
	if current_scene == null:
		return false
	var scene_path := String(current_scene.scene_file_path)
	if scene_path.find("/scenes/maps/") != -1:
		return true
	var n := String(current_scene.name).to_lower()
	return n.find("map") != -1

func _update_menu_music_for_state(new_state: GameState) -> void:
	if _menu_music_player == null or _ingame_music_player == null:
		return
	var use_menu_music := (new_state == GameState.LOBBY and not _is_map_scene_active())
	if use_menu_music:
		if _ingame_music_player.playing:
			_ingame_music_player.stop()
		if not _menu_music_player.playing:
			_menu_music_player.volume_db = menu_music_volume_db
			_menu_music_player.play()
	else:
		if _menu_music_player.playing:
			_menu_music_player.stop()
		if not _ingame_music_player.playing:
			_ingame_music_player.volume_db = ingame_music_volume_db
			_ingame_music_player.play()

func _process_menu_music(_delta: float) -> void:
	if _menu_music_player and _menu_music_player.playing:
		var pos := _menu_music_player.get_playback_position()
		if pos >= MENU_MUSIC_LOOP_AT:
			_menu_music_player.play(0.0)
			_menu_music_player.volume_db = menu_music_volume_db
		elif pos >= MENU_MUSIC_FADEOUT_AT:
			var ratio := (pos - MENU_MUSIC_FADEOUT_AT) / (MENU_MUSIC_LOOP_AT - MENU_MUSIC_FADEOUT_AT)
			_menu_music_player.volume_db = lerpf(menu_music_volume_db, -60.0, ratio)
		else:
			_menu_music_player.volume_db = menu_music_volume_db

	if _ingame_music_player and _ingame_music_player.playing:
		var pos := _ingame_music_player.get_playback_position()
		if pos >= 73.0:
			_ingame_music_player.play(0.0)
			_ingame_music_player.volume_db = ingame_music_volume_db
		elif pos >= 69.0:
			var ratio := (pos - 69.0) / 4.0
			_ingame_music_player.volume_db = lerpf(ingame_music_volume_db, -60.0, ratio)
		else:
			_ingame_music_player.volume_db = ingame_music_volume_db

func _preload_audio_dir(path: String) -> void:
	var dir := DirAccess.open(path)
	if dir != null:
		dir.list_dir_begin()
		var file_name := dir.get_next()
		while file_name != "":
			if not dir.current_is_dir() and file_name.ends_with(".mp3"):
				var res_path := path + file_name
				var stream := ResourceLoader.load(res_path)
				if stream != null:
					if stream is AudioStreamMP3:
						stream.loop = false
					_audio_streams[file_name] = stream
					var base_name := file_name.trim_suffix(".mp3")
					_audio_streams[base_name] = stream
			file_name = dir.get_next()
		dir.list_dir_end()

func play_effect(sound_name: String, volume_db: float = 0.0, pitch_scale: float = 1.0) -> void:
	if _audio_streams.has(sound_name):
		var stream = _audio_streams[sound_name]
		
		# Define strict concurrency limits - if limit hit, SKIP (don't voice steal, avoid pop artifacts)
		var limit = 8
		if sound_name == "single-footstep":
			limit = 1
		elif sound_name == "running-fast":
			limit = 1
		elif sound_name == "Large-beast-monster-footsteps":
			limit = 2
		elif sound_name == "landing":
			limit = 2
		elif sound_name == "zoom-in-weapons":
			limit = 1
		elif sound_name == "run-out-of-energy":
			limit = 1
			
		# Count how many players are already playing this exact stream
		var active_count = 0
		for p in _audio_players:
			if p.playing and p.stream == stream:
				active_count += 1
				
		# If at or over limit, skip entirely - the sound is already playing
		if active_count >= limit:
			return

		for p in _audio_players:
			if not p.playing:
				p.stream = stream
				p.volume_db = volume_db + sfx_volume_db
				p.pitch_scale = pitch_scale
				p.play()
				return

func play_kill_sound(kill_count: int, weapon_name: String = "") -> void:
	if weapon_name.to_upper() == "KNIFE" and _audio_streams.has("knife-kill"):
		play_effect("knife-kill")
		return

	var sound_to_play := ""
	match kill_count:
		1: sound_to_play = "firstkill-1kill"
		2: sound_to_play = "doublekill-2kill"
		3: sound_to_play = "triplekill-3kill"
		5: sound_to_play = "comboking-kill-5-without-taking-any-damage"
		6: sound_to_play = "ultrakill-6kill"
		10: sound_to_play = "multikill-10kill"
		12: sound_to_play = "dominating-12kill"
		14: sound_to_play = "godlike-14kill"
		16: sound_to_play = "killingspree-16kill"
		18: sound_to_play = "ludicrouskill-18kill"
		19: sound_to_play = "megakill-19kill"
		20: sound_to_play = "rampage-20kill"
		25: sound_to_play = "monsterkill-25kill"
	
	if sound_to_play != "":
		play_effect(sound_to_play)
