extends CharacterBody3D

enum Weapon {
	KNIFE,
	PISTOL,
	SMG,
	AK,
	SNIPER,
	SHOTGUN,
	REVOLVER
}

# FPSPlayer - CS1.6/Quake-style movement
# Attach to a CharacterBody3D with:
#   - CollisionShape3D (CapsuleShape3D, height 1.8, radius 0.35)
#   - Node3D "Head" at y=0.75 (eye height)
#     - Camera3D

# --- Constants ----------------------------------------------------------------

const GRAVITY: float = 22.0          # units/s�
const JUMP_VELOCITY: float = 6.2
const MAX_SPEED: float = 5.4          # ground target speed
const SPRINT_MULTIPLIER: float = 1.32
const ACCEL: float = 8.5             # ground acceleration
const FRICTION: float = 8.0           # ground friction
const STOP_SPEED: float = 2.1
const COUNTER_STRAFE_BOOST: float = 2.2
const LANDING_FRICTION_GRACE: float = 0.08
const LANDING_FRICTION_SCALE: float = 0.18
const AIR_ACCEL: float = 3.6          # air strafing acceleration
const AIR_CAP: float = 0.18            # forward air accel cap fraction
const AIR_FORWARD_ACCEL: float = 1.75
const AIR_STRAFE_ACCEL: float = 2.45
const AIR_CONTROL: float = 0.72
const AIR_SIDE_SPEED_MULT: float = 0.82
const MAX_AIR_SPEED_MULT: float = 1.05
const LEVEL_SPEED_PER_LEVEL: float = 0.018
const CROUCH_SPEED_MULT: float = 0.58
const CROUCH_HEIGHT: float = 0.9
const STAND_HEIGHT: float = 1.8
const MOUSE_SENSITIVITY: float = 0.002
const MAX_HEALTH: float = 100.0
const MAX_STAMINA: float = 100.0
const STAMINA_DRAIN_RATE: float = MAX_STAMINA / 3.0
const STAMINA_REGEN_RATE: float = 16.0
const EXHAUSTED_RECOVER_THRESHOLD: float = MAX_STAMINA * 0.5
const EXHAUSTED_SPEED_MULT: float = 0.72
const BHOP_SPEED_THRESHOLD: float = 3.0
const BHOP_STAMINA_COST: float = 12.0
const SLIDE_DURATION: float = 0.9
const SLIDE_STAMINA_COST: float = 18.0
const SLIDE_MIN_SPEED: float = 8.8
const SLIDE_DECEL: float = 8.5
const SLIDE_STEER_SPEED: float = 3.6
const SLIDE_ROLL_AMOUNT: float = 0.13
const SLIDE_CAMERA_DROP: float = 0.08
const WALL_JUMP_DETECT_DISTANCE: float = 0.95
const WALL_JUMP_PUSH_SPEED: float = 7.82
const WALL_JUMP_UP_SPEED: float = 6.04
const WALL_JUMP_FORWARD_SPEED: float = 2.04
const WALL_JUMP_COOLDOWN: float = 0.18
const ENERGY_DENIED_COOLDOWN: float = 0.32
const DOUBLE_JUMP_RECHARGE_TIME: float = 20.0
const DOUBLE_JUMP_UP_SPEED: float = 6.9
const DOUBLE_JUMP_AIR_BOOST: float = 1.8
const BUG_SWARM_COOLDOWN_TIME: float = 60.0
const BACK_JUMP_COOLDOWN_TIME: float = 10.0
const BACK_JUMP_STAMINA_COST: float = 24.0
const BACK_JUMP_PUSH_SPEED: float = 10.03
const BACK_JUMP_UP_SPEED: float = 5.53
const BACK_JUMP_SIDE_PUSH_SPEED: float = 2.38
const BACK_JUMP_EFFECT_TIME: float = 0.45
const BACK_JUMP_HEAD_SWIVEL: float = 0.42
const GAME_STATE_PLAYING: int = 2
const WARMUP_FLY_SPEED: float = 14.0
const WARMUP_FLY_SPRINT_SPEED: float = 28.0
const AUDIO_SAMPLE_RATE: int = 22050
const AUDIO_JUMP_DURATION: float = 0.08
const AUDIO_LAND_DURATION: float = 0.16
const AUDIO_SHOOT_DURATION: float = 0.1
const AUDIO_SLIDE_DURATION: float = 0.34
const BHOP_CHAIN_LIMIT: int = 3
const BHOP_LOCKOUT_TIME: float = 6.0
const JUMP_SPAM_BUFFER_COOLDOWN: float = 0.3
const KNIFE_DAMAGE: float = 45.0
const PISTOL_DAMAGE: float = 25.0
const SMG_DAMAGE: float = 16.0
const AK_DAMAGE: float = 32.0
const SNIPER_DAMAGE: float = 95.0
const SHOTGUN_DAMAGE: float = 9.0
const REVOLVER_DAMAGE: float = 62.0

const KNIFE_RANGE: float = 2.4
const PISTOL_RANGE: float = 48.0
const SMG_RANGE: float = 36.0
const AK_RANGE: float = 64.0
const SNIPER_RANGE: float = 128.0
const SHOTGUN_RANGE: float = 14.0
const REVOLVER_RANGE: float = 45.0

const KNIFE_COOLDOWN: float = 0.42
const PISTOL_COOLDOWN: float = 0.24
const SMG_COOLDOWN: float = 0.08
const AK_COOLDOWN: float = 0.12
const SNIPER_COOLDOWN: float = 1.4
const SHOTGUN_COOLDOWN: float = 0.85
const REVOLVER_COOLDOWN: float = 0.62

const PISTOL_MAG_SIZE: int = 12
const SMG_MAG_SIZE: int = 30
const AK_MAG_SIZE: int = 24
const SNIPER_MAG_SIZE: int = 5
const SHOTGUN_MAG_SIZE: int = 8
const REVOLVER_MAG_SIZE: int = 6

const PISTOL_RESERVE_START: int = 60
const SMG_RESERVE_START: int = 120
const AK_RESERVE_START: int = 72
const SNIPER_RESERVE_START: int = 15
const SHOTGUN_RESERVE_START: int = 32
const REVOLVER_RESERVE_START: int = 36

const RELOAD_TIME: float = 1.05
const SMG_RELOAD_TIME: float = 1.4
const AK_RELOAD_TIME: float = 1.8
const SNIPER_RELOAD_TIME: float = 2.4
const SHOTGUN_RELOAD_TIME: float = 2.2
const REVOLVER_RELOAD_TIME: float = 1.75
const DAMAGE_ROLL_LIMIT: float = 0.16
const DAMAGE_ROLL_RECOVERY: float = 7.5
const RESPAWN_LIFT: float = 0.15
var base_fov: float = 74.0
const SPRINT_FOV_BOOST: float = 5.5
const ZOOM_FOV_PULL: float = 11.5
const ZOOM_BLEND_SPEED: float = 8.5
const LANDING_SHAKE_THRESHOLD: float = 4.6
const LANDING_SHAKE_RECOVERY: float = 9.5
const CAMERA_BOB_SPEED: float = 10.5
const CAMERA_BOB_STRENGTH: float = 0.04
const CAMERA_IDLE_SWAY_SPEED: float = 1.8
const CAMERA_IDLE_SWAY_STRENGTH: float = 0.008
const TRACER_DURATION: float = 0.08
const TRACER_THICKNESS: float = 0.028
const IMPACT_FLASH_DURATION: float = 0.12
const PISTOL_SPREAD_BASE: float = 0.0035
const PISTOL_SPREAD_MOVE: float = 0.012
const PISTOL_SPREAD_AIR: float = 0.026
const PISTOL_SPREAD_SPRINT: float = 0.008
const PISTOL_SPREAD_SHOT: float = 0.018
const PISTOL_SPREAD_CROUCH_MULT: float = 0.84
const PISTOL_SPREAD_ZOOM_MULT: float = 0.62
const SHOT_INACCURACY_GAIN: float = 0.5
const SHOT_INACCURACY_RECOVERY: float = 2.2
const SHOTGUN_PELLETS: int = 8
const SHOTGUN_PELLET_SPREAD: float = 0.045
const KNIFE_LUNGE_SPEED: float = 2.4

# --- Live Tuning (Use Remote Inspector) --------------------------------------

@export_group("Viewmodel Tuning")
@export var vm_tuning_enabled: bool = false
@export var vm_pos_offset: Vector3 = Vector3.ZERO
@export var vm_rot_offset: Vector3 = Vector3.ZERO
@export var muzzle_tuning_offset: Vector3 = Vector3.ZERO
@export var vm_visible: bool = true
@export var vm_draw_on_top: bool = true
@export var vm_model_scale: float = 1.0
@export var vm_muzzle_scale: float = 1.0
@export var crosshair_color: Color = Color(0.42, 0.92, 1.0, 0.92)
@export var tracer_color: Color = Color(0.62, 0.92, 1.0, 0.85)
@export var tracer_texture_path: String = ""
@export var muzzle_flash_texture_path: String = ""
@export var show_crosshair: bool = true
@export var show_crosshair_dot: bool = true
@export var crosshair_alpha: float = 0.92
@export var show_tracer: bool = true
@export var show_muzzle_flash: bool = true
@export var muzzle_auto_detect: bool = false
@export var camera_mode: String = "first"
@export var arms_model_path: String = "res://addons/viewmodel_tuner/sample_models/arms_model.tscn"
@export var body_model_path: String = "res://kr_models/player/vip/Untitled.glb"
@export var body_texture_head_path: String = "res://kr_models/player/vip/head2.png"
@export var body_texture_main_path: String = "res://kr_models/player/vip/newsvip.png"
@export var cs_qc_path: String = "res://kr_models/player/vip/vip.qc"
@export var cs_asset_root_path: String = "res://kr_models/player/vip"
@export var vm_bob_intensity: float = 1.0
@export var vm_sway_intensity: float = 1.0
@export var crosshair_thickness: float = 2.0
@export var crosshair_gap: float = 4.0
@export var crosshair_size: float = 6.0
@export var camera_idle_sway_speed: float = 1.8
@export var camera_idle_sway_strength: float = 0.008
@export var recoil_kick_amount: float = 0.12
@export var recoil_recovery_rate: float = 16.0
var _cached_tracer_texture: Texture2D = null
var _cached_muzzle_flash_texture: Texture2D = null
var unlocked_perks: Array[String] = []
var _acid_slow_timer: float = 0.0
var _is_wall_running: bool = false
var _wall_run_side: float = 0.0
var _wall_run_roll: float = 0.0
var _wall_run_cooldown: float = 0.0
var _wall_run_normal: Vector3 = Vector3.ZERO
var wall_run_cooldown_time: float = 0.0
var wall_run_cooldown_total: float = 3.0
var _wall_run_time: float = 0.0
var _ledge_clambering: bool = false
var _clamber_target: Vector3 = Vector3.ZERO
var _clamber_timer: float = 0.0
var _inspect_timer: float = 0.0
var _hitmarker_timer: float = 0.0
var _third_person_camera: Camera3D = null
var _arms_root: Node3D = null
var is_grappling: bool = false
var _was_g_pressed: bool = false
var grapple_target: Vector3 = Vector3.ZERO
var _grapple_rope: MeshInstance3D = null
var _arms_model: Node3D = null
var _arms_anim_time: float = 0.0
var _body_anim_time: float = 0.0
var _body_anim_player: AnimationPlayer = null
var _body_anim_current: String = ""
var _target_camera_y: float = 1.625
var _standing_camera_y: float = 1.625
var _editor_model_pos := Vector3(0, -0.9, 0)
var _editor_model_rot := Vector3(0, 180, 0)
var _editor_model_scale := Vector3(0.0254, 0.0254, 0.0254)
var _editor_camera_pos := Vector3.ZERO
var _world_model_editor_bottom: float = -0.9
var _cs_sequences_recovered: bool = false
var _world_model_anim_setup_done: bool = false
var _body_anim_priority_timer: float = 0.0

# Bhop: if the player presses jump just before landing, allow auto-jump
const BHOP_WINDOW: float = 0.1

signal health_changed(current_health: float, max_health: float)
signal stamina_changed(current_stamina: float, max_stamina: float, exhausted: bool)
signal ammo_changed(current_ammo: int, reserve_ammo: int, reloading: bool)
signal weapon_changed(weapon_name: String)
signal hit_marker(lethal: bool)
signal damage_feedback(intensity: float, lethal: bool)
signal damage_dealt(amount: float, lethal: bool)
signal energy_denied(source: String)
signal double_jump_charge_changed(current_charge: float, max_charge: float, ready: bool)
signal kill_streak_changed(kills: int)

const REQUIRED_GAMEPLAY_SEQUENCE_NAMES: PackedStringArray = [
	"idle1", "walk", "run", "crouch_idle", "crouchrun", "jump",
	"death1", "death2", "death3", "longjump", "back", "swim",
	"treadwater", "forward", "gut_flinch", "head_flinch", "gutshot", "head"
]

# --- State --------------------------------------------------------------------

var is_crouching: bool = false
var jump_buffer: float = 0.0          # seconds until bhop window expires
var _held_bhop_count: int = 0
var _jump_tap_cooldown: float = 0.0
var bhop_lockout_time: float = 0.0
var bhop_lockout_total: float = BHOP_LOCKOUT_TIME
var camera_pitch: float = 0.0
var health: float = MAX_HEALTH
var stamina: float = MAX_STAMINA
var current_weapon: int = Weapon.PISTOL
var attack_cooldown: float = 0.0
var damage_roll: float = 0.0
var _afk_timer: float = 0.0
var _played_afk_30: bool = false
var _played_afk_50: bool = false
var _disable_local_optional_visuals: bool = false
var double_jump_charge: float = DOUBLE_JUMP_RECHARGE_TIME
var double_jump_ready: bool = true
var bug_swarm_cooldown_time: float = 0.0
var grapple_cooldown_time: float = 0.0
var grapple_cooldown_total: float = 20.0
var bug_swarm_cooldown_total: float = BUG_SWARM_COOLDOWN_TIME
var back_jump_cooldown_time: float = 0.0
var back_jump_cooldown_total: float = BACK_JUMP_COOLDOWN_TIME
var is_menu_open: bool = false
var is_exhausted: bool = false
var current_ammo: int = PISTOL_MAG_SIZE
var reserve_ammo: int = PISTOL_RESERVE_START
var is_reloading: bool = false
const VIEWMODEL_TUNER_STATE_PATH := "user://viewmodel_tuner_state.json"

var _viewmodel_root: Node3D
var _viewmodel_holder: Node3D
var _viewmodel_debug_camera: Camera3D
var _viewmodel_shared_mat: StandardMaterial3D  # BUG-L1: reused across all viewmodel meshes
var _knife_model: Node3D
var _pistol_model: Node3D
var _smg_model: Node3D
var _ak_model: Node3D
var _sniper_model: Node3D
var _shotgun_model: Node3D
var _revolver_model: Node3D
var _weapon_tween: Tween
var _player_dust: GPUParticles3D
var _viewmodel_tuner_saved_pos: Dictionary = {}
var _viewmodel_tuner_saved_rot: Dictionary = {}
var _world_model: Node3D
var _reload_serial: int = 0
var sprint_visual_strength: float = 0.0
var slide_visual_strength: float = 0.0
var zoom_visual_strength: float = 0.0
var _step_timer: float = 0.0
var _was_zooming: bool = false
var weapon_accuracy_visual_strength: float = 0.0
var crosshair_spread_visual_strength: float = 0.0
var _landing_camera_offset: float = 0.0
var _landing_shake_strength: float = 0.0
var _landing_shake_phase: float = 0.0
var _camera_motion_time: float = 0.0
var _slide_timer: float = 0.0
var _slide_speed: float = 0.0
var _slide_direction: Vector3 = Vector3.ZERO
var _back_jump_effect_time: float = 0.0
var _back_jump_spin_direction: float = 1.0
var _wall_jump_cooldown: float = 0.0
var _energy_denied_cooldown: float = 0.0
var _last_shot_time: float = -1.0
var _shot_camera_offset: float = 0.0
var _jump_audio: AudioStreamPlayer
var _land_audio: AudioStreamPlayer
var _pistol_shot_audio: AudioStreamPlayer
var _knife_swing_audio: AudioStreamPlayer
var _reload_audio: AudioStreamPlayer
var _slide_audio: AudioStreamPlayer
var _grapple_audio: AudioStreamPlayer
var _landing_friction_grace_time: float = 0.0
var _weapon_muzzle: Node3D
var _mouse_sway_x: float = 0.0
var _mouse_sway_y: float = 0.0
var _turn_roll: float = 0.0
var _owned_weapons: Array[int] = []
var _weapon_mag_inventory: Dictionary = {}
var _weapon_reserve_inventory: Dictionary = {}
var _sniper_zoom_stage: int = 0

@onready var head: Node3D = $Head
@onready var camera: Camera3D = $Head/Camera3D
@onready var collision_shape: CollisionShape3D = $CollisionShape3D
@onready var game_manager: Node = get_node("/root/GameManager")

var peer_id: int = 0
var is_local_player: bool = false
var is_eliminated: bool = false

var is_inspecting_model: bool = false
var inspect_orbit_yaw: float = 0.0
var inspect_orbit_pitch: float = 0.0
var inspect_orbit_radius: float = 2.2


func _ready() -> void:
	if camera:
		base_fov = camera.fov
		_editor_camera_pos = camera.position
	_standing_camera_y = head.position.y
	_target_camera_y = _standing_camera_y
	add_to_group("fps_players")
	var untitled = get_node_or_null("WorldModel")
	if untitled:
		_world_model = untitled
		_editor_model_pos = untitled.position
		_editor_model_rot = untitled.rotation_degrees
		_editor_model_scale = untitled.scale
		for child in untitled.find_children("*", "VisualInstance3D", true, false):
			child.set_layer_mask_value(1, false)
			child.set_layer_mask_value(4, true)
		var cube = untitled.get_node_or_null("Cube")
		if cube:
			cube.visible = false
		var skeletons = untitled.find_children("*", "Skeleton3D", true, false)
		var skeleton: Skeleton3D = skeletons[0] if skeletons.size() > 0 else null
		if skeleton:
			for i in range(skeleton.get_bone_count()):
				print(untitled.name, "/Skeleton3D bone: ", skeleton.get_bone_name(i))
		var anim_player: AnimationPlayer = untitled.get_node_or_null("AnimationPlayer")
		if anim_player:
			print("[PlayerModel] ANIMATION LIST: ", anim_player.get_animation_list())
			# Store reference — CS1.6 AnimationPlayer drives locomotion
			_body_anim_player = anim_player
			_setup_world_model_anim_player()
	peer_id = name.to_int()  # Node name set to peer_id string
	is_local_player = (peer_id == multiplayer.get_unique_id()) or (peer_id == 1 and multiplayer.is_server())

	if is_local_player:
		add_to_group("local_player")
		camera.current = true
		camera.fov = base_fov
		camera.near = 0.01
		camera.cull_mask = 1 + 2 # Render Layer 1 (world) and Layer 2 (viewmodel) but NOT Layer 4 (p_model)
		_reset_weapon_inventory_for_mode()
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
		health_changed.emit(health, _max_health())
		stamina_changed.emit(stamina, _max_stamina(), is_exhausted)
		double_jump_charge_changed.emit(double_jump_charge, DOUBLE_JUMP_RECHARGE_TIME, double_jump_ready)
		ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
		weapon_changed.emit(get_weapon_name())
	else:
		camera.current = false
		# Remote players don't need camera or input processing
		set_process_input(false)
		set_physics_process(false)  # Server/client handles their own physics
	call_deferred("_build_optional_visuals")


func _build_optional_visuals() -> void:
	if is_local_player:
		if _disable_local_optional_visuals:
			return
		if _world_model == null and has_node("WorldModel"):
			_world_model = get_node("WorldModel") as Node3D
		if _world_model == null:
			# Local crash-safe fallback so third-person/inspect still has a body.
			_world_model = Node3D.new()
			_world_model.name = "WorldModel"
			add_child(_world_model)
			_build_placeholder_body_model(_world_model)
			_set_layer_recursive(_world_model, 4)
			_apply_visibility_upgrade()
		else:
			# Keep the existing scene model active for local player without
			# reloading heavy assets from disk.
			_set_layer_recursive(_world_model, 4)
			_apply_player_world_model_textures()
			_apply_nearest_texture_filter_recursive(_world_model)
			_apply_visibility_upgrade()
			_update_third_person_weapon_attachment()
		# Do not build local world model on D3D12 startup path.
		# Remote players still use world model rendering as normal.
		if _viewmodel_root == null:
			_build_local_viewmodel()
		if _viewmodel_root != null:
			_load_viewmodel_tuner_state()
		_update_local_model_visibility()
		if _jump_audio == null:
			_build_local_audio()
		return

	if _world_model == null:
		_build_world_model()


func _toggle_model_inspection() -> void:
	is_inspecting_model = not is_inspecting_model
	if is_inspecting_model:
		tuner_set_camera_mode("third")
		inspect_orbit_yaw = 0.0
		inspect_orbit_pitch = 0.0
		velocity = Vector3.ZERO
	else:
		tuner_set_camera_mode("first")

func _input(event: InputEvent) -> void:
	if not is_local_player:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_L or event.physical_keycode == KEY_L:
			_toggle_model_inspection()
			return
	if event is InputEventMouseMotion and not is_menu_open and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		if is_inspecting_model and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			inspect_orbit_yaw -= event.relative.x * MOUSE_SENSITIVITY
			inspect_orbit_pitch = clamp(
				inspect_orbit_pitch - event.relative.y * MOUSE_SENSITIVITY,
				deg_to_rad(-75.0),
				deg_to_rad(75.0)
			)
		else:
			_handle_mouse_look(event)
	if is_menu_open:
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			var is_auto: bool = current_weapon == Weapon.SMG or current_weapon == Weapon.AK
			if not is_auto:
				_request_attack()
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed and current_weapon == Weapon.SNIPER:
			_cycle_sniper_zoom_stage()
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_Q or event.physical_keycode == KEY_Q:
			_cycle_weapon()
		elif event.keycode == KEY_F or event.physical_keycode == KEY_F:
			_inspect_weapon()
		elif event.keycode == KEY_R or event.physical_keycode == KEY_R:
			_begin_reload()
		elif event.keycode == KEY_B or event.physical_keycode == KEY_B:
			_handle_role_power_input()
	if event.is_action_pressed("interact"):
		_try_interact()


func _handle_mouse_look(event: InputEventMouseMotion) -> void:
	rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
	camera_pitch = clamp(
		camera_pitch - event.relative.y * MOUSE_SENSITIVITY,
		deg_to_rad(-89.0),
		deg_to_rad(89.0)
	)
	head.rotation.x = camera_pitch
	
	# AAA Gamefeel: Accumulate inertia roll & viewmodel lag sway on mouse movements
	_turn_roll = clamp(_turn_roll - event.relative.x * 0.00035, -0.018, 0.018)
	_mouse_sway_x = clamp(_mouse_sway_x + event.relative.x * 0.00075, -0.05, 0.05)
	_mouse_sway_y = clamp(_mouse_sway_y + event.relative.y * 0.00075, -0.05, 0.05)


func _process(delta: float) -> void:
	if not is_local_player:
		_update_local_model_animation(delta)

func _physics_process(delta: float) -> void:
	if not is_local_player:
		return
	bhop_lockout_time = max(bhop_lockout_time - delta, 0.0)
	_jump_tap_cooldown = max(_jump_tap_cooldown - delta, 0.0)
	bug_swarm_cooldown_time = max(bug_swarm_cooldown_time - delta, 0.0)
	grapple_cooldown_time = max(grapple_cooldown_time - delta, 0.0)
	back_jump_cooldown_time = max(back_jump_cooldown_time - delta, 0.0)
	_back_jump_effect_time = max(_back_jump_effect_time - delta, 0.0)
	_wall_jump_cooldown = max(_wall_jump_cooldown - delta, 0.0)
	wall_run_cooldown_time = max(wall_run_cooldown_time - delta, 0.0)
	_energy_denied_cooldown = max(_energy_denied_cooldown - delta, 0.0)
	_landing_friction_grace_time = max(_landing_friction_grace_time - delta, 0.0)
	weapon_accuracy_visual_strength = max(weapon_accuracy_visual_strength - delta * SHOT_INACCURACY_RECOVERY, 0.0)
	_update_double_jump_recharge(delta)
	crosshair_spread_visual_strength = lerpf(crosshair_spread_visual_strength, _target_crosshair_spread_strength(), min(delta * 10.0, 1.0))
	slide_visual_strength = lerpf(slide_visual_strength, 1.0 if _slide_timer > 0.0 else 0.0, min(delta * 9.0, 1.0))
	var was_on_floor: bool = is_on_floor()
	var vertical_speed_before_move: float = velocity.y
	attack_cooldown = max(attack_cooldown - delta, 0.0)
	if vm_tuning_enabled:
		_apply_live_tuning()
	_update_zoom_state(delta)
	_handle_grappling_hook(delta)
	if is_eliminated:
		_update_camera_feedback(delta)
		return
	if is_menu_open:
		_update_camera_feedback(delta)
		return
	if _is_warmup_free_fly_active():
		_handle_warmup_free_fly(delta)
		_update_camera_feedback(delta)
		return
	# Perks updates: Regen & Slow timers
	if unlocked_perks.has("PERK_REGEN"):
		health = min(health + 2.0 * delta, _max_health())
		health_changed.emit(health, _max_health())
	if _acid_slow_timer > 0.0:
		_acid_slow_timer -= delta
		if randf() < delta * 1.5:
			if multiplayer.is_server():
				server_apply_damage(2.0, -1)
			elif multiplayer.multiplayer_peer != null:
				rpc_id(1, "_server_request_acid_damage")
			
	# Clambering interpolation
	if _ledge_clambering:
		_clamber_timer -= delta
		global_position = global_position.lerp(_clamber_target, min(delta * 12.0, 1.0))
		if _clamber_timer <= 0.0:
			_ledge_clambering = false
		_update_camera_feedback(delta)
		return

	# Handle wall running detection
	var input_dir_wr := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var wish_dir_wr := (transform.basis * Vector3(input_dir_wr.x, 0.0, input_dir_wr.y)).normalized()
	_wall_run_cooldown = max(_wall_run_cooldown - delta, 0.0)
	
	if not is_on_floor() and _wall_run_cooldown <= 0.0 and wall_run_cooldown_time <= 0.0 and stamina > 0.0 and not is_exhausted:
		var has_wall = _check_wall_run(wish_dir_wr)
		if has_wall:
			if not _is_wall_running:
				_is_wall_running = true
				_wall_run_time = 0.0
			_wall_run_time += delta
			_consume_stamina(delta)
			if _wall_run_time >= 2.0 or stamina <= 0.0 or is_exhausted:
				_is_wall_running = false
				_wall_run_cooldown = 0.35
				wall_run_cooldown_time = 3.0
		else:
			if _is_wall_running:
				_is_wall_running = false
				wall_run_cooldown_time = 3.0
	else:
		if _is_wall_running:
			_is_wall_running = false
			wall_run_cooldown_time = 3.0
		
	# Trigger ledge clamber check
	if not is_on_floor() and not _is_wall_running:
		_check_ledge_clamber(delta)

	# Firing inspect key check
	if Input.is_action_just_pressed("interact") or Input.is_key_pressed(KEY_I):
		_inspect_timer = 1.8 # 1.8 seconds inspect animation

	_handle_crouch(delta)
	
	# Apply adjusted gravity if wall running
	if _is_wall_running:
		velocity.y = lerpf(velocity.y, -0.6, delta * 4.0) # slow slide down wall
	else:
		_apply_gravity(delta)
		
	_handle_jump(delta)
	_handle_movement(delta)
	
	var wish_velocity = velocity
	var original_pos = global_position
	
	move_and_slide()
	
	# Stair stepping / Step climbing logic
	if was_on_floor and not is_grappling and not _is_wall_running and not _ledge_clambering:
		var hit_wall = false
		for i in get_slide_collision_count():
			var collision = get_slide_collision(i)
			if collision.get_normal().y < 0.9: # steeper than ~25 degrees
				hit_wall = true
				break
		
		if hit_wall:
			var step_up_dist = 0.45
			var post_move_pos = global_position
			var motion_up = Vector3.UP * step_up_dist
			var up_collision = KinematicCollision3D.new()
			if test_move(global_transform, motion_up, up_collision):
				step_up_dist = up_collision.get_travel().y
			
			if step_up_dist > 0.02:
				var elevated_pos = original_pos + Vector3.UP * step_up_dist
				global_position = elevated_pos
				var horizontal_motion = Vector3(wish_velocity.x, 0, wish_velocity.z) * delta
				if horizontal_motion.length_squared() > 0.0001:
					move_and_collide(horizontal_motion)
					var motion_down = Vector3.DOWN * step_up_dist
					var down_collision = KinematicCollision3D.new()
					if test_move(global_transform, motion_down, down_collision):
						global_position += down_collision.get_travel()
						var land_normal = down_collision.get_normal()
						if land_normal.y >= 0.7 and global_position.y > original_pos.y + 0.01:
							velocity.y = 0.0
						else:
							global_position = post_move_pos
					else:
						global_position = post_move_pos
				else:
					global_position = post_move_pos
	
	_handle_landing_feedback(was_on_floor, vertical_speed_before_move)
	_update_camera_feedback(delta)
	_update_local_model_animation(delta)
	# Re-evaluate viewmodel visibility every frame so it shows up
	# when the game state transitions from warmup/countdown to PLAYING.
	if _viewmodel_root != null:
		_update_local_model_visibility()
	if _third_person_camera != null:
		_update_third_person_camera_transform()

	if not is_menu_open and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		var is_auto: bool = current_weapon == Weapon.SMG or current_weapon == Weapon.AK
		if is_auto:
			_request_attack()
			
	_send_state()


