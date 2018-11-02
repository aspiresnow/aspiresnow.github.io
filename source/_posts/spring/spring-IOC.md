---
title: spring-IOC
catalog: true
date: 2018-09-20 15:27:13
tags:
- spring 
categories:
- spring

---

# spring-IOC

---



## BeanFactory继承体系

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/beanFactory.png)

Spring中声明了BeanFactory接口，该接口提供了获取Bean的功能。从继承图可以看出，BeanFactory的继承主要分成两个体系，一条是spring-context中ApplicationContext的继承体系，一条是spring-core中XMLBeanFactory的继承体系。首先简单介绍下spring-core继承体系中各个继承类的功能

- BeanFactory:访问spring容器的根接口，主要提供了 getBean方法。通过id获取容器中bean对象
- ListableBeanFactory:提供获取容器中所有bean对象的功能实现。通俗讲就是获取多个bean对象
- HierarchicalBeanFactory：提供获取父类容器的功能
- AutowireCapableBeanFactory:提供创建bean、配置bean、自动注入、bean初始化以及应用BeanPostProcesror的后处理器。
- ConfigurableBeanFactory:提供配置spring容器的方法接口
- ConfigurableListableBeanFactory：配置容器要忽略的类型和接口。综合了listable和configurable的功能。
- AbstractBeanFactory:综合了FactoryBeanRegistrySupport的注册功能，并实现了部分容器的具体功能实现
- AbstractAutowireCapableBeanFactory:对自动配置的具体实现，综合了AbstractBeanFactory的功能
- DefaultListableBeanFactory:提供创建bean和获取bean的具体实现。并实现了BeanDefinition的注册功能

## 加载Bean

spring的加载bean的过程是将开发人员的spring配置转换为spring内部数据结构的过程，主要进行下面三步:

1. Resource定位,解析配置文件路径及dom解析。
2. BeanDefinition构建， 将用户定义的<bean>配置表示为IOC容器内部的数据结构
3. BeanDefinition注册，将BeanDefinition对象注册到一个HashMap中，以bean id为key

在spring-core中使用XmlBeanFactory作为BeanFactory的具体实现来作为spring容器。

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/XmlBeanFactory.jpg)

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/BeanDefinition.jpg)

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/BeanLoad.jpg)

- ResourceLoader：资源加载，处理import的时候用了
- BeanDefinitionReader：
- DocumentLoader：配置文件转换为Document
- BeanDefinitionDocumentReader：读取Document并注册BeanDefinition
- BeanDefinitionParserDelegate： 用来解析xml转换为BeanDefinition 用来解析 <bean>标签返回 BeanDefinitionHolder
- XmlReaderContext：全局变量 存储 BeanDefinitionRegistry, XmlBeanDefinitionReader
- BeanDefinitionReaderUtils：注册
- BeanDefinitionRegistry：注册器  DefaultListableBeanFactory 实现了注册器功能

对bean 定义载入IOC容器使用的方法是loadBeanDefinition,其中的大致过程如下：通过ResourceLoader来完成资源文件位置的定位，DefaultResourceLoader是默认的实现，同时上下文本身就给出了ResourceLoader的实现，可以从类路径，文件系统, URL等方式来定为资源位置。如果是XmlBeanFactory作为IOC容器，那么需要为它指定bean定义的资源，也就是说bean定义文件时通过抽象成Resource来被IOC容器处理的，容器通过BeanDefinitionReader来完成定义信息的解析和Bean信息的注册,往往使用的是XmlBeanDefinitionReader来解析bean的xml定义文件 - 实际的处理过程是委托给BeanDefinitionParserDelegate来完成的，从而得到bean的定义信息，这些信息在Spring中使用BeanDefinition对象来表示 - 这个名字可以让我们想到loadBeanDefinition,RegisterBeanDefinition这些相关的方法 - 他们都是为处理BeanDefinitin服务的，IoC容器解析得到BeanDefinition以后，需要把它在IOC容器中注册，这由IOC实现 BeanDefinitionRegistry接口来实现。注册过程就是在IOC容器内部维护的一个HashMap来保存得到的 BeanDefinition的过程。这个HashMap是IoC容器持有bean信息的场所，以后对bean的操作都是围绕这个HashMap来实现的

