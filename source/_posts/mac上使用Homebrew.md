---
title: mac上使用Homebrew
date: 2018-07-14 10:26:48
tags:
- homebrew
categories:
- java工具
---

# mac上使用Homebrew

Homebrew是一个包管理工具，类似linux上的yum和apt包管理，可以让你在mac上安装和更新程序变得更方便，只需要输入简单的命令，从而避免安装过程中的包依赖。

## 安装homeBrew

```shell
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

```shell
brew --version  #查看是否安装成功 Homebrew 1.6.17
```

## 软件管理

```shell
brew install <formula>  #安装软件
brew install https://raw.github.com/dsr/homebrew/9b22d42f50fcbc5e52c764448b3ac002bc153bd7/Library/Formula/python3.rb

brew uninstall <formula> #卸载软件
brew outdated <formula> #插件软件是否过时
brew upgrade <formula> #更新软件
brew list #列出所有通过brew安装的软件
brew search  <formula># 搜索可以通过brew安装的软件
brew cleanup <formula> #卸载软件
brew info <formula> #查看安装的软件的信息
brew switch <formula> <version> #切换安装的版本
brew home <formula> #查看安装的软件的目录
```

## 安装路径

`Homebrew`会将软件包安装到独立目录(`/usr/local/Cellar`)，并将其文件软链接至`/usr/local`。  将配置文件放到`/usr/local/etc`下，

## 服务管理

```shell
brew services list # 展示所有服务
brew services run xxx #启动
brew services start xxx #启动
brew services stop xxx #停止
brew services restart xxx #重启
brew services cleanup #清除所有服务
```