var _warmup_fly_initialized: bool = false

func _is_warmup_free_fly_active() -> bool:
	if game_manager == null:
		return false
	# Allow free-fly during non-playing states (lobby/countdown/round over).
	return int(game_manager.get("state")) != GAME_STATE_PLAYING


func _handle_warmup_free_fly(delta: float) -> void:
	velocity = Vector3.ZERO
	# First time entering warmup fly: reset camera pitch so we're looking horizontally
	if not _warmup_fly_initialized:
		_warmup_fly_initialized = true
		camera_pitch = deg_to_rad(-10.0)  # Slight downward angle for a nice arena overview
		head.rotation.x = camera_pitch
	# If the player is at an invalid position (underground, outside arena, or at origin), recover
	var arena_center := Vector3(0.0, 6.0, -60.0)
	var bad_pos := (
		global_position.y < -3.0 or
		global_position.y > 50.0 or
		(global_position.x == 0.0 and global_position.y == 0.0 and global_position.z == 0.0) or
		absf(global_position.x) > 100.0 or
		absf(global_position.z + 60.0) > 100.0
	)
	if bad_pos:
		# Try to use the actual spawn point from the scene
		var scene := get_tree().current_scene
		if scene != null and scene.has_node("PlayerSpawner"):
			var sp := scene.get_node("PlayerSpawner")
			if sp.has_node("RunnerSpawn1"):
				var spawn_pos: Vector3 = sp.get_node("RunnerSpawn1").global_position
				arena_center = Vector3(spawn_pos.x, spawn_pos.y + 2.0, spawn_pos.z)
		global_position = arena_center
	var input_2d := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var move_dir := Vector3.ZERO
	move_dir += head.global_transform.basis.z * input_2d.y
	move_dir += head.global_transform.basis.x * input_2d.x
	if Input.is_key_pressed(KEY_E):
		move_dir += Vector3.UP
	if Input.is_key_pressed(KEY_Q):
		move_dir += Vector3.DOWN
	if move_dir.length_squared() > 0.0:
		var speed := WARMUP_FLY_SPEED
		if Input.is_key_pressed(KEY_SHIFT):
			speed = WARMUP_FLY_SPRINT_SPEED
		global_position += move_dir.normalized() * speed * delta


func _update_zoom_state(delta: float) -> void:
	var target_zoom: float = 0.0
	if is_local_player and not is_eliminated and not is_menu_open:
		if current_weapon == Weapon.SNIPER:
			if _sniper_zoom_stage == 1:
				target_zoom = 0.72
			elif _sniper_zoom_stage >= 2:
				target_zoom = 1.0
		elif Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			target_zoom = 1.0
			
	var is_zooming = target_zoom > 0.0
	if is_zooming != _was_zooming:
		_was_zooming = is_zooming
		if is_zooming:
			GameManager.call("play_effect", "zoom-in-weapons")

	zoom_visual_strength = lerpf(zoom_visual_strength, target_zoom, min(delta * ZOOM_BLEND_SPEED, 1.0))


func _try_interact() -> void:
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var from: Vector3 = camera.global_position
	var to: Vector3 = from + (-camera.global_transform.basis.z * 3.5)
	var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, to, collision_mask, [self])
	params.collide_with_areas = true
	var result: Dictionary = space.intersect_ray(params)
	if result.is_empty():
		return
	var collider: Object = result.get("collider")
	if collider == null:
		return
	if multiplayer.is_server():
		if collider.has_method("server_press"):
			collider.call("server_press", peer_id)
		return
	if collider.has_method("server_press") and collider is Node:
		rpc_id(1, "_server_request_interact", (collider as Node).get_path())


func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _world_gravity() * delta


func _handle_jump(delta: float) -> void:
	var jump_pressed: bool = Input.is_action_pressed("jump")
	var jump_just_pressed: bool = Input.is_action_just_pressed("jump")
	var move_input: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var buffered_jump_tap: bool = jump_just_pressed and _jump_tap_cooldown <= 0.0
	if not jump_pressed:
		_held_bhop_count = 0
	if jump_just_pressed and _try_wall_jump(move_input):
		jump_buffer = 0.0
		return
	if jump_just_pressed and _try_double_jump(move_input):
		jump_buffer = 0.0
		return
	if buffered_jump_tap:
		jump_buffer = BHOP_WINDOW
		_jump_tap_cooldown = JUMP_SPAM_BUFFER_COOLDOWN
	elif jump_pressed and bhop_lockout_time <= 0.0 and _held_bhop_count < BHOP_CHAIN_LIMIT:
		jump_buffer = BHOP_WINDOW
	else:
		jump_buffer = max(jump_buffer - delta, 0.0)
	if is_on_floor() and jump_buffer > 0.0:
		var horizontal_speed: float = Vector2(velocity.x, velocity.z).length()
		var bhop_jump: bool = horizontal_speed >= BHOP_SPEED_THRESHOLD
		if bhop_jump:
			if stamina < BHOP_STAMINA_COST:
				_emit_energy_denied("bhop")
				jump_buffer = 0.0
				return
			_consume_bhop_stamina()
		velocity.y = _jump_velocity()
		_landing_friction_grace_time = 0.0
		_play_local_sound(_jump_audio, 0.0, randf_range(0.97, 1.03))
		_clamp_horizontal_speed(_max_ground_speed() * SPRINT_MULTIPLIER)
		jump_buffer = 0.0  # consume buffer
		if bhop_lockout_time > 0.0:
			_held_bhop_count = 0
		elif bhop_jump and jump_pressed:
			_held_bhop_count += 1
			if _held_bhop_count >= BHOP_CHAIN_LIMIT:
				bhop_lockout_time = BHOP_LOCKOUT_TIME
				_held_bhop_count = 0
		else:
			_held_bhop_count = 0


func _handle_crouch(_delta: float) -> void:
	var crouch_input := Input.is_action_pressed("crouch")
	if Input.is_action_just_pressed("slide"):
		if _can_start_slide():
			_start_slide()
			crouch_input = true
		elif Input.is_action_pressed("sprint") and (stamina < SLIDE_STAMINA_COST or is_exhausted):
			_emit_energy_denied("slide")
	if _slide_timer > 0.0:
		crouch_input = true
	if crouch_input and not is_crouching:
		is_crouching = true
		_set_crouch_height(CROUCH_HEIGHT)
	elif not crouch_input and is_crouching:
		# Only stand if there's room above
		if _can_stand():
			is_crouching = false
			_set_crouch_height(STAND_HEIGHT)


func _can_start_slide() -> bool:
	if _slide_timer > 0.0 or is_eliminated or is_reloading or not is_on_floor():
		return false
	if not Input.is_action_pressed("sprint") or not _can_sprint() or stamina < SLIDE_STAMINA_COST:
		return false
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if input_dir.length() <= 0.01:
		return false
	return Vector2(velocity.x, velocity.z).length() >= _max_ground_speed() * 0.9


func _start_slide() -> void:
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var wish_dir := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	if wish_dir.length() <= 0.01:
		var forward: Vector3 = -transform.basis.z
		wish_dir = Vector3(forward.x, 0.0, forward.z).normalized()
	_slide_direction = wish_dir
	_slide_timer = SLIDE_DURATION
	_slide_speed = max(Vector2(velocity.x, velocity.z).length() * 1.04, SLIDE_MIN_SPEED)
	is_crouching = true
	_set_crouch_height(CROUCH_HEIGHT)
	velocity.x = _slide_direction.x * _slide_speed
	velocity.z = _slide_direction.z * _slide_speed
	sprint_visual_strength = max(sprint_visual_strength, 0.92)
	_consume_instant_stamina(SLIDE_STAMINA_COST)
	_play_local_sound(_slide_audio, -1.5, randf_range(0.96, 1.02))


func _set_crouch_height(height: float) -> void:
	var shape := collision_shape.shape as CapsuleShape3D
	shape.height = height
	collision_shape.position.y = height / 2.0
	if height == STAND_HEIGHT:
		_target_camera_y = _standing_camera_y
	else:
		_target_camera_y = _standing_camera_y * 0.562
		
	if _world_model and is_instance_valid(_world_model):
		_update_world_model_ground_offset(height)


func _can_stand() -> bool:
	# Cast a ray upward to check for ceiling
	var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(
		global_position,
		global_position + Vector3.UP * STAND_HEIGHT,
		collision_mask,
		[self]
	)
	var result: Dictionary = space.intersect_ray(params)
	return result.is_empty()


func _handle_movement(delta: float) -> void:
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var wish_dir := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	var has_move_input: bool = input_dir.length() > 0.01
	if _slide_timer > 0.0:
		_update_slide(delta, wish_dir, has_move_input)
		return

	var sprint_requested: bool = Input.is_action_pressed("sprint") and not is_crouching and has_move_input
	var sprinting := sprint_requested and _can_sprint()
	if sprint_requested and not sprinting and (stamina <= 0.0 or is_exhausted):
		_emit_energy_denied("sprint")
	var move_speed_scalar: float = _movement_speed_scalar(input_dir)
	var sprint_factor: float = _sprint_effectiveness(input_dir)
	var target_speed: float = _max_ground_speed() * move_speed_scalar
	if unlocked_perks.has("PERK_DASH") and Input.is_key_pressed(KEY_V) and stamina > 25.0:
		_consume_instant_stamina(25.0)
		var dash_dir := wish_dir
		if dash_dir.length() < 0.1:
			dash_dir = -transform.basis.z.normalized()
		velocity.x = dash_dir.x * 16.5
		velocity.z = dash_dir.z * 16.5
		_play_local_sound(_jump_audio, -0.6, 1.35)
		GameManager.call("play_effect", "Futuristic-swish-transition")
		
	if sprinting:
		target_speed *= lerpf(1.0, SPRINT_MULTIPLIER, sprint_factor)
		_consume_stamina(delta)
	else:
		_recover_stamina(delta)
	sprint_visual_strength = lerpf(sprint_visual_strength, sprint_factor if sprinting else 0.0, min(delta * 4.2, 1.0))
	if is_crouching:
		target_speed *= CROUCH_SPEED_MULT
	elif is_exhausted:
		target_speed *= EXHAUSTED_SPEED_MULT
	if _acid_slow_timer > 0.0:
		target_speed *= 0.45

	if is_on_floor():
		_accelerate_ground(wish_dir, target_speed, delta)
	else:
		_accelerate_air(wish_dir, target_speed, delta, input_dir)

	# Play footstep sounds
	if is_local_player and is_on_floor() and has_move_input:
		var speed = Vector2(velocity.x, velocity.z).length()
		if speed > 0.1:
			var step_interval = 0.38
			if sprinting:
				step_interval = 0.28
			elif is_crouching:
				step_interval = 0.52
				
			_step_timer += delta
			if _step_timer >= step_interval:
				_step_timer = 0.0
				var snd = "single-footstep"
				if sprinting:
					snd = "running-fast"
				GameManager.call("play_effect", snd, -12.0, randf_range(0.9, 1.1))
	else:
		_step_timer = 0.0


func _update_slide(delta: float, wish_dir: Vector3, has_move_input: bool) -> void:
	if not is_on_floor():
		_slide_timer = 0.0
		return
	_slide_timer = max(_slide_timer - delta, 0.0)
	if has_move_input and wish_dir.length() > 0.01:
		_slide_direction = _slide_direction.lerp(wish_dir, min(delta * SLIDE_STEER_SPEED, 1.0)).normalized()
	_slide_speed = max(_slide_speed - SLIDE_DECEL * delta, _max_ground_speed() * 0.72)
	velocity.x = _slide_direction.x * _slide_speed
	velocity.z = _slide_direction.z * _slide_speed
	sprint_visual_strength = lerpf(sprint_visual_strength, 0.94, min(delta * 6.0, 1.0))


func _update_double_jump_recharge(delta: float) -> void:
	if double_jump_ready:
		return
	var previous_charge: float = double_jump_charge
	double_jump_charge = min(double_jump_charge + delta, DOUBLE_JUMP_RECHARGE_TIME)
	if double_jump_charge >= DOUBLE_JUMP_RECHARGE_TIME:
		double_jump_charge = DOUBLE_JUMP_RECHARGE_TIME
		double_jump_ready = true
	if not is_equal_approx(previous_charge, double_jump_charge) or double_jump_ready:
		double_jump_charge_changed.emit(double_jump_charge, DOUBLE_JUMP_RECHARGE_TIME, double_jump_ready)


func _handle_role_power_input() -> void:
	if is_eliminated or is_menu_open:
		return
	if int(game_manager.get("state")) != GAME_STATE_PLAYING and multiplayer.multiplayer_peer != null and multiplayer.get_peers().size() > 0:
		return
	if _is_trapper_role():
		_request_bug_swarm_release()
		return
	_try_runner_back_jump()


func _is_trapper_role() -> bool:
	return bool(game_manager.call("is_trapper"))


func _request_bug_swarm_release() -> void:
	if bug_swarm_cooldown_time > 0.0:
		return
	var current_scene: Node = get_tree().current_scene
	if current_scene == null or not current_scene.has_method("server_release_bug_swarm"):
		return
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		if bool(current_scene.call("server_release_bug_swarm", peer_id)):
			_confirm_bug_swarm_release()
		return
	rpc_id(1, "_server_request_bug_swarm")


func _confirm_bug_swarm_release() -> void:
	bug_swarm_cooldown_time = bug_swarm_cooldown_total


func _try_runner_back_jump() -> bool:
	if _is_trapper_role() or back_jump_cooldown_time > 0.0:
		return false
	if _slide_timer > 0.0 or is_reloading:
		return false
	if stamina < BACK_JUMP_STAMINA_COST or is_exhausted:
		_emit_energy_denied("back_jump")
		return false
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var forward: Vector3 = Vector3(-transform.basis.z.x, 0.0, -transform.basis.z.z).normalized()
	var right: Vector3 = Vector3(transform.basis.x.x, 0.0, transform.basis.x.z).normalized()
	velocity.x = -forward.x * BACK_JUMP_PUSH_SPEED + right.x * input_dir.x * BACK_JUMP_SIDE_PUSH_SPEED
	velocity.z = -forward.z * BACK_JUMP_PUSH_SPEED + right.z * input_dir.x * BACK_JUMP_SIDE_PUSH_SPEED
	velocity.y = max(velocity.y, BACK_JUMP_UP_SPEED)
	back_jump_cooldown_time = back_jump_cooldown_total
	_back_jump_effect_time = BACK_JUMP_EFFECT_TIME
	if absf(input_dir.x) > 0.08:
		_back_jump_spin_direction = signf(input_dir.x)
	else:
		_back_jump_spin_direction = -1.0 if int(Time.get_ticks_msec() / 100.0) % 2 == 0 else 1.0
	_consume_instant_stamina(BACK_JUMP_STAMINA_COST)
	sprint_visual_strength = max(sprint_visual_strength, 0.72)
	slide_visual_strength = max(slide_visual_strength, 0.18)
	GameManager.call("play_effect", "press-b-backflip-sound")
	return true


func _emit_energy_denied(source: String) -> void:
	if not is_local_player or _energy_denied_cooldown > 0.0:
		return
	_energy_denied_cooldown = ENERGY_DENIED_COOLDOWN
	energy_denied.emit(source)


func _try_double_jump(input_dir: Vector2) -> bool:
	if is_on_floor() or not double_jump_ready:
		return false
	double_jump_ready = false
	double_jump_charge = 0.0
	velocity.y = _double_jump_up_speed()
	var air_dir: Vector3 = (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	if air_dir.length() > 0.01:
		velocity.x += air_dir.x * DOUBLE_JUMP_AIR_BOOST
		velocity.z += air_dir.z * DOUBLE_JUMP_AIR_BOOST
	_held_bhop_count = 0
	double_jump_charge_changed.emit(double_jump_charge, DOUBLE_JUMP_RECHARGE_TIME, double_jump_ready)
	GameManager.call("play_effect", "double-jump-sound")
	return true


func _try_wall_jump(input_dir: Vector2) -> bool:
	if is_on_floor() or _wall_jump_cooldown > 0.0 or absf(input_dir.x) < 0.18:
		return false
	var local_dir: Vector3 = Vector3(input_dir.x, 0.0, input_dir.y * 0.35)
	if local_dir.length() < 0.12:
		return false
	var ray_dir: Vector3 = (transform.basis * local_dir).normalized()
	var origin: Vector3 = global_position + Vector3.UP * clamp(head.position.y * 0.72, 0.72, 1.12)
	var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(origin, origin + ray_dir * WALL_JUMP_DETECT_DISTANCE, collision_mask, [self])
	params.collide_with_areas = false
	var result: Dictionary = get_world_3d().direct_space_state.intersect_ray(params)
	if result.is_empty():
		return false
	var wall_normal: Vector3 = result.get("normal", Vector3.ZERO)
	if absf(wall_normal.y) > 0.45:
		return false
	var flat_normal: Vector3 = Vector3(wall_normal.x, 0.0, wall_normal.z)
	if flat_normal.length() < 0.1:
		return false
	flat_normal = flat_normal.normalized()
	if ray_dir.dot(-flat_normal) < 0.12:
		return false
	var forward := Vector3(-transform.basis.z.x, 0.0, -transform.basis.z.z).normalized()
	var inherited := Vector3(velocity.x, 0.0, velocity.z) * 0.18
	var forward_boost: float = max(-input_dir.y, 0.0)
	var launch_velocity: Vector3 = flat_normal * WALL_JUMP_PUSH_SPEED + forward * forward_boost * WALL_JUMP_FORWARD_SPEED + inherited
	velocity.x = launch_velocity.x
	velocity.z = launch_velocity.z
	velocity.y = _wall_jump_up_speed()
	_slide_timer = 0.0
	_held_bhop_count = 0
	_wall_jump_cooldown = WALL_JUMP_COOLDOWN
	slide_visual_strength = max(slide_visual_strength, 0.35)
	sprint_visual_strength = max(sprint_visual_strength, 0.55)
	_play_local_sound(_jump_audio, -1.0, randf_range(1.02, 1.08))
	return true


func _can_sprint() -> bool:
	return not is_exhausted and stamina > 0.0 and not is_reloading


func _consume_stamina(delta: float) -> void:
	var previous_stamina: float = stamina
	var max_stamina := _max_stamina()
	stamina = max(stamina - _stamina_drain_rate() * delta, 0.0)
	if stamina <= 0.0:
		is_exhausted = true
		if is_local_player:
			GameManager.call("play_effect", "run-out-of-energy")
	if not is_equal_approx(previous_stamina, stamina):
		stamina_changed.emit(stamina, max_stamina, is_exhausted)


func _recover_stamina(delta: float) -> void:
	var previous_stamina: float = stamina
	var max_stamina := _max_stamina()
	stamina = min(stamina + _stamina_regen_rate() * delta, max_stamina)
	if is_exhausted and stamina >= max_stamina * 0.5:
		is_exhausted = false
	if not is_equal_approx(previous_stamina, stamina):
		stamina_changed.emit(stamina, max_stamina, is_exhausted)


func _consume_instant_stamina(amount: float) -> void:
	var previous_stamina: float = stamina
	stamina = max(stamina - amount, 0.0)
	if stamina <= 0.0:
		is_exhausted = true
		if is_local_player:
			GameManager.call("play_effect", "run-out-of-energy")
	if not is_equal_approx(previous_stamina, stamina):
		stamina_changed.emit(stamina, _max_stamina(), is_exhausted)


func _consume_bhop_stamina() -> void:
	_consume_instant_stamina(BHOP_STAMINA_COST)


func _accelerate_ground(wish_dir: Vector3, wish_speed: float, delta: float) -> void:
	var horizontal := Vector2(velocity.x, velocity.z)
	var speed: float = horizontal.length()
	if speed > 0.01:
		var friction_scale: float = 1.0
		var wish_2d := Vector2(wish_dir.x, wish_dir.z)
		if _landing_friction_grace_time > 0.0:
			friction_scale = LANDING_FRICTION_SCALE
		elif wish_2d.length() > 0.01 and horizontal.normalized().dot(wish_2d.normalized()) < -0.35:
			friction_scale = COUNTER_STRAFE_BOOST
		var control: float = max(speed, STOP_SPEED)
		var drop: float = control * FRICTION * delta * friction_scale
		var new_speed: float = max(speed - drop, 0.0)
		horizontal *= new_speed / speed
		velocity.x = horizontal.x
		velocity.z = horizontal.y

	var current_speed: float = Vector3(velocity.x, 0.0, velocity.z).dot(wish_dir)
	var add_speed: float = float(wish_speed - current_speed)
	if add_speed <= 0.0:
		return
	var accel_speed: float = min(ACCEL * wish_speed * delta, add_speed)
	velocity.x += wish_dir.x * accel_speed
	velocity.z += wish_dir.z * accel_speed


func _accelerate_air(wish_dir: Vector3, wish_speed: float, delta: float, input_dir: Vector2) -> void:
	if wish_dir.length() <= 0.01:
		return
	var side_input: float = clampf(absf(input_dir.x), 0.0, 1.0)
	var forward_input: float = clampf(max(-input_dir.y, 0.0), 0.0, 1.0)
	var strafe_bias: float = clampf(side_input - forward_input * 0.7, 0.0, 1.0)
	var air_accel: float = lerpf(AIR_FORWARD_ACCEL, AIR_STRAFE_ACCEL, strafe_bias)
	var capped_speed: float = min(wish_speed, _max_air_speed())
	if side_input > 0.01:
		capped_speed *= lerpf(1.0, AIR_SIDE_SPEED_MULT, side_input)
	else:
		capped_speed *= AIR_CAP
	var current_speed: float = Vector3(velocity.x, 0.0, velocity.z).dot(wish_dir)
	var add_speed: float = float(capped_speed - current_speed)
	if add_speed <= 0.0:
		_apply_air_control(wish_dir, delta, strafe_bias, side_input)
		return
	var accel_speed: float = min(air_accel * capped_speed * delta, add_speed)
	velocity.x += wish_dir.x * accel_speed
	velocity.z += wish_dir.z * accel_speed
	_apply_air_control(wish_dir, delta, strafe_bias, side_input)
	var preserved_speed_cap: float = min(_max_air_speed(), Vector2(velocity.x, velocity.z).length() + accel_speed * 0.04)
	_clamp_horizontal_speed(preserved_speed_cap)


func _apply_air_control(wish_dir: Vector3, delta: float, strafe_bias: float, side_input: float) -> void:
	if strafe_bias <= 0.01 or side_input < 0.18:
		return
	var horizontal_velocity := Vector3(velocity.x, 0.0, velocity.z)
	var horizontal_speed: float = horizontal_velocity.length()
	if horizontal_speed <= 0.08:
		return
	var current_dir: Vector3 = horizontal_velocity / horizontal_speed
	var control_strength: float = min(delta * AIR_CONTROL * strafe_bias * side_input, 0.1)
	var steered_dir: Vector3 = current_dir.lerp(wish_dir, control_strength).normalized()
	velocity.x = steered_dir.x * horizontal_speed
	velocity.z = steered_dir.z * horizontal_speed


func _request_attack() -> void:
	if _is_warmup_free_fly_active():
		return
	if is_eliminated or attack_cooldown > 0.0 or is_reloading:
		return
	if Input.get_mouse_mode() != Input.MOUSE_MODE_CAPTURED:
		return
	var is_gun: bool = current_weapon != Weapon.KNIFE
	if is_gun:
		if current_ammo <= 0:
			_begin_reload()
			return
		current_ammo -= 1
		_save_equipped_weapon_ammo()
		ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	var now: float = Time.get_ticks_msec() * 0.001
	var shot_interval: float = now - _last_shot_time if _last_shot_time >= 0.0 else 0.45
	_last_shot_time = now
	var recoil_amount: float = clamp(1.0 + max(0.0, 0.35 - shot_interval) * 2.8, 1.0, 2.2)
	if is_gun:
		weapon_accuracy_visual_strength = min(weapon_accuracy_visual_strength + SHOT_INACCURACY_GAIN, 1.35)
		recoil_amount *= 1.08
	else:
		recoil_amount *= 0.82
	_apply_shot_recoil(recoil_amount)
	attack_cooldown = _weapon_cooldown(current_weapon)
	if is_gun:
		var w_name_s = get_weapon_name()
		if w_name_s == "SNIPER": GameManager.call("play_effect", "Sniper-rifle-single-shot")
		elif w_name_s == "PISTOL": GameManager.call("play_effect", "pistol-shot")
		elif w_name_s == "SMG" or w_name_s == "AK": GameManager.call("play_effect", "smg-shoot")
		elif w_name_s == "SHOTGUN": GameManager.call("play_effect", "shotgun-sound")
		elif w_name_s == "REVOLVER": GameManager.call("play_effect", "revolver-sound")
		else: GameManager.call("play_effect", "pistol-shot")
	else:
		GameManager.call("play_effect", "knife-sound-missed")
		_apply_knife_lunge()
	_animate_attack()
	var aim_origin: Vector3 = camera.global_position
	var direction: Vector3 = _apply_weapon_spread(-camera.global_transform.basis.z, current_weapon)
	var tracer_origin: Vector3 = aim_origin
	if is_gun and _weapon_muzzle != null and is_instance_valid(_weapon_muzzle):
		tracer_origin = _weapon_muzzle.global_position
		_spawn_muzzle_flash(tracer_origin, direction)
	if is_gun:
		if current_weapon == Weapon.SHOTGUN:
			for i in range(4): # Show a dense visual pellet burst
				_spawn_local_tracer(tracer_origin, _apply_shotgun_pellet_spread(direction), _weapon_range(current_weapon))
		else:
			_spawn_local_tracer(tracer_origin, direction, _weapon_range(current_weapon))
	if multiplayer.is_server():
		_perform_server_attack(peer_id, current_weapon, aim_origin, direction)
		return
	rpc_id(1, "_server_attack", current_weapon, aim_origin, direction)


func _apply_shotgun_pellet_spread(direction: Vector3) -> Vector3:
	var spread_yaw: float = randf_range(-SHOTGUN_PELLET_SPREAD, SHOTGUN_PELLET_SPREAD)
	var spread_pitch: float = randf_range(-SHOTGUN_PELLET_SPREAD, SHOTGUN_PELLET_SPREAD)
	var spread_direction: Vector3 = direction.normalized()
	spread_direction = spread_direction.rotated(camera.global_transform.basis.y.normalized(), spread_yaw)
	spread_direction = spread_direction.rotated(camera.global_transform.basis.x.normalized(), spread_pitch)
	return spread_direction.normalized()


func _weapon_mag_size(weapon: int) -> int:
	if weapon == Weapon.SMG: return SMG_MAG_SIZE
	if weapon == Weapon.AK: return AK_MAG_SIZE
	if weapon == Weapon.SNIPER: return SNIPER_MAG_SIZE
	if weapon == Weapon.SHOTGUN: return SHOTGUN_MAG_SIZE
	if weapon == Weapon.REVOLVER: return REVOLVER_MAG_SIZE
	return PISTOL_MAG_SIZE

func _weapon_reload_time(weapon: int) -> float:
	if weapon == Weapon.SMG: return SMG_RELOAD_TIME
	if weapon == Weapon.AK: return AK_RELOAD_TIME
	if weapon == Weapon.SNIPER: return SNIPER_RELOAD_TIME
	if weapon == Weapon.SHOTGUN: return SHOTGUN_RELOAD_TIME
	if weapon == Weapon.REVOLVER: return REVOLVER_RELOAD_TIME
	return RELOAD_TIME

func _cycle_weapon() -> void:
	if is_reloading:
		_reload_serial += 1
		is_reloading = false
		ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	if _owned_weapons.size() <= 1:
		return
	var current_index := _owned_weapons.find(current_weapon)
	if current_index == -1:
		current_index = 0
	var next_index := (current_index + 1) % _owned_weapons.size()
	_set_current_weapon(_owned_weapons[next_index], false)


func _begin_reload() -> void:
	if current_weapon == Weapon.KNIFE or is_reloading:
		return
	var mag_size = _weapon_mag_size(current_weapon)
	if current_ammo >= mag_size or reserve_ammo <= 0 or is_eliminated:
		return
	is_reloading = true
	_reload_serial += 1
	var reload_id: int = _reload_serial
	var r_time = _weapon_reload_time(current_weapon)
	attack_cooldown = max(attack_cooldown, r_time)
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	var w_name_r = get_weapon_name()
	if w_name_r == "SNIPER": GameManager.call("play_effect", "Sniper-rifle-reload")
	elif w_name_r == "PISTOL" or w_name_r == "REVOLVER": GameManager.call("play_effect", "pistol-reload")
	elif w_name_r == "AK" or w_name_r == "SMG": GameManager.call("play_effect", "rifle-reload")
	elif w_name_r == "SHOTGUN": GameManager.call("play_effect", "shotgun-reload")
	else: GameManager.call("play_effect", "pistol-reload")
	_animate_reload()
	_finish_reload(reload_id, r_time, mag_size)


func _finish_reload(reload_id: int, r_time: float, mag_size: int) -> void:
	await get_tree().create_timer(r_time).timeout
	if reload_id != _reload_serial or is_eliminated:
		return
	var needed_ammo: int = mag_size - current_ammo
	var reloaded_ammo: int = min(needed_ammo, reserve_ammo)
	current_ammo += reloaded_ammo
	reserve_ammo -= reloaded_ammo
	_save_equipped_weapon_ammo()
	is_reloading = false
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)


