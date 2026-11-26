# 角色语音

《潮汐鼓港》的五句普通话对白由本机 `gemini-api` 0.5.0 调用 Google **Gemini 3.8 Flash TTS**（`gemini-3.8-flash-tts`）生成。台词写给本作的原创角色，音色采用 Google 预置声音，表演指令单独传给 `--style`。素材使用时遵循 [Gemini API 附加条款](https://aistudio.google.com/docs/terms)，其中说明 Google 对生成内容的所有权安排。语音生成参数见 [Google AI Studio 语音生成文档](https://aistudio.google.com/docs/speech-generation)。

| 游戏文件 | 台词 | 角色与演出 | 时长 |
| --- | --- | --- | ---: |
| `voice_castoff.wav` | 起锚！ | 年轻鼓手，Puck，亮声发令 | 0.657 秒 |
| `voice_heave.wav` | 嗨哟！ | 甲板领班 Fenrir 带头，船员 Gacrux 短延时接声 | 0.611 秒 |
| `voice_watch.wav` | 当心！ | 老船长，Charon，急促提醒 | 0.484 秒 |
| `voice_push.wav` | 破浪！ | 领鼓手，Kore，重读开头，短促收尾 | 0.552 秒 |
| `voice_win.wav` | 嘿！好样的！ | Fenrir 先喊，Puck 与 Zephyr 分别跟进 | 1.176 秒 |

成品在 [game/voice](../game/voice)，采用 48 kHz 单声道 PCM 16 位 WAV，峰值约 −2.9 dBFS。原音为 Google 返回的 24 kHz WAV。后期去掉首尾空白和低频杂声，仅对过长的短句做保音高加速。群声保留独立声部，跟喊压低音量、错开 34–67 ms，方便听清主句。

起锚与当心的原始演出带有下一句语境，成品只截取停顿前的指定台词。两句原始演出的自动转写均识别到目标词。极短的独立片段容易被自动转写误判，台词以原始演出和截取区间为准。战斗内调用这些角色语音时，给乐曲自带的唱词留出空隙。

## 复现

安装 FFmpeg，确保当前环境可以调用已配置的 `gemini-api`。脚本默认将生成结果写入 `game/voice/`，也可指定独立的输出目录试听。

```powershell
py scripts/prepare-voices.py --cli 'D:/Program Files/gemini/gemini-api.exe'
```

`--raw` 可指定保存原始 Gemini WAV 的目录。已有的原音会用于重新混音，缺少的原音会向 Google 请求生成。生成的表演和时长会随请求变化，发布使用仓库内已有的成品。
