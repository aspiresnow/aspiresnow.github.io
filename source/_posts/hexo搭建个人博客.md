---
title: hexo搭建个人博客
date: 2017-09-01 00:17:40
tags: hexo
---

# hexo+github搭建个人博客

## 简介

Hexo 是一个快速、简洁且高效的博客框架。Hexo 使用 [Markdown](http://daringfireball.net/projects/markdown/)（或其他渲染引擎）解析文章，在几秒内，即可利用靓丽的主题生成静态网页。由于github pages存放的都是静态文件，博客存放的不只是文章内容，还有文章列表、分类、标签、翻页等动态内容，假如每次写完一篇文章都要手动更新博文目录和相关链接信息，相信谁都会疯掉，**所以hexo所做的就是将这些md文件都放在本地**，每次写完文章后调用写好的命令来批量完成相关页面的生成，然后再将有改动的页面提交到github。

<!--more-->

## 安装

- 安装node.js

  下载对应版本的node.js安装，并配置环境变量path

- 安装git

- 安装hexo

  ```shell
  npm config set registry https://registry.npm.taobao.org
  sudo npm install --unsafe-perm --verbose -g hexo
  ```

  ​

## 初始化hexo

- 创建一个博客存放目录 /blogs，在该目录下进行hexo初始化

  ```shell
  $ hexo init /blogs
  $ cd /blogs
  $ npm install
  ```

  完成后/blogs目录下生成以下文件

  ```
  ·
  |-- _config.yml
  |-- package.json
  |-- scaffolds
  |-- source
  |   |-- _drafts
  |   |-- _posts
  |-- themes

  _config.yml站点配置文件，很多全局配置都在这个文件中。
  package.json 应用数据。从它可以看出hexo版本信息，以及它所默认或者说依赖的一些组件。
  scaffolds 模版文件。当你创建一篇新的文章时，hexo会依据模版文件进行创建，主要用在你想在每篇文章都添加一些共性的内容的情况下。
  scripts 放脚本的文件夹， 就是放js文件的地方
  source 这个文件夹就是放文章的地方了，除了文章还有一些主要的资源，比如文章里的图片，文件等等东西。这个文件夹最好定期做一个备份，丢了它，整个站点就废了。
  themes 主题文件夹。
  ```

- 初始化hexo完成后，安装 hexo server

  ```shell
  $ sudo npm install hexo-server 
  $ npm install hexo-generator-index --save #索引生成器
  $ npm install hexo-generator-archive --save #归档生成器
  $ npm install hexo-generator-category --save #分类生成器
  $ npm install hexo-generator-tag --save #标签生成器
  $ npm install hexo-deployer-git --save #hexo通过git发布（必装）
  $ npm install hexo-renderer-marked@0.2.7--save #渲染器
  $ npm install hexo-renderer-stylus@0.3.0 --save #渲染器
  ```

- 生成静态页面并打开hexo本地服务

  ```shell
  $ hexo generate #生成静态页面  (或 hexo g)
  $ hexo server  # 启动本地hexo
  ```

  启动完成后打开http://localhost:4000查看效果

## 创建博客

- 执行命令创建博客

  ```shell
  $ hexo new 'hexo搭建个人博客'
  ```

  此时hexo会在source下的_posts目录下创建一个名为hexo搭建个人博客的md文件，会自动生成博客标题和时间，同时可以手动去该目录下创建博客

- 使用<!—more—> 控制哪部分作为简介

  ```
  title: hexo搭建个人博客
  date: 2017-09-01 00:17:40
  categories: 默认分类 #分类
  tags: hexo
  description: 附加一段文章摘要，字数最好在140字以内，会出现在meta的description里面
  ```


  hexo+github搭建个人博客

  简介

  Hexo 是一个快速、简洁且高效的博客框架。Hexo 使用 Markdown（或其他渲染引擎）解析文章，在几秒内，即可利用靓丽的主题生成静态网页。由于github pages存放的都是静态文件，博客存放的不只是文章内容，还有文章列表、分类、标签、翻页等动态内容，假如每次写完一篇文章都要手动更新博文目录和相关链接信息，相信谁都会疯掉，所以hexo所做的就是将这些md文件都放在本地，每次写完文章后调用写好的命令来批量完成相关页面的生成，然后再将有改动的页面提交到github。

  <!--more-->
  ```

## 关联github

- 在github上创建以用户名.github.io的仓库，aspiresnow.github.io

- 配置ssh key

  ```shell
  $ cd ~/. ssh #检查本机已存在的ssh密钥
  $ ssh-keygen -t rsa -C "714131254@qq.com"
  ```

  连续点回车然后连续3次回车，最终会生成一个文件在用户目录下，打开用户目录，找到`.ssh\id_rsa.pub`文件，记事本打开并复制里面的内容，打开你的github主页，进入个人设置 -> SSH and GPG keys -> New SSH key：

- 测试ssh配置是否成功

  ```shell
  $ ssh -T git@github.com
  ```

  如果提示`Are you sure you want to continue connecting (yes/no)?`，输入yes，然后会看到

  > Hi liuxianan! You’ve successfully authenticated, but GitHub does not provide shell access. 

  说明配置成功，此时添加git配置
  ```shell
  > $ git config --global user.name "liuxianan"// 你的github用户名，非昵称
  > $ git config --global user.email  "xxx@qq.com"// 填写你的github注册邮箱
  ```
- 修改/blogs目录下的 **_config.yml **文件，在修改最下方的**deploy**为：(注意:后面要有空格)

  ```
  deploy:
    type: git
    repository: git@github.com:aspiresnow/aspiresnow.github.io.git
    branch: master
  ```

- 安装hexo的git部署

  ```shell
  $ npm install hexo-deployer-git --save
  ```

- 将生成静态页面并部署到github的仓库中

  ```shell
  $ hexo clean
  $ hexo d -g 
  或者
  $ hexo generate
  $ hexo deploy
  ```

  访问https://aspiresnow.github.io/验证效果

## 修改主题

- 首先将主题库clone到/blogs目录下的themes目录：

  ```shell
  $ cd /blogs/themes/
  $ git clone https://github.com/hilanmiao/hexo-theme-lanmiao
  ```

- 安装主题

  ```shell
  $ cd hexo-theme-lanmiao
  $ npm install
  ```

- 修改hexo的主题配置配置文件`_config.yml`中的主题标签

  ```
  # Site
  favicon: /image/favicon.jpg
  header-img: /image/header-img.png

  # Writing
  post_asset_folder: true

  # Extensions
  theme: hexo-theme-lanmiao#对应主题的文件夹名称
  ```

- 执行命令

  ```shell
  hexo clean #清空
  hexo d -g  #重新部署
  ```

## 参考

- 主题地址：[LanMiao](https://github.com/hilanmiao/hexo-theme-lanmiao)