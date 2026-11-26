# 鼓浪迎击的战斗音效

游戏使用 15 个短音效。所有音效都从 Google Gemini Omni 1.2 Flash 短片随画生成的音轨中选取，保留木质鼓船、铜铃盔甲和短促打击的材质。三种出招分别使用低沉重拍、连续木击和金属碎裂声。处理步骤包含实测切点、滤波、音量调整、混录与尾部淡出。

| 场合 | 素材 | 听觉提示 |
| --- | --- | --- |
| 普通命中 | `hit`、`hit_b`、`hit_c` | 三种木质落点固定轮换，同拍击中多个鼓位时共用一次声效 |
| 精准正拍 | `accent` | 每个攻击或防守小节的第一个精准正拍附加轻铜铃 |
| 起战、预警、钳落 | `start`、`windup`、`slam` | 开场木扣、短促金属刮擦和带铜壳音的低鼓冲击 |
| 护甲过半、护甲清空 | `armor` | 分次裂开的铜壳声，给触发攻击留出起音 |
| 重锤、连射、碎浪 | `power`、`flurry`、`break` | 低鼓共击、三击木片、金属碎片和短镲尾 |
| 格挡、反击、受创 | `guard`、`guard_b`、`counter`、`hurt` | 两种短盾击固定轮换，反击明亮，船体受创是一记闷木响 |

真实与触屏鼓击继续走独立的输入和打击声通路。命中木音在鼓击后 19–20 ms 起音，格挡声在 22–23 ms 后起音。两类音效分别有 54 ms、68 ms 的合并窗口，合击只加一层反馈。蓄力与钳落由音频时钟安排。蓄力从防守下拍前 0.145 拍起，钳落比下拍迟 36 ms。第一声起战音在首个预备点击后 56 ms 出现。

强攻击、回击和受伤短暂压低配乐约 2 dB。两位角色的五句独立口令每局各至多播放一次。口令期间压低配乐和战斗碰撞音量，训练鼓击和按谱示范保留原有通路。主动重开会清除原回合的口令和音效。

| 口令 | 入点 |
| --- | --- |
| 起锚 | 四拍预备的第 3、4 响之间，从训练曲首拍回数 1.65 拍 |
| 嗨哟 | 首次全精准成招后的下一个安全间隙 |
| 当心 | 训练曲第 38.75 拍，前于第三轮敌招示范 1.25 拍 |
| 破浪 | 首次削去至少一半护甲后的下一个安全间隙 |
| 嘿，好样的 | 胜利结算后 780 ms |

## 源录音与重建

三条源短片均由官方 `gemini-api video -m gemini-omni-1.2-flash` 生成。木质和铜质短片各测得六组独立动作，鼓组短片补充底部冲击和短镲。

| 归档录音，位于 `art/audio/sources/` | Interaction ID | FLAC SHA-256 |
| --- | --- | --- |
| `omni-harbor-wood.flac` | `v1_ChdfNXdIYTUyVkhwaUw2dGtQOHZIYzJBURIXXzV3SGE1MlZIcGlMNnRrUDh2SGMyQVE` | `abe73c23e18a9117795a49d767639d69d02a6f76b683ea33060e629bd4da34c9` |
| `omni-harbor-brass.flac` | `v1_ChdBSjBIYTUtcER0dUw2dGtQMklfZDRBURIXQUowSGE1LXBEdHVMNnRrUDJJX2Q0QVE` | `d3a1b7cdaab60d8db2fb92f1fe65e221ee7af92adc834dbfdb0faaceee6d3154` |
| `omni-percussion.flac` | `v1_Chc3cHdIYTlPZ0VNRzB1cjhQaXNDdmlBWRIXN3B3SGE5T2dFTUcwdXI4UGlzQ3ZpQVk` | `f5f0c523d68b965a5aa53d79af592a225e6ca73c12be081166c1d67e3e4eb1a6` |

初次 Lyria 3.5 打击素材试听返回了 128.096 秒，包含连续有调钟琴。正式音效采用上述有分隔的 Omni 源录音。木质和铜质各按单声道 44.1 kHz、24 位 FLAC 保存，归档时减掉 6 dB 保护峰值，编辑时恢复增益。第三份沿用鼓组的 16 位 FLAC 归档。

以下命令使用仓库内的 FLAC 离线重建。它先校验文件指纹，再用 PATH 上的 FFmpeg 解码、裁切，生成 15 枚 44.1 kHz 单声道 16 位 PCM，共 306,100 字节。脚本保存原始 MP4 指纹，每层的切点和每个输出的哈希写入 `build/google-audio/impact-edits.json`。

```sh
node scripts/render-impacts.mjs
```

运行 Godot 导入后再执行 `tests/audio_assets.gd`。该测试检查 PCM 格式、峰值余量、首尾静音、短音效长度、预排时间以及 Native 按 36 ms 延迟混入的行为。跨端音量和时间窗由 `game/scripts/harbor_sfx.gd` 集中维护。
