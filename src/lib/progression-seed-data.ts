import { DAILY_MISSION_SEEDS } from '@/lib/daily-missions';

/** Metrics must match progression-actions.metricCount / processWebsiteAction. */
export const missionTemplates = [
  // In-game (10) — category "game"
  { key: "ig_play_1", title: "First Footing", description: "Play 1 Deathrun match.", category: "game", metric: "runs", targetCount: 1, rewardXp: 50 },
  { key: "ig_play_5", title: "Warm-Up Loop", description: "Play 5 Deathrun matches.", category: "game", metric: "runs", targetCount: 5, rewardXp: 120 },
  { key: "ig_win_1", title: "First Clear", description: "Win 1 Deathrun as a Runner.", category: "game", metric: "wins", targetCount: 1, rewardXp: 80 },
  { key: "ig_win_3", title: "Triple Threat", description: "Win 3 Deathrun matches.", category: "game", metric: "wins", targetCount: 3, rewardXp: 150 },
  { key: "ig_dist_100", title: "Hundred Meters", description: "Cover 100m total distance.", category: "game", metric: "distance", targetCount: 100, rewardXp: 60 },
  { key: "ig_dist_500", title: "Half-Kilo Dash", description: "Cover 500m total distance.", category: "game", metric: "distance", targetCount: 500, rewardXp: 140 },
  { key: "ig_play_10", title: "Queue Regular", description: "Play 10 Deathrun matches.", category: "game", metric: "runs", targetCount: 10, rewardXp: 200 },
  { key: "ig_win_5", title: "Course Specialist", description: "Win 5 Deathrun matches.", category: "game", metric: "wins", targetCount: 5, rewardXp: 250 },
  { key: "ig_score_500", title: "Point Hunter", description: "Reach a best score of 500.", category: "game", metric: "score", targetCount: 500, rewardXp: 180 },
  { key: "ig_win_10", title: "Escape Artist", description: "Win 10 Deathrun matches.", category: "game", metric: "wins", targetCount: 10, rewardXp: 500 },
  // Horde (8)
  { key: "hz_play_1", title: "First Wave", description: "Play 1 Horde match.", category: "game", metric: "horde_runs", targetCount: 1, rewardXp: 60 },
  { key: "hz_play_5", title: "Wave Rider", description: "Play 5 Horde matches.", category: "game", metric: "horde_runs", targetCount: 5, rewardXp: 140 },
  { key: "hz_survive_1", title: "Hold the Line", description: "Survive 1 Horde match.", category: "game", metric: "horde_wins", targetCount: 1, rewardXp: 90 },
  { key: "hz_survive_3", title: "Squad Anchor", description: "Survive 3 Horde matches.", category: "game", metric: "horde_wins", targetCount: 3, rewardXp: 180 },
  { key: "hz_waves_10", title: "Ten Deep", description: "Clear 10 Horde waves total.", category: "game", metric: "horde_waves", targetCount: 10, rewardXp: 120 },
  { key: "hz_waves_50", title: "Endless Push", description: "Clear 50 Horde waves total.", category: "game", metric: "horde_waves", targetCount: 50, rewardXp: 280 },
  { key: "hz_kills_25", title: "Exterminator", description: "Kill 25 monsters in Horde.", category: "game", metric: "horde_kills", targetCount: 25, rewardXp: 100 },
  { key: "hz_kills_100", title: "Horde Slayer", description: "Kill 100 monsters in Horde.", category: "game", metric: "horde_kills", targetCount: 100, rewardXp: 300 },
  // Competitive (6)
  { key: "cp_play_1", title: "Ranked Debut", description: "Play 1 Competitive match.", category: "game", metric: "competitive_runs", targetCount: 1, rewardXp: 70 },
  { key: "cp_play_5", title: "Ladder Climber", description: "Play 5 Competitive matches.", category: "game", metric: "competitive_runs", targetCount: 5, rewardXp: 160 },
  { key: "cp_win_1", title: "First Frag Win", description: "Win 1 Competitive match.", category: "game", metric: "competitive_wins", targetCount: 1, rewardXp: 100 },
  { key: "cp_win_5", title: "Team Ace", description: "Win 5 Competitive matches.", category: "game", metric: "competitive_wins", targetCount: 5, rewardXp: 280 },
  { key: "cp_win_10", title: "Premade Predator", description: "Win 10 Competitive matches.", category: "game", metric: "competitive_wins", targetCount: 10, rewardXp: 450 },
  { key: "cp_kp_1200", title: "Gold Territory", description: "Reach 1200 Killrun Points.", category: "game", metric: "kp", targetCount: 1200, rewardXp: 200 },
  // Website (10)
  { key: "web_login_1", title: "Welcome Aboard", description: "Log into the Kilrun hub.", category: "website", metric: "logins", targetCount: 1, rewardXp: 40 },
  { key: "web_friend_1", title: "Make a Friend", description: "Add 1 friend on Kilrun.", category: "website", metric: "friends", targetCount: 1, rewardXp: 60 },
  { key: "web_msg_1", title: "First Message", description: "Send 1 direct message.", category: "website", metric: "messages", targetCount: 1, rewardXp: 40 },
  { key: "web_forum_1", title: "Forum Voice", description: "Create 1 forum thread.", category: "website", metric: "forum", targetCount: 1, rewardXp: 70 },
  { key: "web_msg_5", title: "Conversation Starter", description: "Send 5 direct messages.", category: "website", metric: "messages", targetCount: 5, rewardXp: 90 },
  { key: "web_shop_1", title: "First Purchase", description: "Buy 1 item from the VP store.", category: "website", metric: "purchases", targetCount: 1, rewardXp: 80 },
  { key: "web_email_1", title: "Mailbox Linked", description: "Confirm your email address.", category: "website", metric: "email", targetCount: 1, rewardXp: 100 },
  { key: "web_chat_5", title: "Global Chatter", description: "Send 5 global chat messages.", category: "website", metric: "chat", targetCount: 5, rewardXp: 60 },
  { key: "web_friend_3", title: "Social Circle", description: "Have 3 accepted friends.", category: "website", metric: "friends", targetCount: 3, rewardXp: 120 },
  { key: "web_vip_1", title: "VIP Lifestyle", description: "Unlock VIP status.", category: "website", metric: "vip", targetCount: 1, rewardXp: 150 },
  // Daily — single source of truth in DAILY_MISSION_SEEDS
  ...DAILY_MISSION_SEEDS.map((m) => ({ ...m })),
];

