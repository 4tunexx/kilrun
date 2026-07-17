extends Node

signal state_changed()
signal profile_loaded(profile: Dictionary)
signal profile_saved(profile: Dictionary)
signal profile_error(message: String)
signal vip_checkout_ready(url: String)
signal vip_trial_started(profile: Dictionary)
signal admin_player_updated(target_steam_id: String, updates: Dictionary)
signal admin_ban_created(target_steam_id: String)
signal admin_ban_removed(target_steam_id: String)
signal admin_action_logged(action_type: String, target_steam_id: String)
signal admin_snapshot_loaded(snapshot: Dictionary)

const SUPABASE_URL_SETTING := "killrun/backend/supabase_url"
const SUPABASE_ANON_KEY_SETTING := "killrun/backend/supabase_anon_key"
const STEAM_AUTH_FUNCTION_SETTING := "killrun/backend/steam_auth_function"
const PROFILE_SAVE_FUNCTION_SETTING := "killrun/backend/profile_save_function"
const ADMIN_UPDATE_FUNCTION_SETTING := "killrun/backend/admin_update_function"
const ADMIN_BAN_FUNCTION_SETTING := "killrun/backend/admin_ban_function"
const ADMIN_UNBAN_FUNCTION_SETTING := "killrun/backend/admin_unban_function"
const ADMIN_SNAPSHOT_FUNCTION_SETTING := "killrun/backend/admin_snapshot_function"
const ADMIN_LOG_FUNCTION_SETTING := "killrun/backend/admin_log_function"
const VIP_TRIAL_FUNCTION_SETTING := "killrun/backend/vip_trial_function"
const VIP_CHECKOUT_FUNCTION_SETTING := "killrun/backend/vip_checkout_function"
const VIP_CHECKOUT_SUCCESS_URL_SETTING := "killrun/backend/vip_checkout_success_url"
const VIP_CHECKOUT_CANCEL_URL_SETTING := "killrun/backend/vip_checkout_cancel_url"
const STRIPE_VIP_PRICE_ID_SETTING := "killrun/backend/stripe_vip_price_id"

var _profile: Dictionary = {}
var _profile_ready: bool = false
var _loading_profile: bool = false
var _saving_profile: bool = false
var _pending_save: Dictionary = {}
var _save_timeout_timer: float = 0.0
const SAVE_TIMEOUT_SEC := 30.0
var _last_error: String = ""
var _status_text: String = "PROFILE SYNC // WAITING FOR STEAM"
var _admin_snapshot: Dictionary = {
	"active_bans": [],
	"recent_logs": []
}
var _admin_snapshot_loading: bool = false


func _ready() -> void:
	call_deferred("_bind_services")


func _process(delta: float) -> void:
	if _saving_profile:
		_save_timeout_timer += delta
		if _save_timeout_timer >= SAVE_TIMEOUT_SEC:
			push_warning("[BackendService] Save timed out, resetting save lock")
			_saving_profile = false
			_save_timeout_timer = 0.0
			if not _pending_save.is_empty():
				_flush_pending_save()
	else:
		_save_timeout_timer = 0.0


func is_profile_ready() -> bool:
	return _profile_ready


func has_profile() -> bool:
	return not _profile.is_empty()


func get_profile() -> Dictionary:
	return _profile.duplicate(true)


func get_avatar_url() -> String:
	return str(_profile.get("avatar_url", ""))


func get_status_text() -> String:
	return _status_text


func get_admin_snapshot() -> Dictionary:
	return _admin_snapshot.duplicate(true)


func get_account_role() -> String:
	return str(_profile.get("account_role", "normal"))


func get_vip_status() -> String:
	return str(_profile.get("vip_status", "inactive"))


func can_start_vip_trial() -> bool:
	return not bool(_profile.get("vip_trial_used", false))


func has_vip() -> bool:
	return get_account_role() == "vip" or get_vip_status() in ["trial", "active"]


func retry_profile_load() -> void:
	authenticate_with_backend(true)


