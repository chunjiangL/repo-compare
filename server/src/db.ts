import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "history.db");

// Ensure data dir exists
import { mkdirSync } from "fs";
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
 CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  urls TEXT NOT NULL,
  repos TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  analyses TEXT,
  comparison TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
 CREATE INDEX IF NOT EXISTS idx_history_user_status ON history(user_id, status);
`);

export interface HistoryRow {
 id: string;
 user_id: string;
 urls: string;
 repos: string;
 status: "completed" | "queued";
 analyses: string | null;
 comparison: string | null;
 created_at: string;
 updated_at: string;
}

export function getHistory(userId: string): HistoryRow[] {
 return db
  .prepare("SELECT * FROM history WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50")
  .all(userId) as HistoryRow[];
}

export function getEntry(id: string, userId: string): HistoryRow | undefined {
 return db
  .prepare("SELECT * FROM history WHERE id = ? AND user_id = ?")
  .get(id, userId) as HistoryRow | undefined;
}

export function addQueued(userId: string, urls: string[], repos: string[]): HistoryRow {
 const id = crypto.randomUUID();
 db.prepare(`
  INSERT INTO history (id, user_id, urls, repos, status)
  VALUES (?, ?, ?, ?, 'queued')
 `).run(id, userId, JSON.stringify(urls), JSON.stringify(repos));
 return getEntry(id, userId)!;
}

export function addCompleted(
 userId: string,
 urls: string[],
 repos: string[],
 analyses: unknown,
 comparison: unknown,
): HistoryRow {
 const id = crypto.randomUUID();
 const urlsJson = JSON.stringify(urls);
 const reposJson = JSON.stringify(repos);
 const analysesJson = JSON.stringify(analyses);
 const comparisonJson = comparison ? JSON.stringify(comparison) : null;

 // Upsert: if same user+urls combo exists, update it
 const existing = db
  .prepare("SELECT id FROM history WHERE user_id = ? AND urls = ?")
  .get(userId, urlsJson) as { id: string } | undefined;

 if (existing) {
  db.prepare(`
   UPDATE history SET status = 'completed', analyses = ?, comparison = ?, updated_at = datetime('now')
   WHERE id = ?
  `).run(analysesJson, comparisonJson, existing.id);
  return getEntry(existing.id, userId)!;
 }

 db.prepare(`
  INSERT INTO history (id, user_id, urls, repos, status, analyses, comparison)
  VALUES (?, ?, ?, ?, 'completed', ?, ?)
 `).run(id, userId, urlsJson, reposJson, analysesJson, comparisonJson);
 return getEntry(id, userId)!;
}

export function deleteEntry(id: string, userId: string): boolean {
 const result = db
  .prepare("DELETE FROM history WHERE id = ? AND user_id = ?")
  .run(id, userId);
 return result.changes > 0;
}
