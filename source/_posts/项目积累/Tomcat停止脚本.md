---
title: Tomcat停止脚本
date: 2019-05-10 19:58:46
tags:
- linux
categories:
- 运维
---

# Tomcat停止脚本

直接执行linux自带的shutdown.sh，会发现进程并没有被关掉而是越来越多，由于tomcat自己有相应的保护机制，所以我们只需要强制结束其进程即可，所以自己实现类了一个脚本去 kill 进程
  

<!--more-->

在tomcat的bin目录下创建 stopdown.sh

```shell
#!/bin/bash
#scripts for stop tomcat

SCRIPT_PATH=$(cd `dirname $0`; pwd)
echo 'script_path is '+$SCRIPT_PATH
TOMCAT_PATH=${SCRIPT_PATH%/*}
echo 'tomcat_path is '+$TOMCAT_PATH
PID=`ps aux | grep $TOMCAT_PATH/ | grep "org.apache.catalina.startup.Bootstrap"  | grep -v grep | awk '{print $2}'`
echo 'the tomcat pid is '+$PID
if [ "$PID" != "" ]; then
    kill -9 $PID
    echo 'Tomcat stoped.'
else
    echo 'Tomcat is not running.'
fi

```