export const achievements = [
  // In-game (10)
  { key: "ach_ig_first_match", title: "Boots On Ground", description: "Complete your first Deathrun match.", category: "game", metric: "runs", targetCount: 1, xpReward: 75, icon: "game" },
  { key: "ach_ig_five_matches", title: "Getting Serious", description: "Play 5 Deathrun matches.", category: "game", metric: "runs", targetCount: 5, xpReward: 125, icon: "fire" },
  { key: "ach_ig_first_win", title: "Survivor", description: "Win your first Runner match.", category: "game", metric: "wins", targetCount: 1, xpReward: 100, icon: "trophy" },
  { key: "ach_ig_three_wins", title: "Hot Streak", description: "Win 3 Runner matches.", category: "game", metric: "wins", targetCount: 3, xpReward: 175, icon: "zap" },
  { key: "ach_ig_ten_matches", title: "Veteran Queue", description: "Play 10 Deathrun matches.", category: "game", metric: "runs", targetCount: 10, xpReward: 200, icon: "target" },
  { key: "ach_ig_five_wins", title: "Course Cleared", description: "Win 5 Runner matches.", category: "game", metric: "wins", targetCount: 5, xpReward: 250, icon: "gem" },
  { key: "ach_ig_dist_250", title: "Road Warrior", description: "Cover 250m total distance.", category: "game", metric: "distance", targetCount: 250, xpReward: 100, icon: "gauge" },
  { key: "ach_ig_twenty_matches", title: "Arena Regular", description: "Play 20 Deathrun matches.", category: "game", metric: "runs", targetCount: 20, xpReward: 300, icon: "stadium" },
  { key: "ach_ig_ten_wins", title: "Deathrun Ace", description: "Win 10 Runner matches.", category: "game", metric: "wins", targetCount: 10, xpReward: 400, icon: "crown" },
  { key: "ach_ig_score_1k", title: "High Scorer", description: "Reach a best score of 1000.", category: "game", metric: "score", targetCount: 1000, xpReward: 350, icon: "star" },
  // Horde (6)
  { key: "ach_hz_first", title: "Into the Swarm", description: "Complete your first Horde match.", category: "game", metric: "horde_runs", targetCount: 1, xpReward: 80, icon: "skull" },
  { key: "ach_hz_five", title: "Wave Veteran", description: "Play 5 Horde matches.", category: "game", metric: "horde_runs", targetCount: 5, xpReward: 150, icon: "fire" },
  { key: "ach_hz_survive", title: "Last Stand", description: "Survive a Horde match.", category: "game", metric: "horde_wins", targetCount: 1, xpReward: 120, icon: "shield" },
  { key: "ach_hz_waves_25", title: "Deep Waves", description: "Clear 25 Horde waves total.", category: "game", metric: "horde_waves", targetCount: 25, xpReward: 200, icon: "zap" },
  { key: "ach_hz_kills_50", title: "Monster Hunter", description: "Kill 50 Horde monsters.", category: "game", metric: "horde_kills", targetCount: 50, xpReward: 175, icon: "swords" },
  { key: "ach_hz_kills_200", title: "Swarm Breaker", description: "Kill 200 Horde monsters.", category: "game", metric: "horde_kills", targetCount: 200, xpReward: 400, icon: "crown" },
  // Competitive (5)
  { key: "ach_cp_first", title: "On the Ladder", description: "Play your first Competitive match.", category: "game", metric: "competitive_runs", targetCount: 1, xpReward: 90, icon: "target" },
  { key: "ach_cp_win", title: "Round Winners", description: "Win a Competitive match.", category: "game", metric: "competitive_wins", targetCount: 1, xpReward: 120, icon: "trophy" },
  { key: "ach_cp_five_wins", title: "Clutch Crew", description: "Win 5 Competitive matches.", category: "game", metric: "competitive_wins", targetCount: 5, xpReward: 280, icon: "gem" },
  { key: "ach_cp_ten_wins", title: "Premier Contender", description: "Win 10 Competitive matches.", category: "game", metric: "competitive_wins", targetCount: 10, xpReward: 450, icon: "crown" },
  { key: "ach_cp_gold", title: "Gold Ranked", description: "Reach Gold rank (1200 KP).", category: "game", metric: "kp", targetCount: 1200, xpReward: 250, icon: "star" },
  // Website (10)
  { key: "ach_web_welcome", title: "Hub Citizen", description: "Log into the website hub.", category: "website", metric: "logins", targetCount: 1, xpReward: 50, icon: "home" },
  { key: "ach_web_friend", title: "Connected", description: "Add a friend on Kilrun.", category: "website", metric: "friends", targetCount: 1, xpReward: 75, icon: "users" },
  { key: "ach_web_messenger", title: "Direct Line", description: "Send a direct message.", category: "website", metric: "messages", targetCount: 1, xpReward: 50, icon: "mail" },
  { key: "ach_web_author", title: "Thread Starter", description: "Create a forum thread.", category: "website", metric: "forum", targetCount: 1, xpReward: 80, icon: "pen" },
  { key: "ach_web_chatty", title: "Always Online", description: "Send 10 direct messages.", category: "website", metric: "messages", targetCount: 10, xpReward: 150, icon: "radio" },
  { key: "ach_web_shopper", title: "Window Shopper Done", description: "Buy something from the store.", category: "website", metric: "purchases", targetCount: 1, xpReward: 90, icon: "cart" },
  { key: "ach_web_email", title: "Verified Inbox", description: "Confirm your email.", category: "website", metric: "email", targetCount: 1, xpReward: 120, icon: "check" },
  { key: "ach_web_chatter", title: "Global Presence", description: "Send 5 global chat messages.", category: "website", metric: "chat", targetCount: 5, xpReward: 70, icon: "globe" },
  { key: "ach_web_circle", title: "Friend Group", description: "Have 3 accepted friends.", category: "website", metric: "friends", targetCount: 3, xpReward: 140, icon: "handshake" },
  { key: "ach_web_vip", title: "Patron of Kilrun", description: "Unlock VIP status.", category: "website", metric: "vip", targetCount: 1, xpReward: 200, icon: "star" },
];

