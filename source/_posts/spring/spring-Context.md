---
title: spring-Context
date: 2018-10-05 23:51:13
tags:
- spring 
categories:
- spring

---

# spring-Context

PropertyPlaceholderHelper

ObjectUtils

AbstractPropertyResolver  PropertyResolver

PostProcessorRegistrationDelegate

PathMatchingResourcePatternResolver 用于解析配置文件位置

## 源码解读

以ApplicationContext为例,创建一个ApplicationContext对象，指定配置文件的位置

```java
ApplicationContext ac = new ClassPathXmlApplicationContext("spring/applicationContext.xml");
```
### 主流程

在ClassPathXmlApplicationContext中首先初始化父类中的一些配置，主要进行了创建路径解析器和配置父类容器。然后就是解析配置文件位置，如果路径中含有${} 系统变量，也会被解析。其他的工作都是在refresh()方法中执行的。

```java
public ClassPathXmlApplicationContext(String configLocation) throws BeansException {
    this(new String[] {configLocation}, true, null);
}
public ClassPathXmlApplicationContext(String[] configLocations, boolean refresh, ApplicationContext parent)  throws BeansException {
    super(parent);
    setConfigLocations(configLocations);
    if (refresh) {
        refresh();
    }
}
```

进入AbstractApplicationContext的refresh方法，refresh方法列出了所有spring容器初始化的工作清单

```java
@Override
public void refresh() throws BeansException, IllegalStateException {
    synchronized (this.startupShutdownMonitor) {
        //初始化前准备
        prepareRefresh();
        //加载BeanDefinition 创建DefaultListableBeanFactory
        ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();
        //对spring容器进行功能填充
        prepareBeanFactory(beanFactory);
        try {
            //用于子类覆盖扩展的钩子方法
            postProcessBeanFactory(beanFactory);
            //应用BeanFactoryPostProcessor
            invokeBeanFactoryPostProcessors(beanFactory);
            //注册BeanFactoryPost
            registerBeanPostProcessors(beanFactory);
            //添加国际化支持
            initMessageSource();
            //初始化消息广播器
            initApplicationEventMulticaster();
            //用于子类覆盖扩展的钩子方法
            onRefresh();
            //注册监听器
            registerListeners();
            //实例化spring容器中的对象
            finishBeanFactoryInitialization(beanFactory);
            //注册LifecycleProcessor，并发布事件
            finishRefresh();
        } catch (BeansException ex) {
            // Destroy already created singletons to avoid dangling resources.
            destroyBeans();
            // Reset 'active' flag.
            cancelRefresh(ex);
            throw ex;
        } finally {
            // Reset common introspection caches in Spring's core, since we
            // might not ever need metadata for singleton beans anymore...
            resetCommonCaches();
        }
    }
}
```

### 初始化前准备

在prepareRefresh中主要提供了两个空实现的方法，用于子类扩展使用

```java
initPropertySources();//钩子方法，用于子类扩展使用
getEnvironment().validateRequiredProperties();//验证需要的系统变量是否存在
```

### 创建容器

众所周知ApplicationContext扩展了BeanFactory的所有功能，在obtainFreshBeanFactory方法中创建了一个DefaultListableBeanFactory对象并完成BeanDefinition的加载，然后将BeanFactory存储在ApplicationContext中，所以ApplicationContext可以包含所有XMLBeanFactory所有功能

```java
protected final void refreshBeanFactory() throws BeansException {
    if (hasBeanFactory()) {//如果存在spring容器，销毁容器及其中的单例bean
        destroyBeans();
        closeBeanFactory();
    }
    try {
        //创建一个DefaultListableBeanFactory对象
        DefaultListableBeanFactory beanFactory = createBeanFactory();
        beanFactory.setSerializationId(getId());
        customizeBeanFactory(beanFactory);//设置是否允许循环依赖和覆盖
        loadBeanDefinitions(beanFactory);
        synchronized (this.beanFactoryMonitor) {
            this.beanFactory = beanFactory;//将BeanFactory声明为内部的一个全局变量
        }
    } catch (IOException ex) {
       //....
    }
}
```

调用loadBeanDefinitions方法定位加载转换BeanDefinition。到这步就完成了spring容器的BeanDefinition加载过程。

