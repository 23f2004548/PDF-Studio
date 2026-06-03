with open('node_modules/pdfjs-dist/build/pdf.mjs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(14540, 14610):
    print(f'{i+1}: {lines[i]}', end='')
