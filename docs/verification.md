# 指令战斗验证

使用 Godot 4.7.2 官方 Windows 控制台版和同版本单线程 Web 模板。每个测试从正常场景或发布构建开始。

## 规则和声音

在仓库根目录执行以下 PowerShell 命令。规则测试覆盖三种标准律动、推荐弱点、修船和护盾、四种防守、相邻同鼓的切窗、合击边界、两档速度和结算时的练习反馈。声音检查核对两种速度的 Web 与原生母带、两首尾奏、七种打击音效和两张动画图集。

```powershell
$godot = 'D:/dev/windssea/game/godot4.7.2/Godot_v4.7.2-stable_win64_console.exe'
& $godot --headless --path game --import
& $godot --headless --path game --script (Resolve-Path tests/combat.gd).Path
& $godot --headless --path game --script (Resolve-Path tests/audio_assets.gd).Path
```

## 导出后的实际回合

`tests/browser-battle.cjs` 对 Godot Web 成品运行实时浏览器测试。启动静态服务器指向 `build/web`，提供 Playwright 和 Chrome 后运行。用 `BATTLE_URL` 选择本机或线上网址，`PLAYWRIGHT_PATH` 指定已安装的 Playwright，`CHROME_PATH` 指定浏览器。`BATTLE_BPM=72` 走慢练，默认 96。设置 `BATTLE_TEST_LOSS=1` 会在胜利后通过触屏切换速度并重开，放弃防守，验证船体耗尽与失败尾奏。

浏览器在 1024×768 触屏视口解码整首乐曲，通过游戏的 Web MIDI 回调接收谱面击打。测试从非推荐的八分摇滚开局，检查四轮出招、四次反击、胜利结算、对应速率的原调伴奏与尾奏。键盘、单点触摸和双指底鼓＋闭镲合击另行测试。浏览器内调度、绘制和显示面板实际发光属于不同测量环节，罗兰模块、USB、扬声器和显示器的端到端延迟还需真机测量。

本机 Windows Chrome 的 96 BPM 回合验证了 83 个 MIDI Note On、四次成招和四次反击。活动帧间隔 p95 为 16.9 ms。另测 20 次注入触摸，触摸处理开始至 Web Audio 提交起音的 p95 为 0.3 ms，事件时间戳至首个 WebGL 绘制调用的 p95 为 56.5 ms。后一项包含浏览器派发，未计设备发声和面板扫描。重开并放弃防守的回合出现三次受伤并播放失败尾奏。

测试录下的[完整胜利回合](../art/motion/battle-playthrough.mp4)长 44.53 秒，含游戏实际输出的双声道音乐、打击反馈和结算动画。

## 媒体验证与交付

[配乐制作与瞬态测量](music-score.md) · [Grok 动作的取帧及透明度检查](motion-production.md)

私有 R2 桶保存单线程引擎，本版游戏包内的旋律、鼓采样和图集在开战前准备。按键与触摸立即触发本地音色；模块本机提供实体鼓的鼓声。胜败尾奏、护甲结算等事件仍使用即时战斗结果。各阶段目标与真实硬件验收方案见[游戏策划](game-design.md)。
