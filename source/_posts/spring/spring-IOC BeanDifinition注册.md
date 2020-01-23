---
title: spring-IOC BeanDifinition注册
date: 2018-09-20 15:27:13
tags:
- spring
categories:
- spring

---

# spring-IOC BeanDifinition注册

---



## BeanFactory继承体系

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/beanFactory.png)

Spring中声明了BeanFactory接口，该接口提供了获取Bean的功能。从继承图可以看出，BeanFactory的继承主要分成两个体系，一条是spring-context中ApplicationContext的继承体系，一条是spring-core中XMLBeanFactory的继承体系。首先简单介绍下spring-core继承体系中各个继承类的功能

- BeanFactory:访问spring容器的根接口，主要提供了 getBean方法。通过beanName获取容器中bean对象
- ListableBeanFactory:提供获取容器中所有bean对象的功能实现。通俗讲就是获取多个bean对象
- HierarchicalBeanFactory：提供获取父类容器的功能
- AutowireCapableBeanFactory:提供创建bean、配置bean、自动注入、bean初始化以及应用BeanPostProcesror的后处理器。
- ConfigurableBeanFactory:提供配置spring容器的方法接口,用于对容器进行扩展
- ConfigurableListableBeanFactory：配置容器要忽略的类型和接口。综合了listable和configurable的功能。
- AbstractBeanFactory:综合了FactoryBeanRegistrySupport的注册功能，并实现了部分容器的具体功能实现
- AbstractAutowireCapableBeanFactory:对自动配置的具体实现，综合了AbstractBeanFactory的功能
- DefaultListableBeanFactory:提供创建bean和获取bean的具体实现。并实现了BeanDefinition的注册功能

## 容器配置

### XmlBeanFactory配置

spring的加载bean配置的过程是将spring配置转换为spring内部数据结构BeanDefinition的过程，主要进行下面三步:

1. Resource定位,解析配置文件路径及dom解析。
2. BeanDefinition构建， 将用户定义的<bean>配置表示为IOC容器内部的数据结构
3. BeanDefinition注册，将BeanDefinition对象注册到一个HashMap中，以bean id为key

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/BeanDefinition.jpg)

在spring-core中使用XmlBeanFactory作为BeanFactory的具体实现来作为spring容器。而其中最重要的一个容器类是**DefaultListableBeanFactory**,XmlBeanFactory完全继承了DefaultListableBeanFactory的功能，只是额外提供了加载BeanDefinition的功能实现。

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/XmlBeanFactory.jpg)

从图中可以看到，xmlBeanFactory继承了DefaultListableBeanFactory，容器的功能都是由DefaultListableBeanFactory提供的。图中大致可以分为两条继承线，一条是BeanFactory的继承线，一条是AliasRegistry的继承线。DefaultListableBean除了提供容器的功能，还通过实现BeanDefinitionRegistry接口实现了BeanDefinition的注册功能。

### 加载过程简述

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/BeanLoad.jpg)

- ResourceLoader：资源加载，处理import的时候用了
- BeanDefinitionReader：
- DocumentLoader：配置文件转换为Document
- BeanDefinitionDocumentReader：读取Document并注册BeanDefinition
- BeanDefinitionParserDelegate： 用来解析xml转换为BeanDefinition 用来解析 <bean>节点返回 BeanDefinitionHolder
- XmlReaderContext：全局变量 存储 BeanDefinitionRegistry, XmlBeanDefinitionReader
- BeanDefinitionReaderUtils：注册
- BeanDefinitionRegistry：注册器  DefaultListableBeanFactory 实现了注册器功能

XmlBeanFactory的初始化是从`loadBeanDefinition`方法开始的,主要过程如下:
1. 通过ResourceLoader来完成资源文件位置的定位，DefaultResourceLoader是默认的实现，同时上下文本身就给出了ResourceLoader的实现，可以从类路径，文件系统, URL等方式来定位资源位置。如果是XmlBeanFactory作为IOC容器，那么需要为它指定bean定义的资源，也就是说bean定义文件是通过抽象成Resource来被IOC容器处理的
2. 容器通过BeanDefinitionReader来完成定义信息的解析和Bean信息的注册,使用的是XmlBeanDefinitionReader来解析bean的xml定义文件
3. 实际的处理过程是委托给BeanDefinitionParserDelegate来完成的，从而得到bean的定义信息，这些信息在Spring中使用BeanDefinition对象来表示 
4. IoC容器解析得到BeanDefinition以后，需要把它在IOC容器中注册，这由IOC实现 BeanDefinitionRegistry接口来实现。注册过程就是在IOC容器内部维护的一个HashMap来保存得到的 BeanDefinition的过程。这个HashMap是IoC容器持有bean信息的场所，以后对bean的操作都是围绕这个HashMap来实现的

## 源码解读

首先编写测试类，读取类路径下的spring配置，然后创建一个spring容易，XmlBeanFactory对象

```java
@Test
public void testSimpleLoad(){
    ClassPathResource resource = new ClassPathResource("spring/applicationContext.xml");
    XmlBeanFactory bf = new XmlBeanFactory(resource);
}
```

