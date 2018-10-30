---
title: Git的使用
date: 2018-02-04 10:26:48
tags:
- Git
categories:
- java工具
---

# Git的使用

## git中的提交逻辑

![image](http://omdq6di7v.bkt.clouddn.com/18-1-29/76019026.jpg)

- Workspace：工作区，工作使用的地方，是当前能看到的最新的代码
- Index / Stage：暂存区，.git目录下的index文件，通过`git status`可以查看暂存区状态
- Repository：仓库区（或本地仓库）
- Remote：远程仓库

## Git配置

- 配置git提交时的名称和邮箱

  ```shell
  git config --global user.name "lizhi.zhang"
  git config --global user.email "lizhi.zhang@xxx.com"
  git config --global color.ui true #开启颜色
  git config --global alias.st status #设置命令简写
  git config --unset user.email #删除用户email信息
  ```


## HEAD

HEAD，它始终指向当前所处分支的最新的提交点。你所处的分支变化了，或者产生了新的提交点，HEAD就会跟着改变。

## git常用的指令

![image](http://omdq6di7v.bkt.clouddn.com/18-1-29/62404687.jpg)

### git add

```shell
git add .	#添加当前目录的所有文件到暂存区(只包含新增和修改，不包括删除)
git add	-A    #保存全部增删改
git add	 files   #添加指定文件到暂存区
```

### git rm

```shell
git rm [file1][file2]... #删除工作区文件，并且将这次删除放入暂存区
git rm --cache xxx #从暂存区移除
```

### git commit

```shell
git commit  -m "message" #提交暂存区的指定文件到本地仓库,message代表说明信息
git commit --amend -m "message"  #使用一次新的commit，替代上一次提交
git commit -v #提交时显示所有的diff信息
```

### git checkout

```shell
git checkout [files..]	#一般用来覆盖工作区，如果不指定提交点的时候，默认使用暂存区覆盖工作区
git checkout . #使用暂存区所有文件覆盖工作区
git checkout [commit] [files...] #使用本地仓库的commit覆盖工作区
git checkout head [files...] #使用本地仓库覆盖工作区
git checkout branchName	#切换分支
```

### git fetch

```shell
git fetch #获取远程库的变化到本地库
```

### git pull

```shell
git pull = git fetch+git merge
git pull --rebase = git fetch + git rebase
git pull origin 远程分支:本地分支 #拉取远程代码到工作区分支
```

### git push

```shell
git push [origin/bracnh] #推送本地分支变动到远程分支，如果本地和远程分支已经绑定，不需要输入名称
git push -u origin master –f #强行推送当前分支到远程分支，即使有冲突
```

### git reset

```shell
git reset --soft [commit] [file]	#只改变提交点(本地仓库)，暂存区和工作目录的内容都不改变
git reset --mixed [commit] [file]	#改变提交点(本地仓库)，同时改变暂存区的内容，工作区不变
git reset --hard [commit] [file]	#暂存区、工作区的内容都会被修改到与提交点完全一致的状态
git reset --hard HEAD [file]	#让工作区回到上次提交时的状态
```

### git revert

```shell
git revert head	#撤销前一次 commit
git revert commitNo	#撤销指定的提交
```

revert和reset区别

- git revert用一个新提交来消除一个历史提交所做的任何修改;git reset是直接删除指定的commit。
- 在回滚这一操作上看，效果差不多。但是在日后继续merge以前的老版本时有区别。因为git revert是用一次逆向的commit“中和”之前的提交，因此日后合并老的branch时，导致这部分改变不会再次出现，减少冲突。但是git reset是之间把某些commit在某个branch上删除，因而和老的branch再次merge时，这些被回滚的commit应该还会被引入，产生很多冲突。

- git reset 是把HEAD向后移动了一下，而git revert是HEAD继续前进，只是新的commit的内容和要revert的内容正好相反，能够抵消要被revert的内容。

![image](http://omdq6di7v.bkt.clouddn.com/18-1-29/63781244.jpg)

### git log

用于查看git的提交历史日志

```shell
git log --graph —pretty=oneline #查看树形的历史提交日志
git log --stat #查看提交记录及记录中提交的文件
git log -S [关键词] #根据关键词搜索提交历史
git log -p [file] #显示该文件相关的每一次diff
git blame [file] #显示该文件什么人在什么时间修改过
git reflog #查看当前分支最近几次提交
```

### git diff

```Shell
git diff	#比较工作区与暂存区区别
git diff head [file] #比较工作区与本地库中区别
git diff --cached [file] #比较暂存区与本地库区别
git diff [commit1] [commit2] #显示两次提交之间的区别
git diff branch1 branch2 [file] --stat #显示两个分支上该文件的区别
git show [commit] #查看提交改变的详细内容

```


### git stash

当正在进行一些工作，工作区处于最新状态，这时需要切换到另外分支进行工作，但是又不想提交代码代码，这个时候就需要使用`git stash`对当前工作区进行暂存

```shell
git status #当前很多变动
git stash save -a "msg"#暂存
git status # 发现没有变动了
git stash list # 查看暂存区列表
git show stash@{0} # 查看暂存的改变是什么
git stash apply stash@{2} #恢复暂存区，如果不指定，将恢复到最近的一个暂存
git stash pop      # 应用最新的一次暂存的东西,并移除一个stash
git stash drop <stash@{id}>  # 删除指定编号的stash，如果不指定编号，删除最新的
git stash clear # 清空所有的stash
git stash branch 分支名 stash@{id} #根据stash创建分支
```

### git cherry-pick

```shell
git cherry-pick [commit] #可以选择另外一个分支上的一个commit，合并到当前分支
```



## 分支 branch

在开发过程中往往会需要多个开发任务并行开发，或者多人同时操作一个项目时，往往会有很多冲突，这个时候就需要用到git的分支。当需要单独开发一个任务时，从主分支上拉出一个新的分支，然后开发完毕后，将主分支的代码merge到自己的分支上，解决冲突后，再讲自己的分支merge到主分支上。

### 常用命令

```shell
git branch	#列出所有本地分支
git branch -r	#列出所有远程分支
git branch -a	#列出所有本地分支和远程分支
git branch -vv	#查看本地分支和远程分支的关联关系
git branch xx	#新建一个分支，但依然停留在当前分支
git checkout xx	#切换到指定分支，并更新工作区
git checkout -b xx	#新建一个分支，并切换到该分支
git push -u origin 本地当前分支:远程分支名	#将本地分支推送到远程创建分支
git branch -d xx	#删除分支
git push origin --delete [origin/branch]	#删除远程分支
git branch --set-upstream-to=origin/远程分支 本地分支	#绑定本地分支和远程分支的关系
git checkout -b 本地分支名x origin/远程分支名x	#从远程分支下拉
git branch 本地分支名 --track orign/远程分支名	#新建一个分支，与指定的远程分支建立追踪关系
git checkout -  #切换到上一个分支
```

### 合并分支

#### git merge

```shell
git merge [branch1]   #将branch1合并到当前分支上
```

#### git rebase

```shell
git rebase [branch1] #将branch1合并到当前分支上
```

**git merge **是把远程的修改拉下来然后和本地的修改合并，然后生成一个新的commit

**git rebase** 会将所有的提交合并到一条线上，并不会产生新的commit

## 标签 tag

在git中分支是动态的，每一次提交，分支都一直在跟着提交变动，标签是分支在某个时刻的快照，标签是固定的

```shell
git tag  #列出所有的tag
git tag -l 'rex'  #搜索tag
git tag [tag]  #在当前的commit新建一个tag
git tag [tag] [commit] #在指定的commit新建一个tag
git tag -d [tag] #删除本地的tag  git push origin :[tag] #删除远程tag
git show [tag] #查看tag信息
git push origin [tag]  #将本地tag推送到远程
git push origin --tags  #将本地所有的tag推送到远程
git checkout -b [branch] [tag] #从tag拉一个分支
```



## 设置git的alias

每次输入指令的全名称比较浪费时间，git提供了给指令设置alias的功能，通过设置alias提高命令输入速度

在user目录下找到.gitconfig(没有就创建一个)然后编辑，加入以下命令

```xml
[alias]
    br = branch
    ch = checkout
    co = commit
    st = status
    pl = pull --rebase
    ps = push
    dt = difftool
    l = log --stat
    lg = log --graph --pretty=oneline
    ca = commit -a
    cm = commit -m 
    rv = revert
    re = reset
    cl = clone
    fe = fetch
    sh = stash
    brv = branch -vv
    ad = add .

```

## 一些配置

- 忽略一些未add的文件，避免add . 的时候将其add进去

  在 .git/info/exclude 中添加要忽略的文件，如要忽略 /test.log，则填写 test.log,这样在git add . 的时候将不会添加test.log到git版本控制

- 忽略已纳入版本的文件修改，如本地修改的jdbc配置，又不想提交到远程仓库，所有就想在执行git add . 的时候不要将本地的修改提交

  使用 **git update-index -\-assume-unchanged   xxx**：可以忽略这个xxx文件的修改。从而不用提交到库里面。要想恢复该文件则执行 **git update-index -\-no-assume-unchanged xxx** 来恢复跟踪

  ```shell
  git update-index --assume-unchanged   xxx
  git update-index --no-assume-unchanged xxx
  ```

## 解决冲突

当多人在操作同一个分支的时候，由于并发工作，常常会产生代码冲突，如果在提交代码前，别的同事提交了代码，经常会由于冲突无法提交代码，这个时候就需要解决完冲突，然后重新提交。

```shell
git push  #提交，如果有冲突，会提示提交失败
git pull #有冲突，拉取远程代码，
	#如果能自动合并，会提示auto merge成功，然后再git push提交代码
	#失败，需要手动解决冲突
		1. git status #查看冲突情况
		2. 打开冲突文件，解决冲突
		3. git add . #解决完冲突后，一定要执行以下该命令，不然git状态为merging状态
		4. git commit -m 'xxx' #提交代码
		5. git push #推送到远程仓库
```



### 清除git提交历史记录

```shell
1.Checkout

   git checkout --orphan latest_branch

2. Add all the files

   git add -A

3. Commit the changes

   git commit -am "commit message"

4. Delete the branch

   git branch -D master

5.Rename the current branch to master

   git branch -m master

6.Finally, force update your repository

   git push -f origin master
```

## 更新fork工程

fork 了别人的仓库后，原作者又更新了仓库，如何将自己的代码和原仓库保持一致

```shell
git remote -v  #查看远程仓库
# origin  git@github.com:aspiresnow/spring-framework.git (fetch) 
# origin  git@github.com:aspiresnow/spring-framework.git (push)
git remote add upstream https://github.com/spring-projects/spring-framework.git#添加被fork的远程仓库
git remote -v
# origin  git@github.com:aspiresnow/spring-framework.git (fetch)
# origin  git@github.com:aspiresnow/spring-framework.git (push)
# upstream        https://github.com/spring-projects/spring-framework.git (fetch)
# upstream        https://github.com/spring-projects/spring-framework.git (push)
git fetch upstream #同步被fork仓库的更新
git merge upstream/mastegit r #把 upstream/master 分支合并到本地 master 上
git push origin master # 推到origin远程

```

# 参考资料

[一篇文章，教你学会Git](https://www.jianshu.com/p/072587b47515)