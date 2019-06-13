---
title: 发布jar包启动
date: 2019-05-10 19:58:46
tags:
- linux
categories:
- 运维
---

# 发布jar包启动

之前都是发布tomcat，现在spring boot直接打包为jar包为可执行包，所以需要一个方便启动、重启jar的工具脚本。

<!--more-->

接收两个参数，一个必传的参数为jar包的名称，一个为可选的springboot的外部配置文件。将jar包上传到 `/usr/local/apps/`目录下。启动后将日志打印到 `/opt/logs/`下。

```shell
#!/bin/sh
appName=$1
dbconfig=$2

appPath=/usr/local/apps
logPath=/opt/logs

echo "appPath:"$appPath
echo "logPath:"$logPath

export PATH=$PATH

if [ ! -d $appPath ]
then
  echo "appPath does not exist,it will be created automatically. appPath:"$appPath
  mkdir -p $appPath
fi

if [ ! -d $logPath ]
then
  echo "logPath does not exist,it will be created automatically. logPath:"$logPath
  mkdir -p $logPath
fi

if [ ! -f $logPath/$appName.log ]
then
  touch $logPath/$appName.log
fi

echo "BEGIN STOP $appName ... "

pid=`ps aux | grep "${appPath}/${appName}.jar" | grep -v "grep" | awk '{print $2}'`

if [ "$pid" != "" ]; then
        kill -9 $pid
        echo "$appName stoped."
else
        echo "$appName is not running."
fi

sleep 1s

chmod u+x $appPath/$appName.jar

JAVA_OPTS="-XX:SurvivorRatio=8 -XX:PermSize=1024m -XX:MaxPermSize=1024m -XX:+HeapDumpOnOutOfMemoryError -XX:ReservedCodeCacheSize=512m -XX:InitialCodeCacheSize=512m -Xmx1024m -Xms1024m"

if [ -n $dbconfig ]
then
	nohup java -jar $appPath/$appName.jar --spring.config.location=$dbconfig  $JAVA_OPTS > $logPath/$appName.log &
else 
	nohup java -jar $appPath/$appName.jar $JAVA_OPTS > $logPath/$appName.log &
fi

echo "$appName is starting."
sleep 1
tail -1000f $logPath/$appName.log
```

启动\重启。第一个参数为jar包的名称，第二个参数可选，为springboot的外部配置文件

```shell
sh ./run.sh spring-boot-test /config/application.properties
```

