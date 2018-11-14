---
title: spring-IOC创建bean
date: 2018-10-05 22:51:13
tags:
- spring 
categories:
- spring

---

# spring-IOC创建bean

## 循环依赖

在创建bean的时候会存在依赖注入的情况，即A依赖B，B又依赖A。在创建bean的时候为了避免循环依赖，创建完bean对象后，依赖注入前，将未实例化完毕的bean提早曝光，也就是将ObjectFactory或者未添加依赖注入的bean加入到缓存中，这样下个bean创建时需要依赖上个bean则直接使用ObjectFactory或者未set依赖的bean。由于bean是个对象，后期的属性注入不会影响对象地址的变化

只有单例模式setter注入才能解决循环依赖问题，构造器注入模式和原型模式在遇到循环依赖的情况下会直接抛出异常，构造器依赖注入无法创建对象，原型模式无法缓存。

**单例的缓存**

- singletonObjects：beanName和bean实例之间关系，bean是已经完成依赖注入的bean
- earlySingletonObjects：beanName和bean实例之间关系。bean还未完成依赖注入，是ObjectFactory getObject返回
- singletonFactories：beanName和创建bean的工厂之间的关系 beanName---ObjectFactory
- registeredSingletons：保存当前已注册的beanName的集合,包括以上三种情况下的beanName

## 源码解读

### 创建bean主流程

测试类中创建好spring容器后，调用getBean方法会进行Bean的初始化

```java
ClassPathResource resource = new ClassPathResource("spring/applicationContext.xml");
XmlBeanFactory bf = new XmlBeanFactory(resource);
//调用getBean 触发创建bean对象
TestBean testBean = (TestBean) bf.getBean("haha");
System.out.println(testBean.toString());
```

XMLBeanFactory继承了AbstractBeanFactory，AbstractBeanFactory提供了getBean的主流程

```java
@Override
public Object getBean(String name) throws BeansException {
    return doGetBean(name, null, null, false);
}

protected <T> T doGetBean(
    final String name, final Class<T> requiredType, final Object[] args, boolean typeCheckOnly) throws BeansException {
    //去除 & 并且将alias转换为beanName进行获取bean
    final String beanName = transformedBeanName(name);
    Object bean;

    // Eagerly check singleton cache for manually registered singletons.
    Object sharedInstance = getSingleton(beanName);
    if (sharedInstance != null && args == null) {
        if (logger.isDebugEnabled()) {
            if (isSingletonCurrentlyInCreation(beanName)) {
                logger.debug("Returning eagerly cached instance of singleton bean")
            }else {
                logger.debug("Returning cached instance of singleton bean");
            }
        }
        bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
    } else {
		//只有单例才会解决循环依赖，原型模式遇到循环依赖直接抛异常
        if (isPrototypeCurrentlyInCreation(beanName)) {//判断当前bean是否正在创建中的原型bean
            throw new BeanCurrentlyInCreationException(beanName);
        }
        //当前spring容器中不存在当前bean的时候，从父类容器中获取
        BeanFactory parentBeanFactory = getParentBeanFactory();
        if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
            // Not found -> check parent.
            String nameToLookup = originalBeanName(name);
            if (args != null) {
                // Delegation to parent with explicit args.
                return (T) parentBeanFactory.getBean(nameToLookup, args);
            } else {
                // No args -> delegate to standard getBean method.
                return parentBeanFactory.getBean(nameToLookup, requiredType);
            }
        }
        if (!typeCheckOnly) {//要创建bean则标记当前beanName是已经创建的
            markBeanAsCreated(beanName);//alreadyCreated添加beanName
        }
        try {
            //将BeanDefinition转换为RootBeanDefinition，如果是子类bean合并父类相关属性
            final RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);
            checkMergedBeanDefinition(mbd, beanName, args);

            // Guarantee initialization of beans that the current bean depends on.
            String[] dependsOn = mbd.getDependsOn();
            if (dependsOn != null) {
                for (String dep : dependsOn) {
                    if (isDependent(beanName, dep)) {
                        throw new BeanCreationException("Circular depends-on relationship");
                    }
                    registerDependentBean(dep, beanName);
                    try {
                        getBean(dep);
                    }
                    catch (NoSuchBeanDefinitionException ex) {
                        throw new BeanCreationException(mbd.getResourceDescription(), beanName,"'" + beanName + "' depends on missing bean '" + dep + "'", ex);
                    }
                }
            }
            // Create bean instance.
            if (mbd.isSingleton()) {
                sharedInstance = getSingleton(beanName, new ObjectFactory<Object>() {
                    @Override
                    public Object getObject() throws BeansException {
                        try {
                            return createBean(beanName, mbd, args);
                        }
                        catch (BeansException ex) {
                            destroySingleton(beanName);
                            throw ex;
                        }
                    }
                });
                bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
            }

            else if (mbd.isPrototype()) {
                // It's a prototype -> create a new instance.
                Object prototypeInstance = null;
                try {
                    beforePrototypeCreation(beanName);
                    prototypeInstance = createBean(beanName, mbd, args);
                }
                finally {
                    afterPrototypeCreation(beanName);
                }
                bean = getObjectForBeanInstance(prototypeInstance, name, beanName, mbd);
            }

            else {
                String scopeName = mbd.getScope();
                final Scope scope = this.scopes.get(scopeName);
                if (scope == null) {
                    throw new IllegalStateException("No Scope registered for scope name");
                }
                try {
                    Object scopedInstance = scope.get(beanName, new ObjectFactory<Object>() {
                        @Override
                        public Object getObject() throws BeansException {
                            beforePrototypeCreation(beanName);
                            try {
                                return createBean(beanName, mbd, args);
                            }
                            finally {
                                afterPrototypeCreation(beanName);
                            }
                        }
                    });
                    bean = getObjectForBeanInstance(scopedInstance, name, beanName, mbd);
                }
                catch (IllegalStateException ex) {
                    throw new BeanCreationException("defining a scoped proxy for this bean if you intend to refer to it from a singleton",ex);
                }
            }
        }
        catch (BeansException ex) {
            cleanupAfterBeanCreationFailure(beanName);
            throw ex;
        }
    }

    // 类型转换
    if (requiredType != null && bean != null && !requiredType.isInstance(bean)) {
        try {
            return getTypeConverter().convertIfNecessary(bean, requiredType);
        }
        catch (TypeMismatchException ex) {
            if (logger.isDebugEnabled()) {
                logger.debug("Failed to convert bean '" + name + "' to required type '" +
                             ClassUtils.getQualifiedName(requiredType) + "'", ex);
            }
            throw new BeanNotOfRequiredTypeException(name, requiredType, bean.getClass());
        }
    }
    return (T) bean;
}
```

