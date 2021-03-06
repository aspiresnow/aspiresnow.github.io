---
title: vim编辑器
date: 2018-09-10 10:26:48
tags:
- linux
categories:
- linux


---

# vim编辑器
定制vim的工作特性： 配置文件：永久有效  全局：/etc/vimrc  个人：~/.vimrc
## 屏幕翻滚类命令

```shell
Ctrl+u  #向文件首翻半屏
Ctrl+d  #向文件尾翻半屏
Ctrl+f #向文件尾翻一屏
Ctrl＋b #向文件首翻一屏
nz  #将第n行滚至屏幕顶部，不指定n时将当前行滚至屏幕顶部

```

## 进入vim的命令

```shell
vim filename #打开或新建文件，并将光标置于第一行首
vim +n filename #打开文件，并将光标置于第n行首
vim + filename #打开文件，并将光标置于最后一行首
vim +/pattern filename #打开文件，并将光标置于第一个与pattern匹配的串处
vim -r filename #在上次正用vi编辑时发生系统崩溃，恢复filename
vim -o/O filename1 filename2 ... #打开多个文件，依次进行编辑

```

##  vi m关闭文件

```shell
:w       #保存
:w file.txt：在末尾将文件内容另存到 file.txt中   (将当前文件中部分内容另存为另一个文件)
:r file.txt：将file中的内容复制到当前文件的光标处  (将另一个文件的内容填充在当前文件中) 
:q        #退出
:q!       #强制退出
:wq       #保存退出编辑器
:set nu   #显示行号，:set nonu：隐藏行号
:set mouse=a #就能够使用鼠标点击光标的位置
:set ic   #忽略大小写
:set autoindent #设置自动缩进  :set noai：取消自动缩进
:syntax on #语法着色，:syntax off：关闭语法着色
可以修改 /etc/vimrc文件修改vim的默认配置，如果只作用于某个用户，在该用户家目录下闯将.vimrc文件，并复制进去内容进行修改
```

## 插入文本类命令

```shell
i           #在光标前
I           #在当前行首
a           #光标后
A           #在当前行尾
o           #在当前行之下新开一行
O           #在当前行之上新开一行
r           #替换当前字符
R           #替换当前字符及其后的字符，直至按ESC键
s           #从当前光标位置处开始，以输入的文本替代指定数目的字符
S           #删除指定数目的行，并以所输入文本代替之
ncw或nCW    #修改指定数目的字
nCC        #修改指定数目的行
C          #删除光标位置到行尾的内容并进入插入模式 (相当于c$) 
c<范围>     #删除光标所在位置周围某个范围的文本并进入插入模式。关于范围请看第5点，常用的组合有：caw - 删除一个单词包括它后面的空格并开始插入； ciw - 删除一个单词并开始插入； ci" - 删除一个字符串内部文本并开始插入； c$ - 从光标位置删除到行尾并开始插入； ct字符 - 从光标位置删除本行某个字符之前（保留该字符）并开始插入。等等。 
```

```shell
常用的范围指令有： 
空格 #光标所在位置字符。（例如 gU空格 - 将光标位置字符转为大写） 
重复某些动作命令 - 光标所在行。 （例如dd删除一行，yy复制一行，cc删除一行文本并开始插入，>> 当前行缩进一格，==自动缩进当前行） 
$ - 从光标位置到行尾 
^ - 从光标位置到行首，不包含缩进空白 
0 - 从光标位置到行首，包含缩进空白 
gg - 从光标位置到文件开头 
ngg - 跳到第n行，如 2gg跳到第2行
G - 从光标位置到文件结尾 
% - 从光标位置到另一边匹配的括号 
f<字符> - 从光标位置到光标右边某个字符首次出现的位置，包括该字符 
F<字符> - 从光标位置到光标左边某个字符首次出现的位置，包括该字符 
t<字符> - 从光标位置到光标右边某个字符首次出现的位置，包括该字符 
F<字符> - 从光标位置到光标左边某个字符首次出现的位置，包括该字符 
/正则表达式 - 从光标位置到下一个匹配正则表达式的位置（跨行） 
?正则表达式 - 从光标位置到上一个匹配正则表达式的位置（跨行） 
aw - 一个单词加一个空格 （a可理解为“一个”，下同） 
iw - 一个单词 （i可理解为in，下同） 
a" - 一个字符串包括双引号 
i" - 一个字符串内部文本 
a< - 一组< >包含的文本，包括< >号本身 
同理类推： i<, a[, i[, a(, i( 
注意：真正vim中的it范围（一对xml标签内部）在ideaVim中不生效。 
```