func authenticate_with_backend(force: bool = false) -> void:
	if _loading_profile:
		return
	if _profile_ready and not force:
		return
	var steam_service := _steam_service()
	if steam_service == null:
		_set_error("PROFILE SYNC // STEAM SERVICE NOT FOUND")
		return
	if not bool(steam_service.call("is_authenticated")):
		_profile_ready = false
		_profile.clear()
		_status_text = "PROFILE SYNC // WAITING FOR STEAM"
		state_changed.emit()
		return
	if not _has_backend_config():
		_set_error("PROFILE SYNC // SUPABASE NOT CONFIGURED")
		return
	var payload := steam_service.call("get_auth_payload") as Dictionary
	if str(payload.get("auth_ticket", "")).is_empty():
		_set_error("PROFILE SYNC // STEAM AUTH TICKET REQUIRED")
		return
	_loading_profile = true
	_last_error = ""
	_status_text = "PROFILE SYNC // VERIFYING STEAM"
	state_changed.emit()
	_send_function_request(_steam_auth_function_name(), payload, "_on_auth_completed")


func queue_profile_save(profile_payload: Dictionary) -> void:
	if profile_payload.is_empty():
		return
	_pending_save = profile_payload.duplicate(true)
	if _saving_profile:
		return
	if not _profile_ready:
		return
	_flush_pending_save()


func start_vip_trial() -> void:
	if not _profile_ready:
		_set_error("VIP TRIAL // PROFILE NOT READY")
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload")
	}
	_status_text = "VIP TRIAL // STARTING"
	state_changed.emit()
	_send_function_request(_vip_trial_function_name(), payload, "_on_vip_trial_completed")


func create_vip_checkout() -> void:
	if not _profile_ready:
		_set_error("VIP ORDER // PROFILE NOT READY")
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"price_id": _stripe_vip_price_id(),
		"success_url": _vip_checkout_success_url(),
		"cancel_url": _vip_checkout_cancel_url()
	}
	_status_text = "VIP ORDER // OPENING CHECKOUT"
	state_changed.emit()
	_send_function_request(_vip_checkout_function_name(), payload, "_on_vip_checkout_completed")


func admin_update_player(target_steam_id: String, updates: Dictionary) -> void:
	if target_steam_id.strip_edges().is_empty() or updates.is_empty():
		return
	if not _profile_ready:
		_set_error("ADMIN UPDATE // PROFILE NOT READY")
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"target_steam_id": target_steam_id.strip_edges(),
		"updates": updates.duplicate(true)
	}
	_status_text = "ADMIN UPDATE // WRITING PLAYER STATE"
	state_changed.emit()
	_send_function_request(_admin_update_function_name(), payload, "_on_admin_update_completed")


func admin_ban_player(target_steam_id: String, target_name: String, reason: String = "BANNED FROM ADMIN CONSOLE", expires_at = null) -> void:
	if target_steam_id.strip_edges().is_empty():
		return
	if not _profile_ready:
		_set_error("ADMIN BAN // PROFILE NOT READY")
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"target_steam_id": target_steam_id.strip_edges(),
		"target_name": target_name,
		"reason": reason,
		"expires_at": expires_at
	}
	_status_text = "ADMIN BAN // WRITING BAN"
	state_changed.emit()
	_send_function_request(_admin_ban_function_name(), payload, "_on_admin_ban_completed")


func admin_log_action(action_type: String, target_steam_id: String = "", target_name: String = "", details: Dictionary = {}) -> void:
	if action_type.strip_edges().is_empty():
		return
	if not _profile_ready:
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"action_type": action_type.strip_edges().to_lower(),
		"target_steam_id": target_steam_id.strip_edges(),
		"target_name": target_name,
		"details": details.duplicate(true)
	}
	_send_function_request(_admin_log_function_name(), payload, "_on_admin_log_completed")


func load_admin_snapshot(force: bool = false) -> void:
	if _admin_snapshot_loading and not force:
		return
	if not _profile_ready:
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	_admin_snapshot_loading = true
	var payload := {
		"auth": steam_service.call("get_auth_payload")
	}
	_send_function_request(_admin_snapshot_function_name(), payload, "_on_admin_snapshot_completed")


func admin_unban_player(target_steam_id: String) -> void:
	if target_steam_id.strip_edges().is_empty():
		return
	if not _profile_ready:
		_set_error("ADMIN UNBAN // PROFILE NOT READY")
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"target_steam_id": target_steam_id.strip_edges()
	}
	_status_text = "ADMIN UNBAN // REMOVING BAN"
	state_changed.emit()
	_send_function_request(_admin_unban_function_name(), payload, "_on_admin_unban_completed")