### beanName处理

如果要获取FactoryBean对象本身，需要传递 `&BeanName`，但是再获取bean的时候，需要暂时去掉`&`，然后需要递归将alias彻底转换为对应的beanId去创建获取Bean实例

```java
protected String transformedBeanName(String name) {
    return canonicalName(BeanFactoryUtils.transformedBeanName(name));
}
public static String transformedBeanName(String name) {
    Assert.notNull(name, "'name' must not be null");
    String beanName = name;
    while (beanName.startsWith(BeanFactory.FACTORY_BEAN_PREFIX)) {
        beanName = beanName.substring(BeanFactory.FACTORY_BEAN_PREFIX.length());
    }
    return beanName;
}
public String canonicalName(String name) {
    String canonicalName = name;//最终想要的是BeanID
    String resolvedName;
    do {
        resolvedName = this.aliasMap.get(canonicalName);//aliasMap中存储了 alias-->beanId的关系
        if (resolvedName != null) {
            canonicalName = resolvedName;
        }
    }
    while (resolvedName != null);//直到获取到的不再是alias
    return canonicalName;
}
```

### 从缓存中获取Bean

单例bean是全局唯一的，spring缓存了所有已经创建的单例bean，所以在获取bean的时候，会首先去缓存中查找，如果找到，直接使用。在创建单例bean的时候如果存在依赖注入，为了避免循环依赖，spring创建bean的时候不等bean的依赖全部set上就会提前将创建bean的ObjectFactory提前添加到缓存中,一旦下个bean创建的时候需要依赖这个bean则直接将ObjectFactory进行set依赖。

```java
Object sharedInstance = getSingleton(beanName);
if (sharedInstance != null && args == null) {
    if (logger.isDebugEnabled()) {
        if (isSingletonCurrentlyInCreation(beanName)) {
            logger.debug("Returning eagerly cached instance of singleton bean");
        }
        else {
            logger.debug("Returning cached instance of singleton bean '" + beanName + "'");
        }
    }//处理 FactoryBean类型的实例,判断beanName中是否有 & 确定是返货FactoryBean本身还是getObject
    bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
}
```

DefaultSingletonBeanRegistry提供了从缓存获取bean的功能