## 复制、粘贴

```shell
ggvG    #全选
yy    #将当前行复制到缓存区
nyy   #将当前行向下n行复制到缓冲区
yw    #复制从光标开始到词尾的字符。
nyw   #复制从光标开始的n个单词。
y^    #复制从光标到行首的内容。  
y$    #复制从光标到行尾的内容。
p     #粘贴剪切板里的内容在光标后
P     #粘贴剪切板里的内容在光标前
```

## 文本替换

```shell
:s/old/new           #用new替换行中首次出现的old
:s/old/new/g         #用new替换行中所有的old
:s/old/new/gc         #用new替换行中所有的old，每次都需要询问确认
:n,m s/old/new/g     #用new替换从n到m行里所有的old
:%s/old/new/g        #用new替换当前文件里所有的old ,简单替换表达式  :%s/four/4/g , “%” 范围前缀表示在所有行中执行替换，最后的 “g” 标记表示替换行中的所有匹配点，如果仅仅对当前行进行操作，那么只要去掉%即可
如果你有一个像 “thirtyfour” 这样的单词，上面的命令会出错。这种情况下，这个单词会被替换成”thirty4″。要解决这个问题，用 “<”来指定匹配单词开头： :%s/<four/4/g , 显然，这样在处理 “fourty” 的时候还是会出错。用 “>” 来解决这个问题： :%s/<four>/4/g 
```

## 删除命令

```shell
ndw或ndW     #删除光标处开始及其后的n-1个字 ,并复制被删除的
do     #删至行首,并复制被删除的
d$     #删至行尾,并复制被删除的
ndd    #删除当前行及其后n-1行,并复制被删除的
x或X   #删除一个字符，x删除光标后的，而X删除光标前的
Ctrl+u #删除输入方式下所输入的文本
x      #删除当前字符,并复制被删除的
nx     #删除从光标开始的n个字符,并复制被删除的
dd     #删除当前行,并复制被删除的
ndd    #向下删除当前行在内的n行,并复制被删除的
u      #撤销上一步操作
U      #撤销对当前行的所有操作
```

## 搜索及替换命令

```shell
/pattern     #从光标开始处向文件尾搜索pattern 
?pattern     #从光标开始处向文件首搜索pattern
n            #在同一方向重复上一次搜索命令
N            #在反方向上重复上一次搜索命令
：s/p1/p2/g  #将当前行中所有p1均用p2替代
：n1,n2s/p1/p2/g   #将第n1至n2行中所有p1均用p2替代
：g/p1/s//p2/g     #将文件中所有p1均用p2替换
```



## 打开多个文件：vim 1.txt 2.txt

```shell
vim -o 1.txt 2.txt          #水平分割显示
vim -O 1.txt 2.txt          #垂直分割显示
ctrl+w 放开后按 s            #水平拆分窗口
ctrl+w 放开后按 v            #垂直拆分窗口
ctrl+w 放开后按 w   		 #放开后按上下箭头：在各个窗口中切换光标
:next                       #切换到下一个文件
:prev                       #切换到上一个文件
:last                       #切换到最后一个文件
:first                      #切换至第一个文件
:qa                         #退出全部
```



vim编辑器


