---
title: maven笔记
date: 2019-08-14 11:23:24
tags:
- Maven
categories:
- Maven

---

# maven笔记

maven的一些使用经验

<!--more-->

#### 插件帮助

使用maven的help插件的describe查看目标插件的配置项

```shell
mvn help:describe -Dplugin=<plugin_name> -Dgoal=<goal> -Ddetail
mvn help:describe -Dplugin=compiler -Dgoal=compile -Ddetail=true
mvn help:describe -DgroupId=org.apache.maven.plugins -DartifactId=maven-jar-plugin -Ddetail=true
```

#### 坐标

通过 `groupId`、`artifactId`、`version`、`packaging`、`classifier` 定义一个jar

- groupId:定义当前项目所在的实际项目，注意不是只到组织级别

- artifactId:模块名

- version:模块版本，分`SNAPSHOT`和`RELEASE`

- packaging: 打包方式，默认是`jar`，可以设置为 `war` 和 `pom`

- classifier: 附属构件，如相同的坐标，生成 -javadoc.jar,和 -sources.jar,有时候jar包会生成基于不同jdk版本构建出的构件，带classifier，如 json-lib-2.4-jdk15.jar,不能直接定义，由对应插件帮助生成

#### 依赖dependency

- groupId
- artifactId
- version
- type: 默认是jar，如果被依赖的jar包坐标的packaging是pom，这里也应该写pom
- optional: 依赖是否可选，默认是false，如果是true，**将不会触发传递依赖**，在spring中使用可选依赖解决jar包的编译问题，同时不会影响使用方版本依赖，由使用方提供直接依赖
- scope: 依赖范围
  - compile: 默认的scope，编译范围的依赖
  - test: 测试范围的依赖，只有单元测试的时候才会编译依赖
  - provided: 已提供范围的依赖，编译和测试会依赖，运行的时候不依赖，由外部运行平台提供jar，如servlet-api.jar，tomcat容器会提供
  - runtime:运行时范围依赖，编译和测试的时候不会依赖jar，只有在运行的时候提供，如jdbc的实现，编译的时候只需要接口不需要具体实现。
  - system: 添加本地jar包
  - import: 导入依赖范围。只有在`dependencyManagement`中才生效，用于控制jar包版本。接入bom
- exclusions: 排除传递依赖的jar包

#### 传递依赖

A依赖B，B依赖C，那么A自动依赖C

由于传递依赖引起的jar包冲突，maven使用两种原则解决

- 依赖路径最短优先
- 若路径长度一样，先声明的优先

#### 仓库

- 本地仓库

  在settings.xml中通过配置  localRepository

  ```xml
  <localRepository>D:/java/maven_repository</localRepository> 
  ```

- 私服

  ```xml
  <repository>
      <id>mintq-snapshots</id>
      <url>http://localhost:6666/nexus/content/repositories/snapshots/</url>
      <!--maven 默认使用default-->
      <layout>default</layout>
      <releases>
          <enabled>true</enabled>
      </releases>
      <snapshots>
          <!--是否开启snapshots类型jar的下载-->
          <enabled>true</enabled>
          <!--maven从远程仓库检查更新的频率，daily:(默认)每天检查一次;never:从不检查更新;always:每次构建都检查更新;interval:X  每隔X分钟检查一次-->
          <updatePolicy>always</updatePolicy>
          <!--maven验证校验和文件 warn: 验证失败输出警告信息; fail: 验证失败则构建失败; ignore: 忽略验证失败-->
          <checksumPolicy>fail</checksumPolicy>
      </snapshots>
  </repository>
  ```

  

- 中央仓库

#### 项目部署

通过`distributionManagement` 配置工程的部署信息，只能配置在 工程的pom文件中，可以在父pom中配置，子pom会继承。

```xml
<distributionManagement>
    <snapshotRepository>
        <!--id为远程仓库的唯一标识-->
        <id>nexus-snapshots</id>
        <name>snapshots resp</name>
        <url>http://localhost:6666/nexus/content/repositories/snapshots</url>
    </snapshotRepository>
    <repository>
        <id>nexus-releases</id>
        <name>releases resp</name>
        <url>http://localhost:6666/nexus/content/repositories/releases</url>
    </repository>
</distributionManagement>
```