```java
//beanName --> bean instance缓存 单例bean缓存map
private final Map<String, Object> singletonObjects=new ConcurrentHashMap(256);
//bean name --> bean instance  跟singletonObjects不同的是当一个bean还在创建过程中，就可以通过getBean方法获取到(只是反射创建了，未set值)，主要用来检测循环引用
private final Map<String, Object> earlySingletonObjects = new HashMap<String, Object>(16);
//beanName --> ObjectFactory缓存
private final Map<String, ObjectFactory<?>> singletonFactories = new HashMap<String, ObjectFactory<?>>(16);
@Override
public Object getSingleton(String beanName) {
    return getSingleton(beanName, true);
}
protected Object getSingleton(String beanName, boolean allowEarlyReference) {
    //首先从bean实例缓存中获取
    Object singletonObject = this.singletonObjects.get(beanName);
    //bean实例缓存中没有，并且判断是bean是正在创建的 单例，则从
    if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
        synchronized (this.singletonObjects) {
            //从提前曝光的缓存中获取 未 set值的对象
            singletonObject = this.earlySingletonObjects.get(beanName);
            if (singletonObject == null && allowEarlyReference) {
                //再从曝光的 ObjectFactory缓存中获取
                ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName);
                if (singletonFactory != null) {
                    //不为空的时候 添加到 earlySingletonObjects中
                    singletonObject = singletonFactory.getObject();
                    this.earlySingletonObjects.put(beanName, singletonObject);
                    this.singletonFactories.remove(beanName);
                }
            }
        }
    }
    return (singletonObject != NULL_OBJECT ? singletonObject : null);
}

```

### 父类容器获取

当当前容器不存在对应beanName的BeanDefinition时，尝试去父类容器获取bean

```java
BeanFactory parentBeanFactory = getParentBeanFactory();
if (parentBeanFactory != null && !containsBeanDefinition(beanName)) {
    // Not found -> check parent.
    String nameToLookup = originalBeanName(name);//还需要将 & 拼接到 beanName上，保持原始参数
    if (args != null) {//走父类容器的 获取bean流程
        return (T) parentBeanFactory.getBean(nameToLookup, args);
    } else {
        return parentBeanFactory.getBean(nameToLookup, requiredType);
    }
}
```

### 提前加载依赖

如果bean配置了 `depend-on`则再实例化该bean之前需要实例化这些依赖

```java
String[] dependsOn = mbd.getDependsOn();
if (dependsOn != null) {
    for (String dep : dependsOn) {
        if (isDependent(beanName, dep)) {
            throw new BeanCreationException(mbd.getResourceDescription(), beanName,
"Circular depends-on relationship between '" + beanName + "' and '" + dep + "'");
        }
        registerDependentBean(dep, beanName);//缓存该bean依赖关系
        try {
            getBean(dep);//实例化依赖bean
        }
        catch (NoSuchBeanDefinitionException ex) {
            throw new BeanCreationException(mbd.getResourceDescription(), beanName,
            "'" + beanName + "' depends on missing bean '" + dep + "'", ex);
        }
    }
}
```

### 创建单例bean

判断BeanDefinition中配置是单例模式，则进行单例实体创建流程。调用getSingleton方法，传递一个ObjectFactory对象

```java
// Create bean instance.
if (mbd.isSingleton()) {
    sharedInstance = getSingleton(beanName, new ObjectFactory<Object>() {
        @Override
        public Object getObject() throws BeansException {
            try {
                return createBean(beanName, mbd, args);
            } catch (BeansException ex) {
                destroySingleton(beanName);//创建失败 移除创建过程中所有的标识位
                throw ex;
            }
        }
    });//处理 FactoryBean接口
    bean = getObjectForBeanInstance(sharedInstance, name, beanName, mbd);
}
```

调用DefaultSingletonBeanRegistry的getSingletion方法

```java
public Object getSingleton(String beanName, ObjectFactory<?> singletonFactory) {
    Assert.notNull(beanName, "'beanName' must not be null");
    synchronized (this.singletonObjects) {
        Object singletonObject = this.singletonObjects.get(beanName);
        if (singletonObject == null) {
            if (this.singletonsCurrentlyInDestruction) {
                throw new BeanCreationNotAllowedException(beanName);
            }
            beforeSingletonCreation(beanName);//添加singletonsCurrentlyInCreation
            boolean newSingleton = false;
            boolean recordSuppressedExceptions = (this.suppressedExceptions == null);
            if (recordSuppressedExceptions) {
                this.suppressedExceptions = new LinkedHashSet<Exception>();
            }
            try {
                //调用 ObjectFactory的getObject方法，调用createBean实例化bean对象
                singletonObject = singletonFactory.getObject();
                newSingleton = true;//标记是新实例化的bean对象
            } catch (IllegalStateException ex) {
                singletonObject = this.singletonObjects.get(beanName);
                if (singletonObject == null) {
                    throw ex;
                }
            } catch (BeanCreationException ex) {
                if (recordSuppressedExceptions) {
                    for (Exception suppressedException : this.suppressedExceptions) {
                        ex.addRelatedCause(suppressedException);
                    }
                }
                throw ex;
            } finally {
                if (recordSuppressedExceptions) {
                    this.suppressedExceptions = null;
                }
                afterSingletonCreation(beanName);//remove from singletonsCurrentlyInCreation
            }
            if (newSingleton) {//如果是新创建的单例，添加缓存
                addSingleton(beanName, singletonObject);
            }
        }
        return (singletonObject != NULL_OBJECT ? singletonObject : null);
    }
}
```

