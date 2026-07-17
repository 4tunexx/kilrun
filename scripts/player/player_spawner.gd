extends Node3D

# PlayerSpawner
# Spawns and despawns player scenes over the network.
# Automatically collects children named "RunnerSpawn*" and "TrapperSpawn".

const PlayerScene := preload("res://scenes/player/fps_player.tscn")
const STATE_COUNTDOWN := 1
const ROLE_TRAPPER := 1

var _runner_spawns: Array[Node3D] = []
var _trapper_spawn: Node3D = null
var _runner_spawn_index: int = 0

@onready var game_manager: Node = get_node("/root/GameManager")
@onready var network_manager: Node = get_node("/root/NetworkManager")


func _players() -> Dictionary:
	return game_manager.get("players") as Dictionary


func _ready() -> void:
	# Auto-collect spawn markers from children
	for child in get_children():
		if child.name.begins_with("RunnerSpawn"):
			_runner_spawns.append(child)
		elif child.name == "TrapperSpawn":
			_trapper_spawn = child

	network_manager.connect("player_connected", Callable(self, "_on_player_connected"))
	network_manager.connect("player_disconnected", Callable(self, "_on_player_disconnected"))
	game_manager.connect("state_changed", Callable(self, "_on_state_changed"))
	game_manager.connect("round_started", Callable(self, "_on_round_started"))


func _on_state_changed(new_state: int) -> void:
	if new_state == STATE_COUNTDOWN:
		_runner_spawn_index = 0
		if multiplayer.multiplayer_peer == null or multiplayer.is_server():
			for peer_id in _players():
				_spawn_player(peer_id)


func _on_round_started() -> void:
	# Server spawns all registered players
	if multiplayer.multiplayer_peer == null:
		return
	if not multiplayer.is_server():
		return
	_runner_spawn_index = 0
	for peer_id in _players():
		_spawn_player(peer_id)


func _on_player_connected(_peer_id: int) -> void:
	pass  # Spawning handled at round start


func _on_player_disconnected(peer_id: int) -> void:
	_despawn_player(peer_id)


func _spawn_player(peer_id: int) -> void:
	# Set spawn position
	var spawn_pos: Vector3 = Vector3(0, 1.0, 0)
	var players := _players()
	if players[peer_id]["role"] == ROLE_TRAPPER:
		if _trapper_spawn:
			spawn_pos = _trapper_spawn.global_position
	else:
		if not _runner_spawns.is_empty():
			spawn_pos = _runner_spawns[_runner_spawn_index % _runner_spawns.size()].global_position
			_runner_spawn_index += 1

	var existing := get_node_or_null(str(peer_id))
	if existing:
		if existing.has_method("respawn_at"):
			existing.call("respawn_at", spawn_pos)
			rpc("_client_spawn_player", peer_id, spawn_pos)
		return

	var player := PlayerScene.instantiate()
	player.name = str(peer_id)
	add_child(player, true)  # true = use readable name for multiplayer

	if player.has_method("respawn_at"):
		player.call("respawn_at", spawn_pos)
	else:
		player.global_position = spawn_pos
	rpc("_client_spawn_player", peer_id, spawn_pos)


func _despawn_player(peer_id: int) -> void:
	var node := get_node_or_null(str(peer_id))
	if node:
		node.queue_free()
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		rpc("_client_despawn_player", peer_id)


@rpc("authority", "call_remote", "reliable")
func _client_spawn_player(peer_id: int, spawn_pos: Vector3) -> void:
	var existing := get_node_or_null(str(peer_id))
	if existing:
		if existing.has_method("respawn_at"):
			existing.call("respawn_at", spawn_pos)
		return
	var player := PlayerScene.instantiate()
	player.name = str(peer_id)
	add_child(player)
	if player.has_method("respawn_at"):
		player.call("respawn_at", spawn_pos)
	else:
		player.global_position = spawn_pos


@rpc("authority", "call_remote", "reliable")
func _client_despawn_player(peer_id: int) -> void:
	var node := get_node_or_null(str(peer_id))
	if node:
		node.queue_free()