func _inspect_weapon() -> void:
	if _viewmodel_holder == null:
		return
	if _weapon_tween and _weapon_tween.is_valid():
		_weapon_tween.kill()
	var rest_position: Vector3 = _weapon_rest_position(current_weapon)
	var rest_rotation: Vector3 = _weapon_rest_rotation(current_weapon)
	var inspect_position: Vector3 = rest_position + Vector3(-0.08, 0.12, 0.18)
	var inspect_rotation: Vector3 = rest_rotation + Vector3(0.35, 0.8 if current_weapon == Weapon.PISTOL else 0.45, 0.08)
	var inspect_out_time: float = 0.24
	var inspect_return_time: float = 0.28
	if current_weapon == Weapon.KNIFE:
		inspect_out_time = 0.18
		inspect_return_time = 0.24
	_weapon_tween = create_tween()
	_weapon_tween.tween_property(_viewmodel_holder, "position", inspect_position, inspect_out_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", inspect_rotation, inspect_out_time)
	_weapon_tween.tween_property(_viewmodel_holder, "position", rest_position, inspect_return_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", rest_rotation, inspect_return_time)


func _animate_attack() -> void:
	if _viewmodel_holder == null:
		return
	if _weapon_tween and _weapon_tween.is_valid():
		_weapon_tween.kill()
	# Use the tuned ADS position as the rest position when zooming, so the
	# attack animation stays in the zoomed view instead of snapping back to
	# the default hip-fire position.
	var rest_position: Vector3 = _weapon_rest_position(current_weapon)
	var rest_rotation: Vector3 = _weapon_rest_rotation(current_weapon)
	if zoom_visual_strength > 0.45 and current_weapon == Weapon.PISTOL:
		rest_position = Vector3(-0.017, -0.466, -0.597)
		rest_rotation = Vector3(-0.001, 1.600, -0.065)
	var attack_position: Vector3 = rest_position
	var attack_rotation: Vector3 = rest_rotation
	var out_time: float = 0.08
	var return_time: float = 0.12
	if current_weapon == Weapon.KNIFE:
		attack_position += Vector3(-0.14, -0.05, 0.26)
		attack_rotation += Vector3(0.56, 0.7, -0.24)
		out_time = 0.06
		return_time = 0.17
	else:
		attack_position += Vector3(0.03, -0.03, 0.18)
		attack_rotation += Vector3(-0.24, 0.06, 0.03)
		out_time = 0.055
		return_time = 0.13
	_weapon_tween = create_tween()
	_weapon_tween.tween_property(_viewmodel_holder, "position", attack_position, out_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", attack_rotation, out_time)
	_weapon_tween.tween_property(_viewmodel_holder, "position", rest_position, return_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", rest_rotation, return_time)
	# Re-apply the ADS zoom position after the tween finishes, since the
	# _update_camera_feedback lerp may not fully settle the holder
	# position on the exact frame the tween ends.
	if zoom_visual_strength > 0.45 and current_weapon == Weapon.PISTOL:
		var zoom_pos: Vector3 = Vector3(-0.017, -0.466, -0.597)
		var zoom_rot: Vector3 = Vector3(-0.001, 1.600, -0.065)
		_weapon_tween.tween_property(_viewmodel_holder, "position", zoom_pos, 0.02)
		_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", zoom_rot, 0.02)


func _animate_reload() -> void:
	if _viewmodel_holder == null:
		return
	if _weapon_tween and _weapon_tween.is_valid():
		_weapon_tween.kill()
	var rest_position: Vector3 = _weapon_rest_position(current_weapon)
	var rest_rotation: Vector3 = _weapon_rest_rotation(current_weapon)
	var reload_position: Vector3 = rest_position + Vector3(-0.04, -0.12, 0.12)
	var reload_rotation: Vector3 = rest_rotation + Vector3(0.34, 0.22, -0.28)
	var r_time: float = _weapon_reload_time(current_weapon)
	var out_time: float = max(r_time * 0.22, 0.16)
	var return_time: float = max(r_time * 0.24, 0.18)
	var pause_time: float = max(r_time - (out_time + return_time), 0.08)
	_weapon_tween = create_tween()
	_weapon_tween.tween_property(_viewmodel_holder, "position", reload_position, out_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", reload_rotation, out_time)
	_weapon_tween.tween_interval(pause_time)
	_weapon_tween.tween_property(_viewmodel_holder, "position", rest_position, return_time)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", rest_rotation, return_time)


func _apply_weapon_pose(immediate: bool) -> void:
	if _viewmodel_holder == null:
		return
	if _arms_root:
		_arms_root.visible = (current_weapon != Weapon.KNIFE and current_weapon != Weapon.PISTOL)
	if _knife_model:
		_knife_model.visible = current_weapon == Weapon.KNIFE
	if _pistol_model:
		_pistol_model.visible = current_weapon == Weapon.PISTOL
	if _smg_model:
		_smg_model.visible = current_weapon == Weapon.SMG
	if _ak_model:
		_ak_model.visible = current_weapon == Weapon.AK
	if _sniper_model:
		_sniper_model.visible = current_weapon == Weapon.SNIPER
	if _shotgun_model:
		_shotgun_model.visible = current_weapon == Weapon.SHOTGUN
	if _revolver_model:
		_revolver_model.visible = current_weapon == Weapon.REVOLVER
	var active_model: Node3D = null
	match current_weapon:
		Weapon.PISTOL:
			active_model = _pistol_model
		Weapon.SMG:
			active_model = _smg_model
		Weapon.AK:
			active_model = _ak_model
		Weapon.SNIPER:
			active_model = _sniper_model
		Weapon.SHOTGUN:
			active_model = _shotgun_model
		Weapon.REVOLVER:
			active_model = _revolver_model
		_:
			active_model = null
	_weapon_muzzle = active_model.get_node_or_null("WeaponMuzzle") if active_model != null else null
	var target_position: Vector3 = _weapon_rest_position(current_weapon)
	var target_rotation: Vector3 = _weapon_rest_rotation(current_weapon)
	if immediate:
		_viewmodel_holder.position = target_position
		_viewmodel_holder.rotation = target_rotation
		_update_arms_root_transform()
		return
	if _weapon_tween and _weapon_tween.is_valid():
		_weapon_tween.kill()
	_weapon_tween = create_tween()
	_weapon_tween.tween_property(_viewmodel_holder, "position", target_position, 0.12)
	_weapon_tween.parallel().tween_property(_viewmodel_holder, "rotation", target_rotation, 0.12)
	_update_arms_root_transform()


func _weapon_rest_position(weapon: int) -> Vector3:
	if weapon == Weapon.KNIFE or weapon == Weapon.PISTOL:
		return Vector3(0.18, -0.2, -0.4)
	var pos := Vector3(0.18, -0.2, -0.4)
	if weapon == Weapon.KNIFE: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.PISTOL: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.SMG: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.AK: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.SNIPER: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.SHOTGUN: pos = Vector3(0.18, -0.2, -0.4)
	elif weapon == Weapon.REVOLVER: pos = Vector3(0.18, -0.2, -0.4)
	if is_local_player and vm_tuning_enabled:
		return pos + vm_pos_offset
	return pos

func _weapon_rest_rotation(weapon: int) -> Vector3:
	if weapon == Weapon.KNIFE or weapon == Weapon.PISTOL:
		return Vector3.ZERO
	var rot := Vector3(0.000, 1.600, 0.000)
	if weapon == Weapon.KNIFE: rot = Vector3(0.180, -0.220, -0.080)
	elif weapon == Weapon.PISTOL: rot = Vector3(0.000, 1.600, 0.000)
	elif weapon == Weapon.SMG: rot = Vector3(0.000, -0.050, 0.000)
	elif weapon == Weapon.AK: rot = Vector3(0.000, -0.040, 0.000)
	elif weapon == Weapon.SNIPER: rot = Vector3(0.000, -0.030, 0.000)
	elif weapon == Weapon.SHOTGUN: rot = Vector3(0.000, -0.050, 0.020)
	elif weapon == Weapon.REVOLVER: rot = Vector3(0.000, -0.060, 0.000)
	if is_local_player and vm_tuning_enabled:
		return rot + vm_rot_offset
	return rot


func _weapon_arms_position(weapon: int) -> Vector3:
	var pos := Vector3(-0.04, -0.04, -0.08)
	if weapon == Weapon.KNIFE:
		pos = Vector3(0.00, -0.06, -0.10)
	elif weapon == Weapon.SMG:
		pos = Vector3(-0.05, -0.03, -0.09)
	elif weapon == Weapon.AK:
		pos = Vector3(-0.06, -0.02, -0.10)
	elif weapon == Weapon.SNIPER:
		pos = Vector3(-0.05, -0.01, -0.14)
	elif weapon == Weapon.SHOTGUN:
		pos = Vector3(-0.04, -0.01, -0.11)
	elif weapon == Weapon.REVOLVER:
		pos = Vector3(-0.03, -0.04, -0.08)
	return pos

func _weapon_arms_rotation(weapon: int) -> Vector3:
	var rot := Vector3.ZERO
	if weapon == Weapon.KNIFE:
		rot = Vector3(0.0, 0.0, 0.0)
	elif weapon == Weapon.SMG:
		rot = Vector3(0.0, -0.05, 0.0)
	elif weapon == Weapon.AK:
		rot = Vector3(0.0, -0.08, 0.0)
	elif weapon == Weapon.SNIPER:
		rot = Vector3(0.0, -0.08, 0.0)
	elif weapon == Weapon.SHOTGUN:
		rot = Vector3(0.0, -0.05, 0.0)
	elif weapon == Weapon.REVOLVER:
		rot = Vector3(0.0, 0.0, 0.0)
	return rot

func _update_arms_root_transform() -> void:
	if _arms_root == null:
		return
	_arms_root.position = _weapon_arms_position(current_weapon)
	_arms_root.rotation = _weapon_arms_rotation(current_weapon)


func _apply_live_tuning() -> void:
	if not is_local_player or _viewmodel_holder == null:
		return
	_viewmodel_holder.position = _weapon_rest_position(current_weapon)
	_viewmodel_holder.rotation = _weapon_rest_rotation(current_weapon)
	if _weapon_muzzle:
		var w_key = "pistol"
		match current_weapon:
			Weapon.KNIFE: w_key = "knife"
			Weapon.PISTOL: w_key = "pistol"
			Weapon.SMG: w_key = "p90"
			Weapon.AK: w_key = "rifle"
			Weapon.SNIPER: w_key = "awp"
			Weapon.SHOTGUN: w_key = "shotgun"
			Weapon.REVOLVER: w_key = "revolver"
		_weapon_muzzle.position = _get_muzzle_offset(w_key)
	_update_arms_root_transform()

func _weapon_model_node_for_name(weapon_name: String) -> Node3D:
	match weapon_name:
		"knife":
			return _knife_model
		"pistol":
			return _pistol_model
		"p90":
			return _smg_model
		"smg":
			return _smg_model
		"rifle":
			return _ak_model
		"awp":
			return _sniper_model
		"shotgun":
			return _shotgun_model
		"revolver":
			return _revolver_model
	return null

func _get_muzzle_base_offset(weapon_name: String) -> Vector3:
	if muzzle_auto_detect:
		var model_node: Node3D = _weapon_model_node_for_name(weapon_name)
		if model_node != null:
			var detected: Vector3 = _detect_weapon_muzzle_position(model_node)
			if detected != Vector3.ZERO:
				return detected
	var muzzle: Vector3 = Vector3(0.0, 0.0, -0.6)
	match weapon_name:
		"pistol": muzzle = Vector3(0.0, 0.04, -0.42)
		"revolver": muzzle = Vector3(0.0, 0.05, -0.52)
		"p90": muzzle = Vector3(0.0, 0.03, -0.65)
		"shotgun": muzzle = Vector3(0.0, 0.03, -0.85)
		"rifle": muzzle = Vector3(0.0, 0.04, -0.95)
		"awp": muzzle = Vector3(0.0, 0.06, -1.45)
		"knife": muzzle = Vector3(0.0, 0.0, -0.2)
	return muzzle

func _get_muzzle_offset(weapon_name: String) -> Vector3:
	var muzzle: Vector3 = _get_muzzle_base_offset(weapon_name)
	if is_local_player and vm_tuning_enabled:
		return muzzle + muzzle_tuning_offset * vm_muzzle_scale
	return muzzle

func _detect_weapon_muzzle_position(model_node: Node3D) -> Vector3:
	var aabb = AABB()
	var found_mesh := false
	for mesh_instance in model_node.find_children("*", "MeshInstance3D", true):
		if mesh_instance is MeshInstance3D:
			var local_aabb: AABB = mesh_instance.get_aabb()
			var world_aabb: AABB = mesh_instance.global_transform * local_aabb
			var node_space_aabb: AABB = model_node.global_transform.affine_inverse() * world_aabb
			if not found_mesh:
				aabb = node_space_aabb
				found_mesh = true
			else:
				aabb = aabb.merge(node_space_aabb)
	if not found_mesh:
		return Vector3.ZERO
	var forward_endpoint: float = aabb.position.z
	return Vector3(0.0, 0.0, forward_endpoint - 0.02)


func _weapon_cooldown(weapon: int) -> float:
	if weapon == Weapon.KNIFE: return KNIFE_COOLDOWN
	if weapon == Weapon.SMG: return SMG_COOLDOWN
	if weapon == Weapon.AK: return AK_COOLDOWN
	if weapon == Weapon.SNIPER: return SNIPER_COOLDOWN
	if weapon == Weapon.SHOTGUN: return SHOTGUN_COOLDOWN
	if weapon == Weapon.REVOLVER: return REVOLVER_COOLDOWN
	return PISTOL_COOLDOWN


func _weapon_damage(weapon: int) -> float:
	if weapon == Weapon.KNIFE: return KNIFE_DAMAGE
	if weapon == Weapon.SMG: return SMG_DAMAGE
	if weapon == Weapon.AK: return AK_DAMAGE
	if weapon == Weapon.SNIPER: return SNIPER_DAMAGE
	if weapon == Weapon.SHOTGUN: return SHOTGUN_DAMAGE
	if weapon == Weapon.REVOLVER: return REVOLVER_DAMAGE
	return PISTOL_DAMAGE


func _weapon_range(weapon: int) -> float:
	if weapon == Weapon.KNIFE: return KNIFE_RANGE
	if weapon == Weapon.SMG: return SMG_RANGE
	if weapon == Weapon.AK: return AK_RANGE
	if weapon == Weapon.SNIPER: return SNIPER_RANGE
	if weapon == Weapon.SHOTGUN: return SHOTGUN_RANGE
	if weapon == Weapon.REVOLVER: return REVOLVER_RANGE
	return PISTOL_RANGE


func _build_local_viewmodel() -> void:
	var hand_marker = camera.get_node_or_null("HandMarker")
	if hand_marker == null:
		hand_marker = Node3D.new()
		hand_marker.name = "HandMarker"
		camera.add_child(hand_marker)
	# Clean stale runtime weapon nodes from older sessions/configs.
	for stale_name in ["P90Model", "RifleModel", "AwpModel", "ShotgunModel", "RevolverModel"]:
		var stale_node := hand_marker.get_node_or_null(stale_name)
		if stale_node != null:
			stale_node.queue_free()
	_viewmodel_holder = hand_marker
	_viewmodel_root = _viewmodel_holder

	# Pre-warm the shared material so D3D12 compiles its PSO before any mesh
	# enters the scene. All weapons share this one material → one PSO total.
	if _viewmodel_shared_mat == null:
		_viewmodel_shared_mat = StandardMaterial3D.new()
		_viewmodel_shared_mat.albedo_color = Color(0.4, 0.4, 0.42)
		_viewmodel_shared_mat.metallic = 0.5
		_viewmodel_shared_mat.roughness = 0.4
		_viewmodel_shared_mat.no_depth_test = false
		_viewmodel_shared_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST

	_arms_root = Node3D.new()
	_arms_root.name = "ArmsRoot"
	_viewmodel_holder.add_child(_arms_root)
	_load_arms_model()

	# Load weapons ONE PER FRAME via coroutine.
	# D3D12 compiles PSOs in the render thread. Each mesh has its own vertex
	# format → each needs a separate PSO. Loading all 7 weapons in one frame
	# floods D3D12 and causes a signal 11 render-thread crash. One weapon per
	# frame gives D3D12 time to finish each PSO before the next mesh arrives.
	await get_tree().process_frame
	_knife_model = _load_weapon_model("knife", _viewmodel_holder)
	await get_tree().process_frame
	_pistol_model = _load_weapon_model("pistol", _viewmodel_holder)
	_smg_model = null
	_ak_model = null
	_sniper_model = null
	_shotgun_model = null
	_revolver_model = null
	await get_tree().process_frame
	_apply_viewmodel_runtime_options()
	_apply_weapon_pose(true)


func _load_weapon_model(weapon_name: String, parent: Node) -> Node3D:
	var node_name = weapon_name.capitalize() + "Model"
	var existing = parent.get_node_or_null(node_name)
	var saved_pos := Vector3.ZERO
	var saved_rot := Vector3.ZERO
	var saved_scale := Vector3.ONE
	var has_existing := false
	if existing:
		saved_pos = existing.position
		saved_rot = existing.rotation
		saved_scale = existing.scale
		has_existing = true
		existing.queue_free()

	var model_node = Node3D.new()
	model_node.name = node_name
	parent.add_child(model_node)
	
	if has_existing:
		model_node.position = saved_pos
		model_node.rotation = saved_rot
		model_node.scale = saved_scale

	var extensions = [".glb", ".gltf", ".obj", ".OBJ", ".tscn", ".scn", ".fbx", ".FBX"]
	# Prefer GLB/OBJ first. FBX import path is unstable on some D3D12 drivers.
	var search_dirs = [
		"res://kr_models/weapons/knife/",
		"res://kr_models/weapons/knife/v_knife/",
		"res://kr_models/weapons/pistol/v_glock18/",
		"res://assets/weapons/obj/",
		"res://weapons/FBX/",
		"res://assets/weapons/",
		"res://weapons/",
		"res://assets/models/",
		"res://Weapons/"
	]
	var name_variants = [weapon_name, weapon_name.to_lower(), weapon_name.capitalize(), weapon_name.to_upper(), "weapon_" + weapon_name, "v_" + weapon_name]

	# Aliases: map internal weapon keys to the actual filenames in assets/
	if weapon_name == "p90": name_variants.append_array(["smg", "SMG", "P90"])
	elif weapon_name == "rifle": name_variants.append_array(["ak", "ak47", "AK", "AK47", "Rifle"])
	elif weapon_name == "awp": name_variants.append_array(["SniperRifle", "sniper_rifle", "sniper", "SNIPER", "AWP", "Awp", "awm", "AWM"])
	elif weapon_name == "pistol": name_variants.append_array(["glock", "v_glock18", "Pistol", "PISTOL"])
	elif weapon_name == "knife": name_variants.append_array(["v_knife", "reference", "Knife", "KNIFE", "melee", "Melee", "CombatKnife"])

	var loaded_resource: Resource = null
	var found_path: String = ""
	var direct_model_overrides := {
		"knife": "res://kr_models/weapons/knife/knife.glb",
		"pistol": "res://kr_models/weapons/pistol/pistol.glb"
	}
	if direct_model_overrides.has(weapon_name):
		var override_path: String = str(direct_model_overrides[weapon_name])
		if ResourceLoader.exists(override_path):
			loaded_resource = load(override_path)
			found_path = override_path
	
	if loaded_resource == null:
		for dir in search_dirs:
			for n in name_variants:
				for ext in extensions:
					var p = dir + n + ext
					if ResourceLoader.exists(p):
						loaded_resource = load(p)
						found_path = p
						break
					# Check subfolder with same name (common in asset packs)
					var p_sub = dir + n + "/" + n + ext
					if ResourceLoader.exists(p_sub):
						loaded_resource = load(p_sub)
						found_path = p_sub
						break
				if loaded_resource: break
			if loaded_resource: break
			
	if loaded_resource:
		print("[WeaponLoader] Loading %s from %s" % [weapon_name, found_path])
		if found_path.to_lower().ends_with(".fbx"):
			push_warning("[WeaponLoader] FBX runtime load disabled for stability on D3D12; using fallback for %s" % weapon_name)
			_add_fallback_mesh(model_node)
			loaded_resource = null
			found_path = ""
	if loaded_resource:
		var is_custom_model = ("kr_models" in found_path)
		model_node.set_meta("is_custom", is_custom_model)
		if loaded_resource is PackedScene:
			var instance = loaded_resource.instantiate()
			if not is_custom_model:
				_strip_fbx_materials_recursive(instance)
			model_node.add_child(instance)
			_normalize_model_scale(model_node)
			_center_model_geometry(model_node)
			if has_existing:
				model_node.position = saved_pos
				model_node.rotation = saved_rot
				model_node.scale = saved_scale
			_apply_viewmodel_material_recursive(model_node, found_path.get_base_dir())
		elif loaded_resource is Mesh:
			var mesh_instance = MeshInstance3D.new()
			mesh_instance.mesh = loaded_resource
			if not is_custom_model:
				_strip_fbx_materials_recursive(mesh_instance)
			model_node.add_child(mesh_instance)
			_normalize_model_scale(model_node)
			_center_model_geometry(model_node)
			if has_existing:
				model_node.position = saved_pos
				model_node.rotation = saved_rot
				model_node.scale = saved_scale
			_apply_viewmodel_material_recursive(model_node, found_path.get_base_dir())
	else:
		if weapon_name == "knife":
			push_warning("[WeaponLoader] Knife model not found in assets; using fallback mesh.")
		else:
			printerr("[WeaponLoader] FAILED to find model for: ", weapon_name)
		_add_fallback_mesh(model_node)
	
	var muzzle = Node3D.new()
	muzzle.name = "WeaponMuzzle"
	muzzle.position = _get_muzzle_offset(weapon_name)
	model_node.add_child(muzzle)

	# Try to find a matching weapon profile to apply custom CSG sculpting at runtime
	var profile_paths = [
		"res://weapons/" + weapon_name + "_profile.tres",
		"res://weapons/profiles/" + weapon_name + "_profile.tres",
		"res://weapons/FBX/" + weapon_name + "_profile.tres"
	]
	var profile: Resource = null
	for path in profile_paths:
		if ResourceLoader.exists(path):
			profile = ResourceLoader.load(path)
			break
	if profile and profile.get("csg_shapes") and not profile.csg_shapes.is_empty():
		CSGBuilder.apply_csg_shapes(model_node, profile.csg_shapes, true)

	return model_node


func _load_weapon_model_from_path(weapon_name: String, path: String, parent: Node) -> Node3D:
	if not ResourceLoader.exists(path):
		return null
	var loaded_resource := load(path)
	if loaded_resource == null:
		return null
	var model_node := Node3D.new()
	model_node.name = weapon_name.capitalize() + "Model"
	parent.add_child(model_node)
	
	var is_custom_model = ("kr_models" in path)
	model_node.set_meta("is_custom", is_custom_model)
	
	if loaded_resource is PackedScene:
		var instance = loaded_resource.instantiate()
		# Strip all FBX/GLB imported materials BEFORE entering the scene tree.
		# On D3D12, every unique material on a mesh triggers a PSO compilation
		# the instant add_child is called. 7 weapons × N surfaces = signal 11 crash.
		# Replacing with the pre-warmed shared mat means 0 new PSO compilations here.
		if not is_custom_model:
			_strip_fbx_materials_recursive(instance)
		model_node.add_child(instance)
		if is_custom_model:
			instance.scale = Vector3(1.0, 1.0, 1.0)
			instance.position = Vector3(0.0, 0.0, 0.0)
			model_node.scale = Vector3(1.0, 1.0, 1.0)
			model_node.position = Vector3(0.0, 0.0, 0.0)
	elif loaded_resource is Mesh:
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.mesh = loaded_resource
		if not is_custom_model:
			_strip_fbx_materials_recursive(mesh_instance)
		model_node.add_child(mesh_instance)
		if is_custom_model:
			mesh_instance.scale = Vector3(1.0, 1.0, 1.0)
			mesh_instance.position = Vector3(0.0, 0.0, 0.0)
			model_node.scale = Vector3(1.0, 1.0, 1.0)
			model_node.position = Vector3(0.0, 0.0, 0.0)
	else:
		model_node.queue_free()
		return null
	
	if not is_custom_model:
		_normalize_model_scale(model_node)
		_center_model_geometry(model_node)
	
	_apply_viewmodel_material_recursive(model_node)
	var muzzle := Node3D.new()
	muzzle.name = "WeaponMuzzle"
	muzzle.position = _get_muzzle_offset(weapon_name)
	model_node.add_child(muzzle)
	return model_node

func _get_active_weapon_model() -> Node3D:
	match current_weapon:
		Weapon.KNIFE:
			return _knife_model
		Weapon.PISTOL:
			return _pistol_model
		Weapon.SMG:
			return _smg_model
		Weapon.AK:
			return _ak_model
		Weapon.SNIPER:
			return _sniper_model
		Weapon.SHOTGUN:
			return _shotgun_model
		Weapon.REVOLVER:
			return _revolver_model
	return null

func _is_custom_weapon_active() -> bool:
	var active_model = _get_active_weapon_model()
	if active_model != null and is_instance_valid(active_model):
		if active_model.has_meta("is_custom"):
			return active_model.get_meta("is_custom")
	return false

func _load_arms_model() -> void:
	if _arms_root == null:
		return
	for child in _arms_root.get_children():
		child.queue_free()
	var resource := ResourceLoader.load(arms_model_path, "PackedScene", ResourceLoader.CACHE_MODE_REUSE)
	if resource is PackedScene:
		var instance: Node3D = resource.instantiate() as Node3D
		if instance != null:
			# Prevent D3D12 from compiling many imported material PSOs on one frame.
			# Reuse the pre-warmed shared viewmodel material before entering tree.
			if _viewmodel_shared_mat != null:
				_strip_fbx_materials_recursive(instance)
			_arms_model = instance
			_arms_model.name = "ArmsModel"
			_arms_root.add_child(_arms_model)
			return
	_build_placeholder_arms_model(_arms_root)

func _build_placeholder_arms_model(parent: Node3D) -> void:
	var _skin_material := _make_viewmodel_material(Color(0.88, 0.74, 0.64), 0.0, 0.65, 0.0) # skin color
	var glove_material := _make_viewmodel_material(Color(0.08, 0.08, 0.1), 0.15, 0.42, 0.0) # black leather glove
	var sleeve_material := _make_viewmodel_material(Color(1.0, 0.45, 0.0), 0.0, 0.8, 0.4) # orange sleeve with glow!
	var trim_material := _make_viewmodel_material(Color(0.2, 0.2, 0.25), 0.4, 0.3, 0.0) # carbon trim

	# Left Arm Assembly
	var left_arm := Node3D.new()
	left_arm.name = "LeftArm"
	left_arm.position = Vector3(-0.25, -0.22, -0.12)
	left_arm.rotation_degrees = Vector3(-20, 10, 5)
	parent.add_child(left_arm)
	
	# Sleeve (Forearm)
	var left_sleeve := MeshInstance3D.new()
	var left_sleeve_mesh := CylinderMesh.new()
	left_sleeve_mesh.top_radius = 0.05
	left_sleeve_mesh.bottom_radius = 0.055
	left_sleeve_mesh.height = 0.28
	left_sleeve.mesh = left_sleeve_mesh
	left_sleeve.material_override = sleeve_material
	left_sleeve.position = Vector3(0, 0.08, 0)
	left_arm.add_child(left_sleeve)
	
	# Carbon trim wristband
	var left_trim := MeshInstance3D.new()
	var left_trim_mesh := CylinderMesh.new()
	left_trim_mesh.top_radius = 0.052
	left_trim_mesh.bottom_radius = 0.052
	left_trim_mesh.height = 0.03
	left_trim.mesh = left_trim_mesh
	left_trim.material_override = trim_material
	left_trim.position = Vector3(0, -0.06, 0)
	left_arm.add_child(left_trim)

	# Glove (Hand)
	var left_hand := MeshInstance3D.new()
	var left_hand_mesh := CapsuleMesh.new()
	left_hand_mesh.radius = 0.045
	left_hand_mesh.height = 0.15
	left_hand.mesh = left_hand_mesh
	left_hand.material_override = glove_material
	left_hand.position = Vector3(0, -0.12, 0.04)
	left_hand.rotation_degrees = Vector3(10, 0, 0)
	left_arm.add_child(left_hand)

	# Right Arm Assembly
	var right_arm := Node3D.new()
	right_arm.name = "RightArm"
	right_arm.position = Vector3(0.25, -0.22, -0.12)
	right_arm.rotation_degrees = Vector3(-20, -10, -5)
	parent.add_child(right_arm)
	
	# Sleeve (Forearm)
	var right_sleeve := MeshInstance3D.new()
	var right_sleeve_mesh := CylinderMesh.new()
	right_sleeve_mesh.top_radius = 0.05
	right_sleeve_mesh.bottom_radius = 0.055
	right_sleeve_mesh.height = 0.28
	right_sleeve.mesh = right_sleeve_mesh
	right_sleeve.material_override = sleeve_material
	right_sleeve.position = Vector3(0, 0.08, 0)
	right_arm.add_child(right_sleeve)
	
	# Carbon trim wristband
	var right_trim := MeshInstance3D.new()
	var right_trim_mesh := CylinderMesh.new()
	right_trim_mesh.top_radius = 0.052
	right_trim_mesh.bottom_radius = 0.052
	right_trim_mesh.height = 0.03
	right_trim.mesh = right_trim_mesh
	right_trim.material_override = trim_material
	right_trim.position = Vector3(0, -0.06, 0)
	right_arm.add_child(right_trim)

	# Glove (Hand)
	var right_hand := MeshInstance3D.new()
	var right_hand_mesh := CapsuleMesh.new()
	right_hand_mesh.radius = 0.045
	right_hand_mesh.height = 0.15
	right_hand.mesh = right_hand_mesh
	right_hand.material_override = glove_material
	right_hand.position = Vector3(0, -0.12, 0.04)
	right_hand.rotation_degrees = Vector3(10, 0, 0)
	right_arm.add_child(right_hand)

func _set_layer_recursive(node: Node, layer: int) -> void:
	if node is GeometryInstance3D:
		node.layers = layer
	for child in node.get_children():
		_set_layer_recursive(child, layer)

func _apply_nearest_texture_filter_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_inst := node as MeshInstance3D
		if mesh_inst.material_override is BaseMaterial3D:
			mesh_inst.material_override.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		if mesh_inst.mesh:
			for i in range(mesh_inst.mesh.get_surface_count()):
				var mat = mesh_inst.get_active_material(i)
				if mat is BaseMaterial3D:
					mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	for child in node.get_children():
		_apply_nearest_texture_filter_recursive(child)

func _strip_fbx_materials_recursive(node: Node) -> void:
	# Replace all imported mesh materials with the pre-warmed shared material
	# BEFORE the node enters the scene tree. This prevents D3D12 from queuing
	# PSO compilations for every unique FBX-imported material on add_child.
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.mesh:
			for i in range(mi.mesh.get_surface_count()):
				mi.set_surface_override_material(i, _viewmodel_shared_mat)
	for child in node.get_children():
		_strip_fbx_materials_recursive(child)


func _apply_viewmodel_material_recursive(node: Node, weapon_dir: String = "") -> void:
	if node is GeometryInstance3D:
		var geom := node as GeometryInstance3D
		geom.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		geom.ignore_occlusion_culling = true
		geom.custom_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))
		geom.layers = 2
		
		var is_custom = ("kr_models" in weapon_dir)
		if is_custom:
			# Do NOT override or duplicate materials for custom weapons.
			# This keeps their native imported materials (with textures) intact,
			# and avoids triggering runtime D3D12 PSO compilations which crash the driver.
			geom.material_override = null
		else:
			# Use the single pre-warmed shared material — already PSO-compiled,
			# so this assignment never triggers a new D3D12 PSO compilation.
			if _viewmodel_shared_mat == null:
				_viewmodel_shared_mat = StandardMaterial3D.new()
				_viewmodel_shared_mat.albedo_color = Color(0.4, 0.4, 0.42)
				_viewmodel_shared_mat.metallic = 0.5
				_viewmodel_shared_mat.roughness = 0.4
				_viewmodel_shared_mat.no_depth_test = false
				_viewmodel_shared_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			geom.material_override = _viewmodel_shared_mat
	for child in node.get_children():
		_apply_viewmodel_material_recursive(child, weapon_dir)


func _apply_viewmodel_runtime_options() -> void:
	if _viewmodel_root:
		_viewmodel_root.visible = vm_visible and camera_mode == "first" and not _is_warmup_free_fly_active()
	if _viewmodel_holder:
		_viewmodel_holder.scale = Vector3.ONE * max(vm_model_scale, 0.01)
		_apply_viewmodel_runtime_options_recursive(_viewmodel_holder)
	_update_local_model_visibility()

func _update_local_model_visibility() -> void:
	if _viewmodel_root:
		_viewmodel_root.visible = vm_visible and camera_mode == "first" and not _is_warmup_free_fly_active()
	if _world_model:
		_world_model.visible = (not is_local_player) or (camera_mode == "third")

func _load_texture_resource(path: String) -> Texture2D:
	if path.strip_edges() == "":
		return null
	var res: Resource = ResourceLoader.load(path)
	if res is Texture2D:
		return res as Texture2D
	return null


func _apply_player_world_model_textures() -> void:
	if _world_model == null or not is_instance_valid(_world_model):
		return
	var head_tex: Texture2D = _load_texture_resource(body_texture_head_path)
	var main_tex: Texture2D = _load_texture_resource(body_texture_main_path)
	if head_tex == null and main_tex == null:
		return

	for child in _world_model.find_children("*", "MeshInstance3D", true, false):
		if child is MeshInstance3D:
			var mesh_inst := child as MeshInstance3D
			if mesh_inst.mesh == null:
				continue
			for i in range(mesh_inst.mesh.get_surface_count()):
				var surface_name: String = str(mesh_inst.mesh.surface_get_name(i)).to_lower()
				var selected: Texture2D = null
				if head_tex != null and ("head" in surface_name or "face" in surface_name):
					selected = head_tex
				elif main_tex != null and ("newsvip" in surface_name or "vip" in surface_name or "body" in surface_name or "torso" in surface_name):
					selected = main_tex
				elif main_tex != null:
					selected = main_tex
				elif head_tex != null:
					selected = head_tex

				if selected == null:
					continue

				var existing := mesh_inst.get_active_material(i)
				var mat: BaseMaterial3D
				if existing is BaseMaterial3D:
					mat = (existing as BaseMaterial3D).duplicate() as BaseMaterial3D
				else:
					mat = StandardMaterial3D.new()
					mat.metallic = 0.0
					mat.roughness = 1.0
				mat.albedo_texture = selected
				mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
				mesh_inst.set_surface_override_material(i, mat)

# --- CS1.6 Animation State Machine -----------------------------------------------
# Plays real GLB animations (idle1, walk, run, crouch_idle, crouchrun, jump,
# death1, death2, death3) via the AnimationPlayer inside the world model.
# Falls back to procedural bone motion if the player doesn't have a real GLB.

func safe_play_animation(anim_name: String, fallback_name: String = "", crossfade: float = 0.15) -> bool:
	if _body_anim_player == null or not is_instance_valid(_body_anim_player):
		return false
	var resolved_name := _find_animation_name(_body_anim_player, [anim_name])
	if resolved_name == "" and fallback_name != "":
		resolved_name = _find_animation_name(_body_anim_player, [fallback_name])
	if resolved_name == "":
		# Keep current animation running. Never stop into bind pose.
		return false
	if _body_anim_current == resolved_name and _body_anim_player.is_playing():
		return true

	_body_anim_current = resolved_name
	_body_anim_player.play(resolved_name, crossfade)

	# Restore animation speeds based on original sequence FPS.
	var anim_fps_map := {
		"idle1": 15.0,
		"crouch_idle": 10.0,
		"walk": 30.0,
		"run": 60.0,
		"crouchrun": 30.0,
		"jump": 30.0,
		"longjump": 30.0,
		"swim": 30.0,
		"treadwater": 24.0,
		"death1": 30.0,
		"death2": 30.0,
		"death3": 30.0,
		"gut_flinch": 30.0,
		"head_flinch": 30.0
	}
	var base_name := resolved_name
	if resolved_name.contains("/"):
		base_name = resolved_name.split("/")[-1]
	if anim_fps_map.has(base_name):
		_body_anim_player.speed_scale = anim_fps_map[base_name] / 30.0
	else:
		_body_anim_player.speed_scale = 1.0

	# Ensure loops for locomotion; preserve one-shot behavior for death/flinch/hit.
	if _body_anim_player.has_animation(resolved_name):
		var anim_res: Animation = _body_anim_player.get_animation(resolved_name)
		if anim_res != null:
			var is_one_shot := base_name.begins_with("death") or base_name.find("flinch") >= 0 or base_name in ["head", "gutshot"]
			if not is_one_shot and anim_res.loop_mode == Animation.LOOP_NONE:
				anim_res.loop_mode = Animation.LOOP_LINEAR
	return true


func _play_body_anim(anim_name: String, crossfade: float = 0.15) -> void:
	safe_play_animation(anim_name, "", crossfade)

func _update_local_model_animation(delta: float) -> void:
	if _arms_root != null:
		_arms_anim_time += delta * (1.0 + clamp(velocity.length() * 0.15, 0.0, 2.2))
		var arm_swing := sin(_arms_anim_time * 5.4) * 0.28
		var left_arm := _arms_root.get_node_or_null("LeftArm")
		var right_arm := _arms_root.get_node_or_null("RightArm")
		if left_arm:
			left_arm.rotation.x = arm_swing
		if right_arm:
			right_arm.rotation.x = -arm_swing
	if _world_model == null:
		return

	# ---- CS1.6-style animation state machine ----
	# GoldSrc pipeline: idle1=standing, walk=walking, run=sprinting,
	# crouch_idle=crouching still, crouchrun=crouching+moving,
	# jump=full airborne (both rising AND falling), death1/2/3=eliminated.
	if _body_anim_player != null and is_instance_valid(_body_anim_player):
		if is_eliminated:
			var death_anim := _find_animation_name(_body_anim_player, ["death1", "death2", "death3"])
			safe_play_animation(death_anim if death_anim != "" else "death1", "idle1", 0.1)
			_body_anim_player.speed_scale = 1.0
		elif _body_anim_priority_timer > 0.0:
			_body_anim_priority_timer = max(_body_anim_priority_timer - delta, 0.0)
			var flinch_anim := _find_animation_name(_body_anim_player, ["gut_flinch", "head_flinch", "gutshot", "head"])
			if flinch_anim != "":
				safe_play_animation(flinch_anim, "idle1", 0.05)
				_body_anim_player.speed_scale = 1.0
		elif is_grappling:
			safe_play_animation("rope_climb", "idle1", 0.12)
			_body_anim_player.speed_scale = 1.0
		elif _back_jump_effect_time > 0.0:
			safe_play_animation("back_flip", "jump", 0.08)
			_body_anim_player.speed_scale = 1.0
		elif _slide_timer > 0.0 and is_on_floor():
			safe_play_animation("slide", "crouchrun", 0.1)
			_body_anim_player.speed_scale = clamp(velocity.length() / 4.5, 0.6, 1.6)
		elif _is_wall_running:
			safe_play_animation("wall_slide", "jump", 0.1)
			_body_anim_player.speed_scale = 1.0
		elif not is_on_floor():
			# Keep jump anim the ENTIRE time in air (both rise and fall)
			# Prevents T-pose snap when velocity.y crosses zero
			if not double_jump_ready:
				safe_play_animation("double_jump", "jump", 0.1)
			else:
				safe_play_animation("jump", "idle1", 0.1)
			_body_anim_player.speed_scale = 1.0
		elif velocity.length() > 0.1:
			if is_crouching or _slide_timer > 0.0:
				safe_play_animation("crouchrun", "walk", 0.2)
				_body_anim_player.speed_scale = (30.0 / 30.0) * clamp(velocity.length() / 2.2, 0.5, 2.0)
			else:
				var speed_val = velocity.length()
				if speed_val > 4.5 or Input.is_action_pressed("sprint"):
					safe_play_animation("run", "walk", 0.2)
					_body_anim_player.speed_scale = (60.0 / 30.0) * clamp(speed_val / 5.4, 1.0, 2.0)
				else:
					safe_play_animation("walk", "idle1", 0.15)
					_body_anim_player.speed_scale = (30.0 / 30.0) * clamp(speed_val / 2.8, 0.5, 2.0)
		else:
			if is_crouching or _slide_timer > 0.0:
				safe_play_animation("crouch_idle", "idle1", 0.2)
				_body_anim_player.speed_scale = (10.0 / 30.0)
			else:
				safe_play_animation("idle1", "walk", 0.25)
				_body_anim_player.speed_scale = (15.0 / 30.0)
		return

	# ---- Fallback: procedural bone motion (no AnimationPlayer / placeholder body) ----
	var skeletons = _world_model.find_children("*", "Skeleton3D", true, false)
	var skeleton: Skeleton3D = skeletons[0] if skeletons.size() > 0 else null
	if skeleton and skeleton.get_bone_count() > 0:
		_drive_skeleton_procedural(skeleton, delta)
	else:
		_body_anim_time += delta * (1.0 + clamp(velocity.length() * 0.1, 0.0, 1.8))
		var body_swing: float = sin(_body_anim_time * 4.2) * clamp(velocity.length() / 5.0, 0.0, 0.45)
		var left_leg := _world_model.get_node_or_null("LeftLeg")
		var right_leg := _world_model.get_node_or_null("RightLeg")
		var left_arm_world := _world_model.get_node_or_null("LeftArm")
		var right_arm_world := _world_model.get_node_or_null("RightArm")
		if left_leg:
			left_leg.rotation.x = body_swing
		if right_leg:
			right_leg.rotation.x = -body_swing
		if left_arm_world:
			left_arm_world.rotation.x = -body_swing * 0.6
		if right_arm_world:
			right_arm_world.rotation.x = body_swing * 0.6

func _drive_skeleton_procedural(skeleton: Skeleton3D, delta: float) -> void:
	var speed: float = velocity.length()
	var walk_freq: float = clamp(speed * 0.55, 1.0, 4.0)
	_body_anim_time += delta * walk_freq
	var t: float = _body_anim_time
	var walk_blend: float = clamp(speed / 4.0, 0.0, 1.0) if not is_crouching else clamp(speed / 2.5, 0.0, 1.0)
	var crouch_blend: float = 1.0 if (is_crouching or (_slide_timer > 0.0)) else 0.0
	var crouch_height: float = lerp(0.0, -4.0, crouch_blend)
	var idle_breath: float = sin(t * 0.9) * 0.04 * (1.0 - walk_blend)

	# Bone naming (from skeleton print):
	# 0=Bip01 (root), 1=Bip01 Pelvis, 2=Bip01 Spine, 3=Bip01 Spine1
	skeleton.reset_bone_poses()
	skeleton.set_bone_pose_position(0, Vector3.ZERO)
	skeleton.set_bone_pose_rotation(0, Quaternion.IDENTITY)
	var pelvis_sway: float = sin(t) * 0.06 * walk_blend
	var pelvis_y_offset: float = crouch_height
	skeleton.set_bone_pose_position(1, Vector3(pelvis_sway, pelvis_y_offset, 0.0))
	var spine_lean: float = lerp(0.0, -0.15, walk_blend) + idle_breath
	skeleton.set_bone_pose_rotation(2, Quaternion(Vector3(1,0,0), spine_lean))
	skeleton.set_bone_pose_rotation(3, Quaternion(Vector3(1,0,0), spine_lean * 0.5))
	var l_thigh_swing: float = sin(t) * deg_to_rad(35.0) * walk_blend
	var l_calf_bend: float = abs(sin(t)) * deg_to_rad(25.0) * walk_blend + crouch_blend * deg_to_rad(40.0)
	var l_foot_plant: float = -l_thigh_swing * 0.5
	var r_thigh_swing: float = sin(t + PI) * deg_to_rad(35.0) * walk_blend
	var r_calf_bend: float = abs(sin(t + PI)) * deg_to_rad(25.0) * walk_blend + crouch_blend * deg_to_rad(40.0)
	var r_foot_plant: float = -r_thigh_swing * 0.5
	var i_l_thigh: int = skeleton.find_bone("Bip01 L Thigh")
	var i_l_calf: int = skeleton.find_bone("Bip01 L Calf")
	var i_l_foot: int = skeleton.find_bone("Bip01 L Foot")
	var i_r_thigh: int = skeleton.find_bone("Bip01 R Thigh")
	var i_r_calf: int = skeleton.find_bone("Bip01 R Calf")
	var i_r_foot: int = skeleton.find_bone("Bip01 R Foot")
	var i_l_upper: int = skeleton.find_bone("Bip01 L UpperArm")
	var i_r_upper: int = skeleton.find_bone("Bip01 R UpperArm")
	var i_head: int = skeleton.find_bone("Bip01 Head")
	if i_l_thigh >= 0: skeleton.set_bone_pose_rotation(i_l_thigh, Quaternion(Vector3(1,0,0), l_thigh_swing))
	if i_l_calf >= 0: skeleton.set_bone_pose_rotation(i_l_calf, Quaternion(Vector3(1,0,0), l_calf_bend))
	if i_l_foot >= 0: skeleton.set_bone_pose_rotation(i_l_foot, Quaternion(Vector3(1,0,0), l_foot_plant))
	if i_r_thigh >= 0: skeleton.set_bone_pose_rotation(i_r_thigh, Quaternion(Vector3(1,0,0), r_thigh_swing))
	if i_r_calf >= 0: skeleton.set_bone_pose_rotation(i_r_calf, Quaternion(Vector3(1,0,0), r_calf_bend))
	if i_r_foot >= 0: skeleton.set_bone_pose_rotation(i_r_foot, Quaternion(Vector3(1,0,0), r_foot_plant))
	var l_arm_swing: float = sin(t + PI) * deg_to_rad(20.0) * walk_blend
	var r_arm_swing: float = sin(t) * deg_to_rad(20.0) * walk_blend
	if i_l_upper >= 0: skeleton.set_bone_pose_rotation(i_l_upper, Quaternion(Vector3(1,0,0), l_arm_swing))
	if i_r_upper >= 0: skeleton.set_bone_pose_rotation(i_r_upper, Quaternion(Vector3(1,0,0), r_arm_swing))
	if i_head >= 0:
		var head_bob: float = sin(t * 2.0) * 0.02 * walk_blend
		skeleton.set_bone_pose_rotation(i_head, Quaternion(Vector3(1,0,0), head_bob))

func _apply_viewmodel_runtime_options_recursive(node: Node) -> void:
	if node is GeometryInstance3D:
		var geom := node as GeometryInstance3D
		geom.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		geom.extra_cull_margin = 2.0
		geom.ignore_occlusion_culling = true
		geom.custom_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))
		geom.layers = 2 # Set strictly to layer 2
		if geom.material_override is BaseMaterial3D:
			var mat := geom.material_override as BaseMaterial3D
			mat.no_depth_test = false
			mat.render_priority = 127 if vm_draw_on_top else 0
	for child in node.get_children():
		_apply_viewmodel_runtime_options_recursive(child)

func _set_saved_viewmodel_tuning_for_weapon(weapon: int) -> bool:
	var key := ""
	match weapon:
		Weapon.KNIFE: key = "knife"
		Weapon.PISTOL: key = "pistol"
		Weapon.SMG: key = "smg"
		Weapon.AK: key = "ak"
		Weapon.SNIPER: key = "sniper"
		Weapon.SHOTGUN: key = "shotgun"
		Weapon.REVOLVER: key = "revolver"
		_: return false
	if not _viewmodel_tuner_saved_pos.has(key) or not _viewmodel_tuner_saved_rot.has(key):
		return false
	var saved_pos: Vector3 = _viewmodel_tuner_saved_pos[key]
	var saved_rot: Vector3 = _viewmodel_tuner_saved_rot[key]
	var base_pos := _weapon_rest_position(weapon)
	var base_rot := _weapon_rest_rotation(weapon)
	vm_pos_offset = saved_pos - base_pos
	vm_rot_offset = saved_rot - base_rot
	vm_tuning_enabled = true
	return true

func _load_viewmodel_tuner_state() -> void:
	if not FileAccess.file_exists(VIEWMODEL_TUNER_STATE_PATH):
		return
	var f := FileAccess.open(VIEWMODEL_TUNER_STATE_PATH, FileAccess.READ)
	if f == null:
		return
	var json_str: String = f.get_as_text()
	f.close()
	if json_str.strip_edges() == "":
		return
	var parsed: Dictionary = JSON.parse_string(json_str) as Dictionary
	if parsed == null:
		return
	var state: Dictionary = parsed
	var pos_data: Dictionary = state.get("pos", {}) as Dictionary
	var rot_data: Dictionary = state.get("rot", {}) as Dictionary
	if pos_data is Dictionary and rot_data is Dictionary:
		for key in pos_data.keys():
			var p_arr: Array = pos_data[key] as Array
			if p_arr is Array and p_arr.size() == 3:
				_viewmodel_tuner_saved_pos[key] = Vector3(p_arr[0], p_arr[1], p_arr[2])
		for key in rot_data.keys():
			var r_arr: Array = rot_data[key] as Array
			if r_arr is Array and r_arr.size() == 3:
				_viewmodel_tuner_saved_rot[key] = Vector3(r_arr[0], r_arr[1], r_arr[2])
	var options_data: Dictionary = state.get("options", {}) as Dictionary
	if options_data is Dictionary:
		if options_data.has("visible"):
			vm_visible = bool(options_data["visible"])
		if options_data.has("draw_on_top"):
			vm_draw_on_top = bool(options_data["draw_on_top"])
		if options_data.has("scale"):
			vm_model_scale = clamp(float(options_data["scale"]), 0.05, 5.0)
		if options_data.has("muzzle_offset"):
			var muzzle_arr: Variant = options_data["muzzle_offset"]
			if muzzle_arr is Array and muzzle_arr.size() == 3:
				muzzle_tuning_offset = Vector3(float(muzzle_arr[0]), float(muzzle_arr[1]), float(muzzle_arr[2]))
	_apply_viewmodel_runtime_options()
	if _set_saved_viewmodel_tuning_for_weapon(current_weapon):
		_apply_live_tuning()

func _center_model_geometry(node: Node3D) -> void:
	# Compute the AABB of all meshes in the model's local space (no global_transform needed).
	# Using child.transform (local-to-parent) avoids incorrect results when global_transform
	# is still identity at startup before the first render frame.
	var aabb := AABB()
	var found_mesh := false
	for child in node.find_children("*", "MeshInstance3D", true):
		if child is MeshInstance3D:
			var in_node_space: AABB = child.transform * child.get_aabb()
			if not found_mesh:
				aabb = in_node_space
				found_mesh = true
			else:
				aabb = aabb.merge(in_node_space)

	if found_mesh:
		var center_offset := aabb.get_center()
		for child in node.get_children():
			if child is Node3D and child.name != "WeaponMuzzle":
				(child as Node3D).position -= center_offset


func _normalize_model_scale(node: Node3D) -> void:
	# Target the gun's longest dimension to ~0.35 m in Godot units.
	# CS2 viewmodels sit ~0.6-0.8 m from the camera eye at 54� FOV.
	# A pistol barrel is ~17 cm real-world ? 0.17 m, so the whole gun body
	# including grip is roughly 0.25�0.35 m at this scale. Adjust per-weapon
	# below if you want finer control.
	const TARGET_SIZE := 0.35
	var aabb = AABB()
	var found_mesh = false
	for child in node.find_children("*", "MeshInstance3D", true):
		if child is MeshInstance3D:
			var child_aabb = child.get_aabb()
			if not found_mesh:
				aabb = child_aabb
				found_mesh = true
			else:
				aabb = aabb.merge(child_aabb)

	if found_mesh:
		var max_dim = aabb.get_longest_axis_size()
		if max_dim > 0.001:
			node.scale = Vector3.ONE * (TARGET_SIZE / max_dim)


func _add_fallback_mesh(parent: Node) -> void:
	var fallback = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = Vector3(0.08, 0.08, 0.45)
	fallback.mesh = box
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.0, 0.0, 0.5)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fallback.material_override = mat
	fallback.extra_cull_margin = 16384.0
	fallback.ignore_occlusion_culling = true
	fallback.custom_aabb = AABB(Vector3(-10, -10, -10), Vector3(20, 20, 20))
	parent.add_child(fallback)


