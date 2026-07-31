#!/usr/bin/env python3
"""產生 assets/fonts/comic-tc.woff2:Noto Sans TC 變體字重,子集化到常用字。

為什麼要自架:匯出的漫畫站原本只寫 font-family 系統堆疊,Android 與多數 Linux
沒有 Noto Sans TC 就掉到系統預設(可能是簡體字型),同一本電子書在不同裝置長得不一樣。
氣泡位置與字級是靠眼睛排的,字型一換排版就跑掉。

字集 = Big5 常用字區(A440-C67E,5401 字,即教育部常用國字標準字體表)+ ASCII + 中文標點。
ponytail: 常用字外(次常用/罕用)落回系統字型 fallback;真的缺字再把 Big5 次常用區
(C940-F9D5)加進來,體積約 +1MB。

用法:python3 tools/build-font.py [來源 ttf]
需要:pip install fonttools brotli
"""
import subprocess
import sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1
           else Path.home() / '.local/share/fonts/NotoSansTC-VariableFont_wght.ttf')
OUT = Path(__file__).resolve().parent.parent / 'assets/fonts/comic-tc.woff2'

# Big5 常用字區:逐碼點試解碼,解得出且落在漢字區的才要
chars = []
for hi in range(0xA4, 0xC7):
    for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
        try:
            c = bytes([hi, lo]).decode('big5')
        except UnicodeDecodeError:
            continue
        if 0x4E00 <= ord(c) <= 0x9FFF:
            chars.append(c)

ascii_printable = ''.join(chr(i) for i in range(0x20, 0x7F))
zh_punct = '。，、；：？！「」『』（）〔〕《》〈〉—…‧・～　％＃＆＊＋－／＝＠'
text = ''.join(sorted(set(chars) | set(ascii_printable) | set(zh_punct)))

if not SRC.exists():
    sys.exit(f'找不到來源字型:{SRC}')
OUT.parent.mkdir(parents=True, exist_ok=True)
tmp = OUT.parent / '_chars.txt'
tmp.write_text(text, encoding='utf8')
try:
    subprocess.run([
        'pyftsubset', str(SRC),
        f'--text-file={tmp}',
        '--flavor=woff2',
        '--layout-features=*',   # 標點的 vert/palt 等字距特性要留,不然中文標點會歪
        f'--output-file={OUT}',
    ], check=True)
finally:
    tmp.unlink(missing_ok=True)

print(f'{OUT} — {len(chars)} 漢字 + {len(ascii_printable) + len(zh_punct)} 標點英數,'
      f'{OUT.stat().st_size / 1024:.0f} KB')