```java
protected void loadBeanDefinitions(DefaultListableBeanFactory beanFactory) throws BeansException, IOException {
    // 跟XmlBeanFactory一样，将加载工作交由 XmlBeanDefinitionReader 去玩陈个
    XmlBeanDefinitionReader beanDefinitionReader = new XmlBeanDefinitionReader(beanFactory);

    // Configure the bean definition reader with this context's
    // resource loading environment.
    beanDefinitionReader.setEnvironment(this.getEnvironment());
    //ClassPathXmlApplicationContext 实现了ResourceLoader接口
    beanDefinitionReader.setResourceLoader(this);
    beanDefinitionReader.setEntityResolver(new ResourceEntityResolver(this));

    // Allow a subclass to provide custom initialization of the reader,
    // then proceed with actually loading the bean definitions.
    initBeanDefinitionReader(beanDefinitionReader);
    loadBeanDefinitions(beanDefinitionReader);
}
```

循环加载配置文件,可以通过扩展getDefaultConfigLocations指定默认的配置文件

```java
protected void loadBeanDefinitions(XmlBeanDefinitionReader reader) throws BeansException, IOException {
    //如果有解析好的配置路径，直接使用，getConfigResources由子类继承实现
   Resource[] configResources = getConfigResources();
   if (configResources != null) {
      reader.loadBeanDefinitions(configResources);
   }
    //需要解析配置文件为Resource
   String[] configLocations = getConfigLocations();
   if (configLocations != null) {
      reader.loadBeanDefinitions(configLocations);
   }
}
//当没有指定配置文件时，使用默认的配置文件
protected String[] getConfigLocations() {
    return (this.configLocations != null ? this.configLocations : getDefaultConfigLocations());
}
```

在XmlWebApplicationContext中就实现了getDefaultConfigLocations,当没有指定配置文件时默认使用WEB-INF下的applicationContext.xml

```java
protected String[] getDefaultConfigLocations() {
    return this.getNamespace() != null ? new String[]{"/WEB-INF/" + this.getNamespace() + ".xml"} : new String[]{"/WEB-INF/applicationContext.xml"};
}
```

剩下流程就是进入XMLBeanDefinitionReader的loadBeanDefinition方法，跟XmlBeanFactory初始化过程一样,完成BeanDefinition的定位、解析和注册。

ApplicationContext已经拥有了一个完成BeanDefinition加载的BeanFactory，接下来就是ApplicationContext在BeanFactory之上的扩展。首先

### 功能填充

添加SPEL表达式的支持 #{bean.pro}
```java
beanFactory.setBeanExpressionResolver(new   StandardBeanExpressionResolver(beanFactory.getBeanClassLoader()));
```

添加属性注册编辑器
```java
beanFactory.addPropertyEditorRegistrar(new ResourceEditorRegistrar(this, getEnvironment()));
```

添加ApplicationContextAwareProcessor，bean实例化完成后给实现了Aware接口的bean添加额外属性，最常用的例子就是实现了ApplicationContextAware接口的bean在这里会注入applicationContext属性。

```java
beanFactory.addBeanPostProcessor(new ApplicationContextAwareProcessor(this));
```

属性自动装配时忽略实现Aware接口的bean的自动注入

```java
beanFactory.ignoreDependencyInterface(EnvironmentAware.class);
beanFactory.ignoreDependencyInterface(EmbeddedValueResolverAware.class);
beanFactory.ignoreDependencyInterface(ResourceLoaderAware.class);
beanFactory.ignoreDependencyInterface(ApplicationEventPublisherAware.class);
beanFactory.ignoreDependencyInterface(MessageSourceAware.class);
beanFactory.ignoreDependencyInterface(ApplicationContextAware.class);
```

注册依赖，实现依赖BeanFactory、ResourceLoader、ApplicationContext的自动注入，当一个bean有一个属性类型为ApplicationContext的时候，会将上下文自动注入进去

```java
beanFactory.registerResolvableDependency(BeanFactory.class, beanFactory);
beanFactory.registerResolvableDependency(ResourceLoader.class, this);
beanFactory.registerResolvableDependency(ApplicationEventPublisher.class, this);
beanFactory.registerResolvableDependency(ApplicationContext.class, this);
```

添加ApplicationListenerDetector，用来注册单例的ApplicationListener