XmlBeanFactory完全继承DefaultListableBeanFactory，并持有一个XMLBeanDefinitionReader对象,XmlBeanDefinitionReader构造时传递一个BeanDefinitionRegistry对象，上面提过DefaultListableBeanFactory本身就是一个BeanDefinitionRegistry实现类，所以传递this

```java
public class XmlBeanFactory extends DefaultListableBeanFactory {
	private final XmlBeanDefinitionReader reader = new XmlBeanDefinitionReader(this);
	public XmlBeanFactory(Resource resource) throws BeansException {
		this(resource, null);
	}
	public XmlBeanFactory(Resource resource, BeanFactory parentBeanFactory) throws BeansException {
		super(parentBeanFactory);
		this.reader.loadBeanDefinitions(resource);
	}
}
```

在调用super(parentBeanFactory)的时候主要是初始化父类配置。在这个过程中设置了自动装配过程中需要忽略的接口实现类，忽略了BeanNameAware、BeanFactoryAware、BeanClassLoaderAware的自动依赖配置，这类接口的实现类主要功能是spring容易对外暴露容器本身使用的

```java
//Dependency interfaces to ignore on dependency check and autowire
private final Set<Class<?>> ignoredDependencyInterfaces = new HashSet<Class<?>>();
public AbstractAutowireCapableBeanFactory(BeanFactory parentBeanFactory) {
    this();
    setParentBeanFactory(parentBeanFactory);//设置父类容器
}
public AbstractAutowireCapableBeanFactory() {
    super();
    ignoreDependencyInterface(BeanNameAware.class);
    ignoreDependencyInterface(BeanFactoryAware.class);
    ignoreDependencyInterface(BeanClassLoaderAware.class);
}
public void ignoreDependencyInterface(Class<?> ifc) {
    this.ignoredDependencyInterfaces.add(ifc);
}
```

进入XMLBeanDefinitionReader类中进行配置加载过程，在loadBeanDefinitions中其实就做了一步防止配置文件重复加载的功能，然后就调用下一步了

```java
public int loadBeanDefinitions(Resource resource) throws BeanDefinitionStoreException {
    return loadBeanDefinitions(new EncodedResource(resource));
}
public int loadBeanDefinitions(EncodedResource encodedResource) throws BeanDefinitionStoreException {
    Assert.notNull(encodedResource, "EncodedResource must not be null");
    if (logger.isInfoEnabled()) {
        logger.info("Loading XML bean definitions from " + encodedResource);
    }
	//private final ThreadLocal<Set<EncodedResource>> resourcesCurrentlyBeingLoaded =new NamedThreadLocal<Set<EncodedResource>>("XML bean definition resources currently being loaded"); 防止重复加载配置文件
    Set<EncodedResource> currentResources = this.resourcesCurrentlyBeingLoaded.get();
    if (currentResources == null) {
        currentResources = new HashSet<EncodedResource>(4);
        this.resourcesCurrentlyBeingLoaded.set(currentResources);
    }
    if (!currentResources.add(encodedResource)) {
        throw new BeanDefinitionStoreException(
            "Detected cyclic loading of " + encodedResource + " - check your import definitions!");
    }
    try {
        InputStream inputStream = encodedResource.getResource().getInputStream();
        try {
            InputSource inputSource = new InputSource(inputStream);
            if (encodedResource.getEncoding() != null) {
                inputSource.setEncoding(encodedResource.getEncoding());
            }
            return doLoadBeanDefinitions(inputSource, encodedResource.getResource());
        }
        finally {
            inputStream.close();
        }
    }
    catch (IOException ex) {
        throw new BeanDefinitionStoreException(
            "IOException parsing XML document from " + encodedResource.getResource(), ex);
    }
    finally {
        //最终移除文件正在加载的标识
        currentResources.remove(encodedResource);
        if (currentResources.isEmpty()) {
            this.resourcesCurrentlyBeingLoaded.remove();
        }
    }
}
```

调用doLoadBeanDefinitions方法，Dom解析配置文件，然后调用解析dom封装注册BeanDefinition

```java
protected int doLoadBeanDefinitions(InputSource inputSource, Resource resource)
    throws BeanDefinitionStoreException {
    try {
        Document doc = doLoadDocument(inputSource, resource);
        return registerBeanDefinitions(doc, resource);
    }
    catch (BeanDefinitionStoreException ex) {
        throw ex;
    }
}
```

对应dom的解析是委托给DefaultDocumentLoader处理的，主要涉及xml文件的合法校验和dom解析，这里暂时不多讲

```java
protected Document doLoadDocument(InputSource inputSource, Resource resource) throws Exception {
    return this.documentLoader.loadDocument(inputSource, getEntityResolver(), 			this.errorHandler,etValidationModeForResource(resource), isNamespaceAware());
}
```

配置文件dom解析完毕后就是解析dom树封装并注册BeanDefinition对象。XmlBeanDefinitionReader将该功能委托给DefaultBeanDefinitionDocumentReader类实现，可以覆盖提供自定义实现