调用AbstractAutowireCapableBeanFactory中的createBean方法

```java
@Override
protected Object createBean(String beanName, RootBeanDefinition mbd, Object[] args) throws BeanCreationException {
    RootBeanDefinition mbdToUse = mbd;

   //锁定class
    Class<?> resolvedClass = resolveBeanClass(mbd, beanName);
    if (resolvedClass != null && !mbd.hasBeanClass() && mbd.getBeanClassName() != null) {
        mbdToUse = new RootBeanDefinition(mbd);
        mbdToUse.setBeanClass(resolvedClass);
    }

    // 验证override方法
    try {
        mbdToUse.prepareMethodOverrides();
    } catch (BeanDefinitionValidationException ex) {
        throw new BeanDefinitionStoreException(mbdToUse.getResourceDescription(),
                                               beanName, , ex);
    }
	try {
        // Give BeanPostProcessors a chance to return a proxy instead of the target bean instance. 调用BeanPostProcessor
        Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
        if (bean != null) {//如果有，直接返回 短路操作
            return bean;
        }
    } catch (Throwable ex) {
        throw new BeanCreationException(mbdToUse.getResourceDescription(), beanName,
                                        "BeanPostProcessor before instantiation of bean failed", ex);
    }
	//根据配置实例化对象
    Object beanInstance = doCreateBean(beanName, mbdToUse, args);
    return beanInstance;
}
```

在进行实例化前，可以通过BeanPostProcessor在创建之前改变bean，如果经过这个处理器返回的结果不为空，会直接忽略后续的Bean的创建而直接返回。AOP就是基于这实现的

```java
protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
    Object bean = null;
    if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
        // 存在注册了的 InstantiationAwareBeanPostProcessor
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
//InstantiationAwareBeanPostProcessor创建一个bean实例 
protected Object applyBeanPostProcessorsBeforeInstantiation(Class<?> beanClass, String beanName) {
    for (BeanPostProcessor bp : getBeanPostProcessors()) {
        if (bp instanceof InstantiationAwareBeanPostProcessor) {
            InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;			//只应用第一个不返回空的处理器
            Object result = ibp.postProcessBeforeInstantiation(beanClass, beanName);
            if (result != null) {
                return result;
            }
        }
    }
    return null;
}
//保证容器中的实例都应用了BeanPostProcessor的postProcessAfterInitialization方法处理
@Override
public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
    throws BeansException {
	
    Object result = existingBean;
    for (BeanPostProcessor processor : getBeanPostProcessors()) {
        result = processor.postProcessAfterInitialization(result, beanName);
        if (result == null) {//应用所有的初始化后置器
            return result;
        }
    }
    return result;
}
```

后置处理器没有返回一个实例对象，这时进入实例化bean的方法