func _make_viewmodel_material(color: Color, metallic: float, roughness: float, emission_energy: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	if emission_energy > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission_energy
	return material


func _setup_world_model_anim_player() -> void:
	# Called after _world_model is set. Finds the AnimationPlayer inside the GLB
	# and prepares the CS1.6 animation state machine.
	if _world_model == null:
		return
	# Guard: this setup is expensive and mutates tracks; rerunning it multiple
	# times during startup can destabilize the renderer on D3D12.
	if _body_anim_player != null and is_instance_valid(_body_anim_player) and _world_model_anim_setup_done:
		return
	var ap: AnimationPlayer = _world_model.get_node_or_null("AnimationPlayer")
	if ap == null:
		# Try deep search
		var aps := _world_model.find_children("*", "AnimationPlayer", true, false)
		if aps.size() > 0:
			ap = aps[0] as AnimationPlayer
	if ap != null:
		_body_anim_player = ap
		_body_anim_player.active = false # Temporarily deactivate during track modifications to prevent thread crash
		_body_anim_player.speed_scale = 1.0
		if not _body_anim_player.is_playing():
			_body_anim_current = ""
		_body_anim_priority_timer = 0.0

		var unique_lib: AnimationLibrary = null
		if ap.has_animation_library(""):
			var default_lib = ap.get_animation_library("")
			if default_lib != null:
				unique_lib = default_lib.duplicate(true)

		var skeletons = _world_model.find_children("*", "Skeleton3D", true, false)
		var skeleton: Skeleton3D = skeletons[0] if skeletons.size() > 0 else null
		var bip01_bone_idx := -1
		if skeleton:
			bip01_bone_idx = skeleton.find_bone("Bip01")

		if unique_lib != null:
			var ref_pos := Vector3.ZERO
			var has_ref_pos := false
			var ref_anim_name := ""
			for possible in ["idle1", "idle", "RESET"]:
				for lib_anim in unique_lib.get_animation_list():
					if str(lib_anim).to_lower() == possible:
						ref_anim_name = lib_anim
						break
				if ref_anim_name != "":
					break
			if ref_anim_name != "":
				var ref_anim = unique_lib.get_animation(ref_anim_name)
				if ref_anim:
					for track_idx in range(ref_anim.get_track_count()):
						var path_str = str(ref_anim.track_get_path(track_idx))
						if ":Bip01" in path_str and not ":Bip01 " in path_str:
							if ref_anim.track_get_type(track_idx) == Animation.TYPE_POSITION_3D:
								if ref_anim.track_get_key_count(track_idx) > 0:
									var val = ref_anim.track_get_key_value(track_idx, 0)
									if val is Vector3:
										ref_pos = val
										has_ref_pos = true
										break

			for anim_name in unique_lib.get_animation_list():
				var anim_src = unique_lib.get_animation(anim_name)
				if anim_src:
					var anim: Animation = anim_src.duplicate(true)
					var tracks_to_remove = []
					var modified = false
					for track_idx in range(anim.get_track_count()):
						var path_str = str(anim.track_get_path(track_idx))
						if ":Bip01" in path_str and not ":Bip01 " in path_str:
							if anim.track_get_type(track_idx) == Animation.TYPE_POSITION_3D or path_str.ends_with(":position") or path_str.ends_with("location"):
								var keys: int = anim.track_get_key_count(track_idx)
								var projected = false
								if keys > 0 and anim.track_get_type(track_idx) == Animation.TYPE_POSITION_3D:
									var target_pos = ref_pos if has_ref_pos else anim.track_get_key_value(track_idx, 0)
									if target_pos is Vector3:
										projected = true
										modified = true
										for key_idx in range(keys):
											var key_time = anim.track_get_key_time(track_idx, key_idx)
											anim.position_track_insert_key(track_idx, key_time, target_pos)
								
								if not projected:
									tracks_to_remove.append(track_idx)
									modified = true
					if modified:
						tracks_to_remove.reverse()
						for track_idx in tracks_to_remove:
							anim.remove_track(track_idx)
						unique_lib.add_animation(anim_name, anim)
			
			ap.remove_animation_library("")
			ap.add_animation_library("", unique_lib)

		if ap.has_animation("RESET"):
			ap.set_blend_time("RESET", "idle1", 0.0)
			ap.set_blend_time("idle1", "RESET", 0.0)
				
		if skeleton and bip01_bone_idx >= 0:
			skeleton.set_bone_pose_position(bip01_bone_idx, Vector3.ZERO)
			skeleton.set_bone_pose_rotation(bip01_bone_idx, Quaternion.IDENTITY)

		_recover_cs_qc_sequences(ap)
		if not _world_model_anim_setup_done:
			_world_model_anim_setup_done = true
			_ensure_custom_movement_clips(ap)
			_ensure_required_gameplay_clips(ap)
		print("[WorldModel] AnimationPlayer found. Animations: ", ap.get_animation_list())
		_body_anim_player.active = true
		_play_body_anim("idle1")
	else:
		print("[WorldModel] No AnimationPlayer found — using procedural bones.")


func _update_world_model_ground_offset(height: float) -> void:
	if _world_model == null or not is_instance_valid(_world_model):
		return
	var runtime_bottom = collision_shape.position.y - (height / 2.0) if collision_shape else 0.0
	_world_model.position.y = _editor_model_pos.y + (runtime_bottom - _world_model_editor_bottom)


func _compute_model_local_bottom_y(model_root: Node3D) -> float:
	if model_root == null:
		return -0.9
	var found_mesh := false
	var bottom_y := 0.0
	for child in model_root.find_children("*", "MeshInstance3D", true, false):
		if child is MeshInstance3D:
			var mesh_instance := child as MeshInstance3D
			var local_aabb := mesh_instance.get_aabb()
			var to_model := model_root.global_transform.affine_inverse() * mesh_instance.global_transform
			var model_aabb: AABB = to_model * local_aabb
			var mesh_bottom := model_aabb.position.y
			if not found_mesh:
				bottom_y = mesh_bottom
				found_mesh = true
			else:
				bottom_y = min(bottom_y, mesh_bottom)
	return bottom_y if found_mesh else -0.9


func _slice_animation(source_anim: Animation, start_time: float, duration: float) -> Animation:
	var out_anim: Animation = source_anim.duplicate(true)
	var end_time := start_time + duration
	for track_idx in range(out_anim.get_track_count() - 1, -1, -1):
		for key_idx in range(out_anim.track_get_key_count(track_idx) - 1, -1, -1):
			var key_time := out_anim.track_get_key_time(track_idx, key_idx)
			if key_time < start_time or key_time > end_time:
				out_anim.track_remove_key(track_idx, key_idx)
			else:
				out_anim.track_set_key_time(track_idx, key_idx, key_time - start_time)
		if out_anim.track_get_key_count(track_idx) == 0:
			out_anim.remove_track(track_idx)
	out_anim.length = max(duration, 1.0 / 30.0)
	return out_anim


func _read_smd_frame_count(smd_path: String) -> int:
	if not FileAccess.file_exists(smd_path):
		return 0
	var text := FileAccess.get_file_as_string(smd_path)
	if text == "":
		return 0
	var regex := RegEx.new()
	var err := regex.compile("(?m)^\\s*time\\s+(\\d+)\\s*$")
	if err != OK:
		return 0
	var max_frame := -1
	for m in regex.search_all(text):
		max_frame = max(max_frame, int(m.get_string(1)))
	return max_frame + 1 if max_frame >= 0 else 0


func _resolve_sequence_smd_path(smd_ref: String) -> String:
	if smd_ref == "":
		return ""
	var normalized := smd_ref.replace("\\", "/")
	if normalized.ends_with(".smd"):
		return "%s/%s" % [cs_asset_root_path, normalized]
	return "%s/%s.smd" % [cs_asset_root_path, normalized]


func _parse_qc_sequences(qc_text: String) -> Array[Dictionary]:
	var sequences: Array[Dictionary] = []
	var seen := {}
	var lines := qc_text.split("\n")
	var header_re := RegEx.new()
	if header_re.compile("^\\$sequence\\s+\"([^\"]+)\"") != OK:
		return sequences
	var i := 0
	while i < lines.size():
		var line := lines[i].strip_edges()
		if line.begins_with("$sequence"):
			var match := header_re.search(line)
			if match:
				var seq_name := match.get_string(1)
				if not seen.has(seq_name):
					var depth := 1 if line.find("{") >= 0 else 0
					var block_lines: Array[String] = []
					i += 1
					while i < lines.size():
						var bl_raw := lines[i]
						var bl := bl_raw.strip_edges()
						block_lines.append(bl)
						if bl.find("{") >= 0:
							depth += bl.count("{")
						if bl.find("}") >= 0:
							depth -= bl.count("}")
							if depth <= 0:
								break
						i += 1

					var smd_ref := ""
					var fps := 30.0
					var looped := false
					for bl in block_lines:
						if bl.begins_with("fps "):
							fps = max(float(bl.trim_prefix("fps ").strip_edges().to_float()), 1.0)
						elif bl == "loop" or bl.find(" loop") >= 0:
							looped = true
						elif smd_ref == "" and bl.begins_with("\""):
							var q2 := bl.find("\"", 1)
							if q2 > 1:
								smd_ref = bl.substr(1, q2 - 1)

					var duration := 0.0
					var smd_path := _resolve_sequence_smd_path(smd_ref)
					if smd_path != "":
						var frame_count := _read_smd_frame_count(smd_path)
						if frame_count > 1:
							duration = float(frame_count - 1) / fps

					sequences.append({
						"name": seq_name,
						"fps": fps,
						"loop": looped,
						"duration": duration
					})
					seen[seq_name] = true
		i += 1
	return sequences


func _find_animation_name(ap: AnimationPlayer, preferred_names: Array) -> String:
	var names: PackedStringArray = ap.get_animation_list()
	for preferred_variant in preferred_names:
		var preferred := str(preferred_variant)
		if preferred in names:
			return preferred
		for anim_name in names:
			if anim_name == preferred or anim_name.ends_with("/" + preferred):
				return anim_name
	return ""


func _get_default_anim_library(ap: AnimationPlayer) -> AnimationLibrary:
	var lib := ap.get_animation_library("")
	if lib == null:
		lib = AnimationLibrary.new()
		ap.add_animation_library("", lib)
	return lib


func _recover_cs_qc_sequences(ap: AnimationPlayer) -> void:
	if _cs_sequences_recovered:
		return
	_cs_sequences_recovered = true
	# If the GLB already has the core gameplay animations, no recovery needed.
	# Deep-slicing the packed vip_qc_skeleton animation is expensive and can crash.
	var core_required := ["idle1", "walk", "run", "jump", "crouch_idle"]
	var missing_core := false
	for clip_name in core_required:
		if _find_animation_name(ap, [clip_name]) == "":
			missing_core = true
			break
	if not missing_core:
		print("[WorldModel] GLB has all core animations — skipping QC recovery.")
		return
	if not FileAccess.file_exists(cs_qc_path):
		return
	# Only recover the small set of sequences that are missing.
	var qc_text := FileAccess.get_file_as_string(cs_qc_path)
	var sequences := _parse_qc_sequences(qc_text)
	if sequences.is_empty():
		return
	var default_lib := _get_default_anim_library(ap)
	# Find any existing animation to use as a safe idle fallback pose.
	var fallback_anim: Animation = null
	var fallback_name := _find_animation_name(ap, ["idle1", "walk", "run"])
	if fallback_name != "":
		fallback_anim = ap.get_animation(fallback_name)
	var recovered_count := 0
	for seq in sequences:
		var seq_name := str(seq.get("name", "")).strip_edges()
		if seq_name == "" or not REQUIRED_GAMEPLAY_SEQUENCE_NAMES.has(seq_name):
			continue
		if _find_animation_name(ap, [seq_name]) != "":
			continue
		# Create a minimal placeholder so state machine won't stall.
		var placeholder: Animation
		if fallback_anim != null:
			placeholder = fallback_anim.duplicate(true)
		else:
			placeholder = Animation.new()
			placeholder.length = 1.0
		var seq_duration := float(seq.get("duration", 0.0))
		if seq_duration > 0.0:
			placeholder.length = seq_duration
		placeholder.loop_mode = Animation.LOOP_LINEAR if bool(seq.get("loop", false)) else Animation.LOOP_NONE
		default_lib.add_animation(seq_name, placeholder)
		recovered_count += 1
	if recovered_count > 0:
		print("[WorldModel] Created placeholder animations for missing clips: ", recovered_count)


func _ensure_custom_movement_clips(ap: AnimationPlayer) -> void:
	# First, create bespoke keyframed clips on the existing Bip01 skeleton.
	_create_custom_bip01_clip(ap, "slide", 0.90, true, {
		"Bip01 Pelvis": [Vector3(10, 0, 0), Vector3(16, 0, 0), Vector3(8, 0, 0)],
		"Bip01 Spine1": [Vector3(-8, 0, 0), Vector3(-14, 0, 0), Vector3(-6, 0, 0)],
		"Bip01 Spine2": [Vector3(-6, 0, 0), Vector3(-10, 0, 0), Vector3(-4, 0, 0)],
		"Bip01 L Thigh": [Vector3(34, 0, 4), Vector3(42, 0, 2), Vector3(28, 0, 3)],
		"Bip01 R Thigh": [Vector3(26, 0, -4), Vector3(34, 0, -2), Vector3(24, 0, -3)],
		"Bip01 L Calf": [Vector3(42, 0, 0), Vector3(52, 0, 0), Vector3(36, 0, 0)],
		"Bip01 R Calf": [Vector3(30, 0, 0), Vector3(42, 0, 0), Vector3(28, 0, 0)],
		"Bip01 L UpperArm": [Vector3(-14, 0, -10), Vector3(-18, 0, -16), Vector3(-12, 0, -8)],
		"Bip01 R UpperArm": [Vector3(-12, 0, 10), Vector3(-18, 0, 16), Vector3(-10, 0, 8)]
	}, "crouch_idle")
	_create_custom_bip01_clip(ap, "wall_slide", 0.80, true, {
		"Bip01 Pelvis": [Vector3(6, 0, 0), Vector3(10, 0, 0), Vector3(6, 0, 0)],
		"Bip01 Spine1": [Vector3(-4, 0, 0), Vector3(-8, 0, 0), Vector3(-4, 0, 0)],
		"Bip01 L UpperArm": [Vector3(-80, 8, -14), Vector3(-92, 10, -18), Vector3(-80, 8, -14)],
		"Bip01 R UpperArm": [Vector3(-80, -8, 14), Vector3(-92, -10, 18), Vector3(-80, -8, 14)],
		"Bip01 L Forearm": [Vector3(-18, 0, -20), Vector3(-28, 0, -24), Vector3(-18, 0, -20)],
		"Bip01 R Forearm": [Vector3(-18, 0, 20), Vector3(-28, 0, 24), Vector3(-18, 0, 20)],
		"Bip01 L Thigh": [Vector3(18, 0, 0), Vector3(26, 0, 0), Vector3(18, 0, 0)],
		"Bip01 R Thigh": [Vector3(18, 0, 0), Vector3(26, 0, 0), Vector3(18, 0, 0)]
	}, "jump")
	_create_custom_bip01_clip(ap, "double_jump", 0.58, false, {
		"Bip01 Pelvis": [Vector3(-4, 0, 0), Vector3(10, 0, 0), Vector3(-2, 0, 0)],
		"Bip01 Spine1": [Vector3(8, 0, 0), Vector3(-6, 0, 0), Vector3(2, 0, 0)],
		"Bip01 L Thigh": [Vector3(6, 0, 0), Vector3(-36, 0, 0), Vector3(10, 0, 0)],
		"Bip01 R Thigh": [Vector3(6, 0, 0), Vector3(-36, 0, 0), Vector3(10, 0, 0)],
		"Bip01 L Calf": [Vector3(22, 0, 0), Vector3(8, 0, 0), Vector3(24, 0, 0)],
		"Bip01 R Calf": [Vector3(22, 0, 0), Vector3(8, 0, 0), Vector3(24, 0, 0)],
		"Bip01 L UpperArm": [Vector3(-24, 0, -8), Vector3(16, 0, -6), Vector3(-12, 0, -6)],
		"Bip01 R UpperArm": [Vector3(-24, 0, 8), Vector3(16, 0, 6), Vector3(-12, 0, 6)]
	}, "jump")
	_create_custom_bip01_clip(ap, "back_flip", 0.76, false, {
		"Bip01 Pelvis": [Vector3(0, 0, 0), Vector3(-32, 0, 0), Vector3(-8, 0, 0)],
		"Bip01 Spine1": [Vector3(0, 0, 0), Vector3(-40, 0, 0), Vector3(-10, 0, 0)],
		"Bip01 Spine2": [Vector3(0, 0, 0), Vector3(-36, 0, 0), Vector3(-8, 0, 0)],
		"Bip01 Head": [Vector3(0, 0, 0), Vector3(-24, 0, 0), Vector3(-6, 0, 0)],
		"Bip01 L Thigh": [Vector3(8, 0, 0), Vector3(-24, 0, 0), Vector3(4, 0, 0)],
		"Bip01 R Thigh": [Vector3(8, 0, 0), Vector3(-24, 0, 0), Vector3(4, 0, 0)],
		"Bip01 L UpperArm": [Vector3(-20, 0, -10), Vector3(36, 0, -20), Vector3(-10, 0, -8)],
		"Bip01 R UpperArm": [Vector3(-20, 0, 10), Vector3(36, 0, 20), Vector3(-10, 0, 8)]
	}, "jump")
	_create_custom_bip01_clip(ap, "rope_climb", 0.88, true, {
		"Bip01 Pelvis": [Vector3(2, 0, 0), Vector3(8, 0, 0), Vector3(2, 0, 0)],
		"Bip01 Spine1": [Vector3(-2, 0, 0), Vector3(-6, 0, 0), Vector3(-2, 0, 0)],
		"Bip01 L UpperArm": [Vector3(-78, 8, -16), Vector3(-32, 0, -10), Vector3(-78, 8, -16)],
		"Bip01 R UpperArm": [Vector3(-32, 0, 10), Vector3(-78, -8, 16), Vector3(-32, 0, 10)],
		"Bip01 L Forearm": [Vector3(-24, 0, -12), Vector3(-10, 0, -8), Vector3(-24, 0, -12)],
		"Bip01 R Forearm": [Vector3(-10, 0, 8), Vector3(-24, 0, 12), Vector3(-10, 0, 8)],
		"Bip01 L Thigh": [Vector3(26, 0, 0), Vector3(8, 0, 0), Vector3(26, 0, 0)],
		"Bip01 R Thigh": [Vector3(8, 0, 0), Vector3(26, 0, 0), Vector3(8, 0, 0)]
	}, "idle1")

	# Fallback generation from nearest legacy clips if bespoke creation cannot run.
	var templates := {
		"slide": ["crouchrun", "crouch_idle", "walk"],
		"wall_slide": ["jump", "longjump", "back"],
		"double_jump": ["longjump", "jump"],
		"back_flip": ["back", "longjump", "jump"],
		"rope_climb": ["swim", "treadwater", "forward"]
	}
	var default_lib := _get_default_anim_library(ap)
	for new_clip in templates.keys():
		if _find_animation_name(ap, [new_clip]) != "":
			continue
		var template_name := _find_animation_name(ap, templates[new_clip])
		if template_name == "" or not ap.has_animation(template_name):
			continue
		var template_anim := ap.get_animation(template_name)
		if template_anim == null:
			continue
		var generated := template_anim.duplicate(false)
		generated.loop_mode = Animation.LOOP_LINEAR if new_clip in ["slide", "wall_slide", "rope_climb"] else Animation.LOOP_NONE
		default_lib.add_animation(new_clip, generated)


func _rotation_track_path(track_prefix: String, bone_name: String) -> NodePath:
	return NodePath(track_prefix + ":" + bone_name)


func _quat_from_degrees(euler_degrees: Vector3) -> Quaternion:
	var rads := Vector3(deg_to_rad(euler_degrees.x), deg_to_rad(euler_degrees.y), deg_to_rad(euler_degrees.z))
	return Basis.from_euler(rads).get_rotation_quaternion()


func _infer_skeleton_track_prefix(ap: AnimationPlayer) -> String:
	for anim_name in ap.get_animation_list():
		var anim: Animation = ap.get_animation(anim_name)
		if anim == null:
			continue
		for track_idx in range(anim.get_track_count()):
			var path_str := str(anim.track_get_path(track_idx))
			if ":Bip01" in path_str:
				return path_str.get_slice(":", 0)
	# Fallback to common imported skeleton node names.
	return "Skeleton3D"


func _create_custom_bip01_clip(ap: AnimationPlayer, clip_name: String, duration: float, looped: bool, bone_keyframes: Dictionary, template_name: String = "") -> void:
	if _find_animation_name(ap, [clip_name]) != "":
		return
	var track_prefix := _infer_skeleton_track_prefix(ap)
	if track_prefix == "":
		return

	var anim: Animation = null
	var resolved_template := _find_animation_name(ap, [template_name]) if template_name != "" else ""
	if resolved_template != "" and ap.has_animation(resolved_template):
		var base_anim := ap.get_animation(resolved_template)
		if base_anim != null:
			anim = base_anim.duplicate(true)
			anim.length = max(duration, 1.0 / 30.0)
			anim.loop_mode = Animation.LOOP_LINEAR if looped else Animation.LOOP_NONE
	
	if anim == null:
		anim = Animation.new()
		anim.length = max(duration, 1.0 / 30.0)
		anim.loop_mode = Animation.LOOP_LINEAR if looped else Animation.LOOP_NONE

	var key_times := [0.0, anim.length * 0.5, anim.length]

	for bone_name in bone_keyframes.keys():
		var poses: Array = bone_keyframes[bone_name]
		if poses.size() < 3:
			continue
		var path := _rotation_track_path(track_prefix, String(bone_name))
		var existing_idx := anim.find_track(path, Animation.TYPE_ROTATION_3D)
		if existing_idx >= 0:
			anim.remove_track(existing_idx)
		var track_idx := anim.add_track(Animation.TYPE_ROTATION_3D)
		anim.track_set_path(track_idx, path)
		for i in range(3):
			var euler_deg: Vector3 = poses[i]
			anim.rotation_track_insert_key(track_idx, key_times[i], _quat_from_degrees(euler_deg))

	if anim.get_track_count() == 0:
		return
	var default_lib := _get_default_anim_library(ap)
	default_lib.add_animation(clip_name, anim)


func _ensure_required_gameplay_clips(ap: AnimationPlayer) -> void:
	# Build a complete gameplay-facing animation set from available clips.
	# This guarantees state names exist even when imported data is collapsed.
	var required := {
		"idle1": ["idle1", "walk"],
		"walk": ["walk", "run", "idle1"],
		"run": ["run", "walk", "idle1"],
		"sprint": ["run", "walk"],
		"crouch_idle": ["crouch_idle", "idle1"],
		"crouchrun": ["crouchrun", "walk", "run"],
		"jump": ["jump", "longjump", "run"],
		"fall": ["jump", "longjump"],
		"land": ["walk", "run", "idle1"],
		"slide": ["slide", "crouchrun", "crouch_idle"],
		"wall_slide": ["wall_slide", "jump", "fall"],
		"double_jump": ["double_jump", "longjump", "jump"],
		"back_flip": ["back_flip", "back", "jump"],
		"hit": ["gut_flinch", "head_flinch", "gutshot", "head", "idle1"],
		"flinch": ["gut_flinch", "head_flinch", "hit", "idle1"],
		"rope_climb": ["rope_climb", "swim", "treadwater", "forward"],
		"death1": ["death1", "death2", "death3"],
		"death2": ["death2", "death1", "death3"],
		"death3": ["death3", "death1", "death2"]
	}
	var default_lib := _get_default_anim_library(ap)
	var created := 0
	for target_name in required.keys():
		if _find_animation_name(ap, [target_name]) != "":
			continue
		var template_name := _find_animation_name(ap, required[target_name])
		if template_name == "" or not ap.has_animation(template_name):
			continue
		var template_anim: Animation = ap.get_animation(template_name)
		if template_anim == null:
			continue
		var generated: Animation = template_anim.duplicate(false)
		if target_name in ["idle1", "walk", "run", "sprint", "crouch_idle", "crouchrun", "fall", "slide", "wall_slide", "rope_climb"]:
			generated.loop_mode = Animation.LOOP_LINEAR
		else:
			generated.loop_mode = Animation.LOOP_NONE
		default_lib.add_animation(target_name, generated)
		created += 1
	if created > 0:
		print("[WorldModel] Created gameplay aliases: ", created)

func _update_third_person_weapon_attachment() -> void:
	if _world_model == null or not is_instance_valid(_world_model):
		return
	# Local first-person runtime does not need third-person p_model attachment.
	# Skipping this avoids loading extra weapon scenes during startup on D3D12.
	if is_local_player and camera_mode != "third":
		return
	
	# Find Skeleton3D inside our WorldModel
	var skeletons = _world_model.find_children("*", "Skeleton3D", true, false)
	if skeletons.size() == 0:
		return
	var skeleton: Skeleton3D = skeletons[0]
	
	# Target the CS1.6 right hand bone
	var hand_bone_name = "Bip01 R Hand"
	if skeleton.find_bone(hand_bone_name) == -1:
		# Fallback to other possible names
		for bone_candidate in ["Bip01_R_Hand", "ValveBiped.Bip01_R_Hand", "R_Hand"]:
			if skeleton.find_bone(bone_candidate) != -1:
				hand_bone_name = bone_candidate
				break
	
	if skeleton.find_bone(hand_bone_name) == -1:
		return # No hand bone found
		
	# Programmatically find or create BoneAttachment3D
	var attachment = skeleton.get_node_or_null("ThirdPersonWeaponAttachment")
	if attachment == null:
		attachment = BoneAttachment3D.new()
		attachment.name = "ThirdPersonWeaponAttachment"
		skeleton.add_child(attachment)
	attachment.bone_name = hand_bone_name
	
	# Select p_model resource path based on current weapon
	var p_model_path := ""
	match current_weapon:
		Weapon.KNIFE:
			p_model_path = "res://kr_models/weapons/knife/p_knife/reference_knife.smd"
		Weapon.AK:
			p_model_path = "res://kr_models/weapons/rifle/p_ak47/reference_ak47.smd"
		Weapon.PISTOL:
			p_model_path = "res://kr_models/weapons/pistol/p_glock18/reference_glock18.smd"
		Weapon.SMG:
			p_model_path = "res://kr_models/weapons/smg/p_tmp/reference_tmp.smd"
		Weapon.SNIPER:
			p_model_path = "res://kr_models/weapons/sniper/p_awp/reference_awp.smd"
		Weapon.SHOTGUN:
			p_model_path = "res://kr_models/weapons/shotgun/p_xm1014/reference_xm1014.smd"
	
	# If no SMD or GLB model path matches, search in default weapon folder directories
	if p_model_path == "" or not ResourceLoader.exists(p_model_path):
		var weapon_key = get_weapon_name().to_lower()
		var candidate_paths = [
			"res://kr_models/weapons/" + weapon_key + "/p_" + weapon_key + ".glb",
			"res://kr_models/weapons/" + weapon_key + "/p_" + weapon_key + ".gltf",
			"res://weapons/FBX/p_" + weapon_key + ".fbx",
			"res://weapons/p_" + weapon_key + ".fbx"
		]
		for path in candidate_paths:
			if ResourceLoader.exists(path):
				p_model_path = path
				break

	if p_model_path == "" or not ResourceLoader.exists(p_model_path):
		return # No 3rd person model found
		
	var resource = ResourceLoader.load(p_model_path, "PackedScene", ResourceLoader.CACHE_MODE_REUSE)
	if resource is PackedScene:
		var instance = resource.instantiate() as Node3D
		if instance != null:
			attachment.add_child(instance)
			
			# Apply scale conversion (CS1.6 raw coordinate SMD scale is 0.0254)
			var is_custom = ("kr_models" in p_model_path)
			if is_custom:
				instance.scale = Vector3(0.0254, 0.0254, 0.0254)
			
			# Align mesh rotation correctly inside palm (rotate 90 degrees around Y axis)
			instance.rotation_degrees = Vector3(0.0, 90.0, 0.0)
			
			# Apply raw material mappings
			_apply_viewmodel_material_recursive(instance, p_model_path.get_base_dir())
			
			# Force Layer 4 recursively for third person meshes so they show in 3rd person view
			_set_layer_recursive(instance, 4)

func _build_world_model() -> void:
	if has_node("WorldModel"):
		_world_model = get_node("WorldModel")
		# Do NOT use _compute_model_local_bottom_y — unreliable before scene transforms settle.
		# _editor_model_pos.y (-0.9) + default _world_model_editor_bottom (-0.9) already
		# places the CS1.6 VIP feet exactly at the capsule bottom (y=0 player-local).
		_world_model_editor_bottom = -0.9
		var height = (collision_shape.shape as CapsuleShape3D).height if collision_shape else 1.8
		_update_world_model_ground_offset(height)
		
		var cube := _world_model.get_node_or_null("Cube")
		if cube:
			cube.hide()
		
		# Force Layer 4 recursively on _world_model meshes so they are hidden from first person camera
		_set_layer_recursive(_world_model, 4)
		_apply_player_world_model_textures()
		
		_apply_nearest_texture_filter_recursive(_world_model)
		_apply_visibility_upgrade()
		_setup_world_model_anim_player()
		_update_third_person_weapon_attachment()
		return
	var resource := ResourceLoader.load(body_model_path, "PackedScene", ResourceLoader.CACHE_MODE_REUSE)
	if resource is PackedScene:
		var instance: Node3D = resource.instantiate() as Node3D
		if instance != null:
			_world_model = instance
			_world_model.name = "WorldModel"
			_world_model.scale = _editor_model_scale
			_world_model.rotation_degrees = _editor_model_rot
			_world_model_editor_bottom = -0.9
			
			var height = (collision_shape.shape as CapsuleShape3D).height if collision_shape else 1.8
			_world_model.position = _editor_model_pos
			_update_world_model_ground_offset(height)
			
			var cube := _world_model.get_node_or_null("Cube")
			if cube:
				cube.hide()
			add_child(_world_model)
			
			# Force Layer 4 recursively on _world_model meshes so they are hidden from first person camera
			_set_layer_recursive(_world_model, 4)
			_apply_player_world_model_textures()
			
			_apply_nearest_texture_filter_recursive(_world_model)
			_apply_visibility_upgrade()
			_setup_world_model_anim_player()
			_update_third_person_weapon_attachment()
			return
	_world_model = Node3D.new()
	_world_model.name = "WorldModel"
	add_child(_world_model)
	_build_placeholder_body_model(_world_model)
	_apply_visibility_upgrade()

func _build_placeholder_body_model(parent: Node3D) -> void:
	var cloth_material := _make_viewmodel_material(Color(0.14, 0.16, 0.2), 0.2, 0.58, 0.0)
	var trim_material := _make_viewmodel_material(Color(0.28, 0.32, 0.38), 0.35, 0.4, 0.0)
	var skin_material := _make_viewmodel_material(Color(0.88, 0.74, 0.64), 0.0, 0.62, 0.0)
	var dark_material := _make_viewmodel_material(Color(0.08, 0.09, 0.1), 0.15, 0.82, 0.0)
	var torso := _add_world_capsule(parent, 0.24, 0.62, Vector3(0.0, 1.08, 0.0), Vector3.ZERO, cloth_material)
	torso.name = "Torso"
	var head_sphere := _add_world_sphere(parent, 0.2, Vector3(0.0, 1.76, 0.0), skin_material)
	head_sphere.name = "Head"
	var left_arm := _add_world_capsule(parent, 0.10, 0.56, Vector3(-0.36, 1.0, 0.0), Vector3(0.0, 0.0, 1.57), cloth_material)
	left_arm.name = "LeftArm"
	var right_arm := _add_world_capsule(parent, 0.10, 0.56, Vector3(0.36, 1.0, 0.0), Vector3(0.0, 0.0, -1.57), cloth_material)
	right_arm.name = "RightArm"
	var left_leg := _add_world_capsule(parent, 0.11, 0.68, Vector3(-0.16, 0.3, 0.0), Vector3.ZERO, trim_material)
	left_leg.name = "LeftLeg"
	var right_leg := _add_world_capsule(parent, 0.11, 0.68, Vector3(0.16, 0.3, 0.0), Vector3.ZERO, trim_material)
	right_leg.name = "RightLeg"
	var left_foot := _add_world_sphere(parent, 0.08, Vector3(-0.12, -0.18, 0.06), dark_material)
	left_foot.name = "LeftFoot"
	var right_foot := _add_world_sphere(parent, 0.08, Vector3(0.12, -0.18, 0.06), dark_material)
	right_foot.name = "RightFoot"

func _build_player_dust() -> void:
	_player_dust = GPUParticles3D.new()
	_player_dust.name = "PlayerDust"
	_player_dust.position = Vector3(0.0, 2.9, 0.0)
	_player_dust.amount = 55
	_player_dust.lifetime = 2.4
	_player_dust.visibility_aabb = AABB(Vector3(-1.4, -3.0, -1.4), Vector3(2.8, 4.4, 2.8))
	var dust_mesh := SphereMesh.new()
	dust_mesh.radius = 0.028
	dust_mesh.height = 0.06
	_player_dust.draw_pass_1 = dust_mesh
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(1.1, 0.2, 1.1)
	process.direction = Vector3(0.0, -1.0, 0.0)
	process.spread = 18.0
	process.initial_velocity_min = 0.22
	process.initial_velocity_max = 0.5
	process.gravity = Vector3(0.0, -0.08, 0.0)
	process.scale_min = 0.025
	process.scale_max = 0.055
	process.color = Color(0.82, 0.8, 0.76, 0.16)
	_player_dust.process_material = process
	_player_dust.emitting = true
	add_child(_player_dust)


# Synth streams are static so they're generated only once across all FPSPlayer instances.
static var _shared_synth_streams: Dictionary = {}

func _build_local_audio() -> void:
	if _shared_synth_streams.is_empty():
		_shared_synth_streams["jump"]        = _make_synth_stream(AUDIO_JUMP_DURATION, 740.0, 410.0, 0.06, 0.23)
		_shared_synth_streams["land"]        = _make_synth_stream(AUDIO_LAND_DURATION, 180.0, 64.0, 0.34, 0.34)
		_shared_synth_streams["pistol_shot"] = _make_synth_stream(AUDIO_SHOOT_DURATION * 0.92, 1240.0, 180.0, 0.48, 0.46)
		_shared_synth_streams["knife_swing"] = _make_synth_stream(AUDIO_SHOOT_DURATION * 0.78, 520.0, 140.0, 0.62, 0.26)
		_shared_synth_streams["reload"]      = _make_synth_stream(0.18, 240.0, 90.0, 0.22, 0.18)
		_shared_synth_streams["slide"]       = _make_synth_stream(AUDIO_SLIDE_DURATION, 320.0, 120.0, 0.52, 0.28)
	_jump_audio         = _create_audio_player("JumpAudio",        _shared_synth_streams["jump"])
	_land_audio         = _create_audio_player("LandAudio",        _shared_synth_streams["land"])
	_pistol_shot_audio  = _create_audio_player("PistolShotAudio",  _shared_synth_streams["pistol_shot"])
	_knife_swing_audio  = _create_audio_player("KnifeSwingAudio",  _shared_synth_streams["knife_swing"])
	_reload_audio       = _create_audio_player("ReloadAudio",       _shared_synth_streams["reload"])
	_slide_audio        = _create_audio_player("SlideAudio",        _shared_synth_streams["slide"])
	_grapple_audio      = _create_audio_player("GrappleAudio",      preload("res://assets/sounds/effects/graple-as-pressed.mp3"))


func _create_audio_player(player_name: String, stream: AudioStream) -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	player.name = player_name
	player.stream = stream
	player.bus = "Master"
	add_child(player)
	return player


func _make_synth_stream(duration: float, start_frequency: float, end_frequency: float, noise_mix: float, amplitude: float) -> AudioStreamWAV:
	var sample_count: int = max(int(round(duration * AUDIO_SAMPLE_RATE)), 1)
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var phase_primary: float = 0.0
	var phase_secondary: float = 0.0
	for i in range(sample_count):
		var progress: float = float(i) / float(max(sample_count - 1, 1))
		var envelope: float = pow(max(1.0 - progress, 0.0), 2.2)
		var frequency: float = lerpf(start_frequency, end_frequency, progress)
		phase_primary += TAU * frequency / float(AUDIO_SAMPLE_RATE)
		phase_secondary += TAU * (frequency * 0.52) / float(AUDIO_SAMPLE_RATE)
		var tonal_sample: float = sin(phase_primary) * 0.7 + sin(phase_secondary) * 0.3
		var noisy_sample: float = randf_range(-1.0, 1.0) * noise_mix
		var sample_value: float = clamp((tonal_sample + noisy_sample) * amplitude * envelope, -1.0, 1.0)
		var sample_int: int = int(round(sample_value * 32767.0))
		if sample_int < 0:
			sample_int += 65536
		var byte_index: int = i * 2
		data[byte_index] = sample_int & 0xFF
		data[byte_index + 1] = (sample_int >> 8) & 0xFF
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = AUDIO_SAMPLE_RATE
	stream.stereo = false
	stream.data = data
	return stream


func _play_local_sound(player: AudioStreamPlayer, volume_db: float, pitch_scale: float) -> void:
	if player == null or not is_instance_valid(player):
		return
	player.stop()
	player.volume_db = volume_db
	player.pitch_scale = pitch_scale
	player.play()




func _add_world_capsule(parent: Node3D, radius: float, height: float, mesh_position: Vector3, mesh_rotation: Vector3, material: Material) -> MeshInstance3D:
	var mesh := CapsuleMesh.new()
	mesh.radius = radius
	mesh.height = max(height, radius * 2.0)
	return _add_world_mesh(parent, mesh, mesh_position, mesh_rotation, material)


func _add_world_cylinder(parent: Node3D, top_radius: float, bottom_radius: float, height: float, mesh_position: Vector3, mesh_rotation: Vector3, material: Material) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top_radius
	mesh.bottom_radius = bottom_radius
	mesh.height = height
	return _add_world_mesh(parent, mesh, mesh_position, mesh_rotation, material)


func _add_world_sphere(parent: Node3D, radius: float, mesh_position: Vector3, material: Material) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	return _add_world_mesh(parent, mesh, mesh_position, Vector3.ZERO, material)


func _add_world_mesh(parent: Node3D, mesh: Mesh, mesh_position: Vector3, mesh_rotation: Vector3, material: Material) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = mesh
	mesh_instance.position = mesh_position
	mesh_instance.rotation = mesh_rotation
	mesh_instance.material_override = material
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	parent.add_child(mesh_instance)
	return mesh_instance


func _update_camera_feedback(delta: float) -> void:
	head.position.y = lerpf(head.position.y, _target_camera_y, delta * 12.0)
	_hitmarker_timer = max(_hitmarker_timer - delta, 0.0)
	damage_roll = lerpf(damage_roll, 0.0, delta * DAMAGE_ROLL_RECOVERY)
	_landing_camera_offset = lerpf(_landing_camera_offset, 0.0, delta * 10.0)
	_landing_shake_strength = lerpf(_landing_shake_strength, 0.0, delta * LANDING_SHAKE_RECOVERY)
	_landing_shake_phase += delta * (18.0 + _landing_shake_strength * 28.0)
	if is_local_player:
		# AFK logic
		var is_moving := velocity.length() > 0.05 or Input.get_vector("move_left", "move_right", "move_forward", "move_back").length() > 0.01
		if not is_moving:
			_afk_timer += delta
			if _afk_timer >= 50.0 and not _played_afk_50:
				_played_afk_50 = true
				GameManager.call("play_effect", "afk-50sec")
			elif _afk_timer >= 30.0 and not _played_afk_30:
				_played_afk_30 = true
				GameManager.call("play_effect", "30-sec-afk")
		else:
			_afk_timer = 0.0
			_played_afk_30 = false
			_played_afk_50 = false

		# AAA Gamefeel: decay mouse sway & turn rolls
		_mouse_sway_x = lerpf(_mouse_sway_x, 0.0, delta * 9.0)
		_mouse_sway_y = lerpf(_mouse_sway_y, 0.0, delta * 9.0)
		_turn_roll = lerpf(_turn_roll, 0.0, delta * 8.5)

		var horizontal_speed: float = Vector2(velocity.x, velocity.z).length()
		var movement_ratio: float = clamp(horizontal_speed / (_max_ground_speed() * SPRINT_MULTIPLIER), 0.0, 1.0)
		var bob_speed: float = lerpf(camera_idle_sway_speed, CAMERA_BOB_SPEED + sprint_visual_strength * 2.8, movement_ratio)
		_camera_motion_time += delta * bob_speed
		var bob_strength: float = 0.0
		if is_on_floor():
			bob_strength = CAMERA_BOB_STRENGTH * (movement_ratio * 0.9 + sprint_visual_strength * 0.22)
		var bob_x: float = sin(_camera_motion_time * 0.55) * bob_strength
		var bob_y: float = abs(cos(_camera_motion_time)) * bob_strength * 0.82
		var idle_sway_x: float = sin(_camera_motion_time * camera_idle_sway_speed) * camera_idle_sway_strength
		var idle_sway_y: float = cos(_camera_motion_time * camera_idle_sway_speed * 0.72) * camera_idle_sway_strength * 0.55
		# PERF-5: skip sin/cos landing calculations when effects are negligible.
		var lateral_shake := 0.0
		var vertical_shake := 0.0
		if _landing_shake_strength > 0.001:
			lateral_shake = sin(_landing_shake_phase) * _landing_shake_strength * 0.14
			vertical_shake = cos(_landing_shake_phase * 0.55) * _landing_shake_strength * 0.08
		var slide_roll: float = slide_visual_strength * SLIDE_ROLL_AMOUNT
		var weapon_heat: float = clampf(weapon_accuracy_visual_strength, 0.0, 1.0)
		var back_jump_spin: float = 0.0
		var back_jump_roll: float = 0.0
		var back_jump_offset: float = 0.0
		var back_jump_lift: float = 0.0
		if _back_jump_effect_time > 0.0:
			var effect_ratio: float = clamp(1.0 - (_back_jump_effect_time / BACK_JUMP_EFFECT_TIME), 0.0, 1.0)
			var effect_envelope: float = sin(effect_ratio * PI)
			back_jump_spin = effect_envelope * BACK_JUMP_HEAD_SWIVEL * _back_jump_spin_direction
			back_jump_roll = effect_envelope * 0.18 * _back_jump_spin_direction
			back_jump_offset = effect_envelope * 0.08 * _back_jump_spin_direction
			back_jump_lift = effect_envelope * 0.05
			
		# AAA Gamefeel: dynamic roll (strafe lean + turn velocity roll)
		var input_dir_current := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		var strafe_roll := -input_dir_current.x * 0.016
		
		head.rotation.y = back_jump_spin
		# Calculate wall run camera tilt
		if _is_wall_running:
			_wall_run_roll = lerpf(_wall_run_roll, 0.22 * _wall_run_side, delta * 7.0)
		else:
			_wall_run_roll = lerpf(_wall_run_roll, 0.0, delta * 7.0)
		camera.rotation.z = damage_roll + slide_roll + back_jump_roll + strafe_roll + _turn_roll + _wall_run_roll - (_landing_camera_offset * 0.34) + sin(_landing_shake_phase * 0.65) * _landing_shake_strength * 0.07 + bob_x * 0.5
		camera.position = _editor_camera_pos + Vector3(lateral_shake + bob_x + idle_sway_x + slide_visual_strength * 0.06 + back_jump_offset, -_landing_camera_offset * 1.24 + vertical_shake - bob_y + idle_sway_y - slide_visual_strength * SLIDE_CAMERA_DROP + back_jump_lift - _shot_camera_offset, 0.0)
		_shot_camera_offset = lerpf(_shot_camera_offset, 0.0, delta * recoil_recovery_rate)
		var target_fov: float = base_fov - zoom_visual_strength * ZOOM_FOV_PULL + sprint_visual_strength * SPRINT_FOV_BOOST + (_landing_camera_offset + _landing_shake_strength * 0.55) * 9.0
		if current_weapon == Weapon.SNIPER:
			var sniper_pull := 35.0 if _sniper_zoom_stage == 1 else 55.0
			target_fov = base_fov - zoom_visual_strength * sniper_pull
		camera.fov = lerpf(camera.fov, target_fov, delta * 8.0)
		if _viewmodel_root:
			var inspect_x := 0.0
			var inspect_y := 0.0
			var inspect_z := 0.0
			if _inspect_timer > 0.0:
				_inspect_timer -= delta
				inspect_x = sin(_inspect_timer * 4.0) * 0.12
				inspect_y = cos(_inspect_timer * 5.0) * 0.06 - 0.04
				inspect_z = sin(_inspect_timer * 3.0) * 0.15
			# AAA Gamefeel: subtract mouse look sway for realistic viewmodel inertia (lag)
			# When zooming (right-click), snap the viewmodel to the tuned ADS position
			# for a perfect iron-sights view. The viewmodel tuner plugin was used to
			# find these exact offsets � they give a clear top-of-weapon view.
			var base_pos: Vector3 = _weapon_rest_position(current_weapon)
			var base_rot: Vector3 = _weapon_rest_rotation(current_weapon)
			var zoom_pos: Vector3 = base_pos
			var zoom_rot: Vector3 = base_rot
			if current_weapon == Weapon.PISTOL:
				# Viewmodel-tuner-tuned ADS position for the pistol
				zoom_pos = Vector3(-0.017, -0.466, -0.597)
				zoom_rot = Vector3(-0.001, 1.600, -0.065)
			_viewmodel_root.position = Vector3((bob_x * 0.4 * vm_bob_intensity + idle_sway_x * vm_sway_intensity) - _mouse_sway_x * 0.72 * vm_sway_intensity + slide_visual_strength * 0.05 + back_jump_offset * 0.4 + weapon_heat * 0.01 + inspect_x, (-bob_y * 0.3 * vm_bob_intensity + idle_sway_y * vm_sway_intensity) + _mouse_sway_y * 0.72 * vm_sway_intensity - slide_visual_strength * 0.03 + back_jump_lift * 0.4 + inspect_y, -zoom_visual_strength * 0.08 + sprint_visual_strength * 0.02 - weapon_heat * 0.03 + inspect_z)
			_viewmodel_root.rotation = Vector3((-bob_y * 0.5 * vm_bob_intensity + idle_sway_y * vm_sway_intensity) + _mouse_sway_y * 0.6 * vm_sway_intensity + slide_visual_strength * 0.05 + weapon_heat * 0.04 + inspect_y * 4.0, back_jump_spin * 0.25 + _mouse_sway_x * 0.5 * vm_sway_intensity + sprint_visual_strength * 0.05 + inspect_x * 3.0, -(bob_x * 0.8 * vm_bob_intensity + idle_sway_x * vm_sway_intensity) - _mouse_sway_x * 0.3 * vm_sway_intensity + slide_visual_strength * 0.15 - weapon_heat * 0.05 + inspect_z * 2.0)
			if zoom_visual_strength > 0.01:
				_viewmodel_holder.position = _viewmodel_holder.position.lerp(zoom_pos, zoom_visual_strength)
				_viewmodel_holder.rotation = _viewmodel_holder.rotation.lerp(zoom_rot, zoom_visual_strength)
			else:
				_viewmodel_holder.position = _viewmodel_holder.position.lerp(base_pos, 1.0 - zoom_visual_strength * 12.0)
				_viewmodel_holder.rotation = _viewmodel_holder.rotation.lerp(base_rot, 1.0 - zoom_visual_strength * 12.0)


func _apply_local_damage_feedback(damage_amount: float, lethal: bool) -> void:
	var normalized_amount: float = clamp(damage_amount / _max_health(), 0.0, 1.0)
	var roll_strength: float = 0.05 + normalized_amount * 0.08
	if lethal:
		roll_strength = DAMAGE_ROLL_LIMIT
	damage_roll = clamp(damage_roll + randf_range(-roll_strength, roll_strength), -DAMAGE_ROLL_LIMIT, DAMAGE_ROLL_LIMIT)
	if not lethal and _body_anim_player != null and is_instance_valid(_body_anim_player):
		if _find_animation_name(_body_anim_player, ["gut_flinch", "head_flinch", "gutshot", "head"]) != "":
			_body_anim_priority_timer = max(_body_anim_priority_timer, 0.18)
	damage_feedback.emit(clamp(0.15 + normalized_amount * 0.65, 0.15, 0.85), lethal)


func _handle_landing_feedback(was_on_floor: bool, vertical_speed_before_move: float) -> void:
	if not is_local_player:
		return
	if not was_on_floor and is_on_floor():
		_landing_friction_grace_time = LANDING_FRICTION_GRACE
		var impact_speed: float = absf(vertical_speed_before_move)
		if impact_speed < LANDING_SHAKE_THRESHOLD:
			return
		var impact_strength: float = clamp((impact_speed - LANDING_SHAKE_THRESHOLD) * 0.085, 0.0, 0.44)
		_landing_camera_offset = max(_landing_camera_offset, impact_strength * 1.9)
		_landing_shake_strength = max(_landing_shake_strength, impact_strength)
		_landing_shake_phase = 0.0
		damage_roll = clamp(damage_roll + randf_range(-impact_strength * 0.55, impact_strength * 0.55), -DAMAGE_ROLL_LIMIT, DAMAGE_ROLL_LIMIT)
		GameManager.call("play_effect", "landing", randf_range(0.9, 1.02))


func _spawn_local_tracer(origin: Vector3, direction: Vector3, max_range: float) -> void:
	if not is_local_player or not show_tracer:
		return
	var end_position: Vector3 = origin + direction * max_range
	var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(camera.global_position, camera.global_position + direction * max_range, collision_mask, [self])
	params.collide_with_areas = false
	var result: Dictionary = get_world_3d().direct_space_state.intersect_ray(params)
	if not result.is_empty():
		end_position = result.get("position", end_position)
		var hit_normal: Vector3 = result.get("normal", Vector3.UP)
		_spawn_impact_flash(end_position, hit_normal, result.get("collider"))
	var tracer_length: float = origin.distance_to(end_position)
	if tracer_length <= 0.05:
		return
	var tracer := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(TRACER_THICKNESS, TRACER_THICKNESS, tracer_length)
	tracer.mesh = mesh
	tracer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = tracer_color
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = tracer_color
	material.emission_energy_multiplier = 2.4
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	if _cached_tracer_texture != null:
		material.albedo_texture = _cached_tracer_texture
	tracer.material_override = material
	var midpoint: Vector3 = origin.lerp(end_position, 0.5)
	var current_scene: Node = get_tree().current_scene if get_tree().current_scene != null else get_tree().root
	current_scene.add_child(tracer)
	tracer.global_transform = Transform3D(Basis.looking_at((end_position - origin).normalized(), Vector3.UP), midpoint)
	get_tree().create_timer(TRACER_DURATION).timeout.connect(func() -> void:
		if is_instance_valid(tracer):
			tracer.queue_free()
	)


func _spawn_sparks_or_blood(pos: Vector3, normal: Vector3, is_blood: bool) -> void:
	var particles := CPUParticles3D.new()
	particles.emitting = false
	particles.one_shot = true
	particles.explosiveness = 1.0
	particles.lifetime = 0.4
	particles.amount = 18 if is_blood else 12
	particles.direction = normal
	particles.spread = 45.0
	particles.gravity = Vector3(0, -9.8, 0)
	particles.initial_velocity_min = 2.5
	particles.initial_velocity_max = 6.0
	var particle_mesh := QuadMesh.new()
	particle_mesh.size = Vector2(0.06, 0.06) if is_blood else Vector2(0.04, 0.04)
	particles.mesh = particle_mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	if is_blood:
		material.albedo_color = Color(0.72, 0.02, 0.02, 0.95)
		particles.scale_amount_min = 0.5
		particles.scale_amount_max = 1.5
	else:
		material.albedo_color = Color(1.0, 0.85, 0.35, 1.0)
		material.emission_enabled = true
		material.emission = Color(1.0, 0.82, 0.25)
		material.emission_energy_multiplier = 4.0
		particle_mesh.size = Vector2(0.02, 0.08)
		particles.scale_amount_min = 0.4
		particles.scale_amount_max = 1.0
	particles.material_override = material
	var current_scene: Node = get_tree().current_scene if get_tree().current_scene != null else get_tree().root
	current_scene.add_child(particles)
	particles.global_position = pos
	particles.emitting = true
	get_tree().create_timer(0.6).timeout.connect(func() -> void:
		if is_instance_valid(particles):
			particles.queue_free()
	)

func _spawn_impact_flash(hit_position: Vector3, hit_normal: Vector3, collider: Object = null) -> void:
	var is_body := false
	if collider != null:
		var target = _find_damageable_target(collider)
		if target != null:
			is_body = true
	if is_body:
		GameManager.call("play_effect", "Bullet-hit-body-impact")
	else:
		GameManager.call("play_effect", "Bullet-hit-on-metal")
	_spawn_sparks_or_blood(hit_position, hit_normal, is_body)
	var flash := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.05
	mesh.height = 0.1
	flash.mesh = mesh
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.84, 0.96, 1.0, 0.72)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = Color(0.72, 0.94, 1.0)
	material.emission_energy_multiplier = 2.8
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.material_override = material
	var current_scene: Node = get_tree().current_scene if get_tree().current_scene != null else get_tree().root
	current_scene.add_child(flash)
	flash.global_position = hit_position + hit_normal * 0.04
	_spawn_impact_decal(current_scene, hit_position, hit_normal, collider)
	get_tree().create_timer(IMPACT_FLASH_DURATION).timeout.connect(func() -> void:
		if is_instance_valid(flash):
			flash.queue_free()
	)

