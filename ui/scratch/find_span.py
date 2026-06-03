import re

with open('node_modules/pdfjs-dist/build/pdf.mjs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'createElement' in line and 'span' in line:
        print(f"Line {i+1}: {line.strip()}")
        # print surrounding lines
        for j in range(max(0, i-5), min(len(lines), i+15)):
            print(f"  {j+1}: {lines[j]}", end='')
        print("-" * 40)
