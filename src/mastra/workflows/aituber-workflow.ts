import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  getViewer,
  addViewer,
  getConversations,
  addConversation,
  getOrCreateSession,
} from '../lib/session-store';

// 入力スキーマ
const inputSchema = z.object({
  sessionId: z.string().describe('配信セッションのID'),
  username: z.string().describe('コメントした視聴者の名前'),
  comment: z.string().describe('視聴者のコメント内容'),
});

// セグメントスキーマ
const segmentSchema = z.object({
  text: z.string().describe('発話テキスト'),
  emotion: z.string().describe('感情パラメータ'),
});

// 出力スキーマ
const outputSchema = z.object({
  segments: z.array(segmentSchema).describe('応答セグメントの配列'),
  // 後方互換用
  response: z.string().optional().describe('応答全文（後方互換用）'),
  emotion: z.string().optional().describe('メイン感情（後方互換用）'),
  // 共通
  usernameReading: z.string().describe('視聴者名の読み'),
  isFirstTime: z.boolean().describe('初見かどうか'),
  shouldRespond: z.boolean().describe('応答したかどうか'),
});

// Step 1: 視聴者確認・読み仮名生成
const checkViewerStep = createStep({
  id: 'check-viewer',
  description: '視聴者を確認し、初見なら読み仮名を生成',
  inputSchema,
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    streamTitle: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { sessionId, username, comment } = inputData;

    // セッション確認（無ければ自動作成）
    const session = await getOrCreateSession(sessionId);

    // 視聴者確認
    const existingViewer = await getViewer(sessionId, username);

    if (existingViewer) {
      // 既存視聴者
      return {
        sessionId,
        username,
        usernameReading: existingViewer.usernameReading,
        comment,
        isFirstTime: false,
        streamTitle: session.streamTitle,
      };
    }

    // 初見 → 読み仮名をLLMで生成
    const agent = mastra?.getAgent('readingGeneratorAgent');
    if (!agent) {
      throw new Error('readingGeneratorAgent not found');
    }

    const result = await agent.generate([
      {
        role: 'user',
        content: username,
      },
    ]);

    const usernameReading = result.text.trim();

    // 視聴者をDBに追加
    await addViewer(sessionId, username, usernameReading);

    return {
      sessionId,
      username,
      usernameReading,
      comment,
      isFirstTime: true,
      streamTitle: session.streamTitle,
    };
  },
});

// Step 2: コメントフィルタリング
const filterCommentStep = createStep({
  id: 'filter-comment',
  description: 'コメントが返答に値するか判定',
  inputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    streamTitle: z.string(),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    streamTitle: z.string(),
  }),
  execute: async ({ inputData, mastra, bail }) => {
    // 初見視聴者は必ず応答する
    if (inputData.isFirstTime) {
      return inputData;
    }

    const agent = mastra?.getAgent('commentFilterAgent');
    if (!agent) {
      return inputData;
    }

    try {
      const result = await agent.generate([
        { role: 'user', content: inputData.comment },
      ]);

      let shouldRespond = true;
      try {
        const parsed = JSON.parse(result.text);
        shouldRespond = typeof parsed?.shouldRespond === 'boolean'
          ? parsed.shouldRespond
          : true;
      } catch {
        shouldRespond = true;
      }

      // 応答不要の場合は早期終了
      if (!shouldRespond) {
        return bail({
          segments: [],
          response: '',
          emotion: 'neutral',
          usernameReading: inputData.usernameReading,
          isFirstTime: inputData.isFirstTime,
          shouldRespond: false,
        });
      }

      return inputData;
    } catch (error) {
      console.error('Comment filter failed, defaulting to respond:', error);
      return inputData;
    }
  },
});

