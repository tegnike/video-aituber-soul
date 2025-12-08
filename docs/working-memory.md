# ワーキングメモリ | メモリ | Mastra ドキュメント

Mastra のワーキングメモリを設定し、永続的なユーザーデータやユーザー設定を保存する方法を学びましょう。

Source: https://mastra.ai/ja/docs/memory/working-memory

---

# ワーキングメモリ

[conversation history](/ja/docs/memory/conversation-history)や [semantic recall](/ja/docs/memory/semantic-recall)が会話内容の記憶に役立つのに対し、ワーキングメモリは複数のやり取りをまたいでユーザーに関する情報を持続的に保持します。 

これはエージェントの「現在の思考」や「メモ帳」のようなもので、ユーザーやタスクに関する重要な情報を常に手元に置いておくための仕組みです。人が会話の中で相手の名前や嗜好、重要な詳細を自然に覚えているのに近いイメージです。 

常に関連し、常時エージェントが参照できるべき継続的な状態を維持するのに役立ちます。 

ワーキングメモリは、次の2つのスコープで永続化できます: 

- スレッドスコープ（デフォルト）: メモリは会話スレッドごとに分離されます
- リソーススコープ: 同一ユーザーのすべての会話スレッドをまたいでメモリが保持されます

**重要:**スコープを切り替えると、もう一方のスコープのメモリは参照できません。スレッドスコープのメモリはリソーススコープのメモリと完全に分離されています。 

## クイックスタート​

作業メモリを備えたエージェントをセットアップする最小構成の例は次のとおりです： 

```
import { Agent } from "@mastra/core/agent";import { Memory } from "@mastra/memory";import { openai } from "@ai-sdk/openai";// ワーキングメモリを有効にしてエージェントを作成const agent = new Agent({  name: "PersonalAssistant",  instructions: "あなたは頼れるパーソナルアシスタントです。",  model: openai("gpt-4.1"),  memory: new Memory({    options: {      workingMemory: {        enabled: true,      },    },  }),});
```

## 仕組み​

Working memory は、エージェントが時間の経過に応じて更新し、常に必要となる情報を蓄積しておける Markdown テキストのブロックです。 

## メモリの永続スコープ​

ワーキングメモリは2種類のスコープで動作し、会話をまたいだメモリの保持方法を選択できます。 

### スレッド単位のメモリ（デフォルト）​

デフォルトでは、作業メモリは各会話スレッド単位で管理されます。各スレッドは、それぞれ独立したメモリを保持します。 

