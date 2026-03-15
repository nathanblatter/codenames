import express from "express";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import "dotenv/config";
import OpenAI from "openai";
import { Pool } from 'pg';     // <--- Added for DB
import bcrypt from 'bcrypt';   // <--- Added for security

// --- Environment Setup ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// --- Database Configuration ---
const pool = new Pool({
  // Make sure DATABASE_URL is in your .env file
  connectionString: process.env.DATABASE_URL,
  
});

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const client = new OpenAI({ apiKey });
const games = new Map();
const GAME_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

app.use(express.json());

// --- Memory Leak Fix: Cleanup Old Games ---
function cleanupGames() {
  const now = Date.now();
  for (const [id, game] of games.entries()) {
    if (now - game.createdAt > GAME_TTL_MS) {
      games.delete(id);
      console.log(`Deleted expired game: ${id}`);
    }
  }
}
// Run cleanup every 1 hour
setInterval(cleanupGames, 1000 * 60 * 60);


// --- Helper Functions (shuffle, generateTypes, schemas) ---
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateTypes() {
  const startingTeam = Math.random() < 0.5 ? "blue" : "red";
  const blueCount = startingTeam === "blue" ? 9 : 8;
  const redCount  = startingTeam === "red"  ? 9 : 8;
  const types = [...Array(blueCount).fill("blue"), ...Array(redCount).fill("red"), ...Array(7).fill("neutral"), "assassin"];
  const startingPlayer = blueCount > redCount ? "blue" : "red";
  return  { types: shuffle(types), startingPlayer };
}

const wordsSchema = { type: "object", properties: { words: { type: "array", items: { type: "string" }, minItems: 25, maxItems: 25 }}, required: ["words"], additionalProperties: false };
const hintSchema = { type: "object", properties: { hint: { type: "string" }, count: { type: "number" }}, required: ["hint", "count"], additionalProperties: false };


async function saveGameHistory(game) {
  try {
    await pool.query(
      `INSERT INTO game_history (id, words, types, winner, adult_mode, created_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET winner = $4, ended_at = NOW()`,
      [game.id, JSON.stringify(game.words), JSON.stringify(game.types), game.winner || null, game.adultMode, new Date(game.createdAt)]
    );
  } catch (err) {
    console.error('Failed to save game history:', err);
  }
}

