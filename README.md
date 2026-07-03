# 🎧 Splitify: AI-Powered Playlist Router

Splitify is an open-source, AI-driven web application that intelligently splits your massive, chaotic Spotify playlists into highly curated sub-playlists. Powered by an LLM Agent, it goes beyond traditional sorting by understanding genres, languages, ethnicities, and custom "vibes."

## 🚀 Features

* **AI Vibe Routing:** Group tracks based on semantic instructions, custom genres, or abstract moods (e.g., "Late Night Coding," "Old School Reggaeton").
* **Deep Spotify Integration:** Directly fetches your library and creates new playlists right in your account.
* **Flexible Parameters:** Allow tracks to overlap in multiple playlists, strictly isolate them, or group them by linguistic/ethnic origins.
* **Self-Hosted & Private:** Designed for personal deployment to easily comply with Spotify's Development Mode API limits.

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, Tailwind CSS
* **Language:** TypeScript
* **Database:** PostgreSQL / SQLite (Prisma ORM recommended)
* **AI Engine:** Google Gemini API (Configurable model versions)
* **Integration:** Spotify Web API

## ⚙️ How it Works

1.  **Auth:** The user logs in via Spotify OAuth.
2.  **Fetch:** The app retrieves the target playlist's tracklist and rich metadata (Audio Features, Genres, etc.).
3.  **Prompt:** The user defines the destination parameters (e.g., target vibes, rules for overlapping).
4.  **Agent Processing:** The Gemini LLM parses the track array, applies the user's logic, and outputs a structured JSON mapping of tracks to their new playlists.
5.  **Execution:** Splitify pushes the new structure back to Spotify, generating the new playlists instantly.

## 📦 Getting Started (Local Development)

Since Spotify restricts API access in Development Mode, you need to use your own Developer Credentials.

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/splitify.git](https://github.com/yourusername/splitify.git)