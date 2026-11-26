"""Rebuild the OFL HUD subset from the Chinese Noto Sans SC variable font."""
from pathlib import Path
from sys import argv

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

game = Path(__file__).resolve().parent.parent / "game"
source = Path(argv[1]) if len(argv) > 1 else Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
text = "".join(script.read_text(encoding="utf-8") for script in (game / "scripts").glob("*.gd"))
codepoints = set(range(32, 127)) | {ord(char) for char in text if ord(char) > 127}
font = TTFont(source)
subsetter = subset.Subsetter()
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
font = instantiateVariableFont(font, {"wght": 560}, inplace=True)
names = {1: "Harbor HUD", 2: "Medium", 3: "Tidebeat-HUD-Medium", 4: "Harbor HUD Medium", 6: "HarborHUD-Medium"}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
out = game / "art" / "HarborHUD.ttf"
font.save(out)
print(f"{out.name}: {len(font.getBestCmap())} glyph mappings")
