---
title: spring入门
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring入门

## 一、spring-framework组成

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/springComponent.jpg)

- spring-core、spring-beans 提供了基础的依赖注入和控制反转功能 BeanFactory。
- spring-context 提供了ApplicationContext接口集成容器。 并提供了资源加载、国际化等功能
- spring-context-support 提供了集成第三方jar包(guava、javaMail、quatz、freeMarker等)到context中功能.
- spring-expression 提供了SpEL在运行期间向容器对象注入属性功能。
- spring-aop 提供了面向切面编程功能
- spring-aspects 集成AspectJ
- spring-instrument 提供了字节码注入的的切面实现
- spring-instrument-tomcat 提供了tomcat的代理
- spring-jdbc 对jdbc代码的封装
- spring-tx 提供spring声明式事务
- spring-orm 集成O/R-mapping 持久化框架 如JPA、JDO、Hibernate
- spring-oxm 提供了Object/XML mapping的抽象层，用于支持 JAXB、Castor、XMLBeans、JiBX、XStream
- spring-web 将servlet的功能集成到IOC中
- spring-webmvc 提供了mvc和rest web请求
- spring-test 集成测试框架，并提供mock功能

## 版本控制

在使用maven添加spring依赖的时候，一般都会希望spring-framework中所有的jar包都是同一个版本，通过使用spring-framework-bom可以指定版本，这样就避免了传递依赖导致的版本不一致，同时也可以省略了在spring-framework各个模块上重复的指定版本号

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-framework-bom</artifactId>
            <version>4.3.19.RELEASE</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## 日志控制

spring默认使用`commons-logging`记录日志。在`spring-core`中依赖了该jar包。目前比较流行的是使用 `slf4j+log4j2`或者`slf4j+logback`.

```xml
<dependency>
   <groupId>org.springframework</groupId>
   <artifactId>spring-core</artifactId>
   <!--使用slf4j 排除spring默认日志实现  jcl-->
   <exclusions>
      <exclusion>
         <groupId>commons-logging</groupId>
         <artifactId>commons-logging</artifactId>
      </exclusion>
   </exclusions>
</dependency>
<!--jcl的日志重定向到slf4j 依赖slf4j-api-->
<dependency>
   <groupId>org.slf4j</groupId>
   <artifactId>jcl-over-slf4j</artifactId>
   <version>1.7.21</version>
</dependency>
<!--logback默认实现slf4j 依赖logback-core-->
<dependency>
   <groupId>ch.qos.logback</groupId>
   <artifactId>logback-classic</artifactId>
   <version>1.1.7</version>
</dependency>
```
