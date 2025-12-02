import { Agent } from '@mastra/core/agent';

export const commentFilterAgent = new Agent({
  name: 'Comment Filter',
  instructions: `
コメントが返答に値するかを判定してください。

## 返答不要（shouldRespond: false）
- 意味のない単語: 「あ」「お」「ん」「w」「草」
- 相槌のみ: 「ふーん」「へー」「なるほど」
- 絵文字のみ: 😊🎉👍 など
- 記号のみ: 「...」「！！！」「？？？」
- 空白や改行のみ

## 返答必要（shouldRespond: true）
- 質問や挨拶
- 感想や意見
- 会話として成立するもの

JSON形式で出力: {"shouldRespond": true/false}
`,
  model: 'openai/gpt-4o-mini',
});