async function requireAdmin(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (!result.rows.length || !result.rows[0].is_admin) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

async function startServer() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS themes (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  let vite;
  if (!isProd) {
    // --- DEVELOPMENT MODE ---
    vite = await (await import('vite')).createServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: __dirname,
    });
    app.use(vite.middlewares);
  } else {
    // --- PRODUCTION MODE ---
    app.use(express.static(path.join(__dirname, 'dist/client'), { index: false }));
    console.log("Production mode: serving static files from /dist/client");
  }

  // ==========================================
  // --- AUTH ROUTES (NEW) ---
  // ==========================================
  
  // Public registration is disabled - user creation is admin-only
  app.post("/auth/register", (req, res) => {
    res.status(403).json({ error: "Registration is disabled. Contact an admin." });
  });

  // 2. LOGIN
  app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });

      res.json({ id: user.id, username: user.username, isAdmin: user.is_admin });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ==========================================
  // --- GAME ROUTES (EXISTING) ---
  // ==========================================

  app.post("/game/new", async (req, res) => {
    try {
      const { aiTeam, hideOpponent = false, adultMode = true, themeId = null, timerSeconds = null } = req.body;

      const recentGames = await pool.query(
        "SELECT words FROM game_history ORDER BY created_at DESC LIMIT 3"
      );
      const recentWords = recentGames.rows.flatMap(r =>
        Array.isArray(r.words) ? r.words : JSON.parse(r.words)
      );
      const avoidClause = recentWords.length > 0
        ? "Do NOT use any of these words from recent games: " + recentWords.join(", ") + ".\n"
        : "";

      let themeClause = "";
      if (themeId) {
        try {
          const themeResult = await pool.query("SELECT name, description FROM themes WHERE id = $1", [themeId]);
          if (themeResult.rows.length) {
            const t = themeResult.rows[0];
            themeClause = `Theme for this game: "${t.name}" — ${t.description}. Prefer words that connect to this theme.\n`;
          }
        } catch {}
      }

      const wordPrompt = adultMode
        ? "Generate a list of 25 Codenames-style words. Follow these rules:\n" +
          avoidClause +
          themeClause +
          "Adult themes are encouraged - sex, drugs, violence, etc. are all allowed as all players are adults.\n" +
          "USE CITIES, COUNTRIES, AND BRANDS AS NEEDED.\n" +
          "Single words only. No phrases, no hyphens.\n" +
          "Concrete nouns preferred. Avoid abstract concepts (no justice, freedom, etc.).\n" +
          "Each word must have multiple meanings or be interpretable in different contexts.\n" +
          "No proper nouns unless extremely common (good: Amazon, Mercury, Barcelona, Nike, ChatGPT).\n" +
          "Mix physical objects, animals, locations, occupations, and ambiguous nouns.\n" +
          "Return the final output as a numbered list of 25 words only with no explanation."
        : "Generate a list of 25 Codenames-style words suitable for all ages. Follow these rules:\n" +
          avoidClause +
          themeClause +
          "Keep all words clean and family-friendly - no adult content, violence, drugs, or anything inappropriate.\n" +
          "USE CITIES, COUNTRIES, AND BRANDS AS NEEDED.\n" +
          "Single words only. No phrases, no hyphens.\n" +
          "Concrete nouns preferred. Avoid abstract concepts (no justice, freedom, etc.).\n" +
          "Each word must have multiple meanings or be interpretable in different contexts.\n" +
          "No proper nouns unless extremely common (good: Amazon, Mercury, Barcelona, Nike).\n" +
          "Mix physical objects, animals, locations, occupations, and ambiguous nouns.\n" +
          "Return the final output as a numbered list of 25 words only with no explanation.";

      const words1 = await client.responses.create({
        model: "gpt-4o-mini",
        input: wordPrompt,
        text: { format: { "type": "json_schema", "name": "codenames_words", "schema": wordsSchema}},
        temperature: 1.5
        
      });
      console.log("words response:", words1.output_text);
      const payload = JSON.parse(words1.output_text);
      const words = payload.words;
      
      const { types, startingPlayer } = generateTypes();
      const id = "g_" + Math.random().toString(36).slice(2);
      const revealed = Array(25).fill(false);
      const game = { id, words, types, revealed, aiTeam, startingPlayer, currentTurn: startingPlayer, turnDuration: timerSeconds ? timerSeconds * 1000 : null, turnStartedAt: Date.now(), moveHistory: [], hideOpponent: !!hideOpponent, adultMode: !!adultMode, createdAt: Date.now() };
      games.set(id, game);
      res.json(game);
    } catch (err) { 
      console.error("new game error:", err); 
      res.status(500).json({ error: "Failed to create game" }); 
    }
  });

  app.post("/game/:id/hint", async (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    const { team } = req.body;
    const { words, types, revealed } = g;
    const opponentTeam = team === 'blue' ? 'red' : 'blue';
    const boardState = words.map((word, i) => ({ word, type: types[i], revealed: revealed[i] }));
    const myWords = boardState.filter(c => c.type === team && !c.revealed).map(c => c.word);
    const opponentWords = boardState.filter(c => c.type === opponentTeam && !c.revealed).map(c => c.word);
    const neutralWords = boardState.filter(c => c.type === 'neutral' && !c.revealed).map(c => c.word);
    const assassinWord = boardState.find(c => c.type === 'assassin' && !c.revealed)?.word;
    const prompt = `You are the spymaster for the ${team} team... Your team's words are: ${myWords.join(", ")}. Opponent's words are: ${opponentWords.join(", ")}. Neutral words are: ${neutralWords.join(", ")}. The assassin is: ${assassinWord}. Return JSON.`;
    try {
      const hintResponse = await client.responses.create({
        model: "gpt-4o",
        input: prompt,
        text: { format: { type: "json_schema", name: "codenames_hint", schema: hintSchema } }
      });
      const hintPayload = JSON.parse(hintResponse.output_text);
      res.json(hintPayload);
    } catch (err) { console.error("AI hint error:", err); res.status(500).json({ error: "Failed to get AI hint" }); }
  });

  app.get("/game/:id", (req, res) => {
    const g = games.get(req.params.id);
    if (g) res.json(g);
    else res.status(404).json({ error: "not found" });
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.post("/game/:id/abandon", async (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    if (!g.winner) await saveGameHistory(g); // save as no contest (winner stays null)
    res.json({ success: true });
  });

  app.patch("/game/:id/pass-turn", (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    const { fromTeam } = req.body || {};
    if (fromTeam && g.currentTurn !== fromTeam) {
      return res.json({ currentTurn: g.currentTurn, turnStartedAt: g.turnStartedAt });
    }
    g.currentTurn = g.currentTurn === 'blue' ? 'red' : 'blue';
    g.turnStartedAt = Date.now();
    res.json({ currentTurn: g.currentTurn, turnStartedAt: g.turnStartedAt });
  });

  app.patch("/game/:id/hide-opponent", (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    g.hideOpponent = !!req.body.hideOpponent;
    res.json({ hideOpponent: g.hideOpponent });
  });

  app.patch("/game/:id/reveal", async (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });
    const { index, team } = req.body;
    if (typeof index !== "number" || index < 0 || index >= 25)
      return res.status(400).json({ error: "invalid index" });
    g.revealed[index] = true;
    g.moveHistory.push({ index, word: g.words[index], type: g.types[index], team, correct: g.types[index] === team, timestamp: Date.now() });

    // Win detection
    if (!g.winner) {
      if (g.types[index] === 'assassin' && team) {
        // The team that revealed the assassin loses
        g.winner = team === 'blue' ? 'red' : 'blue';
      } else {
        const allBlueRevealed = g.types.every((t, i) => t !== 'blue' || g.revealed[i]);
        const allRedRevealed = g.types.every((t, i) => t !== 'red' || g.revealed[i]);
        if (allBlueRevealed) g.winner = 'blue';
        else if (allRedRevealed) g.winner = 'red';
      }
      if (g.winner) await saveGameHistory(g);
    }

    res.json({ revealed: g.revealed, winner: g.winner || null });
  });

  app.get("/game/:id/spymaster/:team", (req, res) => {
    const g = games.get(req.params.id);
    if (!g) return res.status(404).json({ error: "not found" });

    const team = req.params.team;
    const spymasterTypes = g.types.map(t =>
      (t === team || t === 'assassin' || t === 'neutral') ? t : 'neutral'
    );

    res.json({ id: g.id, words: g.words, types: spymasterTypes, fullTypes: g.types, revealed: g.revealed, hideOpponent: g.hideOpponent, team, currentTurn: g.currentTurn, startingPlayer: g.startingPlayer, turnDuration: g.turnDuration, turnStartedAt: g.turnStartedAt });
  });

  // ==========================================
  // --- ADMIN ROUTES ---
  // ==========================================

  app.get("/admin/users", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/admin/users/:id/toggle-admin", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        "UPDATE users SET is_admin = NOT is_admin WHERE id = $1 RETURNING id, username, is_admin",
        [req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "User not found" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
    const requestingUserId = req.headers['x-user-id'];
    if (String(req.params.id) === String(requestingUserId))
      return res.status(400).json({ error: "Cannot delete yourself" });
    try {
      await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.post("/admin/users", requireAdmin, async (req, res) => {
    const { username, password, isAdmin = false } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });
    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin, created_at",
        [username, hash, isAdmin]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: "Username taken" });
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/admin/users/:id", requireAdmin, async (req, res) => {
    const { username, password, isAdmin } = req.body;
    const requestingUserId = req.headers['x-user-id'];
    try {
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hash, req.params.id]);
      }
      if (username) {
        await pool.query("UPDATE users SET username = $1 WHERE id = $2", [username, req.params.id]);
      }
      // Prevent removing your own admin
      if (typeof isAdmin === 'boolean' && String(req.params.id) !== String(requestingUserId)) {
        await pool.query("UPDATE users SET is_admin = $1 WHERE id = $2", [isAdmin, req.params.id]);
      }
      const result = await pool.query(
        "SELECT id, username, is_admin, created_at FROM users WHERE id = $1",
        [req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: "Username taken" });
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/admin/games", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, words, types, winner, adult_mode, created_at, ended_at FROM game_history ORDER BY ended_at DESC LIMIT 100"
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch game history" });
    }
  });

  app.put("/admin/games/:id", requireAdmin, async (req, res) => {
    const { words, types, winner } = req.body;
    try {
      const result = await pool.query(
        "UPDATE game_history SET words = $1, types = $2, winner = $3 WHERE id = $4 RETURNING *",
        [JSON.stringify(words), JSON.stringify(types), winner || null, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Game not found" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Failed to update game" });
    }
  });

  app.delete("/admin/games/:id", requireAdmin, async (req, res) => {
    try {
      await pool.query("DELETE FROM game_history WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete game" });
    }
  });

  // Public themes list (for settings dropdown)
  app.get("/themes", async (req, res) => {
    try {
      const result = await pool.query("SELECT id, name, description FROM themes ORDER BY name");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.get("/admin/themes", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM themes ORDER BY name");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.post("/admin/themes", requireAdmin, async (req, res) => {
    const { name, description } = req.body;
    if (!name || !description) return res.status(400).json({ error: "Name and description required" });
    try {
      const result = await pool.query(
        "INSERT INTO themes (name, description) VALUES ($1, $2) RETURNING *",
        [name, description]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: "Theme name already exists" });
      res.status(500).json({ error: "Failed to create theme" });
    }
  });

  app.put("/admin/themes/:id", requireAdmin, async (req, res) => {
    const { name, description } = req.body;
    try {
      const result = await pool.query(
        "UPDATE themes SET name = $1, description = $2 WHERE id = $3 RETURNING *",
        [name, description, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Theme not found" });
      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: "Theme name already exists" });
      res.status(500).json({ error: "Failed to update theme" });
    }
  });

  app.delete("/admin/themes/:id", requireAdmin, async (req, res) => {
    try {
      await pool.query("DELETE FROM themes WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete theme" });
    }
  });

  // --- SSR Handler ---
  app.use("/", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const templatePath = isProd
        ? path.join(__dirname, 'dist/client/index.html')
        : path.join(__dirname, 'client/index.html');
      
      let template = fs.readFileSync(templatePath, "utf-8");
      let render;

      if (!isProd) {
        template = await vite.transformIndexHtml(url, template);
        const serverEntry = await vite.ssrLoadModule("client/entry-server.jsx");
        render = serverEntry.render;
      } else {
        const serverEntryPath = path.join(__dirname, 'dist/server/entry-server.js');
        const serverEntry = await import(serverEntryPath);
        render = serverEntry.render;
      }

      const appHtml = await render(url);
      const html = template.replace(``, appHtml?.html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      if (vite) vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(port, () => {
    console.log(`Express server running on *:${port}`);
  });
}

startServer();