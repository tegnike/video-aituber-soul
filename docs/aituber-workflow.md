# AITuber Workflow

VTuber配信でのコメント応答を処理するMastraワークフロー。

## 概要

```
[入力: sessionId, username, comment]
    ↓
[1. check-viewer] → readingGeneratorAgent
    ↓
[2. filter-comment] → commentFilterAgent
    ↓ (shouldRespond: false → スキップ)
[3. build-context]
    ↓
[4. generate-response] → aituberAgent
    ↓
[5. save-conversation]
    ↓
[出力: response, usernameReading, isFirstTime, shouldRespond]
```

## ステップ詳細

| ステップ | 処理内容 | 使用エージェント |
|---------|---------|-----------------|
| check-viewer | セッション確認、視聴者確認、読み仮名生成 | readingGeneratorAgent |
| filter-comment | コメントが返答に値するか判定 | commentFilterAgent |
| build-context | 直近50件の会話履歴からコンテキスト構築 | - |
| generate-response | VTuberとして応答生成 | aituberAgent |
| save-conversation | 会話履歴をDBに保存 | - |

## 入力スキーマ

```typescript
{
  sessionId: string,  // 配信セッションID（無効なら自動作成）
  username: string,   // 視聴者名
  comment: string     // コメント内容
}
```

## 出力スキーマ

```typescript
{
  response: string,        // AITuberの応答
  usernameReading: string, // 視聴者名の読み（カタカナ）
  isFirstTime: boolean,    // 初見かどうか
  shouldRespond: boolean   // 応答したかどうか
}
```

## DB保存内容

| テーブル | 内容 |
|---------|------|
| sessions | 配信セッション情報 |
| viewers | 視聴者名 + 読み仮名（セッション単位） |
| conversations | 会話履歴（最大100件/セッション） |

## エージェント

### readingGeneratorAgent

視聴者名の読み仮名を生成する。

```
入力: ユーザー名
出力: カタカナ読み
```

### commentFilterAgent

コメントが返答に値するか判定する。

```
入力: コメント内容
出力: {"shouldRespond": true/false}

返答不要: 「あ」「ふーん」「絵文字のみ」「記号のみ」など
返答必要: 質問、挨拶、感想、意見など
```

### aituberAgent

VTuber「ニケ」としてコメントに応答する。

```
システムプロンプト:
- キャラクター設定（17歳女子高生VTuber）
- 応答ルール（2〜3文、初見歓迎、疑問形禁止）

ユーザーメッセージ:
- 配信タイトル
- 直近の会話履歴（50件）
- 今回のコメント（視聴者名 + 読み + 初見フラグ）
```

## 使用例

```typescript
import { startSession, endSession } from './lib/session-store';

// 配信開始
const sessionId = await startSession("朝の雑談配信");

// コメント処理
const result = await aituberWorkflow.createRun().start({
  inputData: {
    sessionId,
    username: "太郎_xyz",
    comment: "こんにちは！"
  }
});
// → { response: "タロウさん、こんにちは！...", usernameReading: "タロウ", isFirstTime: true }

// 配信終了
await endSession(sessionId);
```