​	
​	使用
​		vim：模式化的编辑
​	
			基本模式：
				编辑模式，命令模式
				输入模式
				末行模式：
					内置的命令行接口
	
			打开文件：
				# vim [OPTION]... FILE...
					+#: 打开文件后，直接让光标处于第#行的行首；
					+/PATTERN：打开文件后，直接让光标处于第一个被PATTERN匹配到的行的行首；
	
			模式转换：
				编辑模式 --> 输入模式
					i: insert, 在光标所在处输入；
					a: append, 在光标所在处后面输入；
					o: 在当前光标所在行的下方打开一个新行；
					I：在当前光标所在行的行首输入；
					A：在当前光标所在行的行尾输入；
					O：在当前光标所在行的上方打开一个新行；
					c
					C
	
				输入模式 --> 编辑模式
					ESC
	
				编辑模式 --> 末行模式
					:
	
				末行模式 --> 编辑模式
					ESC
	
			关闭文件：
				:q 退出
				:q! 强制退出，丢弃做出的修改；
				:wq 保存退出
				:x 保存退出
				:w /PATH/TO/SOMEWHERE
	
				ZZ: 保存退出；
	
		光标跳转：
			
			字符间跳转：
				h, j, k, l
					h: 左
					l: 右
					j: 下
					k: 上
	
				#COMMAND：跳转由#指定的个数的字符；
	
			单词间跳转：
				w：下一个单词的词首
				e：当前或下一单词的词尾
				b：当前或前一个单词的词首
	
				#COMMAND：由#指定一次跳转的单词数
	
			行首行尾跳转：
				^: 跳转至行首的第一个非空白字符；
				0: 跳转至行首；
				$: 跳转至行尾；
	
			行间移动：
				#G：跳转至由#指定行；
				G：最后一行；
				1G, gg: 第一行；
	
			句间移动：
				)
				(
	
			段落间移动：
				}
				{
	
	vim的编辑命令：
	
		字符编辑：
			x: 删除光标处的字符；
			#x: 删除光标处起始的#个字符；
	
			xp: 交换光标所在处的字符及其后面字符的位置；
	
		替换命令(r, replace)
			r: 替换光标所在处的字符
	
		删除命令：
			d: 删除命令，可结合光标跳转字符，实现范围删除；
				d$: 
				d^:
				d0:
	
				dw
				de
				db
	
					#COMMAND
	
				dd: 删除光标所在的行；
					#dd：多行删除；
	
		粘贴命令(p, put, paste)：
			p：缓冲区存的如果为整行，则粘贴当前光标所在行的下方；否则，则粘贴至当前光标所在处的后面；
			P：缓冲区存的如果为整行，则粘贴当前光标所在行的上方；否则，则粘贴至当前光标所在处的前面；
	
		复制命令(y, yank)：
			y: 复制，工作行为相似于d命令；
				y$
				y0
				y^
	
				ye
				yw
				yb
	
					#COMMAND
	
				yy：复制行
					#yy: 复制多行；
	
		改变命令(c, change)
			c: 修改
				编辑模式 --> 输入模式
	
				c$
				c^
				c0
	
				cb
				ce
				cw
					#COMMAND
	
				cc：删除并输入新内容
				#cc: 
	
		其它编辑操作
	
			可视化模式：
				v: 按字符选定
				V：按行行定
	
				Note：经常结合编辑命令；
					d, c, y
	
			撤消此前的编辑：
				u(undo)：撤消此前的操作；
					#u: 撤消指定次数的操作；
	
			撤消此前的撤消：
				Ctrl+r
	
			重复前一个编辑操作：
				.


​	
​	vim中的末行模式：
​		内建的命令行接口
​	
		(1) 地址定界
			:start_pos,end_pos
				#: 具体第#行，例如2表示第2行；
				#,#: 从左侧#表示行起始，到右侧#表示行结尾；
				#,+#: 从左侧#表示的行起始，加上右侧#表示的行数；
				.: 当前行
				$: 最后一行
					.,$-1
				%：全文, 相当于1,$
	
				/pat1/,/pat2/：
					从第一次被pat1模式匹配到的行开始，一直到第一次被pat2匹配到的行结束；
					#,/pat/
					/pat/,$
	
			使用方式：
				后跟一个编辑命令
					d
					y
					w /PATH/TO/SOMEWHERE: 将范围内的行另存至指定文件中；
					r /PATH/FROM/SOMEFILE：在指定位置插入指定文件中的所有内容；
	
		(2) 查找
			/PATTERN：从当前光标所在处向文件尾部查找；
			?PATTERN：从当前光标所在处向文件首部查找；
				n：与命令同方向；
				N：与命令反方向；
	
		(3) 查找并替换
			s: 在末行模式下完成查找替换操作
				s/要查找的内容/替换为的内容/修饰符
					要查找的内容：可使用模式
					替换为的内容：不能使用模式，但可以使用\1, \2, ...等后向引用符号；还可以使用“&”引用前面查找时查找到的整个内容；
					修饰符：
						i: 忽略大小写
						g: 全局替换；默认情况下，每一行只替换第一次出现；
	
				查找替换中的分隔符/可替换为其它字符，例如
					s@@@
					s###
	
			练习：
				1、复制/etc/grub2.cfg至/tmp/目录，用查找替换命令删除/tmp/grub2.cfg文件中的行首的空白字符；
					%s/^[[:space:]]\+//g
	
				2、复制/etc/rc.d/init.d/functions文件至/tmp目录，用查找替换命令为/tmp/functions的每行开头为空白字符的行的行首添加一个#号；
					:%s/^[[:space:]]/#&/


​	
​	
​	
​	