```java
beanFactory.addBeanPostProcessor(new ApplicationListenerDetector(this));
```

添加AspectJ的支持

```java
if (beanFactory.containsBean(LOAD_TIME_WEAVER_BEAN_NAME)) {
   beanFactory.addBeanPostProcessor(new LoadTimeWeaverAwareProcessor(beanFactory));
   // Set a temporary ClassLoader for type matching.
   beanFactory.setTempClassLoader(new ContextTypeMatchClassLoader(beanFactory.getBeanClassLoader()));
}
```

将形同变量作为单例对象注册到spring容器中

```java
if (!beanFactory.containsLocalBean(ENVIRONMENT_BEAN_NAME)) {
   beanFactory.registerSingleton(ENVIRONMENT_BEAN_NAME, getEnvironment());
}
if (!beanFactory.containsLocalBean(SYSTEM_PROPERTIES_BEAN_NAME)) {
   beanFactory.registerSingleton(SYSTEM_PROPERTIES_BEAN_NAME, getEnvironment().getSystemProperties());
}
if (!beanFactory.containsLocalBean(SYSTEM_ENVIRONMENT_BEAN_NAME)) {
   beanFactory.registerSingleton(SYSTEM_ENVIRONMENT_BEAN_NAME, getEnvironment().getSystemEnvironment());
}
```

ApplicationContext通过注册BeanPostProcessor用以Bean实例化前后的扩展，然后为Bean的初始化做了准备工作。最后spring提供了一个postProcessBeanFactory(beanFactory)钩子方法，用于子类继续自定义扩展配置。

### 激活BeanFactoryPostProcessors

BeanFactory已经创建完成，并完成了功能填充，接下来就该激活注册BeanFactoryPostProcessor用于扩展BeanFactory。BeanFactoryPostProcessor只作用于当前BeanFactory，可以处理实例化前的BeanDefinition。后面会单独讲BeanFactoryPostProcessor接口调用过程

```java
protected void invokeBeanFactoryPostProcessors(ConfigurableListableBeanFactory beanFactory) {
    //激活注册的BeanFactoryPostProcessors
   PostProcessorRegistrationDelegate.invokeBeanFactoryPostProcessors(beanFactory, getBeanFactoryPostProcessors());

   if (beanFactory.getTempClassLoader() == null && beanFactory.containsBean(LOAD_TIME_WEAVER_BEAN_NAME)) {
      beanFactory.addBeanPostProcessor(new LoadTimeWeaverAwareProcessor(beanFactory));
      beanFactory.setTempClassLoader(new ContextTypeMatchClassLoader(beanFactory.getBeanClassLoader()));
   }
}
```

### 注册BeanPostProcessor

注册BeanPostProcessor，在这里只是注册，BeanPostProcessor的调用发生在bean的实例化过程中。后面会有单独讲BeanPostProcessor接口调用过程

```java
protected void registerBeanPostProcessors(ConfigurableListableBeanFactory beanFactory) {
    //交由PostProcessorRegistrationDelegate注册已知的BeanPostProcessor
   PostProcessorRegistrationDelegate.registerBeanPostProcessors(beanFactory, this);
}
```

### 添加国际化支持

通过注册一个MessageSource的bean。bean的id必须为 messageSource。默认实现为DelegatingMessageSource

```java
protected void initMessageSource() {
    ConfigurableListableBeanFactory beanFactory = getBeanFactory();
    if (beanFactory.containsLocalBean(MESSAGE_SOURCE_BEAN_NAME)) {
        this.messageSource = beanFactory.getBean(MESSAGE_SOURCE_BEAN_NAME, MessageSource.class);
        if (this.parent != null && this.messageSource instanceof HierarchicalMessageSource) {
            HierarchicalMessageSource hms = (HierarchicalMessageSource) this.messageSource;
            if (hms.getParentMessageSource() == null) {
                hms.setParentMessageSource(getInternalParentMessageSource());
            }
        }
    } else {//没有配置messageSource，默认实现
        DelegatingMessageSource dms = new DelegatingMessageSource();
        dms.setParentMessageSource(getInternalParentMessageSource());
        this.messageSource = dms;
        beanFactory.registerSingleton(MESSAGE_SOURCE_BEAN_NAME, this.messageSource);
    }
}
```