func _spawn_impact_decal(parent: Node, hit_position: Vector3, hit_normal: Vector3, collider: Object = null) -> void:
	var decal := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = Vector2(randf_range(0.08, 0.12), randf_range(0.08, 0.12))
	decal.mesh = mesh
	decal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var is_glass: bool = false
	if collider != null and collider is MeshInstance3D:
		var material := (collider as MeshInstance3D).material_override
		if material != null and material is StandardMaterial3D and material.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			is_glass = true
	var decal_material := StandardMaterial3D.new()
	if is_glass:
		decal_material.albedo_color = Color(0.58, 0.85, 1.0, 0.18)
	else:
		decal_material.albedo_color = Color(0.08, 0.07, 0.05, 0.88)
	decal_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	decal_material.emission_enabled = true
	if is_glass:
		decal_material.emission = Color(0.34, 0.64, 1.0)
	else:
		decal_material.emission = Color(0.28, 0.22, 0.14)
	if is_glass:
		decal_material.emission_energy_multiplier = 0.8
	else:
		decal_material.emission_energy_multiplier = 1.8
	decal_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	decal_material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	decal.material_override = decal_material
	var decal_transform := Transform3D(Basis.looking_at(hit_position + hit_normal, Vector3.UP), hit_position + hit_normal * 0.009)
	decal.global_transform = decal_transform
	decal.rotate_object_local(Vector3(0.0, 0.0, 1.0), randf_range(0.0, TAU))
	parent.add_child(decal)
	get_tree().create_timer(1.6).timeout.connect(func() -> void:
		if is_instance_valid(decal):
			decal.queue_free()
	)

