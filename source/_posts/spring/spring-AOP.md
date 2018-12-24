---
title: spring-AOP
date: 2018-10-29 16:05:10
tags:
- spring 
categories:
- spring

---

# spring-AOP

## 一、类

- AspectJAutoProxyBeanDefinitionParser.paser()
- AnnotationAwareAspectJAutoProxyCreator  需要注册这个类 实现了 BeanPostProcessor接口，加载bean时调用
- AopConfigUtils
- AbstractAutoProxyCreator.postProcessAfterInitialization().wrapIfNecessary()
- BeanFactoryAspectJAdvisorsBuilder
- InstantiationModelAwarePointcutAdvisorImpl
- ReflectiveAspectJAdvisorFactory
- AbstractAspectJAdvice

### 概念

- 切面（Aspect）：切面是一个关注点的模块化，这个关注点可能是横切多个对象；

- 连接点（Join Point）：连接点是指在方法运行过程中某个特定的点，比如某方法调用前后或抛出异常时；

- 通知（Advice）：指在切面的某个特定的连接点上执行的动作。很多AOP框架都将通知设计成一个拦截器，并将多个通知添加到一个拦截器链中来处理。Spring切面可以应用5中通知：

  - 前置通知（Before）:在目标方法或者说连接点被调用前执行的通知；
  - 返回通知（After-returning）：指在某个连接点正常执行完毕后的通知(没有抛出异常)；
  - 后置通知（After）：某个连接点执行完毕后的通知，不论是正常执行完毕还是抛出异常；
  - 异常通知（After-throwing）：指在方法抛出异常后执行的通知；
  - 环绕通知（Around）：指包围一个连接点通知，在被通知的方法调用之前和之后执行自定义的方法。

- 切点（Pointcut）：指匹配连接点的表达式。通知与一个切入点表达式关联，并在满足这个切入的连接点上运行，例如：当执行某个特定的名称的方法前执行前置通知。

- 引入（Introduction）：引入也被称为内部类型声明，声明额外的方法或者某个类型的字段。

- 目标对象（Target Object）：目标对象是被一个或者多个切面所通知的对象。

- AOP代理（AOP Proxy）：AOP代理是指AOP框架创建的对对象，用来实现切面契约（包括通知方法等功能）


在spring中aop默认使用JDK代理，所有实现接口的类都会使用JDK代理生成代理类。当类没有实现接口时，会使用Cglib代理。不过可以使用强制都使用Cglib代理。



expose-proxy=true 暴露代理类，AopContext.currencyProxy

PlatformTransactionManager


从前面代理的原理我们知道，代理的目的是调用目标方法时我们可以转而执行 InvocationHandler 类的 invoke 方法，所以如何在 InvocationHandler 上做文章就是 Spring 实现 Aop 的关键所在。

Spring 的 Aop 实现是遵守 Aop 联盟的约定。同时 Spring 又扩展了它，增加了如 Pointcut、Advisor 等一些接口使得更加灵活。