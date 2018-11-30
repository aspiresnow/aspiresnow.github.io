---
title: spring注解
date: 2018-11-19 23:51:13
tags:
- spring 
categories:
- spring

---

# spring注解

Annotation injection is performed *before* XML injection, thus the latter configuration will override the former for properties wired through both approaches.

```xml
<context:annotation-config/> <!--用于集成注解和xml配置-->
```

The implicitly registered post-processors include [`AutowiredAnnotationBeanPostProcessor`](https://docs.spring.io/spring-framework/docs/4.3.20.RELEASE/javadoc-api/org/springframework/beans/factory/annotation/AutowiredAnnotationBeanPostProcessor.html), [`CommonAnnotationBeanPostProcessor`](https://docs.spring.io/spring-framework/docs/4.3.20.RELEASE/javadoc-api/org/springframework/context/annotation/CommonAnnotationBeanPostProcessor.html),[`PersistenceAnnotationBeanPostProcessor`](https://docs.spring.io/spring-framework/docs/4.3.20.RELEASE/javadoc-api/org/springframework/orm/jpa/support/PersistenceAnnotationBeanPostProcessor.html), as well as the aforementioned [`RequiredAnnotationBeanPostProcessor`](https://docs.spring.io/spring-framework/docs/4.3.20.RELEASE/javadoc-api/org/springframework/beans/factory/annotation/RequiredAnnotationBeanPostProcessor.html).)

`<context:annotation-config/>` only looks for annotations on beans in the same application context in which it is defined. This means that, if you put`<context:annotation-config/>` in a `WebApplicationContext` for a `DispatcherServlet`, it only checks for `@Autowired` beans in your controllers, and not your services.

@Autowired 是基于类型匹配进行注入的。通过@Primary 和@Qualifier缩小匹配的范围

@Primary 用于标明bean用于被选择的优先权，当有多个同样类型的bean的时候，标记了@primary的优先被注入

@Qualifier 指定注入bean的beanName，qualifier可以重复指定，这时注入的就是一个集合

使用@Autowired注解可以注入一个数组或者集合，如果要想使集合中的bean有顺序，bean需要实现Ordered接口或者添加@Ordered注解用于标明顺序

使用@Autowired注解注入map，map的key是bean的name，value是符合类型的bean的值`

使用`java.util.Optional`注入非必须属性，用于替代 required属性

```java
@Autowired
private Optional<MovieFinder> movieFinder;
```

CustomAutowireConfigurer 用于指定bean时标记了 @Qualifier的

CommonAnnotationBeanPostProcessor用于支持@Resource、@PostConstruct和@PreDestroy

@Autowired @Resource @Value都是基于BeanFactoryPostProcessor和BeanPostProcessor的，所以无法使用这些注解完成对PostProcessor的注入，这些只能通过 @Bean和xml形式进行注入

@Resource和@Autowired的区别

- @Resource只能作用在字段和setter方法注入上。@Autowired还可以作用在普通方法和构造方法注入上
- @Resouce是基于名称匹配注入的，可以通过属性`name`指定。如果没有指定`name`，默认就是根据字段名称匹配。@Autowired是首先根据类型匹配，然后通过@Primary和@Qualifier来缩小范围。
- @Resource只可以注入单个的bean，@Autowired可以将所有匹配的注入到数组、集合、map



@Configuration`, `@Bean`, `@Import`, and `@DependsOn

 the `@RestController` annotation from Spring MVC is *composed* of `@Controller` and `@ResponseBody`.

```java
//启动自动扫描注解，需要再 @Configuration上加上@ComponentScan 
//等同于 <context:component-scan base-package="org.example"/>
@Configuration
@ComponentScan(basePackages = "org.example")
public class AppConfig  {
    ...
}
//the AutowiredAnnotationBeanPostProcessor and CommonAnnotationBeanPostProcessor are both included implicitly when you use the component-scan element. That means that the two components are autodetected and wired together - all without any bean configuration metadata provided in XML.
//You can disable the registration of AutowiredAnnotationBeanPostProcessor and CommonAnnotationBeanPostProcessor by including the annotation-config attribute with a value of false.
```

过滤

| Filter Type          | Example Expression           | Description                                                  |
| -------------------- | ---------------------------- | ------------------------------------------------------------ |
| annotation (default) | `org.example.SomeAnnotation` | An annotation to be present at the type level in target components. |
| assignable           | `org.example.SomeClass`      | A class (or interface) that the target components are assignable to (extend/implement). |
| aspectj              | `org.example..*Service+`     | An AspectJ type expression to be matched by the target components. |
| regex                | `org\.example\.Default.*`    | A regex expression to be matched by the target components class names. |
| custom               | `org.example.MyTypeFilter`   | A custom implementation of the `org.springframework.core.type .TypeFilter` interface. |

```java
@Configuration
@ComponentScan(basePackages = "org.example",
        includeFilters = @Filter(type = FilterType.REGEX, pattern = ".*Stub.*Repository"),
        excludeFilters = @Filter(Repository.class))
public class AppConfig {
    ...
}
```

```xml
<beans>
    <context:component-scan base-package="org.example">
        <context:include-filter type="regex" expression=".*Stub.*Repository"/>
        <context:exclude-filter type="annotation"
                expression="org.springframework.stereotype.Repository"/>
    </context:component-scan>
</beans>
```



```java
@Component
public class FactoryMethodComponent {

    private static int i;

    @Bean
    @Qualifier("public")
    public TestBean publicInstance() {
        return new TestBean("publicInstance");
    }

    // use of a custom qualifier and autowiring of method parameters
    @Bean
    protected TestBean protectedInstance(
            @Qualifier("public") TestBean spouse,
            @Value("#{privateInstance.age}") String country) {
        TestBean tb = new TestBean("protectedInstance", 1);
        tb.setSpouse(spouse);
        tb.setCountry(country);
        return tb;
    }
}
```

在`@Component`和`@Configuration`中定义 `@Bean`的不同是前者定义的是一个正常的bean，后者中定义的bean会使用cglib增强，cglib只能增强非static修饰的`@Bean`

You may declare `@Bean` methods as `static`, allowing for them to be called without creating their containing configuration class as an instance. This makes particular sense when defining post-processor beans, e.g. of type `BeanFactoryPostProcessor` or `BeanPostProcessor`, since such beans will get initialized early in the container lifecycle and should avoid triggering other parts of the configuration at that point.

`@Configuration` classes allow inter-bean dependencies to be defined by simply calling other `@Bean` methods in the same class



`<aop:scoped-proxy/>`

`@Import`引入java配置， `@ImportResource`引入xml配置

```java
@Configuration
public class ServiceConfig {
	//将另一个配置 注入进来，而不是使用 @Import,这样就确却的知道@Bean的引用位置
    @Autowired
    private RepositoryConfig repositoryConfig;

    @Bean
    public TransferService transferService() {
        //
        return new TransferServiceImpl(repositoryConfig.accountRepository());
    }
}
```

`@Conditional`

`@PropertySource`

`@EnableLoadTimeWeaving`

classpath:和classpath*的区别是后者会加载所有重名的配置文件，前者只是找到第一个匹配的就返回