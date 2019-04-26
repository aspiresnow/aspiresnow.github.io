---
title: 重试Utils
date: 2019-04-26 19:12:30
tags:
- utils
categories:
- 项目积累
---

# spring中使用策略模式

在项目开发过程中经常遇到根据条件获取不同的实现类来处理。

定义渠道的枚举值

```java
@AllArgsConstructor
@Getter
public enum ChannelEnum {
    WETCHAT("微信"),
    ALIPAY("支付宝");
    private String channelName;
}
```

定义一个注解，声明在实现类上，用于建立实现类同ChannelEnum的关联关系

```java
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
public @interface ChannelType {
    ChannelEnum value();
}
```

定义第三方渠道接口

```java
public interface ThirdChannelMgr {
    void process();
}
```

定义两个实现类,使用ChannelType注解在类上声明实现类和channel的关联关系

```java
@Service
@ChannelType(ChannelEnum.WETCHAT)//建立同ChannelEnum的关联关系
public class WetchatChannelMgrImpl implements ThirdChannelMgr {
    void process(){
        System.out.println("微信")
    }
}
```

```java
@Service
@ChannelType(ChannelEnum.ALIPAY)//建立同ChannelEnum的关联关系
public class AlipayChannelMgrImpl implements ThirdChannelMgr {
    void process(){
        System.out.println("支付宝")
    }
}
```

策略类，用于保存和查找ChannelEnum和实现类的关联关系。直接使用channelMap来存储对应关系，在spring启动的时候来维护这个map。提供 getInstance 方法，先通过channel从map中获取到对应的beanName，然后使用SpringUtil根据beanName获取spring容器中的实现类对象。

```java
@Setter
@Component
public class ChannelContext {
    //channel -> beanName
    private Map<ChannelEnum, String> channelMap;

    public ThirdChannelMgr getInstance(ChannelEnum channel) {
        String beanName = channelMap.get(channel);
        return SpringUtil.getBean(beanName,ThirdChannelMgr.class);
    }
}
```

spring提供了BeanFactoryPostProccessor用于扩展spring容器。在spring解析完BeanDefinition后会调用自定义的实现类。在这里

```java
@Component
public class ChannelCollectProcessor implements BeanFactoryPostProcessor {
    //扫描@HandlerType，初始化HandlerContext，将其注册到spring容器
    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        Map<ChannelEnum, String> channelMap = new HashMap<>();
        //获取所有声明ChannelType注解类的spring对象
        String[] channelBeanNames = beanFactory.getBeanNamesForAnnotation(ChannelType.class);
        Stream.of(channelBeanNames).forEach(beanName -> {
            //获取类上注解中声明的值，然后建立对应关系
            ChannelEnum channel = beanFactory.findAnnotationOnBean(beanName, ChannelType.class).value();
            channelMap.put(channel, beanName);
        });
        //获取spring容器中的 策略容器对象
        ChannelContext channelContext = beanFactory.getBean(ChannelContext.class);
        //将 建立好的 map对应关系 设置到 策略类中
        channelContext.setChannelMap(Collections.unmodifiableMap(channelMap));
    }
}
```

定义spring工具类用于获取spring容器中的bean

```java
@Component
public class SpringUtil implements ApplicationContextAware {
    private static ApplicationContext ac;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException{
        ac = applicationContext;
    }
    public static Object getBean(String name) {
        return ac.getBean(name);
    }
    public static <T> T getBean(String name, Class<T> clazz) {
        return ac.getBean(name, clazz);
    }
    public static <T> T getBean(Class<T> clazz) {
        return ac.getBean(clazz);
    }
}
```

测试，使用策略类获取具体的实现类

```java
@Slf4j
@RunWith(SpringJUnit4ClassRunner.class)
@SpringBootTest(classes= AdminWebApplication.class,webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class ChannelMgrImplTest {
    @Autowired
    private ChannelContext channelContext;
    @Test
    public void test() {
        //根据策略类获取对应的实现类
        ThirdChannelMgr thirdChannelMgr = channelContext.getInstance(ChannelEnum.ALIPAY);
        thirdChannelMgr.process();
    }

}
```

