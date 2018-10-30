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