```java
protected Object doCreateBean(final String beanName, final RootBeanDefinition mbd, final Object[] args) throws BeanCreationException {

    // Instantiate the bean.
    BeanWrapper instanceWrapper = null;
    if (mbd.isSingleton()) {
        instanceWrapper = this.factoryBeanInstanceCache.remove(beanName);
    }
    if (instanceWrapper == null) {
        instanceWrapper = createBeanInstance(beanName, mbd, args);
    }
    final Object bean = (instanceWrapper != null ? instanceWrapper.getWrappedInstance() : null);
    Class<?> beanType = (instanceWrapper != null ? instanceWrapper.getWrappedClass() : null);
    mbd.resolvedTargetType = beanType;

    // Allow post-processors to modify the merged bean definition.
    synchronized (mbd.postProcessingLock) {
        if (!mbd.postProcessed) {
            try {
                applyMergedBeanDefinitionPostProcessors(mbd, beanType, beanName);
            } catch (Throwable ex) {
                throw new BeanCreationException(mbd.getResourceDescription(), ex);
            }
            mbd.postProcessed = true;
        }
    }

    // Eagerly cache singletons to be able to resolve circular references
    // even when triggered by lifecycle interfaces like BeanFactoryAware.
    boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
                                      isSingletonCurrentlyInCreation(beanName));
    if (earlySingletonExposure) {
        
        addSingletonFactory(beanName, new ObjectFactory<Object>() {
            @Override
            public Object getObject() throws BeansException {
                return getEarlyBeanReference(beanName, mbd, bean);
            }
        });
    }

    // Initialize the bean instance.
    Object exposedObject = bean;
    try {
        populateBean(beanName, mbd, instanceWrapper);
        if (exposedObject != null) {
            exposedObject = initializeBean(beanName, exposedObject, mbd);
        }
    } catch (Throwable ex) {
        if (ex instanceof BeanCreationException && beanName.equals(((BeanCreationException) ex).getBeanName())) {
            throw (BeanCreationException) ex;
        } else {
            throw new BeanCreationException(
                mbd.getResourceDescription(), beanName, "Initialization of bean failed", ex);
        }
    }

    if (earlySingletonExposure) {
        Object earlySingletonReference = getSingleton(beanName, false);
        if (earlySingletonReference != null) {
            if (exposedObject == bean) {
                exposedObject = earlySingletonReference;
            }
            else if (!this.allowRawInjectionDespiteWrapping && hasDependentBean(beanName)) {
                String[] dependentBeans = getDependentBeans(beanName);
                Set<String> actualDependentBeans = new LinkedHashSet<String>(dependentBeans.length);
                for (String dependentBean : dependentBeans) {
                    if (!removeSingletonIfCreatedForTypeCheckOnly(dependentBean)) {
                        actualDependentBeans.add(dependentBean);
                    }
                }
                if (!actualDependentBeans.isEmpty()) {
                    throw new BeanCurrentlyInCreationException(beanName);
                }
            }
        }
    }

    // Register bean as disposable.
    try {
        registerDisposableBeanIfNecessary(beanName, bean, mbd);
    }  catch (BeanDefinitionValidationException ex) {
        throw new BeanCreationException(
            mbd.getResourceDescription(), beanName, "Invalid destruction signature", ex);
    }

    return exposedObject;
}
```

#### 反射创建bean对象

bean的初始化，第一步首先要创建一个对象。创建对象主要分两种，一种是通过工厂方法创建(优先级高)，另一种就是通过构造器反射创建

```java
protected BeanWrapper createBeanInstance(String beanName, RootBeanDefinition mbd, Object[] args) {
    // Make sure bean class is actually resolved at this point.
    Class<?> beanClass = resolveBeanClass(mbd, beanName);

    if (beanClass != null && !Modifier.isPublic(beanClass.getModifiers()) && !mbd.isNonPublicAccessAllowed()) {
        throw new BeanCreationException("Bean class isn't public, and non-public access not allowed: " + beanClass.getName());
    }
    //如果配置了FactoryMethod，直接使用工厂方法创建
	if (mbd.getFactoryMethodName() != null)  {
        return instantiateUsingFactoryMethod(beanName, mbd, args);
    }
    // Shortcut when re-creating the same bean...
    boolean resolved = false;
    boolean autowireNecessary = false;
    if (args == null) {
        synchronized (mbd.constructorArgumentLock) {
            if (mbd.resolvedConstructorOrFactoryMethod != null) {
                resolved = true;
                autowireNecessary = mbd.constructorArgumentsResolved;
            }
        }
    }//如果解析过则使用解析好的构造函数
    if (resolved) {
        if (autowireNecessary) {//应用构造函数自动注入
            return autowireConstructor(beanName, mbd, null, null);
        } else {//使用默认构造函数构造
            return instantiateBean(beanName, mbd);
        }
    }
    //根据参数解析构造函数
    Constructor<?>[] ctors = determineConstructorsFromBeanPostProcessors(beanClass, beanName);
    if (ctors != null ||
        mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_CONSTRUCTOR ||
        mbd.hasConstructorArgumentValues() || !ObjectUtils.isEmpty(args))  {
        //应用构造函数自动注入
        return autowireConstructor(beanName, mbd, ctors, args);
    }
    // 使用默认构造函数构造
    return instantiateBean(beanName, mbd);
}
```

##### 使用工厂方法初始化

```java
protected BeanWrapper instantiateUsingFactoryMethod(
    String beanName, RootBeanDefinition mbd, Object[] explicitArgs) {

    return new ConstructorResolver(this).instantiateUsingFactoryMethod(beanName, mbd, explicitArgs);
}
```



##### 构造函数实例化