func _bind_services() -> void:
	var steam_service := _steam_service()
	if steam_service == null:
		_set_error("PROFILE SYNC // STEAM SERVICE NOT FOUND")
		return
	if steam_service.has_signal("auth_state_changed") and not steam_service.is_connected("auth_state_changed", Callable(self, "_on_steam_state_changed")):
		steam_service.connect("auth_state_changed", Callable(self, "_on_steam_state_changed"))
	if steam_service.has_signal("auth_ticket_changed") and not steam_service.is_connected("auth_ticket_changed", Callable(self, "_on_steam_ticket_changed")):
		steam_service.connect("auth_ticket_changed", Callable(self, "_on_steam_ticket_changed"))
	_on_steam_state_changed()


func _on_steam_state_changed() -> void:
	var steam_service := _steam_service()
	if steam_service == null:
		return
	if bool(steam_service.call("is_authenticated")):
		authenticate_with_backend()
		return
	_profile_ready = false
	_profile.clear()
	_pending_save.clear()
	_last_error = ""
	_status_text = str(steam_service.call("get_status_text"))
	state_changed.emit()


func _on_steam_ticket_changed(_ticket: String) -> void:
	if _profile_ready:
		return
	authenticate_with_backend()


func _flush_pending_save() -> void:
	if _pending_save.is_empty():
		return
	var steam_service := _steam_service()
	if steam_service == null:
		return
	if str(steam_service.call("get_auth_ticket")).is_empty():
		_set_error("PROFILE SAVE // STEAM AUTH TICKET REQUIRED")
		return
	_saving_profile = true
	_last_error = ""
	_status_text = "PROFILE SYNC // SAVING PROGRESS"
	state_changed.emit()
	var payload := {
		"auth": steam_service.call("get_auth_payload"),
		"profile": _pending_save.duplicate(true)
	}
	_send_function_request(_profile_save_function_name(), payload, "_on_save_completed")