- bean属性

  ```
  class
  name
  scope
  constructor arguments
  properties
  autowiring mode
  lazy-initialization mode
  initialization method
  destruction method
  ```

  IdentityHashMap



```java
public AbstractAutowireCapableBeanFactory() {
   super();
    //Set<Class<?>> ignoredDependencyInterfaces ,Dependency interfaces to ignore on dependency check and autowire 依赖注入的时候忽略实现以下接口的bean的初始化
   ignoreDependencyInterface(BeanNameAware.class);
   ignoreDependencyInterface(BeanFactoryAware.class);
   ignoreDependencyInterface(BeanClassLoaderAware.class);
}

public AbstractAutowireCapableBeanFactory(BeanFactory parentBeanFactory) {
   this();
   setParentBeanFactory(parentBeanFactory);
}


//AbstractBeanFactory 继承自ConfigurableBeanFactory
@Override
public void setParentBeanFactory(BeanFactory parentBeanFactory) {
	if (this.parentBeanFactory != null && this.parentBeanFactory != parentBeanFactory) {
    	throw new IllegalStateException("Already associated with parent BeanFactory: " + 			this.parentBeanFactory);
    }
	this.parentBeanFactory = parentBeanFactory;
}
```



```java
//XmlBeanDefinitionReader
public int registerBeanDefinitions(Document doc, Resource resource) throws BeanDefinitionStoreException {
   BeanDefinitionDocumentReader documentReader = createBeanDefinitionDocumentReader();
   int countBefore = getRegistry().getBeanDefinitionCount();
   documentReader.registerBeanDefinitions(doc, createReaderContext(resource));
   return getRegistry().getBeanDefinitionCount() - countBefore;
}
```