func _spawn_muzzle_flash(origin: Vector3, direction: Vector3) -> void:
	if not show_muzzle_flash:
		return
	var flash := MeshInstance3D.new()
	var mesh: Mesh = SphereMesh.new()
	if _cached_muzzle_flash_texture != null:
		var quad := QuadMesh.new()
		quad.size = Vector2(0.16, 0.16)
		mesh = quad
	else:
		var sphere := SphereMesh.new()
		sphere.radius = 0.06
		sphere.height = 0.06
		mesh = sphere
	flash.mesh = mesh
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(1.0, 0.78, 0.35, 0.88)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = Color(1.0, 0.7, 0.2)
	material.emission_energy_multiplier = 3.6
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	if _cached_muzzle_flash_texture != null:
		material.albedo_texture = _cached_muzzle_flash_texture
		material.albedo_color = Color(1.0, 1.0, 1.0, 0.9)
		material.emission = Color(1.0, 1.0, 1.0)
	flash.material_override = material
	var current_scene: Node = get_tree().current_scene if get_tree().current_scene != null else get_tree().root
	current_scene.add_child(flash)
	flash.global_transform = Transform3D(Basis.looking_at(origin + direction, Vector3.UP), origin)
	get_tree().create_timer(0.08).timeout.connect(func() -> void:
		if is_instance_valid(flash):
			flash.queue_free()
	)

