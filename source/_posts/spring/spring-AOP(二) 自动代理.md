---
title: spring-AOP(二)
date: 2020-06-15
tags:
- spring 
categories:
- spring

---

# spring-AOP(二) 自动代理

## 知识导读

- 在何时何处创建代理对象
- 实质就是创建完对象之后，查找并封装 Advisor 列表，然后调用ProxyFactory创建代理
- Advisor 的排序

下图是AOP自动代理的流程图

![OvU9uS](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/06/OvU9uS.png)

## 创建代理时机

## 查找封装目标类的Advisor

## Advisor 排序

## 调用ProxyFactory创建代理

1. 何时何处会创建代理对象
2. 获取适用目标类的增强器 Advisor列表
3. 调用工厂创建代理对象



解析Spring中注册的类，包含 @Aspect @PointCut @Before等注解，封装为Advisor增强

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/spring/%E8%A7%A3%E6%9E%90AspectJ%E4%B8%BAAdvisor.png?raw=true)

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
