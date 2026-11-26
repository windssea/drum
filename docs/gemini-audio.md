# 用 Gemini CLI 生成鼓港声音

交互式 Gemini CLI `gemini` 负责触发项目命令。脚本通过 Google 官方 `gemini-api` CLI 调用 Interactions API，无需在项目里配置额外的 HTTP 客户端。

在仓库根目录启动 `gemini`。首次添加命令后可运行 `/commands reload`。运行斜杠命令时，Gemini CLI 会先确认要执行的本地命令。

| Gemini CLI 命令 | 用途 |
| --- | --- |
| `/drum-audio --dry-run` | 查看真正会提交的请求体。离线执行，无需密钥 |
| `/drum-audio` 或 `/drum-audio music` | 使用 Lyria 3.5 生成卡通港口首领战试听 |
| `/drum-audio percussion` | 使用 Lyria 3.5 按谱演奏一串独立打击，供之后裁切成单件 |
| `/drum-audio voice` | 使用 Gemini 3.8 Flash TTS 生成两个角色的五句干声试听 |
| `/drum-audio music --take=second` | 明确提交一条新的候选试听 |
| `/drum-audio --mock` | 启动本机回环模拟服务，验证官方 CLI 音频落盘与去重 |

需要 Node.js 和 PATH 中的 `gemini-api`。本项目用 0.5.0 验证。真实生成依赖官方 CLI 的本机凭据配置，也支持通过环境传入 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`。使用交互式入口时，可以沿用已有的 Gemini CLI `.env` 配置。直接运行 Node 时，从终端环境或官方 `gemini-api` profile 获取授权。

```powershell
node scripts/generate-google-audio.mjs --dry-run
node scripts/generate-google-audio.mjs --mock
node scripts/generate-google-audio.mjs music
```

每条请求先用模式、试听名和提示词指纹在忽略目录 `build/google-audio/` 创建独占记录，避免同一试听被并发提交或在失败后盲目重试。成功后同样的命令会复用已有音频。若上次失败或中断，先检查其 `manifest.json` 和目录内的文件。确定要另发一条生成请求后，再指定不同的 `--take`。CLI 自动网络重试已关闭。

每条真实试听的目录包含 `prompt.txt`、`manifest.json` 和 `preview.wav` 或服务实际提供的其他音频格式。记录包含音频 SHA-256、字节数和服务端提供的 Interaction ID。专用 `tts` 命令当前输出音频元数据，并且没有公开服务端 Interaction ID，脚本据实记录为空。终端、提示词与记录均无密钥。生成入口不修改游戏的现用音轨。

默认试听要求 **40 秒 · 96 BPM · 4/4 · D 小调 · 16 小节**。四轮从起锚到破浪，配器给中文口令和玩家真鼓留空间。Lyria 的时长、速度、重音和人声落点由听审和测量决定是否可用。换进训练关前，逐拍确认落点，对齐 16 小节，并分别导出 96 BPM 和 72 BPM 版。`percussion` 是音乐模型对打击乐谱的演奏，录音可能带额外声部或超时，需挑出干净声音来裁切。

离线 mock 使用真正的 `gemini-api` 向回环服务请求三次，返回 Interactions 的 `steps` 样例，验证 WAV 导出、原始 PCM 语音封装及同一试听复用。真实战斗音效选样记录见 [战斗音效](sound-effects.md)。

[Gemini CLI 自定义命令](https://geminicli.com/docs/cli/custom-commands/) · [官方 Gemini API CLI](https://github.com/google-gemini/gemini-api-cli) · [Lyria 音乐生成](https://aistudio.google.com/docs/music-generation) · [Gemini 语音生成](https://aistudio.google.com/docs/speech-generation)
