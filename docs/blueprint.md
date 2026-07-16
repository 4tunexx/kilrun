# Kilrun Platform Blueprint

## 1. Project Vision
Kilrun is a high-performance gaming hub and "Deathrun" arcade experience. It serves as both a community ecosystem for competitive players and a launcher for the Kilrun game itself. The platform is designed for cross-platform accessibility, ensuring a premium experience on desktop, tablet, and mobile devices.

## 2. Core Gameplay: Kilrun Prototype
The heart of the platform is an integrated, high-speed 3D-perspective runner.
- **Objective:** Survive an infinite procedural obstacle course, collecting score and distance while managing 3 lives.
- **Visual Style:** Neon-cyberpunk arcade aesthetics with a dark, high-contrast palette.
- **Cross-Platform Controls:**
    - **PC:** Mouse-look (Camera Yaw) with Pointer Lock for immersive control + WASD/Arrow keys for strafing and speed manipulation.
    - **Mobile/Tablet:** Dynamic Dual-Joystick system. Joysticks only appear when the user touches and holds the screen.
        - **Left Zone:** Camera/Rotation control.
        - **Right Zone:** Movement/Strafe control.
- **Game Features:** Real-time scoring, distance tracking, health system, and a "Wasted" death screen with XP rewards.

## 3. Player Experience & Hub Features
- **Dashboard (Home):** A central hub displaying player stats (Last Played, Gems, Time, Achievements), live match scores, and a global community chat.
- **Store:** A virtual marketplace for purchasing weapon skins, bundles, and character outfits using in-game currency (VP).
- **Progression System:** 
    - **Ranks:** A ladder system ranging from Silver to Immortal.
    - **Missions:** Daily, Weekly, and Event-based tasks (e.g., "Get 20 Headshots").
    - **Badges/Achievements:** Unlockable markers of skill and dedication.
- **Statistics:** In-depth performance tracking including K/D ratios, weapon accuracy, and map-specific win rates using Recharts.

## 4. Social & Community
- **Friends System:** Real-time status tracking (Online, In-Game, Away) with party invite and private messaging capabilities.
- **Community Hub:**
    - **Forums:** Nested discussions for strategies and meta-talk.
    - **News:** Official patch notes and map release updates.
    - **Clans:** Team-based rankings and member management.
    - **Events:** Prize-pool tournaments and community cups.
- **Notifications:** A centralized system for friend requests, rewards, and security alerts.

## 5. Admin & Moderator Suite
A powerful command center for platform operators:
- **Dashboard:** High-level metrics for online players, active matches, and revenue.
- **User Management:** Searchable player database with capabilities to ban, message, or award items.
- **Shop Management:** Full CRUD (Create, Read, Update, Delete) access to store items and pricing.
- **Content Engine:** 
    - **Dynamic Creation:** Build missions, achievements, and badges using 40+ logic triggers (e.g., `game_kills_total`, `meta_login_consecutive`).
    - **Rank Editor:** Define XP thresholds and upload custom rank iconography.
- **Site Management:** Control the public landing page branding, hero banners, and logo directly from the UI.
- **Support Desk:** Ticket-based system for resolving player issues.

## 6. Technical Stack
- **Framework:** Next.js 15 (App Router).
- **Styling:** Tailwind CSS with ShadCN UI components.
- **Icons:** Lucide React.
- **Data Visualization:** Recharts.
- **Game Engine:** Custom HTML5 Canvas-based pseudo-3D engine.