func _on_auth_completed(success: bool, status_code: int, body: String) -> void:
	_loading_profile = false
	if not success:
		var parsed_error: Variant = JSON.parse_string(body)
		if parsed_error is Dictionary:
			var error_response := parsed_error as Dictionary
			if status_code == 403 and str(error_response.get("error", "")).to_lower().contains("banned"):
				var ban_reason := str(error_response.get("reason", "ACCOUNT BANNED")).strip_edges()
				_set_error("PROFILE SYNC // BANNED // %s" % ban_reason.to_upper())
				return
		_set_error("PROFILE SYNC // AUTH FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		_set_error("PROFILE SYNC // INVALID AUTH RESPONSE")
		return
	var response := parsed as Dictionary
	var profile_payload: Variant = response.get("profile", response)
	if not profile_payload is Dictionary:
		_set_error("PROFILE SYNC // PROFILE PAYLOAD MISSING")
		return
	_profile = _normalize_profile(profile_payload as Dictionary)
	_profile_ready = true
	_status_text = "PROFILE READY // %s" % str(_profile.get("steam_name", _profile.get("name", "PLAYER"))).to_upper()
	var game_manager := _game_manager()
	if game_manager != null and game_manager.has_method("load_local_profile"):
		game_manager.call("load_local_profile", _profile)
	state_changed.emit()
	profile_loaded.emit(_profile.duplicate(true))
	if not _pending_save.is_empty():
		_flush_pending_save()


func _on_save_completed(success: bool, status_code: int, body: String) -> void:
	_saving_profile = false
	if not success:
		_set_error("PROFILE SAVE // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if parsed is Dictionary:
		var response := parsed as Dictionary
		var profile_payload: Variant = response.get("profile", response)
		if profile_payload is Dictionary:
			_profile = _normalize_profile(profile_payload as Dictionary)
	_pending_save.clear()
	_status_text = "PROFILE READY // %s" % str(_profile.get("steam_name", _profile.get("name", "PLAYER"))).to_upper()
	state_changed.emit()
	profile_saved.emit(_profile.duplicate(true))


func _on_vip_trial_completed(success: bool, status_code: int, body: String) -> void:
	if not success:
		_set_error("VIP TRIAL // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if parsed is Dictionary:
		var response := parsed as Dictionary
		var profile_payload: Variant = response.get("profile", response)
		if profile_payload is Dictionary:
			_profile = _normalize_profile(profile_payload as Dictionary)
			var game_manager := _game_manager()
			if game_manager != null and game_manager.has_method("load_local_profile"):
				game_manager.call("load_local_profile", _profile)
	_status_text = "VIP TRIAL // ACTIVE"
	state_changed.emit()
	vip_trial_started.emit(_profile.duplicate(true))


func _on_vip_checkout_completed(success: bool, status_code: int, body: String) -> void:
	if not success:
		_set_error("VIP ORDER // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		_set_error("VIP ORDER // INVALID RESPONSE")
		return
	var response := parsed as Dictionary
	var checkout_url := str(response.get("url", ""))
	if checkout_url.is_empty():
		_set_error("VIP ORDER // CHECKOUT URL MISSING")
		return
	_status_text = "VIP ORDER // CHECKOUT READY"
	state_changed.emit()
	vip_checkout_ready.emit(checkout_url)
	OS.shell_open(checkout_url)


func _on_admin_update_completed(success: bool, status_code: int, body: String) -> void:
	if not success:
		_set_error("ADMIN UPDATE // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		_set_error("ADMIN UPDATE // INVALID RESPONSE")
		return
	var response := parsed as Dictionary
	var target_steam_id := str(response.get("target_steam_id", ""))
	var profile_payload: Variant = response.get("profile", {})
	if profile_payload is Dictionary and target_steam_id == str(_profile.get("steam_id", "")):
		_profile = _normalize_profile(profile_payload as Dictionary)
		var game_manager := _game_manager()
		if game_manager != null and game_manager.has_method("load_local_profile"):
			game_manager.call("load_local_profile", _profile)
	_status_text = "PROFILE READY // %s" % str(_profile.get("steam_name", _profile.get("name", "PLAYER"))).to_upper()
	state_changed.emit()
	admin_player_updated.emit(target_steam_id, response.get("updates", {}) as Dictionary)


func _on_admin_ban_completed(success: bool, status_code: int, body: String) -> void:
	if not success:
		_set_error("ADMIN BAN // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		_set_error("ADMIN BAN // INVALID RESPONSE")
		return
	var response := parsed as Dictionary
	var ban_payload: Variant = response.get("ban", {})
	var target_steam_id := ""
	if ban_payload is Dictionary:
		target_steam_id = str((ban_payload as Dictionary).get("steam_id", ""))
	_status_text = "PROFILE READY // %s" % str(_profile.get("steam_name", _profile.get("name", "PLAYER"))).to_upper()
	state_changed.emit()
	admin_ban_created.emit(target_steam_id)
	load_admin_snapshot(true)


func _on_admin_unban_completed(success: bool, status_code: int, body: String) -> void:
	if not success:
		_set_error("ADMIN UNBAN // FAILED (%d)" % status_code)
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		_set_error("ADMIN UNBAN // INVALID RESPONSE")
		return
	var response := parsed as Dictionary
	var target_steam_id := str(response.get("target_steam_id", ""))
	_status_text = "PROFILE READY // %s" % str(_profile.get("steam_name", _profile.get("name", "PLAYER"))).to_upper()
	state_changed.emit()
	admin_ban_removed.emit(target_steam_id)
	load_admin_snapshot(true)


func _on_admin_log_completed(success: bool, _status_code: int, body: String) -> void:
	if not success:
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		return
	var response := parsed as Dictionary
	var log_payload: Variant = response.get("log", {})
	if not log_payload is Dictionary:
		return
	var log_dict := log_payload as Dictionary
	admin_action_logged.emit(str(log_dict.get("action_type", "")), str(log_dict.get("target_steam_id", "")))
	load_admin_snapshot(true)


func _on_admin_snapshot_completed(success: bool, _status_code: int, body: String) -> void:
	_admin_snapshot_loading = false
	if not success:
		return
	var parsed: Variant = JSON.parse_string(body)
	if not parsed is Dictionary:
		return
	var response := parsed as Dictionary
	_admin_snapshot = {
		"active_bans": response.get("active_bans", []),
		"recent_logs": response.get("recent_logs", [])
	}
	admin_snapshot_loaded.emit(get_admin_snapshot())


func _normalize_profile(profile_payload: Dictionary) -> Dictionary:
	var normalized := {
		"steam_id": str(profile_payload.get("steam_id", "")),
		"steam_name": str(profile_payload.get("steam_name", profile_payload.get("name", ""))),
		"avatar_url": str(profile_payload.get("avatar_url", "")),
		"account_role": str(profile_payload.get("account_role", "normal")).to_lower(),
		"vip_status": str(profile_payload.get("vip_status", "inactive")).to_lower(),
		"vip_trial_used": bool(profile_payload.get("vip_trial_used", false)),
		"vip_expires_at": profile_payload.get("vip_expires_at", null),
		"vip_last_purchase_source": str(profile_payload.get("vip_last_purchase_source", "")),
		"xp": max(int(profile_payload.get("xp", 0)), 0),
		"level": max(int(profile_payload.get("level", 1)), 1),
		"upgrade_points": max(int(profile_payload.get("upgrade_points", 0)), 0),
		"upgrades": profile_payload.get("upgrades", {}),
		"stats": profile_payload.get("stats", {}),
		"coins": max(int(profile_payload.get("coins", 0)), 0),
		"horde_weapons": profile_payload.get("horde_weapons", ["KNIFE"])
	}
	return normalized


func _send_function_request(function_name: String, payload: Dictionary, callback_name: String) -> void:
	var request := HTTPRequest.new()
	request.timeout = 15.0
	request.request_completed.connect(_on_request_completed.bind(request, callback_name))
	add_child(request)
	var url := "%s/functions/v1/%s" % [_supabase_url().trim_suffix("/"), function_name]
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: %s" % _supabase_anon_key(),
		"Authorization: Bearer %s" % _supabase_anon_key()
	])
	var error := request.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if error != OK:
		if is_instance_valid(request):
			request.queue_free()
		if callback_name == "_on_auth_completed":
			_loading_profile = false
		if callback_name == "_on_save_completed":
			_saving_profile = false
		if callback_name == "_on_admin_snapshot_completed":
			_admin_snapshot_loading = false
		_set_error("PROFILE SYNC // REQUEST FAILED")


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, request: HTTPRequest, callback_name: String) -> void:
	if is_instance_valid(request):
		request.queue_free()
	var body_text := body.get_string_from_utf8()
	var success := result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300
	call(callback_name, success, response_code, body_text)


func _set_error(message: String) -> void:
	_last_error = message
	_profile_ready = false
	_status_text = message
	state_changed.emit()
	profile_error.emit(message)


func _steam_service() -> Node:
	return get_node_or_null("/root/SteamService")


func _game_manager() -> Node:
	return get_node_or_null("/root/GameManager")


func _has_backend_config() -> bool:
	return not _supabase_url().is_empty() and not _supabase_anon_key().is_empty()


func _supabase_url() -> String:
	return str(ProjectSettings.get_setting(SUPABASE_URL_SETTING, ""))


func _supabase_anon_key() -> String:
	return str(ProjectSettings.get_setting(SUPABASE_ANON_KEY_SETTING, ""))


func _steam_auth_function_name() -> String:
	return str(ProjectSettings.get_setting(STEAM_AUTH_FUNCTION_SETTING, "steam-auth"))


func _profile_save_function_name() -> String:
	return str(ProjectSettings.get_setting(PROFILE_SAVE_FUNCTION_SETTING, "save-profile"))


func _admin_update_function_name() -> String:
	return str(ProjectSettings.get_setting(ADMIN_UPDATE_FUNCTION_SETTING, "admin-update-player"))


func _admin_ban_function_name() -> String:
	return str(ProjectSettings.get_setting(ADMIN_BAN_FUNCTION_SETTING, "admin-ban-player"))


func _admin_unban_function_name() -> String:
	return str(ProjectSettings.get_setting(ADMIN_UNBAN_FUNCTION_SETTING, "admin-unban-player"))


func _admin_snapshot_function_name() -> String:
	return str(ProjectSettings.get_setting(ADMIN_SNAPSHOT_FUNCTION_SETTING, "admin-list-moderation"))


func _admin_log_function_name() -> String:
	return str(ProjectSettings.get_setting(ADMIN_LOG_FUNCTION_SETTING, "admin-log-action"))


func _vip_trial_function_name() -> String:
	return str(ProjectSettings.get_setting(VIP_TRIAL_FUNCTION_SETTING, "start-vip-trial"))


func _vip_checkout_function_name() -> String:
	return str(ProjectSettings.get_setting(VIP_CHECKOUT_FUNCTION_SETTING, "create-vip-checkout"))


func _vip_checkout_success_url() -> String:
	return str(ProjectSettings.get_setting(VIP_CHECKOUT_SUCCESS_URL_SETTING, "https://example.com/vip/success"))


func _vip_checkout_cancel_url() -> String:
	return str(ProjectSettings.get_setting(VIP_CHECKOUT_CANCEL_URL_SETTING, "https://example.com/vip/cancel"))


func _stripe_vip_price_id() -> String:
	return str(ProjectSettings.get_setting(STRIPE_VIP_PRICE_ID_SETTING, ""))
