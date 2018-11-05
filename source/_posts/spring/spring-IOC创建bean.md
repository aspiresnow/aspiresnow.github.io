---
title: spring-IOC创建bean
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring-IOC创建bean

StringTokenizer 类  StringUtils.tokenizeToStringArray方法



FactoryBean接口，实现该接口可以通过getObject方法创建自己想要的bean对象。在初始化bean的时候，如果bean实现类了FactoryBean接口，则是返回getObject方法返回的对象，而不是创建实现FactoryBean接口的对象

因为在创建单例bean的时候会存在依赖注入的情况，而在创建依赖的时候为了避免循环依赖，spring创建bean的原则是不等bean创建完成就会将创建bean的ObjectFactory提早曝光，也就是将ObjectFactory加入到缓存中，一旦下个bean创建时间需要依赖上个bean则直接使用ObjectFactory。缓存中记录的只是最原始的bean状态，需要进行实例化

只有单例模式setter注入才会解决循环依赖问题，原型模式在遇到循环依赖的情况下会直接抛出异常，因为不允许缓存原型模式的bean.

解析 depend-on节点，会缓存并初始化depend-on指定的bean





AbstractBeanFactory.getBean

DefaultSingletonBeanRegistry.getSingleton

AbstractAutowireCapableBeanFactory.createBean

ConstructorResolver.autowireConstructor

##### 缓存类

- singletonObjects：beanName和bean实例之间关系
- earlySingletonObjects：beanName和bean实例之间关系。通singletonObjects不同的是当一个bean还在创建过程中，就可以通过getBean方法获取到，主要用来检测循环引用
- singletonFactories：beanName和创建bean的工厂之间的关系 beanName---ObjectFactory
- registeredSingletons：保存当前已注册的bean,包括ObjectFactory



BeanWrapper





```java
private final Set<String> singletonsCurrentlyInCreation =
      Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>(16));
```

IdentityHashMap