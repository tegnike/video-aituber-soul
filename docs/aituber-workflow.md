# AITuber Workflow

VTuber配信でのコメント応答を処理するMastraワークフロー。

## 概要

```
[入力: sessionId, username, comment]
    ↓
[1. check-viewer] → readingGeneratorAgent
    ↓
[2. filter-comment] → commentFilterAgent
    ↓ (shouldRespond: false → bail()で早期終了)
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
  sessionId: string,  // 配信セッションID（存在しなければそのIDで自動作成）
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
// sessionIdは任意の文字列でOK（存在しなければ自動作成）
const result = await aituberWorkflow.createRun().start({
  inputData: {
    sessionId: "my-stream-2024",
    username: "太郎_xyz",
    comment: "こんにちは！"
  }
});
// → { response: "タロウさん、こんにちは！...", usernameReading: "タロウ", isFirstTime: true }

// タイトル付きセッションを事前に作成する場合
import { startSession, endSession } from './lib/session-store';
const sessionId = await startSession("朝の雑談配信");
// ... ワークフロー実行 ...
await endSession(sessionId);
```

## REST API

Mastraサーバー起動後、以下のエンドポイントでワークフローを実行できます。

### サーバー起動

```bash
npm run dev   # 開発サーバー (http://localhost:4111)
npm run start # 本番サーバー
```

### エンドポイント一覧

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | `/api/workflows/aituber-workflow/start-async` | 同期実行（結果を待つ） |
| POST | `/api/workflows/aituber-workflow/start` | 非同期実行（即座に返却） |
| POST | `/api/workflows/aituber-workflow/stream` | ストリーミング実行 |

### リクエスト例

```bash
curl -X POST http://localhost:4111/api/workflows/aituber-workflow/start-async \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": {
      "sessionId": "session-001",
      "username": "太郎_xyz",
      "comment": "こんにちは！"
    }
  }'
```

### レスポンス例

**応答する場合（shouldRespond: true）**

```json
{
  "response": "タロウさん、こんにちは！今日も配信に来てくれてありがとうございます。",
  "usernameReading": "タロウ",
  "isFirstTime": true,
  "shouldRespond": true
}
```

**応答しない場合（shouldRespond: false）**

```json
{
  "response": "",
  "usernameReading": "タロウ",
  "isFirstTime": false,
  "shouldRespond": false
}
```

### OpenAPI / Swagger

- OpenAPI仕様: `http://localhost:4111/openapi.json`
- Swagger UI: `http://localhost:4111/swagger-ui`
