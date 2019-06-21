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
- JdkDynamicAopProxy



切点表达式可以单写一篇博客 you can see private pointcuts in the same type, protected pointcuts in the hierarchy, public pointcuts anywhere, and so on

```java
package com.xyz.someapp;

import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;

@Aspect
public class SystemArchitecture {

    /**
     * A join point is in the web layer if the method is defined
     * in a type in the com.xyz.someapp.web package or any sub-package
     * under that.
     */
    @Pointcut("within(com.xyz.someapp.web..*)")
    public void inWebLayer() {}

    /**
     * A join point is in the service layer if the method is defined
     * in a type in the com.xyz.someapp.service package or any sub-package
     * under that.
     */
    @Pointcut("within(com.xyz.someapp.service..*)")
    public void inServiceLayer() {}

    /**
     * A join point is in the data access layer if the method is defined
     * in a type in the com.xyz.someapp.dao package or any sub-package
     * under that.
     */
    @Pointcut("within(com.xyz.someapp.dao..*)")
    public void inDataAccessLayer() {}

    /**
     * A business service is the execution of any method defined on a service
     * interface. This definition assumes that interfaces are placed in the
     * "service" package, and that implementation types are in sub-packages.
     *
     * If you group service interfaces by functional area (for example,
     * in packages com.xyz.someapp.abc.service and com.xyz.someapp.def.service) then
     * the pointcut expression "execution(* com.xyz.someapp..service.*.*(..))"
     * could be used instead.
     *
     * Alternatively, you can write the expression using the 'bean'
     * PCD, like so "bean(*Service)". (This assumes that you have
     * named your Spring service beans in a consistent fashion.)
     */
    @Pointcut("execution(* com.xyz.someapp..service.*.*(..))")
    public void businessService() {}

    /**
     * A data access operation is the execution of any method defined on a
     * dao interface. This definition assumes that interfaces are placed in the
     * "dao" package, and that implementation types are in sub-packages.
     */
    @Pointcut("execution(* com.xyz.someapp.dao.*.*(..))")
    public void dataAccessOperation() {}

}
```

```java
@Pointcut("execution(public * *(..))")
private void anyPublicOperation() {} 

@Pointcut("within(com.xyz.someapp.trading..*)")
private void inTrading() {} 

@Pointcut("anyPublicOperation() && inTrading()")
private void tradingOperation() {} 
```

启用AspectJ作为aop，注意声明了@Aspect的切面是不能被自动代理的

```java
@Configuration
@EnableAspectJAutoProxy
public class AppConfig {

}
```

```xml
<aop:aspectj-autoproxy/>
```




### 概念

- 切面（Aspect）：切面用于横切多个对象，是一个关注点的模块化，这个关注点可能是横切多个对象；
- 连接点（Join Point）：连接点是指在方法运行过程中某个特定的事件，比如某方法的执行或者抛出异常都可以算是连接点，在spring中连接点一般指的都是目标对象方法的执行；
- 通知（Advice）：切面在某个特定的连接点上执行的动作。很多AOP框架都将通知设计成一个拦截器，并将多个通知添加到一个拦截器链中来处理。Spring切面可以应用5中通知：

  - 前置通知（Before）:在目标方法或者说连接点被调用前执行的通知；
  - 返回通知（After-returning）：指在某个连接点正常执行完毕后的通知(没有抛出异常)；
  - 后置通知（After）：某个连接点执行完毕后的通知，不论是正常执行完毕还是抛出异常,类似Finally
  - 异常通知（After-throwing）：指在方法抛出异常后执行的通知方法；
  - 环绕通知（Around）：指包围一个连接点通知，在被通知的方法调用之前和之后执行通知方法。
- 切点（Pointcut）在切面上进行通知的连接点，切点由切点名称和一个匹配表达式组成，表达式默认使用的是AspectJ的切点表达式用于匹配连接点是否应用切面的通知
- 引入（Introduction）：AOP可以动态的给目标对象扩展方法，通过@DeclareParents注解给目标对象增加接口实现并添加默认实现类
- 目标对象（Target Object）：被切面横切拦截的对象。
- AOP代理（AOP Proxy）：AOP代理是指AOP框架创建的代理对象，使用通知对目标对象的方法进行增强或者覆盖
- 织入：通过生成代理类将切面和目标对象连接，**AspectJ是在编译的时候生成的代理类，AOP是在运行时生成的代理类**

spring的aop只支持方法执行做切点进行通知，而不支持字段访问的通知，AspectJ支持字段方法通知


在spring中aop默认使用JDK代理，所有实现接口的类都会使用JDK代理生成代理类。当类没有实现接口时，会使用Cglib代理。不过可以使用强制都使用Cglib代理。



expose-proxy=true 暴露代理类，AopContext.currencyProxy

PlatformTransactionManager

Spring 的 Aop 实现是遵守 Aop 联盟的约定。同时 Spring 又扩展了它，增加了如 Pointcut、Advisor 等一些接口使得更加灵活。



手动注册bean的过程

```java
RootBeanDefinition beanDefinition = new RootBeanDefinition(cls);
beanDefinition.setSource(source);
beanDefinition.getPropertyValues().add("order", Ordered.HIGHEST_PRECEDENCE);
beanDefinition.setRole(BeanDefinition.ROLE_INFRASTRUCTURE);
registry.registerBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME, beanDefinition);
```

给beanDefinition赋值

```java
BeanDefinition definition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
definition.getPropertyValues().add("exposeProxy", Boolean.TRUE);
```

BeanNameAutoProxyCreator 注册后可以指定bean的name实现代理

```java
//获取所有指定类型的beanName，包括继承这个类的
String[] beanNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
      this.beanFactory, Object.class, true, false);
```

```java
public static void main(String[] args) {
    ProxyFactory factory = new ProxyFactory(new SimplePojo());
    factory.addInterface(Pojo.class);
    factory.addAdvice(new RetryAdvice());

    Pojo pojo = (Pojo) factory.getProxy();
    // this is a method call on the proxy!
    pojo.foo();
}
```



ReflectionUtils