### 初始化事件传播器

注册一个ApplicationEventMulticaster类型的bean，bean的id必须为applicationEventMulticaster.如果没有指定默认使用SimpleApplicationEventMulticaster注册。

```java
protected void initApplicationEventMulticaster() {
   ConfigurableListableBeanFactory beanFactory = getBeanFactory();
   if (beanFactory.containsLocalBean(APPLICATION_EVENT_MULTICASTER_BEAN_NAME)) {
      this.applicationEventMulticaster =
            beanFactory.getBean(APPLICATION_EVENT_MULTICASTER_BEAN_NAME, ApplicationEventMulticaster.class);
      if (logger.isDebugEnabled()) {
         logger.debug("Using ApplicationEventMulticaster [" + this.applicationEventMulticaster + "]");
      }
   } else {
      this.applicationEventMulticaster = new SimpleApplicationEventMulticaster(beanFactory);
      beanFactory.registerSingleton(APPLICATION_EVENT_MULTICASTER_BEAN_NAME, this.applicationEventMulticaster);
   }
}
```

### 注册监听器

```java
protected void registerListeners() {
   //注册手动添加的监听器
   for (ApplicationListener<?> listener : getApplicationListeners()) {
      getApplicationEventMulticaster().addApplicationListener(listener);
   }
	//注册配置文件中的监听器
   String[] listenerBeanNames = getBeanNamesForType(ApplicationListener.class, true, false);
   for (String listenerBeanName : listenerBeanNames) {
      getApplicationEventMulticaster().addApplicationListenerBean(listenerBeanName);
   }
   //需要提前广播的事件 调用广播器广播，通知监听器响应
   Set<ApplicationEvent> earlyEventsToProcess = this.earlyApplicationEvents;
   this.earlyApplicationEvents = null;
   if (earlyEventsToProcess != null) {
      for (ApplicationEvent earlyEvent : earlyEventsToProcess) {
         getApplicationEventMulticaster().multicastEvent(earlyEvent);
      }
   }
}
```

### 初始化Bean

```java
protected void finishBeanFactoryInitialization(ConfigurableListableBeanFactory beanFactory) {
   // 设置ConversionService 用于类型转换
   if (beanFactory.containsBean(CONVERSION_SERVICE_BEAN_NAME) &&
         beanFactory.isTypeMatch(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class)) {
      beanFactory.setConversionService(
            beanFactory.getBean(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class));
   }
   // Register a default embedded value resolver if no bean post-processor
   // (such as a PropertyPlaceholderConfigurer bean) registered any before:
   // 为了解决注解上的属性解析 ${}.
   if (!beanFactory.hasEmbeddedValueResolver()) {
      beanFactory.addEmbeddedValueResolver(new StringValueResolver() {
         @Override
         public String resolveStringValue(String strVal) {
            return getEnvironment().resolvePlaceholders(strVal);
         }
      });
   }
   // 提前初始化LoadTimeWeaverAware实例early to allow for registering their transformers early.
   String[] weaverAwareNames = beanFactory.getBeanNamesForType(LoadTimeWeaverAware.class, false, false);
   for (String weaverAwareName : weaverAwareNames) {
      getBean(weaverAwareName);
   }
   // Stop using the temporary ClassLoader for type matching.
   beanFactory.setTempClassLoader(null);
   //到此不再允许修改BeanDefinition配置
   beanFactory.freezeConfiguration();
   // 实例化bean(non-lazy-init)
   beanFactory.preInstantiateSingletons();
}
```

### 结束刷新

Spring提供了一个Lifecycle接口，实现这个结果的bean，spring会保证在启动的时候调用其start方法开始生命周期，在spring关闭的时候调用stop方法结束bean的生命周期。到此spring容器已经启动成功，onRefresh就是用于调用所有实现Lifecycle接口bean的start方法

```java
protected void finishRefresh() {
   // Initialize lifecycle processor for this context.
   initLifecycleProcessor();
   // Propagate refresh to lifecycle processor first.
   getLifecycleProcessor().onRefresh();
   // Publish the final event.
   publishEvent(new ContextRefreshedEvent(this));
   // Participate in LiveBeansView MBean, if active.
   LiveBeansView.registerApplicationContext(this);
}
```