```java
public int registerBeanDefinitions(Document doc, Resource resource) throws BeanDefinitionStoreException {
    //创建BeanDefinitionDocumentReader
    BeanDefinitionDocumentReader documentReader = createBeanDefinitionDocumentReader();
    //在创建XMLBeanDefinitionReader的时候传入了BeanDefinitionRegistry，其实就是获取map的size
    int countBefore = getRegistry().getBeanDefinitionCount();
    //创建并注册 BeanDefinition
    documentReader.registerBeanDefinitions(doc, createReaderContext(resource));
    //获取本次注册BeanDefinition的数量
    return getRegistry().getBeanDefinitionCount() - countBefore;
}
protected BeanDefinitionDocumentReader createBeanDefinitionDocumentReader() {
    return BeanDefinitionDocumentReader.class.cast(BeanUtils.instantiateClass(this.documentReaderClass));//private Class<?> documentReaderClass = DefaultBeanDefinitionDocumentReader.class;
}
```

在调用documentReader之前，创建了一个XmlReaderContext,在这里保存了本次加载的的XMLBeanDefinitionReader

```java
public XmlReaderContext createReaderContext(Resource resource) {
    return new XmlReaderContext(resource, this.problemReporter, this.eventListener,
                                this.sourceExtractor, this, getNamespaceHandlerResolver());
}
```

终于在doRegisterBeanDefinitions看到了解析xml的操作，这里preProcessXml和postProcessXml都是空方法，主要是给子类扩展实现的，当需要在解析配置文件前后进行改动的时候，可以扩展实现BeanDefinitionDocumentReader。

parseBeanDefinitions是真正的解析开始，不过又把解析实现委托给了BeanDefinitionParserDelegate来完成

```java
@Override
public void registerBeanDefinitions(Document doc, XmlReaderContext readerContext) {
    this.readerContext = readerContext;
    logger.debug("Loading bean definitions");
    Element root = doc.getDocumentElement();
    doRegisterBeanDefinitions(root);
}
protected void doRegisterBeanDefinitions(Element root) {
    //<beans>里面套<beans>的时候 创建新的BeanDefinitionParserDelegate
    BeanDefinitionParserDelegate parent = this.delegate;
    this.delegate = createDelegate(getReaderContext(), root, parent);

    if (this.delegate.isDefaultNamespace(root)) {
        String profileSpec = root.getAttribute(PROFILE_ATTRIBUTE);
        if (StringUtils.hasText(profileSpec)) {
            String[] specifiedProfiles = StringUtils.tokenizeToStringArray(
                profileSpec, BeanDefinitionParserDelegate.MULTI_VALUE_ATTRIBUTE_DELIMITERS);
            if (!getReaderContext().getEnvironment().acceptsProfiles(specifiedProfiles)) {
                if (logger.isInfoEnabled()) {
                    logger.info("Skipped XML bean definition file ");
                return;
            }
        }
    }
    preProcessXml(root);//解析xml前处理，钩子方法
    parseBeanDefinitions(root, this.delegate);//解析开始
    postProcessXml(root);//解析xml后处理，钩子方法

    this.delegate = parent;
}
protected BeanDefinitionParserDelegate createDelegate(XmlReaderContext readerContext, Element root, BeanDefinitionParserDelegate parentDelegate) {
    BeanDefinitionParserDelegate delegate = new BeanDefinitionParserDelegate(readerContext);
    //初始化一些默认配置
    delegate.initDefaults(root, parentDelegate);
    return delegate;
}
```

在parseBeanDefinitions方法就递归解析dom节点。在这里分为对bean空间下标签解析和自定义扩展的标签解析

```java
protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
    if (delegate.isDefaultNamespace(root)) {//判断是否是 <beans>标签
        NodeList nl = root.getChildNodes();
        for (int i = 0; i < nl.getLength(); i++) {
            Node node = nl.item(i);
            if (node instanceof Element) {
                Element ele = (Element) node;
                if (delegate.isDefaultNamespace(ele)) {
                    parseDefaultElement(ele, delegate);//解析 <bean>默认标签
                }else {
                    delegate.parseCustomElement(ele);//解析自定义标签如 <tx:annotation-driven>
                }
            }
        }
    }else {
        delegate.parseCustomElement(root);
    }
}
```

这里主要看对默认标签的解析，也就是解析 `import`,`alias`,`bean`,`beans`四种标签

```java
private void parseDefaultElement(Element ele, BeanDefinitionParserDelegate delegate) {
    if (delegate.nodeNameEquals(ele, IMPORT_ELEMENT)) {
        importBeanDefinitionResource(ele);//解析import标签
    }else if (delegate.nodeNameEquals(ele, ALIAS_ELEMENT)) {
        processAliasRegistration(ele);//解析alias标签
    }else if (delegate.nodeNameEquals(ele, BEAN_ELEMENT)) {
        processBeanDefinition(ele, delegate);//解析bean标签
    }else if (delegate.nodeNameEquals(ele, NESTED_BEANS_ELEMENT)) {
        // 返回去调用doRegisterBeanDefinitions，在那再建一个子类用的delegate进行递归解析
        doRegisterBeanDefinitions(ele);
    }
}
```

由delegate将<bean>解析封装为BeanDefinitionHolder。BeanDefinitionHolder封装了BeanDefinition、BeanName、aliases。最后通过BeanDefinitionReaderUtils注册BeanDefinition