- 根据参数锁定构造函数

  带参数的构造器比较复杂，spring提供了根据参数顺序、类型和名称两种方式，在反射创建对象的时候，首先判断是否显示指定了参数类型 getBean(beanName,args)，这个args指定的就是显示指定的参数。

  将构造函数按照访问级别、参数数量降序排序，然后用BeanDefinition中配置的构造器去循环匹配。找到匹配的构造器后反射创建对象。

  如果是通过构造器是指定名称的，可以通过在构造器上使用注解`ConstructorProperties`来告诉spring参数的名称，如果没有这样处理，需要加载class文件流读取获取参数的实际名称

- 默认构造函数

  构造函数实例化就是反射创建对象的过程。spring对存在look-up 、replace-method的需要使用cglib创建类

  ```java
  protected BeanWrapper instantiateBean(final String beanName, final RootBeanDefinition mbd) {
      try {
          Object beanInstance;
          final BeanFactory parent = this;
          if (System.getSecurityManager() != null) {
              beanInstance = AccessController.doPrivileged(new PrivilegedAction<Object>() {
                  @Override
                  public Object run() {
                      return getInstantiationStrategy().instantiate(mbd, beanName, parent);
                  }
              }, getAccessControlContext());
          }
          else {
              beanInstance = getInstantiationStrategy().instantiate(mbd, beanName, parent);
          }
          BeanWrapper bw = new BeanWrapperImpl(beanInstance);
          initBeanWrapper(bw);
          return bw;
      }
      catch (Throwable ex) {
          throw new BeanCreationException(
              mbd.getResourceDescription(), beanName, "Instantiation of bean failed", ex);
      }
  }
  ```



  ```java
  @Override
  public Object instantiate(RootBeanDefinition bd, String beanName, BeanFactory owner) {
      if (bd.getMethodOverrides().isEmpty()) {
          Constructor<?> constructorToUse;
          synchronized (bd.constructorArgumentLock) {
              constructorToUse = (Constructor<?>) bd.resolvedConstructorOrFactoryMethod;
              if (constructorToUse == null) {
                  final Class<?> clazz = bd.getBeanClass();
                  if (clazz.isInterface()) {
                      throw new BeanInstantiationException(clazz, "Specified class is an interface");
                  }
                  try {
                      if (System.getSecurityManager() != null) {
                          constructorToUse = AccessController.doPrivileged(new PrivilegedExceptionAction<Constructor<?>>() {
                              @Override
                              public Constructor<?> run() throws Exception {
                                  return clazz.getDeclaredConstructor((Class[]) null);
                              }
                          });
                      }
                      else {
                          constructorToUse =	clazz.getDeclaredConstructor((Class[]) null);
                      }
                      bd.resolvedConstructorOrFactoryMethod = constructorToUse;
                  }
                  catch (Throwable ex) {
                      throw new BeanInstantiationException(clazz, "No default constructor found", ex);
                  }
              }
          }// 直接反射创建对象
          return BeanUtils.instantiateClass(constructorToUse);
      }
      else {  //如果有 look-up replace-method之类使用cglib创建
          return instantiateWithMethodInjection(bd, beanName, owner);
      }
  }
  ```

#### 循环依赖

将反射创建的对象添加到缓存中，注意这个时候该bean还未进行依赖注入，这样在循环依赖中，其他bean就可以将未依赖注入的这个bean注入。而之后在将该bean的依赖注入后，bean的地址不会变。这是某些属性变化，不会影响。所以只有setter注入的单例模式bean才能解决循环依赖问题。

```java
boolean earlySingletonExposure = (mbd.isSingleton() && this.allowCircularReferences &&
                                  isSingletonCurrentlyInCreation(beanName));
if (earlySingletonExposure) {
    if (logger.isDebugEnabled()) {
        logger.debug("Eagerly caching bean '" + beanName +
                     "' to allow for resolving potential circular references");
    }
    addSingletonFactory(beanName, new ObjectFactory<Object>() {
        @Override
        public Object getObject() throws BeansException {
            return getEarlyBeanReference(beanName, mbd, bean);
        }
    });
}
```

AOP就是在这里将advice动态注入bean中的，使用SmartInstantiationAwareBeanPostProcessor

```java
protected Object getEarlyBeanReference(String beanName, RootBeanDefinition mbd, Object bean) {
    Object exposedObject = bean;
    if (bean != null && !mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
        for (BeanPostProcessor bp : getBeanPostProcessors()) {
            if (bp instanceof SmartInstantiationAwareBeanPostProcessor) {
                SmartInstantiationAwareBeanPostProcessor ibp = (SmartInstantiationAwareBeanPostProcessor) bp;
                exposedObject = ibp.getEarlyBeanReference(exposedObject, beanName);
                if (exposedObject == null) {
                    return null;
                }
            }
        }
    }
    return exposedObject;
}
```

