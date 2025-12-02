import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  getViewer,
  addViewer,
  getConversations,
  addConversation,
  getSession,
  startSession,
} from '../lib/session-store';

// 入力スキーマ
const inputSchema = z.object({
  sessionId: z.string().describe('配信セッションのID'),
  username: z.string().describe('コメントした視聴者の名前'),
  comment: z.string().describe('視聴者のコメント内容'),
});

// 出力スキーマ
const outputSchema = z.object({
  response: z.string().describe('AITuberの応答'),
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
    let session = await getSession(sessionId);
    let actualSessionId = sessionId;

    if (!session) {
      // セッションが見つからない場合は新規作成
      actualSessionId = await startSession(sessionId || '配信');
      session = await getSession(actualSessionId);
      if (!session) {
        throw new Error('Failed to create session');
      }
    }

    // 視聴者確認
    const existingViewer = await getViewer(actualSessionId, username);

    if (existingViewer) {
      // 既存視聴者
      return {
        sessionId: actualSessionId,
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
    await addViewer(actualSessionId, username, usernameReading);

    return {
      sessionId: actualSessionId,
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
    shouldRespond: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('commentFilterAgent');
    if (!agent) {
      return { ...inputData, shouldRespond: true };
    }

    const result = await agent.generate([
      { role: 'user', content: inputData.comment },
    ]);

    let shouldRespond = true;
    try {
      const parsed = JSON.parse(result.text);
      shouldRespond = parsed.shouldRespond ?? true;
    } catch {
      shouldRespond = true;
    }

    return { ...inputData, shouldRespond };
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
    shouldRespond: z.boolean(),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    isFirstTime: z.boolean(),
    context: z.string(),
    shouldRespond: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { sessionId, username, usernameReading, comment, isFirstTime, streamTitle, shouldRespond } =
      inputData;

    // フィルタリングでスキップ対象の場合
    if (!shouldRespond) {
      return {
        sessionId,
        username,
        usernameReading,
        comment,
        isFirstTime,
        context: '',
        shouldRespond,
      };
    }

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
      shouldRespond,
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
    shouldRespond: z.boolean(),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    username: z.string(),
    usernameReading: z.string(),
    comment: z.string(),
    response: z.string(),
    isFirstTime: z.boolean(),
    shouldRespond: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { sessionId, username, usernameReading, comment, isFirstTime, context, shouldRespond } =
      inputData;

    // フィルタリングでスキップ対象の場合
    if (!shouldRespond) {
      return {
        sessionId,
        username,
        usernameReading,
        comment,
        response: '',
        isFirstTime,
        shouldRespond,
      };
    }

    const agent = mastra?.getAgent('aituberAgent');
    if (!agent) {
      throw new Error('aituberAgent not found');
    }

    const prompt = `
${context}
${isFirstTime ? '\n※この視聴者は初見です' : ''}`;

    const result = await agent.generate([{ role: 'user', content: prompt }]);

    return {
      sessionId,
      username,
      usernameReading,
      comment,
      response: result.text.trim(),
      isFirstTime,
      shouldRespond,
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
    response: z.string(),
    isFirstTime: z.boolean(),
    shouldRespond: z.boolean(),
  }),
  outputSchema,
  execute: async ({ inputData }) => {
    const { sessionId, username, usernameReading, comment, response, isFirstTime, shouldRespond } =
      inputData;

    // フィルタリングでスキップ対象の場合は保存しない
    if (!shouldRespond) {
      return {
        response: '',
        usernameReading,
        isFirstTime,
        shouldRespond,
      };
    }

    // 会話履歴を保存
    await addConversation(sessionId, username, comment, response);

    return {
      response,
      usernameReading,
      isFirstTime,
      shouldRespond,
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