func _apply_shot_recoil(amount: float) -> void:
	damage_roll = clamp(damage_roll + randf_range(-amount * 0.14, amount * 0.14), -DAMAGE_ROLL_LIMIT, DAMAGE_ROLL_LIMIT)
	_shot_camera_offset = min(max(_shot_camera_offset, amount * recoil_kick_amount), 0.35)

func _find_damageable_target(collider: Object) -> Node:
	if collider == null or not collider is Node:
		return null
	var current: Node = collider as Node
	while current:
		if current.has_method("server_apply_damage"):
			return current
		current = current.get_parent()
	return null


func _perform_server_attack(attacker_id: int, weapon: int, origin: Vector3, direction: Vector3) -> void:
	if not multiplayer.is_server():
		return
	# Anti-cheat: reject attacks fired from too far away from the player's server position
	if origin.distance_to(global_position) > 5.0:
		push_warning("[AntiCheat] Player %d sent out-of-range attack origin" % attacker_id)
		return
	var pellet_count: int = SHOTGUN_PELLETS if weapon == Weapon.SHOTGUN else 1
	for i in range(pellet_count):
		var final_dir: Vector3 = direction
		if weapon == Weapon.SHOTGUN:
			final_dir = _apply_shotgun_pellet_spread(direction)
			
		var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(origin, origin + final_dir * _weapon_range(weapon), collision_mask, [self])
		params.collide_with_areas = false
		var result: Dictionary = get_world_3d().direct_space_state.intersect_ray(params)
		if result.is_empty():
			continue
			
		var target: Node = _find_damageable_target(result.get("collider"))
		if target == null or target == self:
			continue
			
		if target.has_method("server_apply_damage"):
			var damage: float = _weapon_damage(weapon)
			var predicted_lethal: bool = false
			var hit_pos: Vector3 = result.get("position", Vector3.ZERO)
			var is_headshot: bool = false
			if target.has_method("get_global_position") and hit_pos.y > target.global_position.y + 1.25:
				is_headshot = true
				damage *= 2.0
			var applied_damage: float = damage
			var current_health: Variant = target.get("health")
			if current_health is float or current_health is int:
				var target_health: float = max(float(current_health), 0.0)
				predicted_lethal = target_health <= damage
				applied_damage = min(damage, target_health)
			
			target.call("server_apply_damage", damage, attacker_id)
			
			if game_manager != null and game_manager.has_method("record_damage_dealt"):
				game_manager.call("record_damage_dealt", attacker_id, applied_damage)
			
			if attacker_id == multiplayer.get_unique_id():
				_client_hit_marker(predicted_lethal)
				_client_confirm_damage(applied_damage, predicted_lethal)
				if is_headshot and predicted_lethal:
					GameManager.call("play_effect", "headshot-kill")
			else:
				rpc_id(attacker_id, "_client_hit_marker", predicted_lethal)
				rpc_id(attacker_id, "_client_confirm_damage", applied_damage, predicted_lethal)


func server_apply_damage(amount: float, attacker_id: int = -1) -> void:
	if not multiplayer.is_server() or is_eliminated:
		return
	if _is_warmup_free_fly_active():
		return
	if unlocked_perks.has("PERK_ARMOR"):
		amount *= 0.6
	var applied_amount: float = max(amount, 0.0)
	if applied_amount <= 0.0:
		return
	health = max(health - applied_amount, 0.0)
	if game_manager != null and game_manager.has_method("record_damage_taken"):
		game_manager.call("record_damage_taken", peer_id, applied_amount)
	var lethal: bool = health <= 0.0
	if multiplayer.multiplayer_peer != null:
		rpc("_client_sync_health", health, applied_amount, lethal)
	else:
		_client_sync_health(health, applied_amount, lethal)
	if lethal:
		_finish_elimination(false, attacker_id)


func _finish_elimination(sync_health: bool, attacker_id: int = -1) -> void:
	if is_eliminated:
		return
	if sync_health:
		health = 0.0
		if multiplayer.multiplayer_peer != null:
			rpc("_client_sync_health", health, _max_health(), true)
		else:
			_client_sync_health(health, _max_health(), true)
	game_manager.call("notify_player_died", peer_id, attacker_id)
	_apply_death_state()
	if multiplayer.multiplayer_peer != null:
		rpc("_client_apply_death")


func set_menu_open(active: bool) -> void:
	is_menu_open = active
	if not is_local_player:
		return
	if active:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func get_weapon_name() -> String:
	match current_weapon:
		Weapon.KNIFE: return "KNIFE"
		Weapon.PISTOL: return "PISTOL"
		Weapon.SMG: return "SMG"
		Weapon.AK: return "AK"
		Weapon.SNIPER: return "SNIPER"
		Weapon.SHOTGUN: return "SHOTGUN"
		Weapon.REVOLVER: return "REVOLVER"
	return "UNKNOWN"


func _weapon_from_name(weapon_name: String) -> int:
	match weapon_name.to_upper():
		"KNIFE":
			return Weapon.KNIFE
		"PISTOL":
			return Weapon.PISTOL
		"SMG":
			return Weapon.SMG
		"AK":
			return Weapon.AK
		"SNIPER":
			return Weapon.SNIPER
		"SHOTGUN":
			return Weapon.SHOTGUN
		"REVOLVER":
			return Weapon.REVOLVER
	return -1


func _weapon_start_reserve(weapon: int) -> int:
	if weapon == Weapon.SMG:
		return SMG_RESERVE_START
	if weapon == Weapon.AK:
		return AK_RESERVE_START
	if weapon == Weapon.SNIPER:
		return SNIPER_RESERVE_START
	if weapon == Weapon.SHOTGUN:
		return SHOTGUN_RESERVE_START
	if weapon == Weapon.REVOLVER:
		return REVOLVER_RESERVE_START
	return PISTOL_RESERVE_START


func _is_horde_mode() -> bool:
	var current_scene := get_tree().current_scene
	return current_scene != null and current_scene.has_method("_start_next_wave") and current_scene.has_method("_client_announce_wave")


func _has_weapon_unlocked(weapon: int) -> bool:
	return weapon == Weapon.KNIFE or _owned_weapons.has(weapon)


func has_weapon_unlocked_by_name(weapon_name: String) -> bool:
	return _has_weapon_unlocked(_weapon_from_name(weapon_name))


func _ensure_weapon_inventory_entry(weapon: int) -> void:
	if weapon == Weapon.KNIFE:
		return
	if not _weapon_mag_inventory.has(weapon):
		_weapon_mag_inventory[weapon] = _weapon_mag_size(weapon)
	if not _weapon_reserve_inventory.has(weapon):
		_weapon_reserve_inventory[weapon] = _weapon_start_reserve(weapon)


func _save_equipped_weapon_ammo() -> void:
	if current_weapon == Weapon.KNIFE:
		return
	_ensure_weapon_inventory_entry(current_weapon)
	_weapon_mag_inventory[current_weapon] = current_ammo
	_weapon_reserve_inventory[current_weapon] = reserve_ammo


func _sync_equipped_weapon_ammo() -> void:
	if current_weapon == Weapon.KNIFE:
		current_ammo = 0
		reserve_ammo = 0
		return
	_ensure_weapon_inventory_entry(current_weapon)
	current_ammo = int(_weapon_mag_inventory.get(current_weapon, _weapon_mag_size(current_weapon)))
	reserve_ammo = int(_weapon_reserve_inventory.get(current_weapon, _weapon_start_reserve(current_weapon)))


func _set_current_weapon(weapon: int, immediate: bool) -> void:
	# Hard-disable all weapons except knife and pistol.
	if weapon != Weapon.KNIFE and weapon != Weapon.PISTOL:
		weapon = Weapon.PISTOL
	if not _has_weapon_unlocked(weapon):
		return
	# Cancel any ongoing reload before saving ammo to prevent race condition
	if is_reloading:
		_reload_serial += 1
		is_reloading = false
	_save_equipped_weapon_ammo()
	current_weapon = weapon
	if current_weapon != Weapon.SNIPER:
		_sniper_zoom_stage = 0
	_sync_equipped_weapon_ammo()
	_apply_weapon_pose(immediate)
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	weapon_changed.emit(get_weapon_name())
	_update_third_person_weapon_attachment()


func _reset_weapon_inventory_for_mode() -> void:
	_owned_weapons.clear()
	_weapon_mag_inventory.clear()
	_weapon_reserve_inventory.clear()
	for weapon in [Weapon.PISTOL]:
		_weapon_mag_inventory[weapon] = _weapon_mag_size(weapon)
		_weapon_reserve_inventory[weapon] = _weapon_start_reserve(weapon)
	if _is_horde_mode():
		_owned_weapons = [Weapon.KNIFE, Weapon.PISTOL]
		current_weapon = Weapon.PISTOL
		
		unlocked_perks.clear()
		if game_manager != null:
			var p_data = game_manager.get("players")
			if p_data and peer_id in p_data and "horde_perks" in p_data[peer_id]:
				for perk in p_data[peer_id]["horde_perks"]:
					unlocked_perks.append(str(perk))
	else:
		_owned_weapons = [Weapon.KNIFE, Weapon.PISTOL]
		current_weapon = Weapon.PISTOL
		unlocked_perks = ["PERK_DOUBLE_JUMP", "PERK_DASH", "PERK_ARMOR", "PERK_REGEN"]
	_sniper_zoom_stage = 0
	_sync_equipped_weapon_ammo()


func grant_weapon_by_name_local(weapon_name: String) -> void:
	var weapon := _weapon_from_name(weapon_name)
	if weapon != Weapon.PISTOL:
		return
	_ensure_weapon_inventory_entry(weapon)
	if not _owned_weapons.has(weapon):
		_owned_weapons.append(weapon)
		_owned_weapons.sort()
	_weapon_mag_inventory[weapon] = max(int(_weapon_mag_inventory.get(weapon, 0)), _weapon_mag_size(weapon))
	_weapon_reserve_inventory[weapon] = max(int(_weapon_reserve_inventory.get(weapon, 0)), _weapon_start_reserve(weapon))
	_set_current_weapon(weapon, false)


func grant_bullet_pack_local(amount: int) -> void:
	var added_amount := maxi(amount, 0)
	if added_amount <= 0:
		return
	for weapon in _owned_weapons:
		if weapon == Weapon.KNIFE:
			continue
		_ensure_weapon_inventory_entry(weapon)
		_weapon_reserve_inventory[weapon] = int(_weapon_reserve_inventory.get(weapon, 0)) + added_amount
	_sync_equipped_weapon_ammo()
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)


func restore_health_local(amount: float) -> void:
	if amount <= 0.0 or is_eliminated:
		return
	health = min(health + amount, _max_health())
	health_changed.emit(health, _max_health())


func _cycle_sniper_zoom_stage() -> void:
	if current_weapon != Weapon.SNIPER:
		return
	_sniper_zoom_stage = (_sniper_zoom_stage + 1) % 3


func get_health_ratio() -> float:
	return health / _max_health()


func get_stamina_ratio() -> float:
	return stamina / _max_stamina()


func _upgrade_rank(upgrade_key: String) -> int:
	if peer_id <= 0 or game_manager == null:
		return 0
	if game_manager.has_method("get_upgrade_rank"):
		return int(game_manager.call("get_upgrade_rank", peer_id, upgrade_key))
	return 0


func _effective_upgrade_rank(upgrade_key: String) -> float:
	var rank := float(_upgrade_rank(upgrade_key))
	var soft_cap := 5.0
	if rank <= soft_cap:
		return rank
	var overflow := rank - soft_cap
	return soft_cap + sqrt(overflow) * 1.6


func _max_health() -> float:
	return MAX_HEALTH + _effective_upgrade_rank("health") * 15.0


func _max_stamina() -> float:
	return MAX_STAMINA + _effective_upgrade_rank("energy") * 18.0



func get_player_level() -> int:
	if game_manager and game_manager.has_method("get_player_level"):
		return int(game_manager.call("get_player_level", peer_id))
	return 1


func _level_movement_multiplier() -> float:
	return 1.0 + float(max(get_player_level() - 1, 0)) * LEVEL_SPEED_PER_LEVEL


func _max_air_speed() -> float:
	return _max_ground_speed() * MAX_AIR_SPEED_MULT


func _clamp_horizontal_speed(max_speed: float) -> void:
	var horizontal := Vector2(velocity.x, velocity.z)
	var speed := horizontal.length()
	if speed <= max_speed:
		return
	horizontal *= max_speed / speed
	velocity.x = horizontal.x
	velocity.z = horizontal.y


func _movement_speed_scalar(input_dir: Vector2) -> float:
	var strafe_strength: float = clampf(absf(input_dir.x), 0.0, 1.0)
	var backward_strength: float = clampf(max(input_dir.y, 0.0), 0.0, 1.0)
	var strafe_penalty: float = 0.12 * strafe_strength
	var backward_penalty: float = 0.22 * backward_strength
	return max(1.0 - strafe_penalty - backward_penalty, 0.74) * _weapon_speed_multiplier()


func _sprint_effectiveness(input_dir: Vector2) -> float:
	var forward_strength: float = clampf(max(-input_dir.y, 0.0), 0.0, 1.0)
	var strafe_penalty: float = clampf(absf(input_dir.x) * 0.35, 0.0, 0.35)
	var backward_penalty: float = clampf(max(input_dir.y, 0.0) * 0.9, 0.0, 0.9)
	return clampf(forward_strength - strafe_penalty - backward_penalty, 0.0, 1.0)


func _weapon_speed_multiplier() -> float:
	if current_weapon == Weapon.KNIFE:
		return 1.045
	if current_weapon == Weapon.SHOTGUN:
		return 0.94
	return 0.985


func _target_crosshair_spread_strength() -> float:
	var horizontal_speed: float = Vector2(velocity.x, velocity.z).length()
	var speed_ratio: float = clampf(horizontal_speed / max(_max_ground_speed() * SPRINT_MULTIPLIER, 0.01), 0.0, 1.0)
	if current_weapon == Weapon.KNIFE:
		return clampf(0.08 + speed_ratio * 0.28 + (0.08 if not is_on_floor() else 0.0), 0.05, 0.42)
	var spread_strength: float = 0.14 + speed_ratio * 0.34 + weapon_accuracy_visual_strength * 0.5
	if not is_on_floor():
		spread_strength += 0.34
	if sprint_visual_strength > 0.08:
		spread_strength += sprint_visual_strength * 0.18
	if is_crouching:
		spread_strength -= 0.07
	spread_strength -= zoom_visual_strength * 0.12
	return clampf(spread_strength, 0.08, 1.0)


func _weapon_spread_angle(weapon: int) -> float:
	if weapon != Weapon.PISTOL:
		return 0.0
	var horizontal_speed: float = Vector2(velocity.x, velocity.z).length()
	var speed_ratio: float = clampf(horizontal_speed / max(_max_ground_speed() * SPRINT_MULTIPLIER, 0.01), 0.0, 1.0)
	var spread_angle: float = PISTOL_SPREAD_BASE
	spread_angle += speed_ratio * PISTOL_SPREAD_MOVE
	spread_angle += weapon_accuracy_visual_strength * PISTOL_SPREAD_SHOT
	if not is_on_floor():
		spread_angle += PISTOL_SPREAD_AIR
	if sprint_visual_strength > 0.08:
		spread_angle += sprint_visual_strength * PISTOL_SPREAD_SPRINT
	if is_crouching:
		spread_angle *= PISTOL_SPREAD_CROUCH_MULT
	if zoom_visual_strength > 0.0:
		spread_angle *= lerpf(1.0, PISTOL_SPREAD_ZOOM_MULT, zoom_visual_strength)
	return spread_angle


func _apply_weapon_spread(direction: Vector3, weapon: int) -> Vector3:
	var spread_angle: float = _weapon_spread_angle(weapon)
	if spread_angle <= 0.0:
		return direction.normalized()
	var spread_yaw: float = randf_range(-spread_angle, spread_angle)
	var spread_pitch: float = randf_range(-spread_angle, spread_angle)
	var spread_direction: Vector3 = direction.normalized()
	spread_direction = spread_direction.rotated(camera.global_transform.basis.y.normalized(), spread_yaw)
	spread_direction = spread_direction.rotated(camera.global_transform.basis.x.normalized(), spread_pitch)
	return spread_direction.normalized()


func _apply_knife_lunge() -> void:
	var forward := Vector3(-transform.basis.z.x, 0.0, -transform.basis.z.z).normalized()
	var lunge_speed: float = KNIFE_LUNGE_SPEED * (1.12 if sprint_visual_strength > 0.1 else 1.0)
	velocity.x += forward.x * lunge_speed
	velocity.z += forward.z * lunge_speed
	_clamp_horizontal_speed(max(_max_ground_speed() * SPRINT_MULTIPLIER * 1.18, Vector2(velocity.x, velocity.z).length()))


func _max_ground_speed() -> float:
	return MAX_SPEED * _level_movement_multiplier() * (1.0 + _effective_upgrade_rank("speed") * 0.025)


func _world_gravity() -> float:
	if game_manager != null and game_manager.has_method("get_world_gravity_scale"):
		return GRAVITY * float(game_manager.call("get_world_gravity_scale"))
	return GRAVITY


func _jump_velocity() -> float:
	return JUMP_VELOCITY * (1.0 + _effective_upgrade_rank("jump") * 0.045)


func _double_jump_up_speed() -> float:
	return DOUBLE_JUMP_UP_SPEED * (1.0 + _effective_upgrade_rank("jump") * 0.04)


func _wall_jump_up_speed() -> float:
	return WALL_JUMP_UP_SPEED * (1.0 + _effective_upgrade_rank("jump") * 0.035)


func _stamina_drain_rate() -> float:
	return _max_stamina() / 3.25


func _stamina_regen_rate() -> float:
	return STAMINA_REGEN_RATE + _effective_upgrade_rank("energy") * 2.0


func _visibility_alpha() -> float:
	return clamp(1.0 - _effective_upgrade_rank("visibility") * 0.08, 0.48, 1.0)


func _apply_visibility_upgrade() -> void:
	if _world_model == null:
		return
	var alpha := _visibility_alpha()
	for child in _world_model.get_children():
		if child is MeshInstance3D:
			var mesh_instance := child as MeshInstance3D
			var material := mesh_instance.material_override
			if material is StandardMaterial3D:
				var standard := material as StandardMaterial3D
				standard.albedo_color.a = alpha
				standard.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if alpha < 0.99 else BaseMaterial3D.TRANSPARENCY_DISABLED


# --- Network sync -------------------------------------------------------------

func _send_state() -> void:
	# Send position + velocity to server unreliably every physics tick
	if is_eliminated:
		return
	if multiplayer.multiplayer_peer == null:
		return
	if multiplayer.is_server():
		_apply_server_state(peer_id, global_position, velocity, rotation.y, camera_pitch)
		return
	# Rate limit state sends to avoid network spam (max ~60 sends/sec)
	if not has_meta("_last_state_send_time"):
		set_meta("_last_state_send_time", 0.0)
	var now: float = Time.get_ticks_msec() * 0.001
	var last_send: float = get_meta("_last_state_send_time")
	if now - last_send < 0.016:  # ~60Hz cap
		return
	set_meta("_last_state_send_time", now)
	rpc_id(1, "_server_receive_state",
		global_position,
		velocity,
		rotation.y,
		camera_pitch
	)


func _apply_server_state(
	sender_id: int,
	pos: Vector3,
	vel: Vector3,
	yaw: float,
	pitch: float
) -> void:
	# Basic server-side sanity check (anti-cheat placeholder)
	var max_delta: float = 5.0  # units per tick tolerance
	if pos.distance_to(global_position) < max_delta:
		global_position = pos
	velocity = vel
	rotation.y = yaw
	rpc("_client_receive_state", sender_id, pos, vel, yaw, pitch)


@rpc("any_peer", "call_remote", "reliable")
func _server_request_interact(target_path: NodePath) -> void:
	if not multiplayer.is_server():
		return
	var sender_id: int = multiplayer.get_remote_sender_id()
	var target: Node = get_tree().root.get_node_or_null(target_path)
	if target and target.has_method("server_press"):
		target.call("server_press", sender_id)


@rpc("any_peer", "call_remote", "reliable")
func _server_request_acid_damage() -> void:
	if not multiplayer.is_server():
		return
	var sender_id: int = multiplayer.get_remote_sender_id()
	if sender_id != peer_id:
		return
	server_apply_damage(2.0, -1)


@rpc("any_peer", "call_remote", "reliable")
func _server_attack(weapon: int, origin: Vector3, direction: Vector3) -> void:
	if not multiplayer.is_server():
		return
	var sender_id: int = multiplayer.get_remote_sender_id()
	if sender_id != peer_id:
		return
	_perform_server_attack(sender_id, weapon, origin, direction)


@rpc("any_peer", "call_remote", "unreliable_ordered")
func _server_receive_state(
	pos: Vector3,
	vel: Vector3,
	yaw: float,
	pitch: float
) -> void:
	if not multiplayer.is_server():
		return
	var sender_id: int = multiplayer.get_remote_sender_id()
	_apply_server_state(sender_id, pos, vel, yaw, pitch)


@rpc("authority", "call_remote", "unreliable_ordered")
func _client_receive_state(
	sender_id: int,
	pos: Vector3,
	vel: Vector3,
	yaw: float,
	pitch: float
) -> void:
	# Resolve through the spawner (parent) to avoid wrong-tree find_child lookups
	var spawner := get_parent()
	if spawner == null:
		return
	var player_node := spawner.get_node_or_null(str(sender_id))
	if player_node == null or player_node == self:
		return
	player_node.global_position = pos
	player_node.velocity = vel
	player_node.rotation.y = yaw
	if player_node.has_node("Head"):
		player_node.get_node("Head").rotation.x = pitch


func eliminate() -> void:
	if not multiplayer.is_server():
		return
	var attacker_id := -1
	if GameManager.trapper_id != -1 and GameManager.trapper_id != peer_id:
		if GameManager.players.has(peer_id):
			var role = GameManager.players[peer_id].get("role", 0)
			if role == 0: # Role.RUNNER
				attacker_id = GameManager.trapper_id
	_finish_elimination(health > 0.0, attacker_id)


func respawn_at(spawn_pos: Vector3) -> void:
	_release_grapple()
	is_eliminated = false
	var max_health := _max_health()
	var max_stamina := _max_stamina()
	health = max_health
	stamina = max_stamina
	is_exhausted = false
	is_crouching = false
	is_reloading = false
	_reload_serial += 1
	_reset_weapon_inventory_for_mode()
	sprint_visual_strength = 0.0
	slide_visual_strength = 0.0
	zoom_visual_strength = 0.0
	_sniper_zoom_stage = 0
	weapon_accuracy_visual_strength = 0.0
	crosshair_spread_visual_strength = 0.0
	double_jump_charge = DOUBLE_JUMP_RECHARGE_TIME
	double_jump_ready = true
	bug_swarm_cooldown_time = 0.0
	back_jump_cooldown_time = 0.0
	jump_buffer = 0.0
	_held_bhop_count = 0
	_jump_tap_cooldown = 0.0
	_back_jump_effect_time = 0.0
	bhop_lockout_time = 0.0
	wall_run_cooldown_time = 0.0
	_wall_run_time = 0.0
	_wall_jump_cooldown = 0.0
	_energy_denied_cooldown = 0.0
	_landing_friction_grace_time = 0.0
	_slide_timer = 0.0
	_slide_speed = 0.0
	_slide_direction = Vector3.ZERO
	_landing_camera_offset = 0.0
	_landing_shake_strength = 0.0
	_landing_shake_phase = 0.0
	_camera_motion_time = 0.0
	_warmup_fly_initialized = false  # Reset so warmup camera pitch resets on next countdown
	_set_crouch_height(STAND_HEIGHT)
	show()
	set_process_input(is_local_player)
	set_physics_process(is_local_player)
	velocity = Vector3.ZERO
	global_position = spawn_pos + Vector3.UP * RESPAWN_LIFT
	damage_roll = 0.0
	camera.rotation.z = 0.0
	camera.position = _editor_camera_pos
	camera.fov = base_fov
	head.rotation.y = 0.0
	if _viewmodel_root:
		_viewmodel_root.position = Vector3.ZERO
		_viewmodel_root.rotation = Vector3.ZERO
	if _world_model:
		_world_model.visible = (not is_local_player) or (camera_mode == "third")
		_apply_visibility_upgrade()
	if _viewmodel_root:
		_viewmodel_root.visible = true
	if is_local_player and (_viewmodel_root == null or _player_dust == null):
		_build_optional_visuals()
	_apply_weapon_pose(true)
	health_changed.emit(health, max_health)
	stamina_changed.emit(stamina, max_stamina, is_exhausted)
	double_jump_charge_changed.emit(double_jump_charge, DOUBLE_JUMP_RECHARGE_TIME, double_jump_ready)
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	weapon_changed.emit(get_weapon_name())
	if is_local_player:
		camera.current = true
		if not is_menu_open:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)


func _apply_death_state() -> void:
	_release_grapple()
	is_eliminated = true
	is_crouching = false
	is_reloading = false
	_reload_serial += 1
	sprint_visual_strength = 0.0
	slide_visual_strength = 0.0
	zoom_visual_strength = 0.0
	_sniper_zoom_stage = 0
	weapon_accuracy_visual_strength = 0.0
	crosshair_spread_visual_strength = 0.0
	double_jump_charge = DOUBLE_JUMP_RECHARGE_TIME
	double_jump_ready = true
	bug_swarm_cooldown_time = 0.0
	back_jump_cooldown_time = 0.0
	jump_buffer = 0.0
	_held_bhop_count = 0
	_jump_tap_cooldown = 0.0
	_back_jump_effect_time = 0.0
	bhop_lockout_time = 0.0
	wall_run_cooldown_time = 0.0
	_wall_run_time = 0.0
	_wall_jump_cooldown = 0.0
	_energy_denied_cooldown = 0.0
	_landing_friction_grace_time = 0.0
	_slide_timer = 0.0
	_slide_speed = 0.0
	_slide_direction = Vector3.ZERO
	_landing_shake_strength = 0.0
	_landing_shake_phase = 0.0
	_camera_motion_time = 0.0
	_set_crouch_height(STAND_HEIGHT)
	velocity = Vector3.ZERO
	if _viewmodel_root:
		_viewmodel_root.visible = false
	hide()
	set_process_input(false)
	set_physics_process(false)
	if is_local_player:
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
		head.rotation.y = 0.0
		camera.rotation.z = damage_roll


