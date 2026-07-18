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
    imageUrl: "https://placehold.co/400x400/0f172a/ef4444/png?text=Neon+Trail",
  },
  {
    itemName: "Deathrun Cape",
    itemCategory: "cosmetic",
    itemSku: "deathrun-cape",
    vpPrice: 1200,
    imageUrl: "https://placehold.co/400x400/0f172a/f59e0b/png?text=Cape",
  },
  {
    itemName: "XP Boost (1 match)",
    itemCategory: "boost",
    itemSku: "xp-boost-1",
    vpPrice: 300,
    imageUrl: "https://placehold.co/400x400/0f172a/22c55e/png?text=XP+Boost",
  },
  {
    itemName: "VP Bundle Icon",
    itemCategory: "cosmetic",
    itemSku: "vp-bundle-icon",
    vpPrice: 800,
    imageUrl: "https://placehold.co/400x400/0f172a/38bdf8/png?text=VP+Icon",
  },
  {
    itemName: "Lobby Emote Pack",
    itemCategory: "emote",
    itemSku: "lobby-emote-pack",
    vpPrice: 650,
    imageUrl: "https://placehold.co/400x400/0f172a/a855f7/png?text=Emote",
  },
];