// Step 3: コンテキスト構築
const buildContextStep = createStep({
  id: 'build-context',
  description: '会話履歴からコンテキストを構築',
  inputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    streamTitle: z.string(),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    context: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { sessionId, username, usernameReading, comment, isFirstTime, streamTitle } =
      inputData;

    // 会話履歴を取得（直近50件）
    const conversations = await getConversations(sessionId, 50);

    // コンテキスト構築
    const historyText = conversations
      .map((c) => `${c.username}: ${c.comment}\nニケ: ${c.response}`)
      .join('\n\n');

    const context = `
【配信タイトル】${streamTitle}

【直近の会話】
${historyText || '(まだ会話はありません)'}

【今回のコメント】
${username}さん（読み: ${usernameReading}）${isFirstTime ? '【初見】' : ''}: ${comment}
`.trim();

    return {
      sessionId,
      username,
      usernameReading,
      comment,
      isFirstTime,
      context,
    };
  },
});

// Step 4: 応答生成
const generateResponseStep = createStep({
  id: 'generate-response',
  description: 'AITuberとして応答を生成',
  inputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    context: z.string(),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    segments: z.array(segmentSchema),
    isFirstTime: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { sessionId, username, usernameReading, comment, isFirstTime, context } =
      inputData;

    const agent = mastra?.getAgent('aituberAgent');
    if (!agent) {
      throw new Error('aituberAgent not found');
    }

    const prompt = `
${context}
${isFirstTime ? '\n※この視聴者は初見です' : ''}`;

    const result = await agent.generate([{ role: 'user', content: prompt }]);

    // JSONパース（エージェントはJSON形式で応答、```json```でラップされる場合あり）
    let segments: Array<{ text: string; emotion: string }> = [];
    try {
      let jsonText = result.text.trim();
      // ```json ... ``` でラップされている場合は除去
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      const parsed = JSON.parse(jsonText);

      // 新形式（segments配列）
      if (Array.isArray(parsed.segments)) {
        segments = parsed.segments.map((seg: { text?: string; emotion?: string }) => ({
          text: seg.text || '',
          emotion: seg.emotion || 'neutral',
        }));
      }
      // 旧形式（response/emotion）からの変換（後方互換性）
      else if (parsed.response) {
        segments = [{
          text: parsed.response,
          emotion: parsed.emotion || 'neutral',
        }];
      }
    } catch {
      // JSONパース失敗時は単一セグメントとして扱う
      segments = [{
        text: result.text.trim(),
        emotion: 'neutral',
      }];
    }

    // 空セグメントを除去
    segments = segments.filter(seg => seg.text.trim().length > 0);

    // 最低1セグメントを保証
    if (segments.length === 0) {
      segments = [{ text: '...', emotion: 'neutral' }];
    }

    return {
      sessionId,
      username,
      usernameReading,
      comment,
      segments,
      isFirstTime,
    };
  },
});

// Step 5: 会話保存
const saveConversationStep = createStep({
  id: 'save-conversation',
  description: '会話履歴をDBに保存',
  inputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    segments: z.array(segmentSchema),
    isFirstTime: z.boolean(),
  }),
  outputSchema,
  execute: async ({ inputData }) => {
    const { sessionId, username, usernameReading, comment, segments, isFirstTime } =
      inputData;

    // セグメントを連結して応答全文を作成（履歴表示用）
    const fullResponse = segments.map(s => s.text).join(' ');

    // 会話履歴を保存
    await addConversation(sessionId, username, comment, fullResponse);

    // 後方互換性のため response/emotion も返す
    const mainEmotion = segments[0]?.emotion || 'neutral';

    return {
      segments,
      response: fullResponse,
      emotion: mainEmotion,
      usernameReading,
      isFirstTime,
      shouldRespond: true,
    };
  },
});

// ワークフロー定義
const aituberWorkflow = createWorkflow({
  id: 'aituber-workflow',
  inputSchema,
  outputSchema,
})
  .then(checkViewerStep)
  .then(filterCommentStep)
  .then(buildContextStep)
  .then(generateResponseStep)
  .then(saveConversationStep);

aituberWorkflow.commit();

export { aituberWorkflow };
