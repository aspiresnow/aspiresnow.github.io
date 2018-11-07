---
title: spring-IOC创建bean
date: 2018-10-05 22:51:13
tags:
- spring 
categories:
- spring

---

# spring-IOC创建bean

## 源码解读

测试类中创建好spring容器后，调用getBean方法会进行Bean的初始化

```java
ClassPathResource resource = new ClassPathResource("spring/applicationContext.xml");
XmlBeanFactory bf = new XmlBeanFactory(resource);
//调用getBean 
TestBean testBean = (TestBean) bf.getBean("haha");
System.out.println(testBean.toString());
```

XMLBeanFactory继承了AbstractBeanFactory，

```java
@Override
public Object getBean(String name) throws BeansException {
    return doGetBean(name, null, null, false);
}

protected <T> T doGetBean(
    final String name, final Class<T> requiredType, final Object[] args, boolean typeCheckOnly) throws BeansException {
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
        // Fail if we're already creating this bean instance:
        // We're assumably within a circular reference.
        if (isPrototypeCurrentlyInCreation(beanName)) {
            throw new BeanCurrentlyInCreationException(beanName);
        }
        // Check if bean definition exists in this factory.
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

        if (!typeCheckOnly) {
            markBeanAsCreated(beanName);
        }

        try {
            final RootBeanDefinition mbd = getMergedLocalBeanDefinition(beanName);
            checkMergedBeanDefinition(mbd, beanName, args);

            // Guarantee initialization of beans that the current bean depends on.
            String[] dependsOn = mbd.getDependsOn();
            if (dependsOn != null) {
                for (String dep : dependsOn) {
                    if (isDependent(beanName, dep)) {
                        throw new BeanCreationException("Circular depends-on relationship between '" + beanName + "' and '" + dep + "'");
                    }
                    registerDependentBean(dep, beanName);
                    try {
                        getBean(dep);
                    }
                    catch (NoSuchBeanDefinitionException ex) {
                        throw new BeanCreationException(mbd.getResourceDescription(), beanName,
                                                        "'" + beanName + "' depends on missing bean '" + dep + "'", ex);
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
                    throw new IllegalStateException("No Scope registered for scope name '" + scopeName + "'");
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

    // Check if required type matches the type of the actual bean instance.
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



FactoryBean接口，实现该接口可以通过getObject方法创建自己想要的bean对象。在初始化bean的时候，如果bean实现类了FactoryBean接口，则是返回getObject方法返回的对象，而不是创建实现FactoryBean接口的对象

因为在创建单例bean的时候会存在依赖注入的情况，而在创建依赖的时候为了避免循环依赖，spring创建bean的原则是不等bean创建完成就会将创建bean的ObjectFactory提早曝光，也就是将ObjectFactory加入到缓存中，一旦下个bean创建时间需要依赖上个bean则直接使用ObjectFactory。缓存中记录的只是最原始的bean状态，需要进行实例化

只有单例模式setter注入才会解决循环依赖问题，原型模式在遇到循环依赖的情况下会直接抛出异常，因为不允许缓存原型模式的bean.





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

IdentityHashMap

beforeInstantiationResolved 是什么时候给BeanDefinition赋值这个属性的，用于控制aop的

instantiationStrategy 这个创建策略是干啥的