extends Node

signal auth_state_changed()
signal auth_ticket_changed(auth_ticket: String)

const WEB_API_IDENTITY := "killrun"

var _steam: Object = null
var _steam_available: bool = false
var _authenticated: bool = false
var _steam_id: String = ""
var _display_name: String = ""
var _avatar_url: String = ""
var _auth_ticket: String = ""
var _status_text: String = "STEAM REQUIRED // CHECKING CLIENT"


var _retry_timer: float = 0.0
const RETRY_INTERVAL := 2.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("_bootstrap")


func _process(delta: float) -> void:
	if _steam != null and _steam.has_method("run_callbacks"):
		_steam.call("run_callbacks")
	
	if not _authenticated:
		_retry_timer += delta
		if _retry_timer >= RETRY_INTERVAL:
			_retry_timer = 0.0
			_bootstrap()


func retry_init() -> void:
	_bootstrap()


func _bootstrap() -> void:
	if not Engine.has_singleton("Steam"):
		_set_error("STEAM REQUIRED // GODOTSTEAM SINGLETON NOT FOUND")
		return
	_steam = Engine.get_singleton("Steam")
	if _steam.has_method("steamInitEx"):
		_steam.call("steamInitEx")
	elif _steam.has_method("steamInit"):
		_steam.call("steamInit")
	if _steam.has_method("isSteamRunning") and not bool(_steam.call("isSteamRunning")):
		_set_error("STEAM REQUIRED // CLIENT NOT RUNNING")
		return
	_refresh_identity()


func is_authenticated() -> bool:
	return _authenticated


func get_steam_id() -> String:
	return _steam_id


func get_display_name() -> String:
	return _display_name


func get_avatar_url() -> String:
	return _avatar_url


func get_auth_ticket() -> String:
	return _auth_ticket


func get_status_text() -> String:
	return _status_text


func get_auth_payload() -> Dictionary:
	return {
		"steam_id": _steam_id,
		"steam_name": _display_name,
		"avatar_url": _avatar_url,
		"auth_ticket": _auth_ticket,
		"identity": WEB_API_IDENTITY
	}


func refresh_auth_ticket() -> void:
	if not _authenticated:
		return
	var next_ticket := ""
	if _steam != null and _steam.has_method("getAuthTicketForWebApi"):
		next_ticket = _normalize_ticket(_steam.call("getAuthTicketForWebApi", WEB_API_IDENTITY))
	elif _steam != null and _steam.has_method("getAuthSessionTicket"):
		next_ticket = _normalize_ticket(_steam.call("getAuthSessionTicket"))
	_set_auth_ticket(next_ticket)
	if _auth_ticket.is_empty():
		_status_text = "STEAM CONNECTED // WAITING FOR AUTH TICKET"
		auth_state_changed.emit()


func _refresh_identity() -> void:
	if _steam == null:
		_set_error("STEAM REQUIRED // SINGLETON NOT READY")
		return
	if _steam.has_method("loggedOn") and not bool(_steam.call("loggedOn")):
		_set_error("STEAM REQUIRED // SIGN IN TO STEAM")
		return
	if _steam.has_method("isLoggedOn") and not bool(_steam.call("isLoggedOn")):
		_set_error("STEAM REQUIRED // SIGN IN TO STEAM")
		return
	_steam_available = true
	_steam_id = _resolve_steam_id(_call_steam("getSteamID"))
	_display_name = str(_call_steam("getPersonaName", ""))
	if _display_name.is_empty():
		_display_name = "STEAM USER"
	if _steam_id.is_empty() or _steam_id == "0":
		_set_error("STEAM REQUIRED // COULD NOT READ STEAM ID")
		return
	_avatar_url = "https://steamcommunity.com/profiles/%s" % _steam_id
	_authenticated = true
	_status_text = "STEAM CONNECTED // %s" % _display_name.to_upper()
	auth_state_changed.emit()
	refresh_auth_ticket()


func _resolve_steam_id(raw_value: Variant) -> String:
	if raw_value is Dictionary:
		var dict_value := raw_value as Dictionary
		return str(dict_value.get("steam_id64", dict_value.get("id", dict_value.get("steamid", ""))))
	return str(raw_value)


func _normalize_ticket(raw_value: Variant) -> String:
	if raw_value is PackedByteArray:
		return _bytes_to_hex(raw_value)
	if raw_value is Dictionary:
		var ticket_dict := raw_value as Dictionary
		for key in ["ticket", "auth_ticket", "buffer", "data"]:
			if ticket_dict.has(key):
				return _normalize_ticket(ticket_dict[key])
		return ""
	if raw_value is Array:
		var bytes := PackedByteArray()
		for value in raw_value:
			bytes.append(int(value))
		return _bytes_to_hex(bytes)
	return str(raw_value).strip_edges()


func _bytes_to_hex(bytes: PackedByteArray) -> String:
	var parts: PackedStringArray = []
	parts.resize(bytes.size())
	for index in range(bytes.size()):
		parts[index] = "%02x" % int(bytes[index])
	return "".join(parts)


func _set_auth_ticket(next_ticket: String) -> void:
	var normalized := next_ticket.strip_edges()
	if normalized == _auth_ticket:
		return
	_auth_ticket = normalized
	auth_ticket_changed.emit(_auth_ticket)
	auth_state_changed.emit()


func _set_error(message: String) -> void:
	_steam_available = false
	_authenticated = false
	_steam_id = ""
	_display_name = ""
	_avatar_url = ""
	_auth_ticket = ""
	_status_text = message
	auth_state_changed.emit()


func _call_steam(method_name: String, fallback: Variant = null) -> Variant:
	if _steam == null or not _steam.has_method(method_name):
		return fallback
	return _steam.call(method_name)
