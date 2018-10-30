---
title: shiro介绍
date: 2017-09-29 15:06:24
tags:
- shiro
categories:
- 权限
---

# shiro介绍

shiro是一个简单适用的安全框架，通过shiro可以方便的对应用进行认证、授权、加密、session管理工作。

- 目标
  - 用户登录token验证
  - 根据用户的角色和权限信息进行权限验证
  - 提供一个可以在任意环境使用的Session API
  - 支持多个用户的角色权限信息来源，并进行聚合
  - 支持单点登录
  - 支持记忆**登录
- shiro的组件

![image](http://omdq6di7v.bkt.clouddn.com/17-9-29/52380803.jpg)

​	**Authentication(认证)**：系统验证用户登录信息
​	**Authorization(授权)**：验证用户有哪些资源的访问权限
​	**CIpher(加解密)**：shiro支持加解密算法
​	**Permission(权限)**：一个功能、一个方法、一个URL，总之就是一个访问控制
​	**Role**：权限的集合
​	**Session**：用户跟application交互过程中存储信息的结构，退出登录时删除

## 流程

1. 获取shiro中的用户，使用Subject对象代表当前用户，如果是Web，获取到的是request请求，普通应用获取到的是当前线程对象

   ```java
   Subject currentUser = SecurityUtils.getSubject();
   Session session = currentUser.getSession();//获取当前会话
   ```

2. 指定当前登录人的用户名密码进行一次登录

   ```java
   if ( !currentUser.isAuthenticated() ) {
       //通过用户的信息创建token
       UsernamePasswordToken token = new UsernamePasswordToken("lonestarr", "vespa");
       //指定`记住我`
       token.setRememberMe(true);
       try {
       	currentUser.login( token );
       } catch ( UnknownAccountException uae ) {
           //username wasn't in the system, show them an error message?
       } catch ( IncorrectCredentialsException ice ) {
           //password didn't match, try again?
       } catch ( LockedAccountException lae ) {
           //account for that username is locked - can't login.  Show them a message?
       } catch ( AuthenticationException ae ) {
           //unexpected condition - error?
       }
   }
   ```
3. 检验用户角色权限
   ```java
   if ( currentUser.hasRole( "schwartz" ) ) //校验角色
   if ( currentUser.isPermitted( "winnebago:drive:eagle5" ) )//权限层级
   ```
## 基本原理

![image](http://omdq6di7v.bkt.clouddn.com/17-9-30/81616656.jpg)
**Subject**：一个抽象概念，同shiro应用交互的对象的抽象，shiro提供的唯一交互接口
**Security Manager**:shiro的核心模块,subject的后期处理都由它进行处理，Security Manager是模块化的继承，每个模块分别负责不同的功能。
**Realm**：shiro的DAO层，提供用户、角色、权限信息，连接一个或多个数据源并将数据转换成shiro可以理解的数据
**Authenticator**：用于验证用户登录时是否能够成功
**Authorizer** ：负责控制用户的访问资源权限
**SessionManager** :管理应用session，如果是web项目，是httpSession的实现
**CacheManager** :支持第三方缓存技术用于缓存用户角色权限信息，提升系统性能
### 用户认证流程

调用Subject的login方法，提交了一个`AuthenticationTokens`信息，将请求提交到Security Manager，然后调用`Authenticator` 进行处理，`Authenticator` 会首先调用Realm的 `supports`方法，验证Realm是否支持该类型的token验证，验证通过后调用Realm中的getAuthenticationInfo(token)方法进行登录验证。

在Realm中getAuthenticationInfo获取用户信息，调用用户数据源进行登录合法性验证，

### 权限认证流程
调用Subject的api的isPermitted和人checkPermission方法，首先会将请求提交给Security Manager，Security Manager调用Authorizer进行权限验证，Authorizer调用底层的多个Realm实现获取用户权限信息，将用户角色所属的权限信息和直接绑定到用户上的权限信息进行聚合，然后判断权限是否在该集合中。
![image](http://omdq6di7v.bkt.clouddn.com/17-9-30/68338105.jpg)





​	



​	