```
const memory = new Memory({  storage,  options: {    workingMemory: {      enabled: true,      scope: 'thread', // デフォルト - メモリはスレッドごとに分離されます      template: `# ユーザープロフィール- **名前**:- **興味・関心**:- **現在の目標**:`,    },  },});
```

**ユースケース:**

- 別々のトピックについての個別の会話
- 一時的またはセッション限定の情報
- 各スレッドに作業用メモリが必要だが、スレッドは短命で互いに関連しないワークフロー

### リソース単位のメモリ​

リソース単位のメモリは、同一ユーザー（resourceId）に紐づくすべての会話スレッド間で保持され、ユーザーの記憶を永続化します。 

```
const memory = new Memory({  storage,  options: {    workingMemory: {      enabled: true,      scope: "thread", // メモリはスレッドごとに分離されます      template: `# ユーザープロフィール- **名前**:- **興味**:- **現在の目標**:`,    },  },});
```

**ユースケース:**

- 別々のトピックについての個別の会話
- 一時的またはセッション限定の情報
- 各スレッドに作業用メモリが必要だが、スレッド自体は短命で相互に関連しないワークフロー

## ストレージアダプターのサポート​

リソーススコープのワーキングメモリには、 `mastra_resources`テーブルに対応した専用のストレージアダプターが必要です。 

### ✅ 対応ストレージアダプター​

- LibSQL (@mastra/libsql)
- PostgreSQL (@mastra/pg)
- Upstash (@mastra/upstash)

## カスタムテンプレート​

テンプレートは、エージェントが作業メモリでどの情報を追跡・更新するかを指示します。テンプレートが指定されていない場合はデフォルトのテンプレートが使用されますが、通常はエージェントの特定のユースケースに合わせてカスタムテンプレートを定義し、最も関連性の高い情報を確実に記憶できるようにすることをお勧めします。 

以下はカスタムテンプレートの例です。この例では、ユーザーがそれらの情報を含むメッセージを送信した時点で、エージェントはユーザーの名前、位置情報、タイムゾーンなどを保存します。 

```
const memory = new Memory({  options: {    workingMemory: {      enabled: true,      template: `# ユーザープロフィール## 個人情報- 氏名:- 居住地:- タイムゾーン:## 望ましい設定- コミュニケーションのスタイル: [例: フォーマル、カジュアル]- プロジェクトの目標:- 重要な締め切り:  - [締め切り 1]: [日付]  - [締め切り 2]: [日付]## セッション状況- 直近に議論したタスク:- 未解決の質問:  - [質問 1]  - [質問 2]`,    },  },});
```

## 効果的なテンプレート設計​

よく構造化されたテンプレートは、エージェントが情報を解釈・更新しやすい状態を保ちます。テンプレートは、アシスタントに常に最新化してほしい簡潔なフォームとして扱いましょう。 

- 短く要点を押さえたラベル。 段落や長すぎる見出しは避けましょう。ラベルは簡潔に（例:
## Personal Info や - Name:）しておくと、更新が読みやすく、途中で切り捨てられにくくなります。
- 大文字・小文字の表記を統一する。 大文字小文字が不一致（Timezone: と timezone:）だと、更新が雑になりがちです。見出しや箇条書きのラベルは Title Case か lower case のどちらかに統一しましょう。
- プレースホルダー文言はシンプルに。 [e.g., Formal] や [Date] といったヒントを使い、LLM が正しい箇所を埋めやすくします。
- 非常に長い値は省略する。 短い形式だけが必要な場合は、全文の法的表記ではなく、
- Name: [First name or nickname] や - Address (short): のようなガイダンスを含めましょう。
- instructions に更新ルールを明記する。 テンプレートのどの部分をいつ埋めるか、またはクリアするかを、エージェントの instructions フィールドで直接指示できます。

### 代替テンプレートスタイル​

必要な項目が少ない場合は、より短い単一ブロックを使用します: 

```
const basicMemory = new Memory({  options: {    workingMemory: {      enabled: true,      template: `ユーザー情報:\n- 名前:\n- 好きな色:\n- 現在のトピック:`,    },  },});
```

より物語的なスタイルを好む場合は、重要な要点を短い段落形式でまとめることもできます。 

```
const paragraphMemory = new Memory({  options: {    workingMemory: {      enabled: true,      template: `重要事項:\n\nユーザーの重要情報（名前、主な目標、現在のタスク）を簡潔な段落でまとめてください。`,    },  },});
```

## 構造化ワーキングメモリ​

ワーキングメモリは、Markdown テンプレートの代わりに構造化スキーマで定義することもできます。これにより、追跡すべきフィールドや型を [Zod](https://zod.dev/)のスキーマで正確に指定できます。スキーマを使用すると、エージェントはスキーマに準拠した JSON オブジェクトとしてワーキングメモリを表示・更新します。 

**重要:**`template`と `schema`のどちらか一方を指定し、両方を同時には指定しないでください。 

### 例：スキーマベースの作業記憶​

```
import { z } from "zod";import { Memory } from "@mastra/memory";const userProfileSchema = z.object({  name: z.string().optional(),  location: z.string().optional(),  timezone: z.string().optional(),  preferences: z    .object({      communicationStyle: z.string().optional(),      projectGoal: z.string().optional(),      deadlines: z.array(z.string()).optional(),    })    .optional(),});const memory = new Memory({  options: {    workingMemory: {      enabled: true,      schema: userProfileSchema,      // template: ... (設定しないこと)    },  },});
```

スキーマが指定されている場合、エージェントは作業メモリを JSON オブジェクトとして受け取ります。例： 

```
{  "name": "Sam",  "location": "Berlin",  "timezone": "CET",  "preferences": {    "communicationStyle": "フォーマル",    "projectGoal": "MVPをローンチ",    "deadlines": ["2025-07-01"]  }}
```

## Template と Schema の選択​

- エージェントに、ユーザープロファイルやスクラッチパッドなどの自由形式テキストとしてメモリを保持させたい場合は、template（Markdown）を使用します。
- 検証可能で、JSON としてプログラムからアクセスできる構造化された型安全なデータが必要な場合は、schema を使用します。
- 同時に有効にできるのは一方のみです。template と schema を同時に設定することはサポートされていません。

## 例: マルチステップのリテンション​

以下は、短いユーザーとの会話の中で `User Profile`テンプレートがどのように更新されるかを簡略化して示したものです。 

```
# ユーザープロフィール## 個人情報- 名前:- 居住地:- タイムゾーン:--- ユーザーが「私の名前は**Sam**で、**Berlin**から来ました」と言った後 ---# ユーザープロフィール- 名前: Sam- 居住地: Berlin- タイムゾーン:--- ユーザーが「ちなみに普段は**CET**です」と付け加えた後 ---# ユーザープロフィール- 名前: Sam- 居住地: Berlin- タイムゾーン: CET
```

エージェントは、作業メモリに保存されているため、以降の応答で `Sam`や `Berlin`を情報を再度求めることなく参照できます。 

期待どおりに作業メモリが更新されない場合は、エージェントの `instructions`設定に、このテンプレートを「どのように」「いつ」使用するかに関するシステム指示を追加できます。 

## 初期ワーキングメモリの設定​

エージェントは通常 `updateWorkingMemory`ツールでワーキングメモリを更新しますが、スレッドの作成や更新時に、プログラムで初期ワーキングメモリを設定することもできます。これは、ユーザーデータ（名前、好み、その他の情報など）を毎回のリクエストで渡さなくてもエージェントが利用できるようにあらかじめ組み込むのに役立ちます。 

### スレッドのメタデータでワーキングメモリを設定する​

スレッドを作成する際は、メタデータの `workingMemory`キーで初期ワーキングメモリを指定できます。 

src/app/medical-consultation.ts 
```
// 初期ワーキングメモリを持つスレッドを作成const thread = await memory.createThread({  threadId: "thread-123",  resourceId: "user-456",  title: "医療相談",  metadata: {    workingMemory: `# 患者プロフィール- 名前: John Doe- 血液型: O+- アレルギー: ペニシリン- 現在の服薬: なし- 病歴: 高血圧(コントロール済み)`,  },});// エージェントは全てのメッセージでこの情報にアクセスできるようになりますawait agent.generate("私の血液型は何ですか?", {  threadId: thread.id,  resourceId: "user-456",});// レスポンス: "あなたの血液型はO+です。"
```

### 作業メモリをプログラムから更新する​

既存のスレッドの作業メモリも更新できます。 

src/app/medical-consultation.ts 
```
// スレッドメタデータを更新してワーキングメモリを追加/変更await memory.updateThread({  id: "thread-123",  title: thread.title,  metadata: {    ...thread.metadata,    workingMemory: `# 患者プロフィール- 氏名: John Doe- 血液型: O+- アレルギー: ペニシリン、イブプロフェン  // 更新済み- 現在の処方薬: リシノプリル 10mg 1日1回  // 追加済み- 既往歴: 高血圧(コントロール良好)`,  },});
```

### メモリを直接更新する​

別の方法として、 `updateWorkingMemory`メソッドを直接使用します。 

src/app/medical-consultation.ts 
```
await memory.updateWorkingMemory({  threadId: "thread-123",  resourceId: "user-456", // リソーススコープメモリに必須  workingMemory: "更新されたメモリコンテンツ...",});
```

## 例​

- テンプレートを用いたワーキングメモリ
- スキーマを用いたワーキングメモリ
- リソース単位のワーキングメモリ - リソース単位のメモリ永続化を示す完全なサンプル