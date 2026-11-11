import io

p = r'D:\projects\7fa4-chat-site\mock\preview.html'
s = io.open(p, encoding='utf-8').read()

hook = ('<script>\n'
        '  (function(){var m=/[?&]theme=(dark|light)/.exec(location.search);'
        ' if(m) document.documentElement.dataset.theme=m[1];})();\n'
        '</script>\n')
if 'dataset.theme=m[1]' not in s:
    s = s.replace('</head>', hook + '</head>')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