```java
//DefaultBeanDefinitionDocumentReader
@Override
public void registerBeanDefinitions(Document doc, XmlReaderContext readerContext) {
    this.readerContext = readerContext;
    logger.debug("Loading bean definitions");
    Element root = doc.getDocumentElement();
    doRegisterBeanDefinitions(root);
}
protected void doRegisterBeanDefinitions(Element root) {
   BeanDefinitionParserDelegate parent = this.delegate;
   this.delegate = createDelegate(getReaderContext(), root, parent);

   if (this.delegate.isDefaultNamespace(root)) {
      String profileSpec = root.getAttribute(PROFILE_ATTRIBUTE);
      if (StringUtils.hasText(profileSpec)) {
         String[] specifiedProfiles = StringUtils.tokenizeToStringArray(
               profileSpec, BeanDefinitionParserDelegate.MULTI_VALUE_ATTRIBUTE_DELIMITERS);
         if (!getReaderContext().getEnvironment().acceptsProfiles(specifiedProfiles)) {
            if (logger.isInfoEnabled()) {
               logger.info("Skipped XML bean definition file due to specified profiles [" + profileSpec +
                     "] not matching: " + getReaderContext().getResource());
            }
            return;
         }
      }
   }

   preProcessXml(root);
   parseBeanDefinitions(root, this.delegate);
   postProcessXml(root);

   this.delegate = parent;
}
protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
    if (delegate.isDefaultNamespace(root)) {
        NodeList nl = root.getChildNodes();
        for (int i = 0; i < nl.getLength(); i++) {
            Node node = nl.item(i);
            if (node instanceof Element) {
                Element ele = (Element) node;
                if (delegate.isDefaultNamespace(ele)) {
                    parseDefaultElement(ele, delegate);
                }
                else {
                    delegate.parseCustomElement(ele);
                }
            }
        }
    }
    else {
        delegate.parseCustomElement(root);
    }
}
private void parseDefaultElement(Element ele, BeanDefinitionParserDelegate delegate) {
    if (delegate.nodeNameEquals(ele, IMPORT_ELEMENT)) {
        importBeanDefinitionResource(ele);
    }
    else if (delegate.nodeNameEquals(ele, ALIAS_ELEMENT)) {
        processAliasRegistration(ele);
    }
    else if (delegate.nodeNameEquals(ele, BEAN_ELEMENT)) {
        processBeanDefinition(ele, delegate);
    }
    else if (delegate.nodeNameEquals(ele, NESTED_BEANS_ELEMENT)) {
        // recurse
        doRegisterBeanDefinitions(ele);
    }
}

//解析bean
protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {
    BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
    if (bdHolder != null) {
        bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
        try {
            // Register the final decorated instance.
            BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
        }
        catch (BeanDefinitionStoreException ex) {
            getReaderContext().error("Failed to register bean definition with name '" +
                                     bdHolder.getBeanName() + "'", ele, ex);
        }
        // Send registration event.
        getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
    }
}
public AbstractBeanDefinition parseBeanDefinitionElement(
			Element ele, String beanName, BeanDefinition containingBean) {

    this.parseState.push(new BeanEntry(beanName));

    String className = null;
    if (ele.hasAttribute(CLASS_ATTRIBUTE)) {
        className = ele.getAttribute(CLASS_ATTRIBUTE).trim();
    }

    try {
        String parent = null;
        if (ele.hasAttribute(PARENT_ATTRIBUTE)) {
            parent = ele.getAttribute(PARENT_ATTRIBUTE);
        }
        AbstractBeanDefinition bd = createBeanDefinition(className, parent);

        parseBeanDefinitionAttributes(ele, beanName, containingBean, bd);
        bd.setDescription(DomUtils.getChildElementValueByTagName(ele, DESCRIPTION_ELEMENT));

        parseMetaElements(ele, bd);//解析子元素 <meta>
        parseLookupOverrideSubElements(ele, bd.getMethodOverrides());//解析子元素 <look-up>
        parseReplacedMethodSubElements(ele, bd.getMethodOverrides());//解析子元素 <replace-method>
        parseConstructorArgElements(ele, bd);
        parsePropertyElements(ele, bd);
        parseQualifierElements(ele, bd);//解析子元素 <qualifier>

        bd.setResource(this.readerContext.getResource());
        bd.setSource(extractSource(ele));

        return bd;
    }
    catch (ClassNotFoundException ex) {
        error("Bean class [" + className + "] not found", ele, ex);
    }
    catch (NoClassDefFoundError err) {
        error("Class that bean class [" + className + "] depends on not found", ele, err);
    }
    catch (Throwable ex) {
        error("Unexpected failure during bean definition parsing", ele, ex);
    }
    finally {
        this.parseState.pop();
    }

    return null;
}
```







StringTokenizer 类  StringUtils.tokenizeToStringArray方法



FactoryBean接口，实现该接口可以通过getObject方法创建自己想要的bean对象。在初始化bean的时候，如果bean实现类了FactoryBean接口，则是返回getObject方法返回的对象，而不是创建实现FactoryBean接口的对象

因为在创建单例bean的时候会存在依赖注入的情况，而在创建依赖的时候为了避免循环依赖，spring创建bean的原则是不等bean创建完成就会将创建bean的ObjectFactory提早曝光，也就是将ObjectFactory加入到缓存中，一旦下个bean创建时间需要依赖上个bean则直接使用ObjectFactory。缓存中记录的只是最原始的bean状态，需要进行实例化

只有单例模式setter注入才会解决循环依赖问题，原型模式在遇到循环依赖的情况下会直接抛出异常，因为不允许缓存原型模式的bean.

解析 depend-on标签，会缓存并初始化depend-on指定的bean





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