```java
protected void processBeanDefinition(Element ele, BeanDefinitionParserDelegate delegate) {
    //将解析工作委托给delegate
    BeanDefinitionHolder bdHolder = delegate.parseBeanDefinitionElement(ele);
    if (bdHolder != null) {
        //如果bean标签下有自定义的标签，在这里解析
        bdHolder = delegate.decorateBeanDefinitionIfRequired(ele, bdHolder);
        try {
            // Register the final decorated instance.
            BeanDefinitionReaderUtils.registerBeanDefinition(bdHolder, getReaderContext().getRegistry());
        }catch (BeanDefinitionStoreException ex) {
            getReaderContext().error("Failed to register bean definition with name '" +
                                     bdHolder.getBeanName() + "'", ele, ex);
        }
        // Send registration event.
        getReaderContext().fireComponentRegistered(new BeanComponentDefinition(bdHolder));
    }
}
public class BeanDefinitionHolder implements BeanMetadataElement {
	private final BeanDefinition beanDefinition;
	private final String beanName;
	private final String[] aliases;
}
```

这里先看下注册，注册比较简单，然后再返回去看解析<bean>标签的功能。再BeanDefinitionReaderUtils中调用registry(DefaultListableBeanFactory)进行注册，

```java
public static void registerBeanDefinition(
    BeanDefinitionHolder definitionHolder, BeanDefinitionRegistry registry)
    throws BeanDefinitionStoreException {

    // Register bean definition under primary name.
    String beanName = definitionHolder.getBeanName();
    registry.registerBeanDefinition(beanName, definitionHolder.getBeanDefinition());

    // Register aliases for bean name, if any.
    String[] aliases = definitionHolder.getAliases();
    if (aliases != null) {
        for (String alias : aliases) {
            registry.registerAlias(beanName, alias);
        }
    }
}
```

注册BeanDefinition

```java
private final Map<String, BeanDefinition> beanDefinitionMap = new ConcurrentHashMap<String, BeanDefinition>(256);
@Override
public void registerBeanDefinition(String beanName, BeanDefinition beanDefinition)
    throws BeanDefinitionStoreException {

    Assert.hasText(beanName, "Bean name must not be empty");
    Assert.notNull(beanDefinition, "BeanDefinition must not be null");

    if (beanDefinition instanceof AbstractBeanDefinition) {
        try {
            ((AbstractBeanDefinition) beanDefinition).validate();
        }catch (BeanDefinitionValidationException ex) {
            throw new BeanDefinitionStoreException("Validation definition failed", ex);
        }
    }

    BeanDefinition existingDefinition = this.beanDefinitionMap.get(beanName);
    if (existingDefinition != null) {//如果已经注册过
        if (!isAllowBeanDefinitionOverriding()) {//不允许覆盖直接抛异常
            throw new BeanDefinitionStoreException("Cannot register bean definition);
        }else if (existingDefinition.getRole() < beanDefinition.getRole()) {
            //ROLE_APPLICATION, now overriding with ROLE_SUPPORT or ROLE_INFRASTRUCTURE
            if (logger.isWarnEnabled()) {
                logger.warn("Overriding user-defined bean definition for bean '");
            }
        }
        this.beanDefinitionMap.put(beanName, beanDefinition);//覆盖注册
    }else {
        if (hasBeanCreationStarted()) {
            // Cannot modify startup-time collection elements anymore (for stable iteration)
            synchronized (this.beanDefinitionMap) {
                this.beanDefinitionMap.put(beanName, beanDefinition);
                List<String> updatedDefinitions = new ArrayList<String>(this.beanDefinitionNames.size() + 1);
                updatedDefinitions.addAll(this.beanDefinitionNames);
                updatedDefinitions.add(beanName);
                this.beanDefinitionNames = updatedDefinitions;
                if (this.manualSingletonNames.contains(beanName)) {
                    Set<String> updatedSingletons = new LinkedHashSet<String>(this.manualSingletonNames);
                    updatedSingletons.remove(beanName);
                    this.manualSingletonNames = updatedSingletons;
                }
            }
        }else {
            // Still in startup registration phase
            this.beanDefinitionMap.put(beanName, beanDefinition);
            this.beanDefinitionNames.add(beanName);
            this.manualSingletonNames.remove(beanName);
        }
        this.frozenBeanDefinitionNames = null;
    }

    if (existingDefinition != null || containsSingleton(beanName)) {
        resetBeanDefinition(beanName);//清除缓存
    }
}
```

注册alias,	其实就是在一个map中建立alias到beanName的映射关系

```java
private final Map<String, String> aliasMap = new ConcurrentHashMap<String, String>(16);
@Override
public void registerAlias(String name, String alias) {
    Assert.hasText(name, "'name' must not be empty");
    Assert.hasText(alias, "'alias' must not be empty");
    synchronized (this.aliasMap) {
        if (alias.equals(name)) {
            //名字和别名一致，不需要再注册别名
            this.aliasMap.remove(alias);
        }else {
            String registeredName = this.aliasMap.get(alias);
            if (registeredName != null) {
                if (registeredName.equals(name)) {
                    // An existing alias - no need to re-register
                    return;
                }
                if (!allowAliasOverriding()) {
                    throw new IllegalStateException("Cannot register alias");
                }
            }
            checkForAliasCircle(name, alias);
            this.aliasMap.put(alias, name);
        }
    }
}
```

然后接着看BeanDefinitionParserDelegate解析<bean>的过程

