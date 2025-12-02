import { Agent } from '@mastra/core/agent';

export const readingGeneratorAgent = new Agent({
  name: 'Reading Generator',
  instructions: `
ユーザー名の読み方をカタカナで答えてください。
- 漢字、英語、記号、当て字を自然な日本語の読みに変換
- カタカナ読みのみを出力（説明不要）
`,
  model: 'openai/gpt-4o-mini',
});