deploy的时候需要认证，在settings.xml中的servers里面配置，注意id要和distributionManagement中的id保持一致

```xml
<servers>
    <server>  
        <!--仓库id,对应settings.xml中的repository或者pom中的repository元素的id-->
        <id>nexus-releases</id>  
        <username>admin</username>  
        <password>admin123</password>  
    </server>  
    <server>  
        <id>nexus-snapshots</id>  
        <username>admin</username>  
        <password>admin123</password>  
    </server> 
</servers>
```

#### 快照版本

对于-SNAPSHOT结尾的jar包，每次install和deploy的时候不需要升级版本，maven会自动在构建上打上时间戳，依赖jar包的时候默认会使用最新的jar包。如果想每次构建项目的时候使用最新发布的snapshot包，需要在repository的snapshot节点下的updatePolicy配置为always。或者使用maven命令，加上-U，强制检查更新

```shell
mvn clean install —U # 强制更新snapshot版本的jar
```

#### 镜像

如果仓库X可以提供仓库Y存储的所有内容，那么就可以认为X是Y的一个镜像。通过使用镜像仓库，可以实现代理功能。

```xml
<!--私服作为所有仓库的镜像，所有的请求都会到私服,然后私服去代理请求目标仓库-->
<mirrors>
    <mirror>
        <id>nexus-releases</id>
        <name>internal nexus repository</name>
        <url>http://192.168.1.247:9999/nexus/content/groups/public</url>
        <mirrorOf>*</mirrorOf>
    </mirror>
</mirrors>
```

如果镜像仓库需要登陆验证，则需要基于 mirror的id在server中配置用户名密码

#### 生命周期

maven提供了三套相互独立的生命周期，每个生命周期包含几个阶段，阶段是有顺序的，后面的阶段依赖前面的阶段，执行后面阶段的时候会自动执行前面的阶段。阶段对应`plugin`插件配置中的`phase`

1. clean生命周期
   - pre-clean 执行清理前需要完成的工作
   - clean 清理上一次构建生成的文件
   - post-clean 执行一些清理后需要完成的工作
2. default生命周期
   - validate、initialize
   - generate-sources、process-sources、generate-resources、process-resources、compile、process-classes
   - generate-test-sources、process-test-sources、generate-test-resources、process-test-resources、test-compile、process-test-classes、test
   - prepare-package、package
   - pre-integration-test、integration-test、post-integration-test
   - verify、install、deploy
3. site生命周期
   - pre-site
   - site
   - post-site
   - site-deploy

#### 插件执行

插件命令执行格式：`mvn 插件名称 : 目标`，目标对应`plugin`插件配置中的`goals`

如 `mvn dependency:tree`,  `mvn compiler:compile`。

#### 插件仓库

maven会依赖一些插件，当本地仓库不存在插件的时候会去远程拉取，但是不会去`repository`中拉取，maven的插件的远程仓库需要单独配置，使用`pluginRepositories`来配置远程插件仓库，可以放到settings.xml或者pom.xml中

```xml
<pluginRepositories>
    <pluginRepository>
        <id>nexus-remote</id>
        <name>nexus-remote</name>
        <url>http://maven.aliyun.com/nexus/content/groups/public/</url>
        <snapshots>false</snapshots>
        <release>
            <updatePolicy>never</updatePolicy>
        </release>
    </pluginRepository>
</pluginRepositories>
```

#### 聚合和继承

所有的pom默认继承一个父pom，在 MAVEN_HOME\lib\maven-model-builder-xx.jar中\org\apache\maven\model下的pom.xml

父pom中的以下元素可以被继承：groupId、version、description、dependencies、dependencyManagement、build、repositories、distributionManagement、properties、organization、url、developers、contributors、issueManagement、ciManagement、scm、

在父pom中声明`dependencyManagement`和`pluginManagement`用于管理依赖，不会造成实际的插件依赖行为，只会约束版本和作用范围以及插件的配置

#### 私服

私服中的 **public** 仓库是将所有类型仓库聚合合并通过一致的地址提供服务。所以配置Release的仓库只需要配置**public**的仓库就行。

#### 常用命令

```shell
mvn compile -DskipTests
mvn compile -Dmaven.test.skip=true  #跳过测试并且跳过编译测试代码
```

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <skipTests>true</skipTests>
    </configuration>
</plugin>
```