@rpc("authority", "call_remote", "reliable")
func _client_apply_death() -> void:
	_kill_streak = 0
	kill_streak_changed.emit(0)
	_apply_death_state()


@rpc("authority", "call_local", "reliable")
func _client_sync_health(new_health: float, damage_amount: float, lethal: bool) -> void:
	health = new_health
	health_changed.emit(health, _max_health())
	if is_local_player and damage_amount > 0.0:
		_apply_local_damage_feedback(damage_amount, lethal)


var _kill_streak: int = 0
var _last_kill_time: float = 0.0

@rpc("authority", "call_local", "reliable")
func _client_hit_marker(lethal: bool) -> void:
	if is_local_player:
		hit_marker.emit(lethal)
		if lethal:
			if GameManager.has_method("is_horde_mode") and GameManager.is_horde_mode():
				var now = Time.get_ticks_msec() / 1000.0
				_kill_streak += 1
				_last_kill_time = now
				kill_streak_changed.emit(_kill_streak)
				var w_name = get_weapon_name()
				if GameManager.has_method("play_kill_sound"):
					GameManager.play_kill_sound(_kill_streak, w_name)


func register_deathrun_kill() -> void:
	var now = Time.get_ticks_msec() / 1000.0
	_kill_streak += 1
	_last_kill_time = now
	kill_streak_changed.emit(_kill_streak)
	var w_name = get_weapon_name()
	if GameManager.has_method("play_kill_sound"):
		GameManager.play_kill_sound(_kill_streak, w_name)


@rpc("authority", "call_local", "reliable")
func _client_confirm_damage(amount: float, lethal: bool) -> void:
	if is_local_player and amount > 0.0:
		damage_dealt.emit(amount, lethal)
		if current_weapon == Weapon.KNIFE:
			GameManager.call("play_effect", "knife-sound")


# -- Viewmodel Tuner API (called by the editor plugin dock at runtime) ---------
func tuner_set_viewmodel(pos: Vector3, rot: Vector3) -> void:
	if _viewmodel_holder == null:
		return
	vm_tuning_enabled = false
	var base_pos := _weapon_rest_position(current_weapon)
	var base_rot := _weapon_rest_rotation(current_weapon)
	vm_tuning_enabled = true
	vm_pos_offset = pos - base_pos
	vm_rot_offset = rot - base_rot
	_apply_live_tuning()

func tuner_get_viewmodel_pos() -> Vector3:
	if _viewmodel_holder == null:
		return Vector3.ZERO
	return _viewmodel_holder.position

func tuner_get_viewmodel_rot() -> Vector3:
	if _viewmodel_holder == null:
		return Vector3.ZERO
	return _viewmodel_holder.rotation

func tuner_get_current_weapon() -> int:
	return current_weapon

func tuner_switch_weapon(weapon_idx: int) -> void:
	if weapon_idx < Weapon.KNIFE or weapon_idx > Weapon.REVOLVER:
		return
	current_weapon = weapon_idx
	_apply_weapon_pose(true)
	if _set_saved_viewmodel_tuning_for_weapon(current_weapon):
		_apply_live_tuning()
	elif vm_tuning_enabled:
		_apply_live_tuning()

func tuner_set_viewmodel_options(options: Dictionary) -> void:
	if options.has("visible"):
		vm_visible = bool(options["visible"])
	if options.has("draw_on_top"):
		vm_draw_on_top = bool(options["draw_on_top"])
	if options.has("scale"):
		vm_model_scale = clamp(float(options["scale"]), 0.05, 5.0)
	if options.has("muzzle_scale"):
		vm_muzzle_scale = clamp(float(options["muzzle_scale"]), 0.1, 5.0)
	if options.has("muzzle_offset"):
		var muzzle_value: Variant = options["muzzle_offset"]
		if muzzle_value is Vector3:
			muzzle_tuning_offset = muzzle_value
		elif muzzle_value is Array and muzzle_value.size() == 3:
			muzzle_tuning_offset = Vector3(float(muzzle_value[0]), float(muzzle_value[1]), float(muzzle_value[2]))
	if options.has("crosshair_color"):
		var cross_color: Variant = options["crosshair_color"]
		if cross_color is Array and cross_color.size() == 4:
			crosshair_color = Color(float(cross_color[0]), float(cross_color[1]), float(cross_color[2]), float(cross_color[3]))
		elif cross_color is Color:
			crosshair_color = cross_color
	if options.has("crosshair_alpha"):
		crosshair_alpha = clamp(float(options["crosshair_alpha"]), 0.0, 1.0)
	if options.has("show_crosshair"):
		show_crosshair = bool(options["show_crosshair"])
	if options.has("show_crosshair_dot"):
		show_crosshair_dot = bool(options["show_crosshair_dot"])
	if options.has("show_tracer"):
		show_tracer = bool(options["show_tracer"])
	if options.has("show_muzzle_flash"):
		show_muzzle_flash = bool(options["show_muzzle_flash"])
	if options.has("muzzle_auto_detect"):
		muzzle_auto_detect = bool(options["muzzle_auto_detect"])
	if options.has("camera_mode"):
		tuner_set_camera_mode(str(options["camera_mode"]))
	if options.has("tracer_texture_path"):
		tracer_texture_path = str(options["tracer_texture_path"])
		_cached_tracer_texture = _load_texture_resource(tracer_texture_path)
	if options.has("muzzle_flash_texture_path"):
		muzzle_flash_texture_path = str(options["muzzle_flash_texture_path"])
		_cached_muzzle_flash_texture = _load_texture_resource(muzzle_flash_texture_path)
	if options.has("arms_model_path"):
		arms_model_path = str(options["arms_model_path"])
		_load_arms_model()
	if options.has("bob_intensity"):
		vm_bob_intensity = clamp(float(options["bob_intensity"]), 0.0, 5.0)
	if options.has("sway_intensity"):
		vm_sway_intensity = clamp(float(options["sway_intensity"]), 0.0, 5.0)
	if options.has("crosshair_thickness"):
		crosshair_thickness = float(options["crosshair_thickness"])
	if options.has("crosshair_gap"):
		crosshair_gap = float(options["crosshair_gap"])
	if options.has("crosshair_size"):
		crosshair_size = float(options["crosshair_size"])
	if options.has("camera_idle_sway_speed"):
		camera_idle_sway_speed = float(options["camera_idle_sway_speed"])
	if options.has("camera_idle_sway_strength"):
		camera_idle_sway_strength = float(options["camera_idle_sway_strength"])
	if options.has("recoil_kick_amount"):
		recoil_kick_amount = float(options["recoil_kick_amount"])
	if options.has("recoil_recovery_rate"):
		recoil_recovery_rate = float(options["recoil_recovery_rate"])
	_apply_viewmodel_runtime_options()
	_apply_live_tuning()

func tuner_preview_pose(pose_name: String) -> void:
	match pose_name:
		"inspect":
			_inspect_weapon()
		"attack":
			_animate_attack()
		"reload":
			_animate_reload()
		_:
			if _weapon_tween and _weapon_tween.is_valid():
				_weapon_tween.kill()
			_apply_weapon_pose(true)
			if vm_tuning_enabled:
				_apply_live_tuning()

func tuner_set_viewmodel_debug_camera(enabled: bool) -> void:
	if enabled:
		_ensure_viewmodel_debug_camera()
		if _viewmodel_debug_camera:
			_viewmodel_debug_camera.current = true
	else:
		if _viewmodel_debug_camera:
			_viewmodel_debug_camera.current = false
		if camera:
			camera.current = true

func tuner_set_camera_mode(mode: String) -> void:
	var normalized := mode.to_lower()
	if normalized != "first" and normalized != "third":
		return
	camera_mode = normalized
	if camera_mode == "third":
		_ensure_third_person_camera()
		if _third_person_camera:
			_third_person_camera.current = true
		if camera:
			camera.current = false
	else:
		if _third_person_camera:
			_third_person_camera.current = false
		if camera:
			camera.current = true
	_update_local_model_visibility()

func tuner_replace_weapon_model(weapon_idx: int, resource_path: String) -> bool:
	if _viewmodel_holder == null:
		return false
	if weapon_idx < Weapon.KNIFE or weapon_idx > Weapon.REVOLVER:
		return false
	if not ResourceLoader.exists(resource_path):
		print("[ViewmodelTuner] Model path does not exist: %s" % resource_path)
		return false
	var weapon_name := _tuner_weapon_asset_name(weapon_idx)
	var old_model := _tuner_weapon_model_node(weapon_idx)
	var old_index := -1
	if old_model != null:
		old_index = old_model.get_index()
		_viewmodel_holder.remove_child(old_model)
	var new_model := _load_weapon_model_from_path(weapon_name, resource_path, _viewmodel_holder)
	if new_model == null:
		if old_model != null:
			_viewmodel_holder.add_child(old_model)
			if old_index >= 0:
				_viewmodel_holder.move_child(old_model, old_index)
		return false
	if old_index >= 0:
		_viewmodel_holder.move_child(new_model, old_index)
	if old_model != null:
		old_model.queue_free()
	_tuner_assign_weapon_model_node(weapon_idx, new_model)
	_apply_viewmodel_runtime_options()
	_apply_weapon_pose(true)
	return true

func tuner_replace_arms_model(resource_path: String) -> bool:
	if _arms_root == null:
		return false
	arms_model_path = resource_path
	if ResourceLoader.exists(arms_model_path):
		_load_arms_model()
	else:
		print("[ViewmodelTuner] Arms model path does not exist: %s" % resource_path)
		return false
	return _arms_model != null

func tuner_replace_body_model(resource_path: String) -> bool:
	if not ResourceLoader.exists(resource_path):
		print("[ViewmodelTuner] Body model path does not exist: %s" % resource_path)
		return false
	var loaded_resource := ResourceLoader.load(resource_path)
	if loaded_resource == null:
		return false
	var parent: Node = self
	if _world_model != null and _world_model.get_parent() != null:
		parent = _world_model.get_parent()
	var new_model := Node3D.new()
	new_model.name = "WorldModel"
	if loaded_resource is PackedScene:
		var instance: Node = loaded_resource.instantiate()
		new_model.add_child(instance)
	elif loaded_resource is Mesh:
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.mesh = loaded_resource
		new_model.add_child(mesh_instance)
	else:
		return false
	if _world_model != null and _world_model.get_parent() == parent:
		new_model.global_transform = _world_model.global_transform
		new_model.visible = _world_model.visible
		_world_model.queue_free()
	parent.add_child(new_model)
	_world_model = new_model
	_body_anim_player = null
	_body_anim_current = ""
	_setup_world_model_anim_player()
	_update_third_person_weapon_attachment()
	return true

func _ensure_viewmodel_debug_camera() -> void:
	if _viewmodel_root == null:
		return
	if _viewmodel_debug_camera != null:
		return
	_viewmodel_debug_camera = Camera3D.new()
	_viewmodel_debug_camera.name = "ViewmodelDebugCamera"
	_viewmodel_debug_camera.near = 0.005
	_viewmodel_debug_camera.fov = 55.0
	_viewmodel_root.add_child(_viewmodel_debug_camera)

func _ensure_third_person_camera() -> void:
	if _third_person_camera != null:
		return
	_third_person_camera = Camera3D.new()
	_third_person_camera.name = "ThirdPersonCamera"
	_third_person_camera.near = 0.01
	_third_person_camera.fov = base_fov
	_third_person_camera.cull_mask = 1 + 4 # Render Layer 1 (world) and Layer 4 (3rd-person p_model/weapons) but NOT Layer 2 (first-person hands)
	_third_person_camera.current = false
	add_child(_third_person_camera)

func _update_third_person_camera_transform() -> void:
	if _third_person_camera == null or head == null or camera == null:
		return
	var target_position: Vector3 = camera.global_transform.origin
	if is_inspecting_model:
		var rotation_yaw = rotation.y + inspect_orbit_yaw
		var rotation_pitch = inspect_orbit_pitch
		var offset := Vector3(0, 0, inspect_orbit_radius)
		offset = offset.rotated(Vector3.RIGHT, rotation_pitch)
		offset = offset.rotated(Vector3.UP, rotation_yaw)
		var desired_position: Vector3 = target_position + offset
		_third_person_camera.global_position = desired_position
		_third_person_camera.look_at(target_position, Vector3.UP)
	else:
		var offset_distance: float = 2.2
		var desired_position: Vector3 = target_position + head.global_transform.basis.z * offset_distance + Vector3(0.0, 0.85, 0.0)
		_third_person_camera.global_transform = Transform3D().looking_at(target_position, Vector3.UP)
		_third_person_camera.global_transform.origin = desired_position

func _tuner_weapon_asset_name(weapon_idx: int) -> String:
	match weapon_idx:
		Weapon.KNIFE:
			return "knife"
		Weapon.PISTOL:
			return "pistol"
		Weapon.SMG:
			return "p90"
		Weapon.AK:
			return "rifle"
		Weapon.SNIPER:
			return "awp"
		Weapon.SHOTGUN:
			return "shotgun"
		Weapon.REVOLVER:
			return "revolver"
	return "pistol"

func _tuner_weapon_model_node(weapon_idx: int) -> Node3D:
	match weapon_idx:
		Weapon.KNIFE:
			return _knife_model
		Weapon.PISTOL:
			return _pistol_model
		Weapon.SMG:
			return _smg_model
		Weapon.AK:
			return _ak_model
		Weapon.SNIPER:
			return _sniper_model
		Weapon.SHOTGUN:
			return _shotgun_model
		Weapon.REVOLVER:
			return _revolver_model
	return null

func _tuner_assign_weapon_model_node(weapon_idx: int, model_node: Node3D) -> void:
	match weapon_idx:
		Weapon.KNIFE:
			_knife_model = model_node
		Weapon.PISTOL:
			_pistol_model = model_node
		Weapon.SMG:
			_smg_model = model_node
		Weapon.AK:
			_ak_model = model_node
		Weapon.SNIPER:
			_sniper_model = model_node
		Weapon.SHOTGUN:
			_shotgun_model = model_node
		Weapon.REVOLVER:
			_revolver_model = model_node
# -----------------------------------------------------------------------------


func debug_request_restore() -> void:
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		_apply_debug_restore()
		return
	rpc_id(1, "_server_debug_restore")


func debug_request_teleport(target_pos: Vector3) -> void:
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		_apply_debug_teleport(target_pos)
		return
	rpc_id(1, "_server_debug_teleport", target_pos)


func _apply_debug_restore() -> void:
	if is_eliminated:
		respawn_at(global_position)
		return
	var max_health := _max_health()
	var max_stamina := _max_stamina()
	health = max_health
	stamina = max_stamina
	is_exhausted = false
	is_crouching = false
	is_reloading = false
	_reload_serial += 1
	_reset_weapon_inventory_for_mode()
	double_jump_charge = DOUBLE_JUMP_RECHARGE_TIME
	double_jump_ready = true
	bug_swarm_cooldown_time = 0.0
	back_jump_cooldown_time = 0.0
	jump_buffer = 0.0
	_held_bhop_count = 0
	_jump_tap_cooldown = 0.0
	_back_jump_effect_time = 0.0
	bhop_lockout_time = 0.0
	wall_run_cooldown_time = 0.0
	_wall_run_time = 0.0
	_wall_jump_cooldown = 0.0
	_energy_denied_cooldown = 0.0
	_landing_friction_grace_time = 0.0
	_slide_timer = 0.0
	_slide_speed = 0.0
	_slide_direction = Vector3.ZERO
	slide_visual_strength = 0.0
	zoom_visual_strength = 0.0
	_sniper_zoom_stage = 0
	weapon_accuracy_visual_strength = 0.0
	crosshair_spread_visual_strength = 0.0
	_set_crouch_height(STAND_HEIGHT)
	health_changed.emit(health, max_health)
	stamina_changed.emit(stamina, max_stamina, is_exhausted)
	double_jump_charge_changed.emit(double_jump_charge, DOUBLE_JUMP_RECHARGE_TIME, double_jump_ready)
	ammo_changed.emit(current_ammo, reserve_ammo, is_reloading)
	weapon_changed.emit(get_weapon_name())


@rpc("any_peer", "call_remote", "reliable")
func _server_request_bug_swarm() -> void:
	if not multiplayer.is_server():
		return
	var sender_id: int = multiplayer.get_remote_sender_id()
	if sender_id != peer_id:
		return
	var current_scene: Node = get_tree().current_scene
	if current_scene == null or not current_scene.has_method("server_release_bug_swarm"):
		return
	if bool(current_scene.call("server_release_bug_swarm", sender_id)):
		rpc_id(sender_id, "_client_confirm_bug_swarm_release")


@rpc("authority", "call_remote", "reliable")
func _client_confirm_bug_swarm_release() -> void:
	_confirm_bug_swarm_release()


func _apply_debug_teleport(target_pos: Vector3) -> void:
	respawn_at(target_pos)


@rpc("any_peer", "call_remote", "reliable")
func _server_debug_restore() -> void:
	if not multiplayer.is_server():
		return
	if multiplayer.get_remote_sender_id() != peer_id:
		return
	_apply_debug_restore()
	rpc("_client_debug_restore")


@rpc("authority", "call_remote", "reliable")
func _client_debug_restore() -> void:
	_apply_debug_restore()


@rpc("any_peer", "call_remote", "reliable")
func _server_debug_teleport(target_pos: Vector3) -> void:
	if not multiplayer.is_server():
		return
	if multiplayer.get_remote_sender_id() != peer_id:
		return
	_apply_debug_teleport(target_pos)
	rpc("_client_debug_teleport", global_position)


@rpc("authority", "call_remote", "reliable")
func _client_debug_teleport(target_pos: Vector3) -> void:
	_apply_debug_teleport(target_pos)


func die() -> void:
	if multiplayer.is_server():
		eliminate()


func _check_wall_run(wish_dir: Vector3) -> bool:
	if is_on_floor() or _wall_run_cooldown > 0.0:
		return false
	if wish_dir.length() < 0.1:
		return false
		
	var space := get_world_3d().direct_space_state
	var origin := global_position + Vector3.UP * 0.9
	var right_dir := transform.basis.x.normalized()
	
	# Check Right wall
	var right_query := PhysicsRayQueryParameters3D.create(origin, origin + right_dir * 1.15, collision_mask, [self])
	right_query.collide_with_areas = false
	var right_hit := space.intersect_ray(right_query)
	if not right_hit.is_empty():
		var normal = right_hit.get("normal", Vector3.ZERO)
		if absf(normal.y) < 0.35:
			_wall_run_side = 1.0
			_wall_run_normal = normal
			# Align velocity along wall tangent
			var wall_tangent := Vector3(-normal.z, 0.0, normal.x).normalized()
			var forward := -transform.basis.z
			if wall_tangent.dot(forward) < 0.0:
				wall_tangent = -wall_tangent
			var speed: float = max(Vector3(velocity.x, 0.0, velocity.z).length(), MAX_SPEED * 1.25)
			velocity.x = wall_tangent.x * speed
			velocity.z = wall_tangent.z * speed
			
			if Input.is_action_just_pressed("jump"):
				velocity = normal * 7.6 + Vector3.UP * 6.6 + wall_tangent * 5.2
				_wall_run_cooldown = 0.35
				wall_run_cooldown_time = 3.0
				_is_wall_running = false
				_play_local_sound(_jump_audio, -0.6, 1.2)
			return true
			
	# Check Left wall
	var left_query := PhysicsRayQueryParameters3D.create(origin, origin - right_dir * 1.15, collision_mask, [self])
	left_query.collide_with_areas = false
	var left_hit := space.intersect_ray(left_query)
	if not left_hit.is_empty():
		var normal = left_hit.get("normal", Vector3.ZERO)
		if absf(normal.y) < 0.35:
			_wall_run_side = -1.0
			_wall_run_normal = normal
			# Align velocity along wall tangent
			var wall_tangent := Vector3(-normal.z, 0.0, normal.x).normalized()
			var forward := -transform.basis.z
			if wall_tangent.dot(forward) < 0.0:
				wall_tangent = -wall_tangent
			var speed: float = max(Vector3(velocity.x, 0.0, velocity.z).length(), MAX_SPEED * 1.25)
			velocity.x = wall_tangent.x * speed
			velocity.z = wall_tangent.z * speed
			
			if Input.is_action_just_pressed("jump"):
				velocity = normal * 7.6 + Vector3.UP * 6.6 + wall_tangent * 5.2
				_wall_run_cooldown = 0.35
				wall_run_cooldown_time = 3.0
				_is_wall_running = false
				_play_local_sound(_jump_audio, -0.6, 1.2)
			return true
			
	return false

func _check_ledge_clamber(_delta: float) -> bool:
	if _clamber_timer > 0.0 or is_on_floor():
		return false
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if input_dir.y >= -0.5:
		return false
		
	var space := get_world_3d().direct_space_state
	var forward := -transform.basis.z.normalized()
	
	var eye_origin := global_position + Vector3.UP * 1.5
	var eye_query := PhysicsRayQueryParameters3D.create(eye_origin, eye_origin + forward * 0.9, collision_mask, [self])
	eye_query.collide_with_areas = false
	var eye_hit := space.intersect_ray(eye_query)
	if eye_hit.is_empty():
		return false
		
	var wall_hit_pos = eye_hit.get("position", Vector3.ZERO)
	var wall_normal = eye_hit.get("normal", Vector3.ZERO)
	if absf(wall_normal.y) > 0.3:
		return false
		
	var head_origin := global_position + Vector3.UP * 2.1
	var head_query := PhysicsRayQueryParameters3D.create(head_origin, head_origin + forward * 1.0, collision_mask, [self])
	head_query.collide_with_areas = false
	var head_hit := space.intersect_ray(head_query)
	if not head_hit.is_empty():
		return false
		
	var top_origin = wall_hit_pos + forward * 0.2 + Vector3.UP * 0.8
	var down_query := PhysicsRayQueryParameters3D.create(top_origin, top_origin + Vector3.DOWN * 1.2, collision_mask, [self])
	down_query.collide_with_areas = false
	var down_hit := space.intersect_ray(down_query)
	if down_hit.is_empty():
		return false
		
	var ledge_y = down_hit.get("position", Vector3.ZERO).y
	var height_diff = ledge_y - global_position.y
	if height_diff > 0.5 and height_diff < 1.95:
		_clamber_target = Vector3(wall_hit_pos.x + forward.x * 0.58, ledge_y + 0.98, wall_hit_pos.z + forward.z * 0.58)
		_ledge_clambering = true
		_clamber_timer = 0.26
		velocity = Vector3.ZERO
		return true
		
	return false

func apply_jump_pad_boost(boost: float) -> void:
	velocity.y = boost
	_play_local_sound(_jump_audio, -0.6, 1.25)

func apply_speed_pad_boost(direction: Vector3, multiplier: float) -> void:
	velocity.x = direction.x * MAX_SPEED * multiplier
	velocity.z = direction.z * MAX_SPEED * multiplier
	_play_local_sound(_jump_audio, -1.0, 1.3)

func teleport_to(target_pos: Vector3) -> void:
	global_position = target_pos
	velocity = Vector3.ZERO

func unlock_perk_local(perk_name: String) -> void:
	if not unlocked_perks.has(perk_name):
		unlocked_perks.append(perk_name)

func apply_acid_slow() -> void:
	_acid_slow_timer = 0.25
# test



func _handle_grappling_hook(delta: float) -> void:
	if not is_local_player or is_eliminated or is_menu_open:
		_release_grapple()
		return

	var g_pressed = Input.is_key_pressed(KEY_G)
	var g_just_pressed = g_pressed and not _was_g_pressed
	_was_g_pressed = g_pressed

	if g_just_pressed:
		if not is_grappling:
			if stamina >= 20.0 and not is_exhausted and grapple_cooldown_time <= 0.0:
				grapple_cooldown_time = grapple_cooldown_total
				_consume_instant_stamina(20.0)
				_try_initiate_grapple()
		else:
			_release_grapple()

	if is_grappling and Input.is_action_just_pressed("jump"):
		_release_grapple()
		velocity.y += 5.2
		velocity += -transform.basis.z.normalized() * 6.5

	if is_grappling:
		var player_center = global_position + Vector3.UP * 0.9
		var to_target = grapple_target - player_center
		var dist = to_target.length()
		
		if dist < 2.0 or dist > 45.0:
			_release_grapple()
			return
			
		var dir = to_target.normalized()
		var pull_accel = 32.0
		var up_boost = 4.0 if dir.y > 0.0 else 0.0
		velocity += (dir * pull_accel + Vector3.UP * up_boost) * delta
		
		if velocity.length() > 36.0:
			velocity = velocity.normalized() * 36.0
			
		_update_grapple_rope_visual()

func _try_initiate_grapple() -> void:
	var space := get_world_3d().direct_space_state
	var cam_pos = camera.global_position
	var look_dir = -camera.global_transform.basis.z.normalized()
	
	var query := PhysicsRayQueryParameters3D.create(cam_pos, cam_pos + look_dir * 38.0, collision_mask, [self])
	query.collide_with_areas = true
	var hit := space.intersect_ray(query)
	
	if not hit.is_empty():
		var hit_node = hit.get("collider")
		if hit_node is StaticBody3D or hit_node is Area3D or hit_node is CSGShape3D or hit_node is CharacterBody3D:
			is_grappling = true
			grapple_target = hit.get("position", Vector3.ZERO)
			_play_local_sound(_grapple_audio, 0.0, 1.0)
			_create_grapple_rope_visual()

func _release_grapple() -> void:
	if not is_grappling:
		return
	is_grappling = false
	if _grapple_rope and is_instance_valid(_grapple_rope):
		_grapple_rope.queue_free()
		_grapple_rope = null

func _create_grapple_rope_visual() -> void:
	if _grapple_rope and is_instance_valid(_grapple_rope):
		_grapple_rope.queue_free()
	_grapple_rope = MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = Vector3(0.04, 0.04, 1.0)
	_grapple_rope.mesh = box_mesh
	
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.1, 0.8, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(0.1, 0.8, 1.0)
	mat.emission_energy_multiplier = 3.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_grapple_rope.material_override = mat
	_grapple_rope.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	
	var current_scene = get_tree().current_scene
	if current_scene:
		current_scene.add_child(_grapple_rope)

func _update_grapple_rope_visual() -> void:
	if not _grapple_rope or not is_instance_valid(_grapple_rope):
		return
		
	var origin = camera.global_position + camera.global_transform.basis.x * 0.25 + camera.global_transform.basis.y * -0.25 - camera.global_transform.basis.z * 0.5
	if _weapon_muzzle and is_instance_valid(_weapon_muzzle):
		origin = _weapon_muzzle.global_position
		
	var target = grapple_target
	var diff = target - origin
	var length = diff.length()
	if length < 0.1:
		_grapple_rope.visible = false
		return
	_grapple_rope.visible = true
	
	var box_mesh: BoxMesh = _grapple_rope.mesh as BoxMesh
	if box_mesh:
		box_mesh.size = Vector3(0.04, 0.04, length)
		
	var midpoint = origin + diff * 0.5
	var look_at_dir = diff.normalized()
	_grapple_rope.global_transform = Transform3D(Basis.looking_at(look_at_dir, Vector3.UP), midpoint)
