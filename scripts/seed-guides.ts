import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

type SeedGuide = { title: string; summary: string; body: string; category: string };

const guides: SeedGuide[] = [
  // getting-started
  { category: 'getting-started', title: 'Welcome to Kilrun', summary: 'What Kilrun is and how the hub works.', body: 'Kilrun is a deathrun-style competitive shooter. This hub is your home base: launch the game, track your stats, manage your loadout, and follow the community — all from one dashboard.' },
  { category: 'getting-started', title: 'Creating your account', summary: 'Sign up and link Steam.', body: 'Create an account with email or link your Steam profile for one-click sign-in. Linking Steam also syncs your in-game identity with your website profile automatically.' },
  { category: 'getting-started', title: 'Launching your first match', summary: 'Using the Launch Game button.', body: 'Hit the red "Launch Game" button on the dashboard to boot the client. First-time players are dropped into a short tutorial run before joining public matchmaking.' },
  { category: 'getting-started', title: 'Understanding the dashboard', summary: 'VP balance, best score, distance, runs.', body: 'Your dashboard shows four key stats: VP balance (currency), best score, best distance, and total runs. These update live as you play.' },
  { category: 'getting-started', title: 'Setting up your profile', summary: 'Avatar, bio, and visibility options.', body: 'Head to Profile to set your avatar, write a bio, and choose what other players can see, including match history and inventory.' },

  // account-security
  { category: 'account-security', title: 'Enabling two-factor authentication', summary: 'Secure your account with 2FA.', body: 'Go to Account Settings > Security and enable 2FA using an authenticator app. This adds a required one-time code on every new login.' },
  { category: 'account-security', title: 'Linking and unlinking Steam', summary: 'Manage your Steam connection.', body: 'You can link a Steam account from Profile > Connections. Unlinking removes Steam sign-in but keeps your website account and inventory intact.' },
  { category: 'account-security', title: 'Recovering a locked account', summary: 'Steps if you cannot log in.', body: 'Use the "Forgot password" link on the login screen. If your email is no longer accessible, open a support ticket with proof of ownership.' },
  { category: 'account-security', title: 'Spotting phishing attempts', summary: 'Kilrun staff will never DM you first.', body: 'Official staff never ask for your password or send you trade links first. Report any suspicious message through Support immediately.' },
  { category: 'account-security', title: 'Managing active sessions', summary: 'See and revoke logged-in devices.', body: 'Account Settings > Sessions lists every device currently logged in. Revoke any session you do not recognize and change your password right after.' },

  // gameplay-basics
  { category: 'gameplay-basics', title: 'Core objective of a deathrun', summary: 'Survive the run, avoid traps.', body: 'One or more "runners" race through a trap-filled course while a "death" player triggers hazards. Survive to the end to win; die and you are out.' },
  { category: 'gameplay-basics', title: 'Basic controls', summary: 'Movement, jump, interact, sprint.', body: 'WASD to move, Space to jump, Shift to sprint, and E to interact with switches and doors. Controls are fully rebindable in Settings.' },
  { category: 'gameplay-basics', title: 'Reading the HUD', summary: 'Timer, health, checkpoint markers.', body: 'The HUD shows your run timer top-center, health bottom-left, and the next checkpoint marker as a waypoint arrow.' },
  { category: 'gameplay-basics', title: 'Checkpoints and respawns', summary: 'How progress is saved mid-run.', body: 'Touching a checkpoint saves your progress for that life. Dying respawns you at the last checkpoint, but running out of lives ends your run.' },
  { category: 'gameplay-basics', title: 'Playing as the Death', summary: 'Trap timing and crowd control basics.', body: 'As the Death, watch the trap panel for cooldowns and try to bait runners into predictable paths before triggering traps.' },

  // movement-tech
  { category: 'movement-tech', title: 'Bunny hopping fundamentals', summary: 'Chain jumps to build speed.', body: 'Time your jump input right as you land and steer with small mouse movements to maintain speed without losing momentum on each hop.' },
  { category: 'movement-tech', title: 'Wall-running basics', summary: 'When and how to wall-run.', body: 'Approach a wall at an angle above the minimum speed threshold and hold forward — your character automatically latches on and runs along it.' },
  { category: 'movement-tech', title: 'Slide-canceling', summary: 'Cancel slides into jumps for distance.', body: 'Crouch-slide then jump near the end of the slide to convert horizontal speed into extra jump distance, useful for gap traps.' },
  { category: 'movement-tech', title: 'Momentum-preserving turns', summary: 'Avoid losing speed on corners.', body: 'Wide, gradual turns preserve more speed than sharp corners. Strafe slightly into the turn rather than snapping your camera.' },
  { category: 'movement-tech', title: 'Advanced tech: ledge grabs', summary: 'Recovering from missed jumps.', body: 'Pressing jump just before hitting a ledge grabs it, letting you climb up instead of falling — critical on precision-jump maps.' },

  // maps
  { category: 'maps', title: 'Map rotation overview', summary: 'How maps cycle in matchmaking.', body: 'Public matchmaking rotates through the active map pool every match. Ranked uses a curated competitive pool that changes each season.' },
  { category: 'maps', title: 'Neon Docks callouts', summary: 'Key routes on Neon Docks.', body: 'Neon Docks has three main paths: the Pipeline shortcut (fast, risky), the Catwalk (safe, slower), and the Underpass (hidden, mid-risk).' },
  { category: 'maps', title: 'Skyline Ruins shortcuts', summary: 'Time-saving routes and their risks.', body: 'The rooftop skip on Skyline Ruins saves roughly four seconds but requires a precise wall-run into a ledge grab — practice in a private lobby first.' },
  { category: 'maps', title: 'Reading trap tells', summary: 'Visual and audio cues before a trap fires.', body: 'Most traps flash or emit a distinct sound cue about half a second before activating — learn each map’s tells to react in time.' },
  { category: 'maps', title: 'Community map voting', summary: 'How the map pool gets updated.', body: 'Community-submitted maps that reach a vote threshold in the Map Editor hub are reviewed by staff for rotation into public playlists.' },

  // weapons-loadouts
  { category: 'weapons-loadouts', title: 'Weapon stat basics', summary: 'Damage, fire rate, mobility trade-offs.', body: 'Every weapon balances damage, fire rate, and movement penalty. Faster weapons generally deal less damage per hit but let you keep momentum.' },
  { category: 'weapons-loadouts', title: 'Best loadout for runners', summary: 'Prioritizing mobility over firepower.', body: 'Runners benefit from lightweight sidearms that carry no movement penalty, keeping bhop chains and wall-runs intact.' },
  { category: 'weapons-loadouts', title: 'Best loadout for the Death', summary: 'Crowd control focused picks.', body: 'The Death role favors area-denial weapons with wider hit detection to punish grouped runners near chokepoints.' },
  { category: 'weapons-loadouts', title: 'Unlocking new weapons', summary: 'Level and store unlock paths.', body: 'Most weapons unlock via player level milestones; a few limited variants are purchasable in the Store with VP.' },
  { category: 'weapons-loadouts', title: 'Weapon skin compatibility', summary: 'Which skins fit which weapons.', body: 'Skins are weapon-specific. Check the skin card’s compatibility tag in your inventory before attempting to equip it.' },

  // powers-abilities
  { category: 'powers-abilities', title: 'Ability cooldown basics', summary: 'How cooldowns scale with rank.', body: 'Ability cooldowns are fixed per ability and do not scale with rank, keeping the power curve consistent across skill tiers.' },
  { category: 'powers-abilities', title: 'Combining powers effectively', summary: 'Synergy examples for runners.', body: 'Pairing a speed-boost ability with a short-invulnerability ability lets runners punch through late-run trap clusters safely.' },
  { category: 'powers-abilities', title: 'Counter-picking Death abilities', summary: 'What to bring against trap-heavy Deaths.', body: 'Against Deaths who lean on area traps, bring mobility-focused powers that let you reposition before a trap zone activates.' },
  { category: 'powers-abilities', title: 'Unlocking powers', summary: 'Progression path for the powers tree.', body: 'Powers unlock through the Progression tab as you level up; each tier requires the previous power to be equipped at least once.' },
  { category: 'powers-abilities', title: 'Power balance changes', summary: 'How and when powers get rebalanced.', body: 'Power balance patches are announced on the News feed with full changelogs before going live server-wide.' },

  // ranked-competitive
  { category: 'ranked-competitive', title: 'How ranks work', summary: 'KP, tiers, and Peak Unranked.', body: 'Ranked Points (KP) determine your tier from Unranked up to Immortal. Your "Peak" tracks the highest tier you have ever reached in a season.' },
  { category: 'ranked-competitive', title: 'Season resets explained', summary: 'What carries over between seasons.', body: 'Each season, KP soft-resets toward the middle of the ladder. Cosmetic rewards and peak rank badges are permanent and carry over.' },
  { category: 'ranked-competitive', title: 'Matchmaking basics', summary: 'How opponents are selected.', body: 'Matchmaking pairs players with similar KP and recent performance to keep matches close, with wider search ranges after longer queue times.' },
  { category: 'ranked-competitive', title: 'Climbing from Silver to Gold', summary: 'Common mistakes at low-mid ranks.', body: 'At Silver, most losses come from over-committing on unfamiliar routes. Learn two reliable safe paths per map before chasing risky shortcuts.' },
  { category: 'ranked-competitive', title: 'Ranked etiquette', summary: 'Reporting, leaving, and fair play.', body: 'Leaving ranked matches early impacts your matchmaking standing. Use the in-match report tool for rule violations instead of retaliating.' },

  // clans-teams
  { category: 'clans-teams', title: 'Creating a clan', summary: 'Requirements and setup steps.', body: 'Any player level 10+ can create a clan from the Community tab for a small VP fee. You can invite members immediately after creation.' },
  { category: 'clans-teams', title: 'Clan roles explained', summary: 'Leader, officer, member permissions.', body: 'Leaders can disband or transfer the clan, officers can invite/kick members, and members can chat and represent the clan tag in matches.' },
  { category: 'clans-teams', title: 'Clan wars overview', summary: 'Weekly clan-vs-clan competitions.', body: 'Clan wars run weekly, pitting clans against each other on aggregate ranked performance for bonus VP and exclusive clan cosmetics.' },
  { category: 'clans-teams', title: 'Finding a clan to join', summary: 'Using the clan browser.', body: 'The clan browser lets you filter by activity level, region, and open recruitment status to find a good fit.' },
  { category: 'clans-teams', title: 'Team communication tips', summary: 'Voice, ping wheel, and text chat.', body: 'Use the quick ping wheel for fast callouts mid-run when voice chat is not practical — it is faster than typing and visible to your whole team.' },

  // crates-cosmetics
  { category: 'crates-cosmetics', title: 'How crates work', summary: 'Odds, rarities, and opening crates.', body: 'Crates contain a randomized cosmetic drawn from weighted rarity tiers: common, rare, epic, and legendary. Odds are published on the Store page.' },
  { category: 'crates-cosmetics', title: 'Rarity tiers explained', summary: 'Common through legendary breakdown.', body: 'Common drops are most frequent and cheapest to trade; legendary items are the rarest and often carry unique visual or sound effects.' },
  { category: 'crates-cosmetics', title: 'Duplicate protection', summary: 'What happens when you unbox a dupe.', body: 'Duplicate cosmetics are automatically converted into a partial VP refund rather than cluttering your inventory.' },
  { category: 'crates-cosmetics', title: 'Trading cosmetics', summary: 'Safe trading practices.', body: 'Only trade through the official Trade panel, which escrows both sides of the deal. Never trade outside the platform.' },
  { category: 'crates-cosmetics', title: 'Equipping skins', summary: 'Loadout slots and preview.', body: 'Open Inventory, select a skin, and hit Equip. Use the 3D preview to check how it looks before confirming.' },

  // store-economy
  { category: 'store-economy', title: 'What is VP?', summary: 'Kilrun\'s in-platform currency.', body: 'VP (Victory Points) is earned through matches, missions, and events, or purchased. It is used to buy crates, cosmetics, and clan features.' },
  { category: 'store-economy', title: 'Earning VP for free', summary: 'Matches, missions, and dailies.', body: 'You earn VP from completing matches, finishing daily missions, and leveling up. No purchase is required to earn cosmetics over time.' },
  { category: 'store-economy', title: 'Understanding fire sales', summary: 'Limited-time discounted items.', body: 'Fire sale items show a countdown timer and a reduced VP price. Once the timer ends, the price reverts and the listing may disappear.' },
  { category: 'store-economy', title: 'Refund policy', summary: 'When purchases can be reversed.', body: 'Accidental purchases can be refunded within 24 hours via Support if the item has not been equipped or traded.' },
  { category: 'store-economy', title: 'Store sorting and filters', summary: 'Finding items fast.', body: 'Use the Store tabs and sort dropdown to filter by category, price, or newest to quickly find what you are looking for.' },

  // progression-xp
  { category: 'progression-xp', title: 'How XP is earned', summary: 'Match completion, missions, bonuses.', body: 'XP is awarded for completing runs, finishing missions, and first-win-of-the-day bonuses. Ranked matches grant slightly more XP than casual.' },
  { category: 'progression-xp', title: 'Leveling and rewards', summary: 'What each level unlocks.', body: 'Every few levels unlock a new weapon, power, or cosmetic slot. Check the Progression tab to preview upcoming unlocks.' },
  { category: 'progression-xp', title: 'Prestige system', summary: 'Resetting level for prestige rewards.', body: 'At max level, you can prestige to reset your level in exchange for an exclusive badge and a permanent small XP bonus.' },
  { category: 'progression-xp', title: 'XP boosts', summary: 'Temporary multipliers from events or Store.', body: 'XP boosts stack additively and apply automatically to all matches while active — check your active boosts in the Profile panel.' },
  { category: 'progression-xp', title: 'Tracking your stats over time', summary: 'Using the stats history page.', body: 'The stats history page graphs your XP, best score, and win rate over the last 30 days so you can track improvement.' },

  // missions-events
  { category: 'missions-events', title: 'Daily missions overview', summary: 'How the 0/7 tracker works.', body: 'Daily missions refresh at midnight UTC and reward VP and XP. Completing all seven grants a bonus crate.' },
  { category: 'missions-events', title: 'Weekly challenges', summary: 'Longer-term goals with bigger rewards.', body: 'Weekly challenges reset every Monday and typically require several matches or a specific playstyle, offering larger VP payouts than dailies.' },
  { category: 'missions-events', title: 'Limited-time events', summary: 'Seasonal modes and exclusive drops.', body: 'Seasonal events introduce temporary game modes and event-exclusive cosmetics that are removed from the Store once the event ends.' },
  { category: 'missions-events', title: 'Event leaderboards', summary: 'Competing for top event rewards.', body: 'Event leaderboards track a special scoring metric for the event\'s duration; top finishers receive unique, non-repeatable rewards.' },
  { category: 'missions-events', title: 'Missing a mission deadline', summary: 'What happens to unclaimed rewards.', body: 'Unclaimed daily or weekly rewards expire at reset and cannot be recovered, so claim progress before the timer runs out.' },

  // anticheat-fairplay
  { category: 'anticheat-fairplay', title: 'What is Pulsar?', summary: 'Kilrun\'s anti-cheat system.', body: 'Pulsar is Kilrun\'s client-side anti-cheat. Activating it before a match is required for ranked play and helps keep matches fair.' },
  { category: 'anticheat-fairplay', title: 'Activating Pulsar', summary: 'How to turn it on before matches.', body: 'Click "Press to activate anticheat" on your dashboard before queuing for ranked. It stays active for the length of your session.' },
  { category: 'anticheat-fairplay', title: 'Reporting a cheater', summary: 'Using the in-match report tool.', body: 'Open the scoreboard during or after a match and select Report on the suspected player, choosing the most accurate violation category.' },
  { category: 'anticheat-fairplay', title: 'Ban appeal process', summary: 'How to contest an anti-cheat ban.', body: 'Submit an appeal through Support with your account details. Appeals are reviewed by staff and typically resolved within a few business days.' },
  { category: 'anticheat-fairplay', title: 'Fair play guidelines', summary: 'What counts as an exploit.', body: 'Using unintended geometry glitches, macro scripts, or third-party overlays that read game memory is prohibited under the fair play policy.' },

  // community-social
  { category: 'community-social', title: 'Using the forums', summary: 'Categories and posting etiquette.', body: 'The forums are split into General, Strategy, Bug Reports, and Off-Topic. Keep posts on-topic for their category to help others find them.' },
  { category: 'community-social', title: 'Friends and party invites', summary: 'Adding friends and queuing together.', body: 'Search for a player and send a friend request from their profile. Once friends, you can invite them into a party to queue together.' },
  { category: 'community-social', title: 'Live chat guidelines', summary: 'Keeping the hub chat welcoming.', body: 'Live chat is moderated. Keep discussion friendly and on-topic; harassment or spam results in a timeout or mute.' },
  { category: 'community-social', title: 'Following other players', summary: 'Tracking friends\' activity feed.', body: 'Following a player surfaces their match highlights and achievements in your activity feed without requiring a friend request.' },
  { category: 'community-social', title: 'Content creator program', summary: 'How to apply and benefits.', body: 'Active creators can apply through Support for the creator program, unlocking early patch notes access and a profile creator badge.' },

  // map-editor
  { category: 'map-editor', title: 'Getting started with the Map Editor', summary: 'Opening the editor and basic tools.', body: 'Launch the Map Editor from the game menu. Start with the block tool to lay out basic geometry before adding traps and checkpoints.' },
  { category: 'map-editor', title: 'Placing checkpoints correctly', summary: 'Spacing and trigger volume tips.', body: 'Space checkpoints evenly so a single death does not erase excessive progress. Trigger volumes should slightly overlap the walkable path.' },
  { category: 'map-editor', title: 'Mesh-fit collision baking', summary: 'Generating accurate collision for custom meshes.', body: 'Use the "Bake collision" action after importing custom meshes so collision hugs the visual geometry instead of using a rough bounding box.' },
  { category: 'map-editor', title: 'Snapping and grid settings', summary: 'Precision placement tools.', body: 'Toggle grid snap in the editor toolbar to align pieces cleanly; hold the modifier key to temporarily disable snapping for fine adjustments.' },
  { category: 'map-editor', title: 'Publishing your map', summary: 'Submitting for community voting.', body: 'Once your map passes the built-in validation check, publish it to the community hub where players can vote it into rotation.' },

  // moderation-support
  { category: 'moderation-support', title: 'Opening a support ticket', summary: 'What info to include.', body: 'Include your username, the approximate time of the issue, and screenshots when opening a ticket for the fastest resolution.' },
  { category: 'moderation-support', title: 'Understanding ban tiers', summary: 'Warning, temporary, and permanent bans.', body: 'Violations escalate from warnings to temporary suspensions and finally permanent bans for repeated or severe rule-breaking.' },
  { category: 'moderation-support', title: 'Staff roles explained', summary: 'Admin, moderator, and support agent.', body: 'Admins manage platform-wide settings, moderators handle in-game and chat conduct, and support agents resolve account and billing tickets.' },
  { category: 'moderation-support', title: 'Response time expectations', summary: 'How long tickets typically take.', body: 'Most tickets receive a first response within 24-48 hours. Account security issues are prioritized and handled faster.' },
  { category: 'moderation-support', title: 'Appealing a chat mute', summary: 'Process for contesting chat penalties.', body: 'Chat mutes can be appealed from the Notifications panel by selecting the penalty and submitting a brief explanation for review.' },

  // troubleshooting
  { category: 'troubleshooting', title: 'Game fails to launch', summary: 'Common fixes for launch issues.', body: 'Try restarting the launcher, verifying your internet connection, and checking the Support status page for ongoing outages before reinstalling.' },
  { category: 'troubleshooting', title: 'Fixing high ping', summary: 'Reducing latency in matches.', body: 'Close bandwidth-heavy background apps, prefer a wired connection, and choose the closest matchmaking region in Settings.' },
  { category: 'troubleshooting', title: 'Resolving login errors', summary: 'Session and authentication issues.', body: 'Clear cached credentials and log in again. If the issue persists, check whether Steam linking has been affected by a recent password change.' },
  { category: 'troubleshooting', title: 'Graphics glitches and crashes', summary: 'Driver and settings checks.', body: 'Update your GPU drivers first, then lower graphics settings if crashes continue, and report persistent issues with your system specs attached.' },
  { category: 'troubleshooting', title: 'Missing purchased items', summary: 'What to do if a purchase did not appear.', body: 'Refresh your inventory first — sync can take a minute after purchase. If the item is still missing, open a support ticket with your order ID.' },
];

async function main() {
  let created = 0;
  for (const g of guides) {
    const existing = await prisma.guide.findFirst({ where: { title: g.title } });
    if (existing) continue;
    await prisma.guide.create({
      data: {
        title: g.title,
        summary: g.summary,
        body: g.body,
        category: g.category,
        published: true,
      },
    });
    created++;
  }
  console.log(`Seeded ${created} new guides (${guides.length} total defined).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
