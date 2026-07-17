extends Node

signal avatar_ready(steam_id: String, texture: Texture2D)
signal avatar_failed(steam_id: String)

const PROFILE_XML_URL := "https://steamcommunity.com/profiles/%s/?xml=1"
const REQUEST_TIMEOUT_SEC := 12.0

var _cache: Dictionary = {}
var _inflight: Dictionary = {}


func _ready() -> void:
	# Connect to GodotSteam's avatar_loaded callback if available
	if Engine.has_singleton("Steam"):
		var steam := Engine.get_singleton("Steam")
		if steam.has_signal("avatar_loaded"):
			steam.avatar_loaded.connect(_on_steam_avatar_loaded)
		if steam.has_signal("persona_state_change"):
			steam.persona_state_change.connect(_on_persona_state_change)


func request_local_avatar() -> void:
	var steam_service := get_node_or_null("/root/SteamService")
	if steam_service == null or not steam_service.has_method("get_steam_id"):
		return
	request_avatar(str(steam_service.call("get_steam_id")))


func request_avatar(steam_id: String) -> void:
	var id := steam_id.strip_edges()
	if id.is_empty():
		return
	
	# If this is the local user and custom avatar is enabled, prioritize it
	var steam_service := get_node_or_null("/root/SteamService")
	var local_steam_id := ""
	if steam_service != null and steam_service.has_method("get_steam_id"):
		local_steam_id = str(steam_service.call("get_steam_id")).strip_edges()
	
	if id == local_steam_id or id.begins_with("OFFLINE_"):
		var settings = GameManager.call("get_settings")
		if settings.get("use_custom_avatar", false):
			var path: String = settings.get("custom_avatar_path", "")
			if not path.is_empty():
				var cached = get_cached_avatar(id)
				if cached != null:
					avatar_ready.emit(id, cached)
					return
				
				if path.begins_with("http://") or path.begins_with("https://"):
					_fetch_custom_avatar_url(id, path)
					return
				else:
					var tex = _load_custom_avatar_texture(path)
					if tex != null:
						_cache["custom_local_avatar_" + path] = tex
						_cache[id] = tex
						avatar_ready.emit(id, tex)
						return

	if _cache.has(id):
		avatar_ready.emit(id, _cache[id])
		return
	if _inflight.has(id):
		return

	# --- PRIMARY: GodotSteam native avatar (instant, no HTTP needed) ---
	if _try_fetch_steam_native_avatar(id):
		return

	# --- FALLBACK: HTTP XML scrape ---
	var request := HTTPRequest.new()
	request.timeout = REQUEST_TIMEOUT_SEC
	request.request_completed.connect(_on_request_completed.bind(id))
	add_child(request)
	_inflight[id] = request
	var err := request.request(PROFILE_XML_URL % id)
	if err != OK:
		_cleanup_request(id)
		avatar_failed.emit(id)


func get_cached_avatar(steam_id: String) -> Texture2D:
	var id := steam_id.strip_edges()
	if id.is_empty():
		return null
	
	var steam_service := get_node_or_null("/root/SteamService")
	var local_steam_id := ""
	if steam_service != null and steam_service.has_method("get_steam_id"):
		local_steam_id = str(steam_service.call("get_steam_id")).strip_edges()
		
	if id == local_steam_id or id.begins_with("OFFLINE_"):
		var settings = GameManager.call("get_settings")
		if settings.get("use_custom_avatar", false):
			var path: String = settings.get("custom_avatar_path", "")
			if not path.is_empty():
				if _cache.has("custom_local_avatar_" + path):
					return _cache["custom_local_avatar_" + path] as Texture2D
				if not (path.begins_with("http://") or path.begins_with("https://")):
					var tex = _load_custom_avatar_texture(path)
					if tex != null:
						_cache["custom_local_avatar_" + path] = tex
						_cache[id] = tex
						return tex
	
	if not _cache.has(id):
		return null
	return _cache[id] as Texture2D

func _load_custom_avatar_texture(path: String) -> Texture2D:
	if not FileAccess.file_exists(path):
		return null
	var image := Image.new()
	var err := image.load(path)
	if err == OK:
		return ImageTexture.create_from_image(image)
	return null

func _fetch_custom_avatar_url(steam_id: String, url: String) -> void:
	if _inflight.has(steam_id):
		return
	var request := HTTPRequest.new()
	request.timeout = REQUEST_TIMEOUT_SEC
	request.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray):
		_cleanup_request(steam_id)
		if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
			avatar_failed.emit(steam_id)
			return
		var image := Image.new()
		var load_err := image.load_jpg_from_buffer(body)
		if load_err != OK:
			load_err = image.load_png_from_buffer(body)
		if load_err != OK:
			load_err = image.load_webp_from_buffer(body)
		if load_err != OK:
			avatar_failed.emit(steam_id)
			return
		var texture := ImageTexture.create_from_image(image)
		_cache["custom_local_avatar_" + url] = texture
		_cache[steam_id] = texture
		avatar_ready.emit(steam_id, texture)
	)
	add_child(request)
	_inflight[steam_id] = request
	if request.request(url) != OK:
		_cleanup_request(steam_id)
		avatar_failed.emit(steam_id)



