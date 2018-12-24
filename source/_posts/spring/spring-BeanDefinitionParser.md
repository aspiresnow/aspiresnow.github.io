---
title: spring-BeanDefinitionParser
date: 2018-12-17 22:11:03
tags:
- spring 
categories:
- spring


---

# spring-BeanDefinitionParser



resolve中调用了其init方法，此方法用以向NamespaceHandler对象注册BeanDefinitionParser对象。**此接口用以解析顶层(beans下)的非默认命名空间元素，比如<context:annotation-config />**。

#### BeanExpressionResolver

注意此时尚未进行bean的初始化工作，初始化是在后面的finishBeanFactoryInitialization进行的，所以在BeanFactoryPostProcessor对象中获取bean会导致提前初始化。