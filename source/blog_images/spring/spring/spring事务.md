---
title: spring事务
date: 2018-09-28 11:28:43
tags:
- spring 
categories:
- spring

---

# spring事务

## 一、在同一类中一个调用本类中另一个有事务的方法,事务是无效

第一步：首先在spring的配置文件中加入以下配置

```xml
<!-- 激活自动代理功能 -->
<aop:aspectj-autoproxy/>
<aop:aspectj-autoproxy proxy-target-class="true" expose-proxy="true" />
```

第二步：将之前使用普通调用的方法,换成使用代理调用

```java
((TestService)AopContext.currentProxy()).testTransactional2();
```

或者直接使用手动回滚

```java
TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
```

## 二、spring声明式事务管理默认对非检查型异常和运行时异常进行事务回滚，而对检查型异常则不进行回滚操作

1 让checked例外也回滚：在整个方法前加上 @Transactional(rollbackFor=Exception.class)

 2 让unchecked例外不回滚： @Transactional(notRollbackFor=RunTimeException.class)

 3 不需要事务管理的(只查询的)方法：@Transactional(propagation=Propagation.NOT_SUPPORTED)

## 三、事务的传播行为

```
PROPAGATION_REQUIRED -- 支持当前事务，如果当前没有事务，就新建一个事务。这是最常见的选择。 
PROPAGATION_SUPPORTS -- 支持当前事务，如果当前没有事务，就以非事务方式执行。 
PROPAGATION_MANDATORY -- 支持当前事务，如果当前没有事务，就抛出异常。 
PROPAGATION_REQUIRES_NEW -- 新建事务，如果当前存在事务，把当前事务挂起。 
PROPAGATION_NOT_SUPPORTED -- 以非事务方式执行操作，如果当前存在事务，就把当前事务挂起。 
PROPAGATION_NEVER -- 以非事务方式执行，如果当前存在事务，则抛出异常。 
PROPAGATION_NESTED -- 如果当前存在事务，则在嵌套事务内执行。如果当前没有事务，则进行与PROPAGATION_REQUIRED类似的操作。 

  PROPAGATION_REQUIRES_NEW 启动一个新的, 不依赖于环境的 "内部" 事务. 这个事务将被完全 commited 或 rolled back 而不依赖于外部事务, 它拥有自己的隔离范围, 自己的锁, 等等. 当内部事务开始执行时, 外部事务将被挂起, 内务事务结束时, 外部事务将继续执行. 
    另一方面, PROPAGATION_NESTED 开始一个 "嵌套的" 事务,  它是已经存在事务的一个真正的子事务. 潜套事务开始执行时,  它将取得一个 savepoint. 如果这个嵌套事务失败, 我们将回滚到此 savepoint. 潜套事务是外部事务的一部分, 只有外部事务结束后它才会被提交. 
    由此可见, PROPAGATION_REQUIRES_NEW 和 PROPAGATION_NESTED 的最大区别在于, PROPAGATION_REQUIRES_NEW 完全是一个新的事务, 而 PROPAGATION_NESTED 则是外部事务的子事务, 如果外部事务 commit, 潜套事务也会被 commit, 这个规则同样适用于 roll back. 

```