```java
public BeanDefinitionHolder parseBeanDefinitionElement(Element ele, BeanDefinition containingBean) {
    String id = ele.getAttribute(ID_ATTRIBUTE);
    String nameAttr = ele.getAttribute(NAME_ATTRIBUTE);

    List<String> aliases = new ArrayList<String>();
    if (StringUtils.hasLength(nameAttr)) {
        String[] nameArr = StringUtils.tokenizeToStringArray(nameAttr, MULTI_VALUE_ATTRIBUTE_DELIMITERS);
        aliases.addAll(Arrays.asList(nameArr));
    }

    String beanName = id;
    //当没有配置bean id，但是配置了alias，默认使用alias中第一个作为beanName
    if (!StringUtils.hasText(beanName) && !aliases.isEmpty()) {
        beanName = aliases.remove(0);
        if (logger.isDebugEnabled()) {
            logger.debug("No XML 'id' specified - using '" + beanName +
                         "' as bean name and " + aliases + " as aliases");
        }
    }

    if (containingBean == null) {
        //保证beanName和alias没有被使用过
        checkNameUniqueness(beanName, aliases, ele);
    }
	//继续向下解析<bean>标签
    AbstractBeanDefinition beanDefinition = parseBeanDefinitionElement(ele, beanName, containingBean);
    if (beanDefinition != null) {
        if (!StringUtils.hasText(beanName)) {//没有指定beanName时 自动生成策略
            try {
                if (containingBean != null) {
                    beanName = BeanDefinitionReaderUtils.generateBeanName(
                        beanDefinition, this.readerContext.getRegistry(), true);
                }else {
                    beanName = this.readerContext.generateBeanName(beanDefinition);
                    String beanClassName = beanDefinition.getBeanClassName();
                    if (beanClassName != null &&
                        beanName.startsWith(beanClassName) && beanName.length() > beanClassName.length() &&
                        !this.readerContext.getRegistry().isBeanNameInUse(beanClassName)) {
                        aliases.add(beanClassName);
                    }
                }
                if (logger.isDebugEnabled()) {
                    logger.debug("Neither XML 'id' nor 'name' specified - " );
                }
            }
            catch (Exception ex) {
                error(ex.getMessage(), ele);
                return null;
            }
        }
        String[] aliasesArray = StringUtils.toStringArray(aliases);
        //将beanName BeanDefinition alias封装到一起返回
        return new BeanDefinitionHolder(beanDefinition, beanName, aliasesArray);
    }
    return null;
}
```

继续看<bean>标签的解析，其实就是解析<bean>标签上的属性节点和子节点，然后将相关属性封装到BeanDefinition中

```java
public AbstractBeanDefinition parseBeanDefinitionElement(
    Element ele, String beanName, BeanDefinition containingBean) {
	//解析内嵌<bean>标签时会传递父类bean作为containingBean
    this.parseState.push(new BeanEntry(beanName));//入栈

    String className = null;
    if (ele.hasAttribute(CLASS_ATTRIBUTE)) {
        className = ele.getAttribute(CLASS_ATTRIBUTE).trim();
    }

    try {
        String parent = null;
        if (ele.hasAttribute(PARENT_ATTRIBUTE)) {
            parent = ele.getAttribute(PARENT_ATTRIBUTE);
        }
         //就是创建一个AbstractBeanDefinition对象返回
        AbstractBeanDefinition bd = createBeanDefinition(className, parent);
		    //解析<bean>标签上的属性，如 init-method singleton scope lazy-init autowire等属性
        parseBeanDefinitionAttributes(ele, beanName, containingBean, bd);
        //解析description
        bd.setDescription(DomUtils.getChildElementValueByTagName(ele, DESCRIPTION_ELEMENT));
        parseMetaElements(ele, bd);//解析meta信息
        parseLookupOverrideSubElements(ele, bd.getMethodOverrides());//解析lookup-method
        parseReplacedMethodSubElements(ele, bd.getMethodOverrides());//解析replace-method
        parseConstructorArgElements(ele, bd);//解析构造器<constructor-arg>
        parsePropertyElements(ele, bd);//解析<bean>标签下的 <property>子标签
        parseQualifierElements(ele, bd);//解析<bean>标签下的 <qualifier> 子标签

        bd.setResource(this.readerContext.getResource());//配置文件 xml
        bd.setSource(extractSource(ele));

        return bd;
    }
    catch (ClassNotFoundException ex) {
        error("Bean class [" + className + "] not found", ele, ex);
    }//....
    finally {
        this.parseState.pop();//出栈
    }
    return null;
}
```

解析构造器配置,构造器可以通过两种方式指定构造器参数，一种是通过index指定参数的顺序，这个是优先级最高的，一种是通过指定参数的名字还匹配构造器。可以通过type字段指定参数的类型。

解析完<constructor-arg>标签后封装到ValueHolder中，然后再将参数分类保存到ConstructorArgumentValues中

