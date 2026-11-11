import io

p = r'D:\projects\7fa4-chat-site\mock\preview.html'
s = io.open(p, encoding='utf-8').read()

# 1) 侧栏徽标放到文字后面
s = s.replace('<div class="item active"><span class="tag">3</span>数学分析 · 助教</div>',
              '<div class="item active">数学分析 · 助教<span class="tag">3</span></div>')

# 2) 第一条消息的公式重写为更干净的求和记号
old_start = s.index('<p>第 3 题换序可以这样理解：若')
old_end = s.index('</p>', old_start) + 4
new_p = ('<p>第 3 题换序可以这样理解：若 '
         '<span class="formula"><span class="big">∑</span>'
         '<span class="lim2"><span class="up">∞</span><span class="dn">n=1</span></span>'
         '<span class="var">a</span><span class="sub">n</span></span>'
         ' 在一致收敛下成立，逐项积分就不必再补条件。</p>')
s = s[:old_start] + new_p + s[old_end:]

# 3) 补 .var/.sub 样式
s = s.replace('.lim2 .up,.lim2 .dn{opacity:.85}',
              '.lim2 .up,.lim2 .dn{opacity:.85}\n'
              '  .var{font-style:italic;font-size:15px;line-height:1}\n'
              '  .sub{font-size:9.5px;vertical-align:-.28em;margin-left:.5px}')

# 4) 中间再加一条，让节奏更自然
s = s.replace('<div class="typing"><i></i><i></i><i></i></div>',
              '<div class="msg me">\n'
              '          <div class="bubble me">\n'
              '            <p>表格收到，我按 <code>SI</code> 单位重算一遍再回。</p>\n'
              '          </div>\n'
              '        </div>\n\n'
              '        <div class="typing"><i></i><i></i><i></i></div>')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched bytes:', len(s))