#### 依赖注入

```java
protected void populateBean(String beanName, RootBeanDefinition mbd, BeanWrapper bw) {
    PropertyValues pvs = mbd.getPropertyValues();

    if (bw == null) {
        if (!pvs.isEmpty()) {
            throw new BeanCreationException(
                mbd.getResourceDescription(), beanName, "Cannot apply property values to null instance");
        }
        else {
            // Skip property population phase for null instance.
            return;
        }
    }
    //属性注入前，应用后置处理器
    boolean continueWithPropertyPopulation = true;
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
    //如果后置处理器设置 不再继续属性注入，停止
    if (!continueWithPropertyPopulation) {
        return;
    }
	//自动装配
    if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_NAME ||
        mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_TYPE) {
        MutablePropertyValues newPvs = new MutablePropertyValues(pvs);

        // Add property values based on autowire by name if applicable.
        if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_NAME) {
            autowireByName(beanName, mbd, bw, newPvs);
        }

        // Add property values based on autowire by type if applicable.
        if (mbd.getResolvedAutowireMode() == RootBeanDefinition.AUTOWIRE_BY_TYPE) {
            autowireByType(beanName, mbd, bw, newPvs);
        }

        pvs = newPvs;
    }

    boolean hasInstAwareBpps = hasInstantiationAwareBeanPostProcessors();
    boolean needsDepCheck = (mbd.getDependencyCheck() != RootBeanDefinition.DEPENDENCY_CHECK_NONE);
	//@Autowire就是在这里实现的
    if (hasInstAwareBpps || needsDepCheck) {
        PropertyDescriptor[] filteredPds = filterPropertyDescriptorsForDependencyCheck(bw, mbd.allowCaching);
        if (hasInstAwareBpps) {
            for (BeanPostProcessor bp : getBeanPostProcessors()) {
                if (bp instanceof InstantiationAwareBeanPostProcessor) {
                    InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
                    pvs = ibp.postProcessPropertyValues(pvs, filteredPds, bw.getWrappedInstance(), beanName);
                    if (pvs == null) {
                        return;
                    }
                }
            }
        }
        if (needsDepCheck) {
            checkDependencies(beanName, mbd, filteredPds, pvs);
        }
    }

    applyPropertyValues(beanName, mbd, bw, pvs);
}
```

#### 注册销毁方法

对于非web项目要想使在bean容器关闭的时候执行bean的销毁方式需要注册一个关闭钩子context.registerShutdownHook()。

```java
protected void registerDisposableBeanIfNecessary(String beanName, Object bean, RootBeanDefinition mbd) {
    AccessControlContext acc = (System.getSecurityManager() != null ? getAccessControlContext() : null);
    if (!mbd.isPrototype() && requiresDestruction(bean, mbd)) {
        if (mbd.isSingleton()) {
            // Register a DisposableBean implementation that performs all destruction
            // work for the given bean: DestructionAwareBeanPostProcessors,
            // DisposableBean interface, custom destroy method.
            registerDisposableBean(beanName,
                                   new DisposableBeanAdapter(bean, beanName, mbd, getBeanPostProcessors(), acc));
        }
        else {
            // A bean with a custom scope...
            Scope scope = this.scopes.get(mbd.getScope());
            if (scope == null) {
                throw new IllegalStateException("No Scope registered for scope name '" + mbd.getScope() + "'");
            }
            scope.registerDestructionCallback(beanName,
                                              new DisposableBeanAdapter(bean, beanName, mbd, getBeanPostProcessors(), acc));
        }
    }
}
```

### 处理FactoryBean

FactoryBean接口，实现该接口可以通过getObject方法创建自己想要的bean对象。在初始化bean的时候，如果bean实现类了FactoryBean接口，则是返回getObject方法返回的对象，而不是创建实现FactoryBean接口的对象

```java
protected Object getObjectForBeanInstance(
    Object beanInstance, String name, String beanName, RootBeanDefinition mbd) {

    //当beanName时 & 开头，并且bean不是FactoryBean的时候直接抛异常
    if (BeanFactoryUtils.isFactoryDereference(name) && !(beanInstance instanceof FactoryBean)) {
        throw new BeanIsNotAFactoryException(transformedBeanName(name), beanInstance.getClass());
    }

   //不是BeanFactory 直接返回，如果 beanName前缀为 & 则是获取FactoryBean本身，直接返回bean
    if (!(beanInstance instanceof FactoryBean) || BeanFactoryUtils.isFactoryDereference(name)) {
        return beanInstance;
    }

    Object object = null;
    if (mbd == null) {
        //从缓存 factoryBeanObjectCache 中获取
        object = getCachedObjectForFactoryBean(beanName);
    }
    if (object == null) {
        // Return bean instance from factory.
        FactoryBean<?> factory = (FactoryBean<?>) beanInstance;
        // Caches object obtained from FactoryBean if it is a singleton.
        if (mbd == null && containsBeanDefinition(beanName)) {
            mbd = getMergedLocalBeanDefinition(beanName);
        }//判断是否是用户自定义的
        boolean synthetic = (mbd != null && mbd.isSynthetic());
        object = getObjectFromFactoryBean(factory, beanName, !synthetic);
    }
    return object;
}
```

