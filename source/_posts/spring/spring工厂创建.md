---
title: spring工厂创建
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring工厂创建



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


```
<bean id="clientService"
    class="examples.ClientService"
    factory-method="createInstance"/>
public class ClientService {
    private static ClientService clientService = new ClientService();
    private ClientService() {}

    public static ClientService createInstance() {
        return clientService;
    }
}
```

<!-- the factory bean, which contains a method called createInstance() -->
<bean id="serviceLocator" class="examples.DefaultServiceLocator">
​    <!-- inject any dependencies required by this locator bean -->
</bean>

<!-- the bean to be created via the factory bean -->
<bean id="clientService"
​    factory-bean="serviceLocator"
​    factory-method="createClientServiceInstance"/>
public class DefaultServiceLocator {

    private static ClientService clientService = new ClientServiceImpl();
    
    public ClientService createClientServiceInstance() {
        return clientService;
    }
}

一个factory-bean可以有多个factory-method
<bean id="serviceLocator" class="examples.DefaultServiceLocator">
​    <!-- inject any dependencies required by this locator bean -->
</bean>

<bean id="clientService"
​    factory-bean="serviceLocator"
​    factory-method="createClientServiceInstance"/>

<bean id="accountService"
​    factory-bean="serviceLocator"
​    factory-method="createAccountServiceInstance"/>
public class DefaultServiceLocator {

    private static ClientService clientService = new ClientServiceImpl();
    
    private static AccountService accountService = new AccountServiceImpl();
    
    public ClientService createClientServiceInstance() {
        return clientService;
    }
    
    public AccountService createAccountServiceInstance() {
        return accountService;
    }
}    

In Spring documentation, factory bean refers to a bean that is configured in the Spring container that will create objects through an 
instance or static factory method. By contrast, FactoryBean (notice the capitalization) refers to a Spring-specific FactoryBean.



```xml
<bean id="exampleBean" class="examples.ExampleBean" factory-method="createInstance">
    <constructor-arg ref="anotherExampleBean"/>
    <constructor-arg ref="yetAnotherBean"/>
    <constructor-arg value="1"/>
</bean>

<bean id="anotherExampleBean" class="examples.AnotherBean"/>
<bean id="yetAnotherBean" class="examples.YetAnotherBean"/>
```

```java
public class ExampleBean {

    // a private constructor
    private ExampleBean(...) {
        ...
    }

    // a static factory method; the arguments to this method can be
    // considered the dependencies of the bean that is returned,
    // regardless of how those arguments are actually used.
    public static ExampleBean createInstance (
        AnotherBean anotherBean, YetAnotherBean yetAnotherBean, int i) {

        ExampleBean eb = new ExampleBean (...);
        // some other operations...
        return eb;
    }
}
```

```java
<bean id="theTargetBean" class="..."/>

<bean id="theClientBean" class="...">
    <property name="targetName">
        <idref bean="theTargetBean"/>
    </property>
</bean>
<!--使用 idref 比较使用ref更好，idref是在build的时候就会检查引用的bean是否存在，而 ref是装配bean的时候才回去检查-->
```

```xml
<beans>
    <bean id="parent" abstract="true" class="example.ComplexObject">
        <property name="adminEmails">
            <props>
                <prop key="administrator">administrator@example.com</prop>
                <prop key="support">support@example.com</prop>
            </props>
        </property>
    </bean>
    <bean id="child" parent="parent">
        <property name="adminEmails">
            <!-- the merge is specified on the child collection definition -->
            <props merge="true">
                <prop key="sales">sales@example.com</prop>
                <prop key="support">support@example.co.uk</prop>
            </props>
        </property>
    </bean>
    <beans>
```

```xml
<bean id="foo" class="foo.Bar">
    <property name="fred.bob.sammy" value="123" />
</bean>
--->
```