export const badges = [
  { key: "badge_newcomer", title: "Newcomer", description: "Joined Kilrun.", icon: "seedling", rarity: "common", metric: "logins", targetCount: 1 },
  { key: "badge_steam", title: "Steam Linked", description: "Signed in with Steam.", icon: "gamepad", rarity: "common", metric: "logins", targetCount: 1 },
  { key: "badge_email", title: "Email Verified", description: "Confirmed email address.", icon: "mail", rarity: "uncommon", metric: "email", targetCount: 1 },
  { key: "badge_first_win", title: "First Victory", description: "Won a Deathrun match.", icon: "medal", rarity: "uncommon", metric: "wins", targetCount: 1 },
  { key: "badge_social", title: "Socialite", description: "Active in hub chat.", icon: "sparkles", rarity: "rare", metric: "chat", targetCount: 5 },
  { key: "badge_forum", title: "Forum Elder", description: "Contributed on the forums.", icon: "scroll", rarity: "rare", metric: "forum", targetCount: 1 },
  { key: "badge_shopper", title: "Collector", description: "Made a store purchase.", icon: "gift", rarity: "rare", metric: "purchases", targetCount: 1 },
  { key: "badge_veteran", title: "Arena Veteran", description: "Played many Deathrun matches.", icon: "shield", rarity: "epic", metric: "runs", targetCount: 20 },
  { key: "badge_ace", title: "Deathrun Ace", description: "Dominated as a Runner.", icon: "swords", rarity: "epic", metric: "wins", targetCount: 10 },
  { key: "badge_horde_rookie", title: "Horde Rookie", description: "Played a Horde match.", icon: "skull", rarity: "common", metric: "horde_runs", targetCount: 1 },
  { key: "badge_horde_survivor", title: "Wave Survivor", description: "Survived a Horde match.", icon: "shield", rarity: "uncommon", metric: "horde_wins", targetCount: 1 },
  { key: "badge_horde_slayer", title: "Swarm Slayer", description: "Cleared many Horde waves.", icon: "zap", rarity: "epic", metric: "horde_waves", targetCount: 50 },
  { key: "badge_comp_rookie", title: "Ranked Rookie", description: "Played Competitive 4v4.", icon: "target", rarity: "common", metric: "competitive_runs", targetCount: 1 },
  { key: "badge_comp_winner", title: "Frag Winner", description: "Won a Competitive match.", icon: "medal", rarity: "uncommon", metric: "competitive_wins", targetCount: 1 },
  { key: "badge_comp_gold", title: "Gold Ladder", description: "Reached Gold KP rank.", icon: "star", rarity: "epic", metric: "kp", targetCount: 1200 },
  { key: "badge_comp_diamond", title: "Diamond Ladder", description: "Reached Diamond KP rank.", icon: "gem", rarity: "legendary", metric: "kp", targetCount: 1600 },
  { key: "badge_messenger", title: "Messenger", description: "Sent many direct messages.", icon: "message", rarity: "rare", metric: "messages", targetCount: 10 },
  { key: "badge_vip", title: "VIP Member", description: "Active VIP subscription.", icon: "gem", rarity: "legendary", metric: "vip", targetCount: 1 },
  { key: "badge_level10", title: "Rising Star", description: "Reached level 10.", icon: "star", rarity: "epic", metric: "level", targetCount: 10 },
];

export const shopItems = [
  {
    itemName: "Neon Trail",
    itemCategory: "cosmetic",
    itemSku: "neon-trail",
    vpPrice: 500,
    imageUrl: "/shop/trail.svg",
  },
  {
    itemName: "Deathrun Cape",
    itemCategory: "cosmetic",
    itemSku: "deathrun-cape",
    vpPrice: 1200,
    imageUrl: "/shop/cape.svg",
  },
  {
    itemName: "XP Boost (1 match)",
    itemCategory: "boost",
    itemSku: "xp-boost-1",
    vpPrice: 300,
    imageUrl: "/shop/xp.svg",
  },
  {
    itemName: "VP Bundle Icon",
    itemCategory: "cosmetic",
    itemSku: "vp-bundle-icon",
    vpPrice: 800,
    imageUrl: "/shop/icon.svg",
  },
  {
    itemName: "Lobby Emote Pack",
    itemCategory: "emote",
    itemSku: "lobby-emote-pack",
    vpPrice: 650,
    imageUrl: "/shop/emote.svg",
  },
];