获取FactoryBean的getObject方法中定义的实体对象，如果定义的 isSingleton() 返回的是true，则会将获取到的bean添加到一个缓存factoryBeanObjectCache中，保证单例。

spring容器原则上保证容器中所有的bean都应用BeanPostProcessor的postProcessAfterInitialization处理器

```java
protected Object getObjectFromFactoryBean(FactoryBean<?> factory, String beanName, boolean shouldPostProcess) {
    //如果是单例模式 从单例缓存中取，并存到单例缓存中
    if (factory.isSingleton() && containsSingleton(beanName)) {
        synchronized (getSingletonMutex()) {
            //先从缓存中获取
            Object object = this.factoryBeanObjectCache.get(beanName);
            if (object == null) {
                //如果缓存中没有要的bean创建 并加入缓存
                object = doGetObjectFromFactoryBean(factory, beanName);
                Object alreadyThere = this.factoryBeanObjectCache.get(beanName);
                if (alreadyThere != null) {
                    object = alreadyThere;
                }
                else {
                    if (object != null && shouldPostProcess) {
                        if (isSingletonCurrentlyInCreation(beanName)) {
                          // Temporarily return non-post-processed object
                            return object;
                        }
                        beforeSingletonCreation(beanName);//singletonsCurrentlyInCreation
                        try {//应用后置处理器 postProcessAfterInitialization
                            object = postProcessObjectFromFactoryBean(object, beanName);
                        }catch (Throwable ex) {
                            throw new BeanCreationException(beanName);
                        }finally {
                            afterSingletonCreation(beanName);//singletonsCurrentlyInCreation
                        }
                    }
                    if (containsSingleton(beanName)) {
                        this.factoryBeanObjectCache.put(beanName, (object != null ? object : NULL_OBJECT));
                    }
                }
            }
            return (object != NULL_OBJECT ? object : null);
        }
    } else {//原型模式每次都调用 getObject() 创建bean
        Object object = doGetObjectFromFactoryBean(factory, beanName);
        if (object != null && shouldPostProcess) {
            try {
                object = postProcessObjectFromFactoryBean(object, beanName);
            }
            catch (Throwable ex) {
                throw new BeanCreationException(beanName, "Post-processing of FactoryBean's object failed", ex);
            }
        }
        return object;
    }
}
```

调用 FactoryBean的getObject方法获取对象

```java
private Object doGetObjectFromFactoryBean(final FactoryBean<?> factory, final String beanName)
    throws BeanCreationException {
    Object object;
    try {
        if (System.getSecurityManager() != null) {
            AccessControlContext acc = getAccessControlContext();
            try {
                object = AccessController.doPrivileged(new PrivilegedExceptionAction<Object>() {
                    @Override
                    public Object run() throws Exception {
                        return factory.getObject();//调用getObject方法
                    }
                }, acc);
            }
            catch (PrivilegedActionException pae) {
                throw pae.getException();
            }
        }
        else {
            object = factory.getObject();
        }
    }
    catch (FactoryBeanNotInitializedException ex) {
        throw new BeanCurrentlyInCreationException(beanName, ex.toString());
    }

    if (object == null && isSingletonCurrentlyInCreation(beanName)) {
        throw new BeanCurrentlyInCreationException(
            beanName, "FactoryBean which is currently in creation returned null from getObject");
    }
    return object;
}
```

### 类型转换

获取bean的时候，如果指定了类型，则需要进行类型转换

```java
if (requiredType != null && bean != null && !requiredType.isInstance(bean)) {
    try {
        return getTypeConverter().convertIfNecessary(bean, requiredType);
    }
    catch (TypeMismatchException ex) {
        if (logger.isDebugEnabled()) {
            logger.debug("Failed to convert bean '" + name + "' to required type '" +
                         ClassUtils.getQualifiedName(requiredType) + "'", ex);
        }
        throw new BeanNotOfRequiredTypeException(name, requiredType, bean.getClass());
    }
}
```

