# 平板练习鼓采样

平板鼓垫和手册试听共用六个短采样。原音来自本机 `gemini-api video` 请求 Google Gemini Omni Flash（`gemini-omni-1.2-flash`）生成的三段鼓组演示。保留的是演示自带声轨的单击片段，模拟近收音的原声鼓音色；罗兰 MIDI 输入仍由游戏判定。 [Google 音视频生成文档](https://aistudio.google.com/docs/video)

| 音色 | 原始声轨 | 源瞬态 | 成品时长 | 成品起音 |
| --- | --- | ---: | ---: | ---: |
| 底鼓 `kit_kick.wav` | `omni-percussion.flac` | 1.326 s | 220 ms | 2.11 ms |
| 军鼓面 `kit_snare.wav` | `omni-drum-heads.flac` | 1.172 s | 180 ms | 1.59 ms |
| 闭合踩镲 `kit_hat.wav` | `omni-percussion.flac` | 3.122 s | 115 ms | 1.72 ms |
| 低音通鼓 `kit_tom.wav` | `omni-cross-tom.flac` | 6.781 s | 205 ms | 1.02 ms |
| 军鼓横击 `kit_cross.wav` | `omni-cross-tom.flac` | 2.977 s | 98 ms | 1.32 ms |
| 鼓棒互击 `kit_click.wav` | `omni-percussion.flac` | 5.019 s | 65 ms | 1.43 ms |

成品是 44.1 kHz 单声道 PCM16，Godot 保留 PCM 原样导入。起音按第一个达到该成品峰值 −30 dB 的样点计；保留击打前沿、短衰减和叠击余量，峰值为 −5.4 至 −2.2 dBFS。闭镲切片滤去了同段低频串音。军鼓面、横击、通鼓均取自可区分击法的画面，横击为一支棒架在鼓面上敲鼓边，鼓棒互击供数拍使用。

## 重建

使用 Python 3 和 FFmpeg，从 [无损原始声轨目录](../art/audio/sources) 重切六个成品，无需请求生成服务。

```powershell
py scripts/cut-drum-samples.py
```

Google 响应编号按原音对应如下，便于回查生成来源。

- `omni-percussion.flac` · `v1_Chc3cHdIYTlPZ0VNRzB1cjhQaXNDdmlBWRIXN3B3SGE5T2dFTUcwdXI4UGlzQ3ZpQVk`
- `omni-drum-heads.flac` · `v1_ChdxcDBIYTYtLURlR3Z2TWNQc3ZtRHVBaxIXcXAwSGE2LS1EZUd2dk1jUHN2bUR1QWs`
- `omni-cross-tom.flac` · `v1_Chc4NTBIYTdlSE02LXpvZEFQemVxOW9RVRIXODUwSGE3ZUhNNi16b2RBUHplcTlvUVU`