```java
public void parseConstructorArgElements(Element beanEle, BeanDefinition bd) {
    NodeList nl = beanEle.getChildNodes();
    for (int i = 0; i < nl.getLength(); i++) {//循环解析构造器的参数
        Node node = nl.item(i);
        if (isCandidateElement(node) && nodeNameEquals(node, CONSTRUCTOR_ARG_ELEMENT)) {
            parseConstructorArgElement((Element) node, bd);//解析子节点<constructor-arg>
        }
    }
}
public void parseConstructorArgElement(Element ele, BeanDefinition bd) {
    String indexAttr = ele.getAttribute(INDEX_ATTRIBUTE);//获取index属性值
    String typeAttr = ele.getAttribute(TYPE_ATTRIBUTE);//获取type属性值
    String nameAttr = ele.getAttribute(NAME_ATTRIBUTE);//获取name属性值
    if (StringUtils.hasLength(indexAttr)) {//如果存在index属性，直接使用index匹配构造器
        try {
            int index = Integer.parseInt(indexAttr);
            if (index < 0) {
                error("'index' cannot be lower than 0", ele);
            }else {
                try {
                    this.parseState.push(new ConstructorArgumentEntry(index));
                    Object value = parsePropertyValue(ele, bd, null);//解析构造器的各个属性
                    ConstructorArgumentValues.ValueHolder valueHolder = new ConstructorArgumentValues.ValueHolder(value);//封装属性值到ValueHolder中
                    if (StringUtils.hasLength(typeAttr)) {
                        valueHolder.setType(typeAttr);//设置构造器参数的类型
                    }
                    if (StringUtils.hasLength(nameAttr)) {
                        valueHolder.setName(nameAttr);//设置构造器参数的名字
                    }
                    valueHolder.setSource(extractSource(ele));
                    //构造器 参数 index 配置重复
                    if (bd.getConstructorArgumentValues().hasIndexedArgumentValue(index)) {
                        error("Ambiguous constructor-arg entries for index " + index, ele);
                    }
                    else {
                        //赋值 BeanDefinition的构造器的参数 根据index进行赋值
                        bd.getConstructorArgumentValues().addIndexedArgumentValue(index, valueHolder);
                    }
                }
                finally {
                    this.parseState.pop();
                }
            }
        }
        catch (NumberFormatException ex) {
            error("Attribute 'index' of tag 'constructor-arg' must be an integer", ele);
        }
    } else {
        try {
            this.parseState.push(new ConstructorArgumentEntry());
            Object value = parsePropertyValue(ele, bd, null);//解析参数属性
            ConstructorArgumentValues.ValueHolder valueHolder = new ConstructorArgumentValues.ValueHolder(value);
            if (StringUtils.hasLength(typeAttr)) {
                valueHolder.setType(typeAttr);
            }
            if (StringUtils.hasLength(nameAttr)) {
                valueHolder.setName(nameAttr);
            }
            valueHolder.setSource(extractSource(ele));
             //赋值 BeanDefinition的构造器的参数 添加到nameList中
            bd.getConstructorArgumentValues().addGenericArgumentValue(valueHolder);
        }
        finally {
            this.parseState.pop();
        }
    }
}
//构造器参数列表
public class ConstructorArgumentValues {
    //参数下标到参数的映射关系
	private final Map<Integer, ValueHolder> indexedArgumentValues = new LinkedHashMap<Integer, ValueHolder>(0);
	//根据name指定的参数列表
    private final List<ValueHolder> genericArgumentValues = new LinkedList<ValueHolder>();
}
```

剩下就是解析最常用的<property>标签，<bean>标签下的和构造器下的<property>标签的解析逻辑和代码都是一样的。其实还是解析属性和子标签。<constructor-arg>和<property>标签的处理逻辑是一样的

对于属性标签存在三种情况，含有 `ref`、`value`属性或者有**一个**子标签`<set>` `<map`等。而且三者不能共存

```java
public Object parsePropertyValue(Element ele, BeanDefinition bd, String propertyName) {
    String elementName = (propertyName != null) ?
        "<property> element for property '" + propertyName + "'" :
    "<constructor-arg> element";

    // Should only have one child element: ref, value, list, etc.
    NodeList nl = ele.getChildNodes();
    //循环子节点 获取一个 非 description和meta的子标签
    Element subElement = null;
    for (int i = 0; i < nl.getLength(); i++) {
        Node node = nl.item(i);
        if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT) &&
            !nodeNameEquals(node, META_ELEMENT)) {
            // Child element is what we're looking for.
            if (subElement != null) {
                error(elementName + " must not contain more than one sub-element", ele);
            }else {
                subElement = (Element) node;
            }
        }
    }
	
    boolean hasRefAttribute = ele.hasAttribute(REF_ATTRIBUTE);
    boolean hasValueAttribute = ele.hasAttribute(VALUE_ATTRIBUTE);
    //检验 ref value subElement只能设置一个
    if ((hasRefAttribute && hasValueAttribute) ||
        ((hasRefAttribute || hasValueAttribute) && subElement != null)) {
        error(elementName +
              " is only allowed to contain either 'ref' attribute OR 'value' attribute OR sub-element", ele);
    }

    if (hasRefAttribute) {
        String refName = ele.getAttribute(REF_ATTRIBUTE);
        if (!StringUtils.hasText(refName)) {
            error(elementName + " contains empty 'ref' attribute", ele);
        }//将ref封装为RuntimeBeanReference对象
        RuntimeBeanReference ref = new RuntimeBeanReference(refName);
        ref.setSource(extractSource(ele));
        return ref;
    } else if (hasValueAttribute) {
        //将value属性封装为TypedStringValue对象
        TypedStringValue valueHolder = new TypedStringValue(ele.getAttribute(VALUE_ATTRIBUTE));
        valueHolder.setSource(extractSource(ele));
        return valueHolder;
    } else if (subElement != null) {//解析子标签 
        return parsePropertySubElement(subElement, bd);
    } else {
        // Neither child element nor "ref" or "value" attribute found.
        error(elementName + " must specify a ref or value", ele);
        return null;
    }
}
```

