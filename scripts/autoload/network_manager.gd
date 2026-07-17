extends Node

# NetworkManager - Autoload singleton
# Handles ENet connections, peer events, and player registration

const DEFAULT_PORT := 7777
const MAX_CLIENTS := 16

var player_name: String = "Player"
var steam_id: String = ""

@onready var game_manager: Node = get_node_or_null("/root/GameManager")
@onready var steam_service: Node = get_node_or_null("/root/SteamService")

signal server_created()
signal joined_server()
signal connection_failed()
signal player_connected(peer_id: int)
signal player_disconnected(peer_id: int)


func _players() -> Dictionary:
	if game_manager == null:
		return {}
	return game_manager.get("players") as Dictionary


func _ready() -> void:
	if game_manager == null:
		push_warning("[NetworkManager] GameManager autoload not found — network features will be limited.")
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)


func create_server(port: int = DEFAULT_PORT) -> Error:
	refresh_local_identity()
	if player_name.is_empty() or steam_id.is_empty():
		push_warning("[NetworkManager] Steam identity is required before hosting.")
		connection_failed.emit()
		return ERR_UNCONFIGURED
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_CLIENTS)
	if err != OK:
		push_error("Failed to create server: %s" % error_string(err))
		return err
	multiplayer.multiplayer_peer = peer
	# Server registers itself as a player
	if game_manager != null:
		var local_profile: Dictionary = game_manager.call("export_local_profile") as Dictionary
		game_manager.call("register_player", 1, player_name, steam_id, local_profile)
	server_created.emit()
	print("[NetworkManager] Server started on port %d" % port)
	return OK


func join_server(address: String, port: int = DEFAULT_PORT) -> Error:
	refresh_local_identity()
	if player_name.is_empty() or steam_id.is_empty():
		push_warning("[NetworkManager] Steam identity is required before joining.")
		connection_failed.emit()
		return ERR_UNCONFIGURED
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		push_error("Failed to connect: %s" % error_string(err))
		return err
	multiplayer.multiplayer_peer = peer
	print("[NetworkManager] Connecting to %s:%d" % [address, port])
	return OK


func disconnect_from_game() -> void:
	if multiplayer.multiplayer_peer:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	_players().clear()
	if game_manager != null:
		game_manager.call("reset_local_state")


func refresh_local_identity() -> void:
	if steam_service != null and steam_service.has_method("is_authenticated") and bool(steam_service.call("is_authenticated")):
		player_name = str(steam_service.call("get_display_name")).strip_edges()
		steam_id = str(steam_service.call("get_steam_id")).strip_edges()
	else:
		player_name = "Player"
		steam_id = "OFFLINE_" + str(OS.get_unique_id())
	
	# Override if settings custom nickname is active
	var settings = game_manager.call("get_settings")
	if settings.get("use_custom_nickname", false) and not str(settings.get("custom_nickname", "")).strip_edges().is_empty():
		player_name = str(settings.get("custom_nickname", "")).strip_edges()


# ─── Multiplayer callbacks ────────────────────────────────────────────────────

func _on_peer_connected(peer_id: int) -> void:
	print("[NetworkManager] Peer connected: %d" % peer_id)
	player_connected.emit(peer_id)
	# Server tells new peer about existing players and vice versa
	if multiplayer.is_server():
		# Send existing players to the new peer
		var players := _players()
		for existing_id in players:
			var pname: String = players[existing_id]["name"]
			var profile_payload: Dictionary = game_manager.call("get_progression", existing_id) as Dictionary
			rpc_id(peer_id, "_register_remote_player", existing_id, pname, str(players[existing_id].get("steam_id", "")), profile_payload)
		# Tell everyone about the new peer (they'll send their name via RPC)
		rpc_id(peer_id, "_request_player_info")
		# Sync current game state so late-joining clients don't stay at LOBBY
		var current_state: int = int(game_manager.get("state"))
		var countdown_const: int = 1  # GameState.COUNTDOWN
		var playing_const: int = 2    # GameState.PLAYING
		if current_state == countdown_const or current_state == playing_const:
			var countdown_dur: float = float(game_manager.get("countdown_timer"))
			var trapper: int = int(game_manager.get("trapper_id"))
			var role_map: Dictionary = game_manager.call("_get_role_map") as Dictionary
			game_manager.rpc_id(peer_id, "_sync_countdown", countdown_dur, trapper, role_map)
			if current_state == playing_const:
				game_manager.rpc_id(peer_id, "_sync_round_start")


func _on_peer_disconnected(peer_id: int) -> void:
	print("[NetworkManager] Peer disconnected: %d" % peer_id)
	game_manager.call("unregister_player", peer_id)
	player_disconnected.emit(peer_id)
	rpc("_remove_remote_player", peer_id)


func _on_connected_to_server() -> void:
	print("[NetworkManager] Connected to server.")
	joined_server.emit()
	# Send our info to server
	rpc_id(1, "_register_remote_player", multiplayer.get_unique_id(), player_name, steam_id, game_manager.call("export_local_profile"))


func _on_connection_failed() -> void:
	push_warning("[NetworkManager] Connection failed.")
	connection_failed.emit()


func _on_server_disconnected() -> void:
	push_warning("[NetworkManager] Server disconnected.")
	disconnect_from_game()


# ─── RPCs ─────────────────────────────────────────────────────────────────────

@rpc("any_peer", "call_local", "reliable")
func _register_remote_player(peer_id: int, pname: String, psteam_id: String = "", profile_payload: Dictionary = {}) -> void:
	if multiplayer.is_server() and peer_id != multiplayer.get_unique_id() and game_manager.has_method("is_steam_banned") and bool(game_manager.call("is_steam_banned", psteam_id)):
		if multiplayer.multiplayer_peer != null and multiplayer.multiplayer_peer.has_method("disconnect_peer"):
			multiplayer.multiplayer_peer.call("disconnect_peer", peer_id)
		return
	if peer_id not in _players():
		game_manager.call("register_player", peer_id, pname, psteam_id, profile_payload)
		print("[NetworkManager] Registered player %d (%s)" % [peer_id, pname])


@rpc("any_peer", "call_local", "reliable")
func _remove_remote_player(peer_id: int) -> void:
	game_manager.call("unregister_player", peer_id)


@rpc("authority", "call_remote", "reliable")
func _request_player_info() -> void:
	# Server asks us to re-send our info
	rpc_id(1, "_register_remote_player", multiplayer.get_unique_id(), player_name, steam_id, game_manager.call("export_local_profile"))
