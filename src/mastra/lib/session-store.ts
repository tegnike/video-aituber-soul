import { createClient, Client } from '@libsql/client';
import { randomUUID } from 'crypto';

// 型定義
export interface Session {
  id: string;
  streamTitle: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Conversation {
  id?: number;
  sessionId: string;
  username: string;
  comment: string;
  response: string;
  timestamp: string;
}

export interface Viewer {
  id?: number;
  sessionId: string;
  username: string;
  usernameReading: string;
}

// DB クライアント
let client: Client | null = null;
let initialized = false;

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: 'file:../mastra.db',
    });
  }
  return client;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await initializeTables();
  initialized = true;
}

// テーブル初期化
export async function initializeTables(): Promise<void> {
  const db = getClient();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      stream_title TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      response TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS viewers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      username TEXT NOT NULL,
      username_reading TEXT NOT NULL,
      UNIQUE(session_id, username),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);
}

// セッション操作
export async function startSession(streamTitle: string): Promise<string> {
  await ensureInitialized();
  const db = getClient();

  const id = randomUUID();
  const startedAt = new Date().toISOString();

  await db.execute({
    sql: 'INSERT INTO sessions (id, stream_title, started_at) VALUES (?, ?, ?)',
    args: [id, streamTitle, startedAt],
  });

  return id;
}

export async function endSession(sessionId: string): Promise<void> {
  await ensureInitialized();
  const db = getClient();
  const endedAt = new Date().toISOString();

  await db.execute({
    sql: 'UPDATE sessions SET ended_at = ? WHERE id = ?',
    args: [endedAt, sessionId],
  });
}

export async function getSession(sessionId: string): Promise<Session | null> {
  await ensureInitialized();
  const db = getClient();

  const result = await db.execute({
    sql: 'SELECT id, stream_title, started_at, ended_at FROM sessions WHERE id = ?',
    args: [sessionId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as string,
    streamTitle: row.stream_title as string,
    startedAt: row.started_at as string,
    endedAt: row.ended_at as string | null,
  };
}

export async function getOrCreateSession(
  sessionId: string,
  streamTitle: string = '配信',
): Promise<Session> {
  await ensureInitialized();
  const db = getClient();

  // 既存セッションを確認
  const existing = await getSession(sessionId);
  if (existing) {
    return existing;
  }

  // 新規作成
  const startedAt = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO sessions (id, stream_title, started_at) VALUES (?, ?, ?)',
    args: [sessionId, streamTitle, startedAt],
  });

  return {
    id: sessionId,
    streamTitle,
    startedAt,
    endedAt: null,
  };
}

// 視聴者操作
export async function getViewer(
  sessionId: string,
  username: string,
): Promise<Viewer | null> {
  await ensureInitialized();
  const db = getClient();

  const result = await db.execute({
    sql: 'SELECT id, session_id, username, username_reading FROM viewers WHERE session_id = ? AND username = ?',
    args: [sessionId, username],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    username: row.username as string,
    usernameReading: row.username_reading as string,
  };
}

export async function addViewer(
  sessionId: string,
  username: string,
  usernameReading: string,
): Promise<void> {
  await ensureInitialized();
  const db = getClient();

  await db.execute({
    sql: 'INSERT OR IGNORE INTO viewers (session_id, username, username_reading) VALUES (?, ?, ?)',
    args: [sessionId, username, usernameReading],
  });
}

export async function getAllViewers(sessionId: string): Promise<Viewer[]> {
  await ensureInitialized();
  const db = getClient();

  const result = await db.execute({
    sql: 'SELECT id, session_id, username, username_reading FROM viewers WHERE session_id = ?',
    args: [sessionId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    sessionId: row.session_id as string,
    username: row.username as string,
    usernameReading: row.username_reading as string,
  }));
}

// 会話履歴操作
export async function addConversation(
  sessionId: string,
  username: string,
  comment: string,
  response: string,
): Promise<void> {
  await ensureInitialized();
  const db = getClient();
  const timestamp = new Date().toISOString();

  await db.execute({
    sql: 'INSERT INTO conversations (session_id, username, comment, response, timestamp) VALUES (?, ?, ?, ?, ?)',
    args: [sessionId, username, comment, response, timestamp],
  });

  // 100件を超えた古い履歴を削除
  await db.execute({
    sql: `
      DELETE FROM conversations
      WHERE session_id = ? AND id NOT IN (
        SELECT id FROM conversations
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT 100
      )
    `,
    args: [sessionId, sessionId],
  });
}

export async function getConversations(
  sessionId: string,
  limit: number = 100,
): Promise<Conversation[]> {
  await ensureInitialized();
  const db = getClient();

  const result = await db.execute({
    sql: `
      SELECT id, session_id, username, comment, response, timestamp
      FROM conversations
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    args: [sessionId, limit],
  });

  return result.rows
    .map((row) => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      username: row.username as string,
      comment: row.comment as string,
      response: row.response as string,
      timestamp: row.timestamp as string,
    }))
    .reverse(); // 古い順に並べ替え
}
