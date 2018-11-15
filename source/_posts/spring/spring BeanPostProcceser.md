---
title: BeanPostProcceser
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# BeanPostProcceser

ReflectionUtils

LocalVariableTableParameterNameDiscoverer 用于获取参数的名字

```java
private final Set<String> singletonsCurrentlyInCreation =
      Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>(16));
```

IdentityHashMap

beforeInstantiationResolved 是什么时候给BeanDefinition赋值这个属性的，用于控制aop的

instantiationStrategy 这个创建策略是干啥的





RequiredAnnotationBeanPostProcessor ---用于启用注解的

BeanPostProcessor 只会作用在所注册的容器中的bean，不会受父类容器中的 BeanPostProcessor影响，使用 @Bean注册一个 BeanPostProcessor的时候直接返回实现类，明确BeanPostProcessor的类型，这样ApplicationContext就能在创建这个bean之前注册BeanPostProcessor的时候使用了

ApplicationContext会自动检测实现了BeanPostProcessor接口的bean并注册后置器。 可以使用 ConfigurableBeanFactory.addBeanPostProcessor 手动添加后置器

BeanPostProcessor`s are scoped *per-container*. This is only relevant if you are using container hierarchies. If you define a `BeanPostProcessor` in one container, it will *only* post-process the beans in that container. In other words, beans that are defined in one container are not post-processed by a `BeanPostProcessor` defined in another container, even if both containers are part of the same hierarchy.

如果要想使一个非web的spring容器优雅的关闭，即停止时调用 bean注册的销毁destroy-method方法，使用registerShutdownHook.。如果不注册则非web容器停止的时候是不会调用destroy方法的

如果你正在一个非web应用的环境下使用Spring的IoC容器，如dubbo服务，你想让容器优雅的关闭，并调用singleton的bean相应destory回调方法，你需要在JVM里注册一个“关闭钩子”（shutdown hook）。这一点非常容易做到，并且将会确保你的Spring IoC容器被恰当关闭，以及所有由单例持有的资源都会被释放。context.registerShutdownHook();  context.start();

```java
ConfigurableApplicationContext ctx = new ClassPathXmlApplicationContext("beans.xml");
 ctx.registerShutdownHook();
```





Spring 的lookup-method结合prototype bean实现运行期间每次获取新的bean？？？ 使用 aop:scoped-proxy

使用 <aop:scoped-proxy/>  给生命周期短的bean暴露一个代理，这样生命周期长的bean就可以依赖注入了,使用的是cglib代理，可以通过指定 proxy-target-class="false"设置为jdk动态代理

```xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:aop="http://www.springframework.org/schema/aop"
    xsi:schemaLocation="http://www.springframework.org/schema/beans
        http://www.springframework.org/schema/beans/spring-beans.xsd
        http://www.springframework.org/schema/aop
        http://www.springframework.org/schema/aop/spring-aop.xsd">

    <!-- an HTTP Session-scoped bean exposed as a proxy -->
    <bean id="userPreferences" class="com.foo.UserPreferences" scope="session">
        <!-- instructs the container to proxy the surrounding bean -->
        <aop:scoped-proxy/>
    </bean>

    <!-- a singleton-scoped bean injected with a proxy to the above bean -->
    <bean id="userService" class="com.foo.SimpleUserService">
        <!-- a reference to the proxied userPreferences bean -->
        <property name="userPreferences" ref="userPreferences"/>
    </bean>
</beans>
```







```java
try {
        // Give BeanPostProcessors a chance to return a proxy instead of the target bean instance.
        Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
        if (bean != null) {
            return bean;
        }
    }
protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
    Object bean = null;
    if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
        // Make sure bean class is actually resolved at this point.
        if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
            Class<?> targetType = determineTargetType(beanName, mbd);
            if (targetType != null) {
                bean = applyBeanPostProcessorsBeforeInstantiation(targetType, beanName);
                if (bean != null) {
                    bean = applyBeanPostProcessorsAfterInitialization(bean, beanName);
                }
            }
        }
        mbd.beforeInstantiationResolved = (bean != null);
    }
    return bean;
}


protected void applyMergedBeanDefinitionPostProcessors(RootBeanDefinition mbd, Class<?> beanType, String beanName) {
    for (BeanPostProcessor bp : getBeanPostProcessors()) {
        if (bp instanceof MergedBeanDefinitionPostProcessor) {
            MergedBeanDefinitionPostProcessor bdp = (MergedBeanDefinitionPostProcessor) bp;
            bdp.postProcessMergedBeanDefinition(mbd, beanType, beanName);
        }
    }
}

@Override
public Object applyBeanPostProcessorsBeforeInitialization(Object existingBean, String beanName)
        throws BeansException {

    Object result = existingBean;
    for (BeanPostProcessor processor : getBeanPostProcessors()) {
        result = processor.postProcessBeforeInitialization(result, beanName);
        if (result == null) {
            return result;
        }
    }
    return result;
}

@Override
public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
        throws BeansException {

    Object result = existingBean;
    for (BeanPostProcessor processor : getBeanPostProcessors()) {
        result = processor.postProcessAfterInitialization(result, beanName);
        if (result == null) {
            return result;
        }
    }
    return result;
}

if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
    for (BeanPostProcessor bp : getBeanPostProcessors()) {
        if (bp instanceof InstantiationAwareBeanPostProcessor) {
            InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
            if (!ibp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
                continueWithPropertyPopulation = false;
                break;
            }
        }
    }
}
```