func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, steam_id: String) -> void:
	_cleanup_request(steam_id)
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		avatar_failed.emit(steam_id)
		return
	var avatar_url := _extract_avatar_url(body.get_string_from_utf8())
	if avatar_url.is_empty():
		avatar_failed.emit(steam_id)
		return
	_fetch_avatar_image(steam_id, avatar_url)


func _fetch_avatar_image(steam_id: String, url: String) -> void:
	var request := HTTPRequest.new()
	request.timeout = REQUEST_TIMEOUT_SEC
	request.request_completed.connect(_on_image_completed.bind(steam_id))
	add_child(request)
	_inflight[steam_id] = request
	if request.request(url) != OK:
		_cleanup_request(steam_id)
		avatar_failed.emit(steam_id)


func _on_image_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, steam_id: String) -> void:
	_cleanup_request(steam_id)
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		avatar_failed.emit(steam_id)
		return
	var image := Image.new()
	var load_err := image.load_jpg_from_buffer(body)
	if load_err != OK:
		load_err = image.load_png_from_buffer(body)
	if load_err != OK:
		load_err = image.load_webp_from_buffer(body)
	if load_err != OK:
		avatar_failed.emit(steam_id)
		return
	var texture := ImageTexture.create_from_image(image)
	_cache[steam_id] = texture
	avatar_ready.emit(steam_id, texture)


func _extract_avatar_url(xml_text: String) -> String:
	var key := "<avatarFull><![CDATA["
	var start := xml_text.find(key)
	if start != -1:
		start += key.length()
		var end := xml_text.find("]]></avatarFull>", start)
		if end != -1:
			return xml_text.substr(start, end - start).strip_edges()
	key = "<avatarFull>"
	start = xml_text.find(key)
	if start == -1:
		return ""
	start += key.length()
	var end_plain := xml_text.find("</avatarFull>", start)
	if end_plain == -1:
		return ""
	return xml_text.substr(start, end_plain - start).strip_edges()


func _cleanup_request(steam_id: String) -> void:
	if not _inflight.has(steam_id):
		return
	var request: HTTPRequest = _inflight[steam_id]
	_inflight.erase(steam_id)
	if is_instance_valid(request):
		request.queue_free()


## ---- GodotSteam native avatar helpers --------------------------------

func _try_fetch_steam_native_avatar(steam_id: String) -> bool:
	## Returns true if GodotSteam can supply the avatar immediately.
	## steam_id is a SteamID64 string.
	if not Engine.has_singleton("Steam"):
		return false
	var steam := Engine.get_singleton("Steam")
	var id64 := int(steam_id) if steam_id.is_valid_int() else 0
	if id64 == 0:
		return false

	# getLargeFriendAvatar returns a handle (int). -1 = pending, 0 = none.
	if not steam.has_method("getLargeFriendAvatar"):
		return false
	var handle: int = int(steam.call("getLargeFriendAvatar", id64))

	if handle > 0:
		# Avatar is immediately available — decode it
		var tex := _steam_handle_to_texture(steam, handle)
		if tex != null:
			_cache[steam_id] = tex
			avatar_ready.emit(steam_id, tex)
			return true
		return false

	# handle == -1 means Steam is still loading the avatar.
	# The avatar_loaded signal will fire when it's ready.
	if handle == -1:
		return true  # Handled via signal, don't fall through to HTTP

	return false  # handle == 0 → no avatar set, let HTTP try


func _steam_handle_to_texture(steam: Object, handle: int) -> ImageTexture:
	if not steam.has_method("getImageSize") or not steam.has_method("getImageRGBA"):
		return null
	var size: Dictionary = steam.call("getImageSize", handle)
	var w: int = int(size.get("width", 0))
	var h: int = int(size.get("height", 0))
	if w <= 0 or h <= 0:
		return null
	var rgba: PackedByteArray = steam.call("getImageRGBA", handle)
	if rgba.is_empty():
		return null
	var image := Image.create_from_data(w, h, false, Image.FORMAT_RGBA8, rgba)
	if image == null:
		return null
	return ImageTexture.create_from_image(image)


func _on_steam_avatar_loaded(id64: int, width: int, height: int) -> void:
	## GodotSteam fires this when an async avatar finishes loading.
	var steam_id := str(id64)
	if not Engine.has_singleton("Steam"):
		return
	var steam := Engine.get_singleton("Steam")
	var handle: int = int(steam.call("getLargeFriendAvatar", id64))
	if handle <= 0:
		return
	var tex := _steam_handle_to_texture(steam, handle)
	if tex != null:
		_cache[steam_id] = tex
		avatar_ready.emit(steam_id, tex)


func _on_persona_state_change(steam_id: int, _flags: int) -> void:
	## Re-fetch avatar when a user's persona data refreshes.
	var id_str := str(steam_id)
	# Invalidate stale cache so next request fetches fresh avatar
	if _cache.has(id_str):
		_cache.erase(id_str)
	_try_fetch_steam_native_avatar(id_str)