解析子节点，当一个节点只有 ref、value属性或者<value> <ref>子节点后证明该元素没有子节点点了

```java
public Object parsePropertySubElement(Element ele, BeanDefinition bd) {
    return parsePropertySubElement(ele, bd, null);
}
public Object parsePropertySubElement(Element ele, BeanDefinition bd, String defaultValueType) {
    if (!isDefaultNamespace(ele)) {
        return parseNestedCustomElement(ele, bd);
    }else if (nodeNameEquals(ele, BEAN_ELEMENT)) {//内嵌的bean节点，递归解析
        BeanDefinitionHolder nestedBd = parseBeanDefinitionElement(ele, bd);
        if (nestedBd != null) {
            nestedBd = decorateBeanDefinitionIfRequired(ele, nestedBd, bd);
        }
        return nestedBd;
    } else if (nodeNameEquals(ele, REF_ELEMENT)) {//ref节点
        // A generic reference to any name of any bean.
        String refName = ele.getAttribute(BEAN_REF_ATTRIBUTE);
        boolean toParent = false;
        if (!StringUtils.hasLength(refName)) {
            // A reference to the id of another bean in the same XML file.
            refName = ele.getAttribute(LOCAL_REF_ATTRIBUTE);
            if (!StringUtils.hasLength(refName)) {
                // A reference to the id of another bean in a parent context.
                refName = ele.getAttribute(PARENT_REF_ATTRIBUTE);
                toParent = true;
                if (!StringUtils.hasLength(refName)) {
                    error("'bean', 'local' or 'parent' is required for <ref> element", ele);
                    return null;
                }
            }
        }
        if (!StringUtils.hasText(refName)) {
            error("<ref> element contains empty target attribute", ele);
            return null;
        }
        RuntimeBeanReference ref = new RuntimeBeanReference(refName, toParent);
        ref.setSource(extractSource(ele));
        return ref;
    } else if (nodeNameEquals(ele, IDREF_ELEMENT)) {//idref节点
        return parseIdRefElement(ele);
    } else if (nodeNameEquals(ele, VALUE_ELEMENT)) {//终极解析value节点
        return parseValueElement(ele, defaultValueType);
    } else if (nodeNameEquals(ele, NULL_ELEMENT)) {//null节点
        // It's a distinguished null value. Let's wrap it in a TypedStringValue
        // object in order to preserve the source location.
        TypedStringValue nullHolder = new TypedStringValue(null);
        nullHolder.setSource(extractSource(ele));
        return nullHolder;
    } else if (nodeNameEquals(ele, ARRAY_ELEMENT)) {//array节点 封装为 ManagedArray对象
        return parseArrayElement(ele, bd);
    } else if (nodeNameEquals(ele, LIST_ELEMENT)) {//list节点 封装为 ManagedList 对象
        return parseListElement(ele, bd);
    } else if (nodeNameEquals(ele, SET_ELEMENT)) {//set节点 封装为 ManagedSet对象
        return parseSetElement(ele, bd);
    } else if (nodeNameEquals(ele, MAP_ELEMENT)) {//map节点 封装为 ManagedMap对象
        return parseMapElement(ele, bd);
    } else if (nodeNameEquals(ele, PROPS_ELEMENT)) {//props节点 封装为 ManagedProperties对象
        return parsePropsElement(ele);
    } else {
        error("Unknown property sub-element: [" + ele.getNodeName() + "]", ele);
        return null;
    }
}
```

解析<value>子节点，封装属性值到 TypedStringValue对象

```java
public Object parseValueElement(Element ele, String defaultTypeName) {
    // It's a literal value.
    String value = DomUtils.getTextValue(ele);
    String specifiedTypeName = ele.getAttribute(TYPE_ATTRIBUTE);
    String typeName = specifiedTypeName;
    //如果<value>节点上指定了类型，使用 <value>节点上指定的类型
    if (!StringUtils.hasText(typeName)) {
        typeName = defaultTypeName;
    }
    try {
        TypedStringValue typedValue = buildTypedStringValue(value, typeName);
        typedValue.setSource(extractSource(ele));
        typedValue.setSpecifiedTypeName(specifiedTypeName);
        return typedValue;
    }catch (ClassNotFoundException ex) {
        error("Type class [" + typeName + "] not found for <value> element", ele, ex);
        return value;
    }
}
```

对于list、array等集合节点，其实就是继续循环递归解析子节点，直到只有 ref、value或者<value> <ref>子节点为止

