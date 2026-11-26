# 指令战斗验证

使用 Godot 4.7.2 官方 Windows 控制台版和同版本单线程 Web 模板。每个测试从正常场景或发布构建开始。

## 规则和声音

在仓库根目录执行以下 PowerShell 命令。规则测试覆盖四个课组、十二种进攻、八种防守、推荐弱点、修船和护盾、相邻同鼓的切窗、合击边界、两档速度和结算时的练习反馈。声音检查分别解码基础、留白与三连三套伴奏的 72／96 BPM Web 和原生母带，同时核对两首尾奏、十五种战斗音效、六种鼓组与数拍采样、五句角色台词和两张动画图集。

```powershell
$godot = 'D:/dev/windssea/game/godot4.7.2/Godot_v4.7.2-stable_win64_console.exe'
& $godot --headless --path game --import
& $godot --headless --path game --script (Resolve-Path tests/combat.gd).Path
& $godot --headless --path game --script (Resolve-Path tests/audio_assets.gd).Path
```

## 导出后的实际回合

`tests/browser-battle.cjs` 对 Godot Web 成品运行实时浏览器测试。启动静态服务器指向 `build/web`，提供 Playwright 和 Chrome 后运行。用 `BATTLE_URL` 选择本机或线上网址，`PLAYWRIGHT_PATH` 指定已安装的 Playwright，`CHROME_PATH` 指定浏览器。`BATTLE_COURSE=0` 至 `3` 按游戏中的顺序选择课组，`BATTLE_BPM=72` 走慢练，默认 96。设置 `BATTLE_TEST_LOSS=1` 会在胜利后通过触屏切换速度并重开，放弃防守，验证船体耗尽与失败尾奏。

浏览器在 1024×768 触屏视口解码当前课组的伴奏，经游戏的 Web MIDI 回调接收击打。每局检查三种攻击、四次反击和胜利结算，核对实际播放的音频文件及速率，并在结算后从游戏打开完整练习手册。切分组用 MIDI 37 发出横击，三连组按每拍三等分发送事件。键盘、单点触摸和双指底鼓＋闭镲合击另行测试。罗兰模块、USB、扬声器和显示器的端到端延迟还需真机测量。

本机 Windows Chrome 以 96 BPM 录制完整基础课组回合，83 个注入的 MIDI Note On 打出四次成招和四次反击。录制过程中活动帧间隔 p95 为 33.3 ms，确认五句角色台词都调用了对应音频。另测 20 次注入触摸，处理开始至 Web Audio 提交起音的 p95 为 0.4 ms，事件时间戳至首个 WebGL 绘制调用的 p95 为 76.8 ms。后者包含浏览器派发，未计设备发声和面板扫描。重开后放弃防守，三次受伤后播放失败尾奏。

四组实测分别注入 83、94、99、99 个 MIDI 击打，均完成四轮攻防。三连课组在公开 Worker 的 72 BPM 模式下完成，听到五句角色口令，结算时可打开二十张谱并启动试听。线上可单独播放的原声与本地发布母带 SHA-256 相同。

测试录下的[完整胜利回合](../art/motion/battle-playthrough.mp4)长 44.53 秒，含游戏实际输出的双声道音乐、打击反馈和结算动画。录屏混音测得 −19.6 LUFS，真峰值 −3.4 dBTP。

## 媒体验证与交付

[配乐制作与瞬态测量](music-score.md) · [Grok 动作的取帧及透明度检查](motion-production.md)

私有 R2 桶保存单线程引擎。Web 版只把本局选用的长伴奏解码成浮点音频，鼓组单击、战斗音效和角色台词在输入前装入内存。触摸和键盘在按下时触发鼓声，实体鼓通过模块返听。角色字幕、技能反馈和胜败尾奏与同一局的事件关联。