```java
public List<Object> parseListElement(Element collectionEle, BeanDefinition bd) {
    String defaultElementType = collectionEle.getAttribute(VALUE_TYPE_ATTRIBUTE);
    NodeList nl = collectionEle.getChildNodes();
    ManagedList<Object> target = new ManagedList<Object>(nl.getLength());
    target.setSource(extractSource(collectionEle));
    target.setElementTypeName(defaultElementType);
    target.setMergeEnabled(parseMergeAttribute(collectionEle));
    parseCollectionElements(nl, target, bd, defaultElementType);
    return target;
}
//继续递归调用 parsePropertySubElement 解析
protected void parseCollectionElements(
    NodeList elementNodes, Collection<Object> target, BeanDefinition bd, String defaultElementType) {

    for (int i = 0; i < elementNodes.getLength(); i++) {
        Node node = elementNodes.item(i);
        if (node instanceof Element && !nodeNameEquals(node, DESCRIPTION_ELEMENT)) {
            target.add(parsePropertySubElement((Element) node, bd, defaultElementType));
        }
    }
}
```

在解析完<bean>节点完成AbstractBeanDefinition对象的封装后，然后就是封装BeanDefinitionHolder。如果没有设置beanName和alias，就需要生成一个默认的beanName作为key。对于外部类默认名是使用**全路径类名+计算器**

```java
if (!StringUtils.hasText(beanName)) {
    try {
        if (containingBean != null) {//内嵌的<bean<直接
            beanName = BeanDefinitionReaderUtils.generateBeanName(
                beanDefinition, this.readerContext.getRegistry(), true);
        }else {
            //使用的是DefaultBeanNameGenerator生成，就是全路径类名
            beanName = this.readerContext.generateBeanName(beanDefinition);
            String beanClassName = beanDefinition.getBeanClassName();
            if (beanClassName != null &&
                beanName.startsWith(beanClassName) && beanName.length() > beanClassName.length() &&
                !this.readerContext.getRegistry().isBeanNameInUse(beanClassName)) {
                aliases.add(beanClassName);
            }
        }
    }
}

public static String generateBeanName(
    BeanDefinition definition, BeanDefinitionRegistry registry, boolean isInnerBean)
    throws BeanDefinitionStoreException {
	//默认取全路径类名
    String generatedBeanName = definition.getBeanClassName();
    //如果没有设置，则为内部类，取父类类型 拼接上 $child 或者 $created
    if (generatedBeanName == null) {
        if (definition.getParentName() != null) {
            generatedBeanName = definition.getParentName() + "$child";
        } else if (definition.getFactoryBeanName() != null) {
            generatedBeanName = definition.getFactoryBeanName() + "$created";
        }
    }
    String id = generatedBeanName;
    if (isInnerBean) {//内部bean
        // Inner bean: generate identity hashcode suffix.
        id = generatedBeanName + GENERATED_BEAN_NAME_SEPARATOR + ObjectUtils.getIdentityHexString(definition);
    }else {//使用全路径类名 然后加上 计数器
        // Top-level bean: .Increase counter until the id is unique.
        int counter = -1;
        while (counter == -1 || registry.containsBeanDefinition(id)) {
            counter++;
            id = generatedBeanName + GENERATED_BEAN_NAME_SEPARATOR + counter;//#
        }
    }
    return id;
}
```

spring最重要的<bean>节点加载解析注册已经梳理完毕，然后看下 <import>节点的解析。<import>节点就是引入额外的配置，其实就是加载配置文件然后递归解析里面的配置

```java
protected void importBeanDefinitionResource(Element ele) {
    String location = ele.getAttribute(RESOURCE_ATTRIBUTE);//获取resource路径
    if (!StringUtils.hasText(location)) {
        getReaderContext().error("Resource location must not be empty", ele);
        return;
    }
    // Resolve system properties: e.g. "${user.dir}"
    location = getReaderContext().getEnvironment().resolveRequiredPlaceholders(location);
    Set<Resource> actualResources = new LinkedHashSet<Resource>(4);
    boolean absoluteLocation = false;
    try {
        absoluteLocation = ResourcePatternUtils.isUrl(location) || ResourceUtils.toURI(location).isAbsolute();
    }
    catch (URISyntaxException ex) {
    }

    // Absolute or relative?
    if (absoluteLocation) {
        try {//使用父类的 XmlBeanDefinitionReader 递归加载
            int importCount = getReaderContext().getReader().loadBeanDefinitions(location, actualResources);
        } catch (BeanDefinitionStoreException ex) {
        }
    }
    else {
        // No URL -> considering resource location as relative to the current file.
        try {
            int importCount;
            Resource relativeResource = getReaderContext().getResource().createRelative(location);
            if (relativeResource.exists()) {
                importCount = getReaderContext().getReader().loadBeanDefinitions(relativeResource);
                actualResources.add(relativeResource);
            }else {
                String baseLocation = getReaderContext().getResource().getURL().toString();
                importCount = getReaderContext().getReader().loadBeanDefinitions(
                    StringUtils.applyRelativePath(baseLocation, location), actualResources);
            }
        }
        catch (IOException ex) {
            getReaderContext().error("Failed to resolve current resource location", ele, ex);
        }
    }
    Resource[] actResArray = actualResources.toArray(new Resource[actualResources.size()]);
    getReaderContext().fireImportProcessed(location, actResArray, extractSource(ele));
}
```

BeanDefinition的定位、加载和注册就到这里完成，**到此还没有初始化bean**，只是为初始化了容器，为创建bean对象做了准备工作。