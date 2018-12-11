---
title: spring FactoryBean
date: 2018-09-20 11:11:05
tags:
- spring 
categories:
- spring

---

# spring FactoryBean

## 介绍与使用

Spring容易中注册了两类的Bean，一种是普通Bean对象，另一种是实现FactoryBean接口的对象。实现FactoryBean接口的对象同普通Bean对象有很大不同，实现FactoryBean接口的对象会在spring容器中注册两个对应，一个是该对象本身，一个是该对象getObject方法返回的对象。如果要获取FactoryBean对象本身getBean的时候id前需要加上`&`符号。

FactoryBean在spring内部使用很广泛，aop、事务管理都有用到，通过FactoryBean也实现了集成第三方框架，如集成mybatis的SessionFactoryBean、MapperFactoryBean。

假如一个对象的初始化过程很复杂，可以使用FactoryBean集成这个对象，并注册到spring容器中，通过FactoryBean和InitializingBean还可以使对象实现高度可配置化

例如:类型转换的实现

```java
public class ConversionServiceFactoryBean implements FactoryBean<ConversionService>, InitializingBean {
   private Set<?> converters;

   private GenericConversionService conversionService;
   public void setConverters(Set<?> converters) {
      this.converters = converters;
   }
   @Override
   public void afterPropertiesSet() {
      this.conversionService = createConversionService();
      ConversionServiceFactory.registerConverters(this.converters, this.conversionService);
   }
   protected GenericConversionService createConversionService() {
      return new DefaultConversionService();
   }
   @Override
   public ConversionService getObject() {
      return this.conversionService;
   }
   @Override
   public Class<? extends ConversionService> getObjectType() {
      return GenericConversionService.class;
   }
   @Override
   public boolean isSingleton() {
      return true;
   }
}
```

xml中配置

```xml
<bean id="conversionService"
        class="org.springframework.context.support.ConversionServiceFactoryBean">
    <property name="converters">
        <set>
            <bean class="example.MyCustomConverter"/>
        </set>
    </property>
</bean>
```
不过这里为什么不直接注册DefaultConversionService对象呢？而是通过ConversionServiceFactoryBean间接的注册了一个DefaultConversionService。我这里分析主要有以下两点原因，在ConversionServiceFactoryBean不仅仅是创建了一个DefaultConversionService对象，而且在创建完对象后又调用`registerConverters`方法进行了类型转换器的注册，如果仅仅使用spring去注册DefaultConversionService则需要用户自己在初始化完成后调用这个方法。

第二点是DefaultConversionService有一系列方法和属性，如果直接注册DefaultConversionService会暴露很多东西，这里使用ConversionServiceFactoryBean只暴露了需要的一些属性。

## 源码

### FactoryBean接口

```java
public interface FactoryBean<T> {
    //返回FactoryBean创建的对象
    T getObject() throws Exception;
    //返回FactoryBean创建的对象的类型
    Class<?> getObjectType();
    //表明是否是单例
    boolean isSingleton();
}
```

FactoryBean常用来使被创建的对象高度可配置化，所以一般会在FactoryBean的实现类中声明一系列属性，然后通过spring注入，众所周知，FactoryBean会首先初始化FactoryBean的实现类，然后注册到spring容器中，然后再调用getObject方法创建对象，然后也注册到spring容器中。

### AbstractFactoryBean

为了方便使用FactoryBean接口，spring提供了一个抽象类AbstractFactoryBean对该功能实现部分扩展。AbstractFactoryBean实现了BeanFactoryAware接口，可以操作BeanFactory对象。同时内部提供了代理功能，这对于在解决循环依赖的时候很关键。

```java
public abstract class AbstractFactoryBean<T>
      implements FactoryBean<T>, BeanClassLoaderAware, BeanFactoryAware, InitializingBean, DisposableBean {
   private boolean singleton = true;//分单例模式和原型模式
   private ClassLoader beanClassLoader = ClassUtils.getDefaultClassLoader();
   private BeanFactory beanFactory;//实现了BeanFactoryAware接口
   private boolean initialized = false;//FactoryBean是否完成了初始化
   private T singletonInstance;//包装的对象
   private T earlySingletonInstance;//包装对象的提前暴露对象

	//指定FactoryBean包装的实际对象的类型，由子类实现
   @Override
   public abstract Class<?> getObjectType();
	//创建FactoryBean包装的实际对象，由子类实现
   protected abstract T createInstance() throws Exception;

   public void setSingleton(boolean singleton) {
      this.singleton = singleton;
   }
   @Override
   public void afterPropertiesSet() throws Exception {
   	//FactoryBean完成初始化后，调用子类的createInstance创建bean，赋值singletonInstance
      if (isSingleton()) {
         this.initialized = true;
         this.singletonInstance = createInstance();//
         this.earlySingletonInstance = null;
      }
   }
	//创建包装的对象
   @Override
   public final T getObject() throws Exception {
      if (isSingleton()) {//单例模式
      	//FactoryBean完成初始化则返回singletonInstance，否则返回代理对象
         return (this.initialized ? this.singletonInstance : getEarlySingletonInstance());
      } else {//原型模式直接创建对象
         return createInstance();
      }
   }

	//获取对象
   private T getEarlySingletonInstance() throws Exception {
      Class<?>[] ifcs = getEarlySingletonInterfaces();
      if (ifcs == null) {
         throw new FactoryBeanNotInitializedException(
               getClass().getName() + " does not support circular references");
      }
      if (this.earlySingletonInstance == null) {
         this.earlySingletonInstance = (T) Proxy.newProxyInstance(
               this.beanClassLoader, ifcs, new EarlySingletonInvocationHandler());
      }
      return this.earlySingletonInstance;
   }

    //解决循环依赖的时候 提前暴露的代理对象，返回接口类型
   protected Class<?>[] getEarlySingletonInterfaces() {
      Class<?> type = getObjectType();
      return (type != null && type.isInterface() ? new Class<?>[] {type} : null);
   }
 private T getSingletonInstance() throws IllegalStateException {
      Assert.state(this.initialized, "Singleton instance not initialized yet");
      return this.singletonInstance;
   }
    //jdk代理
   private class EarlySingletonInvocationHandler implements InvocationHandler {
      @Override
      public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
         try {//代理singletonInstance，这个时候代理singletonInstance还是空，当初始化完成后就不空了
            return method.invoke(getSingletonInstance(), args);
         } catch (InvocationTargetException ex) {
            throw ex.getTargetException();
         }
      }
   }
}
```

### 应用过程

在getBean对bean的初始化中，每个bean完成初始化后都会调用一个方法，用于处理FactoryBean类型的bean

```java
bean = getObjectForBeanInstance(sharedInstance, name, beanName, null);
```

来看下getObjectForBeanInstance到底是做了什么？

```java
protected Object getObjectForBeanInstance(
    Object beanInstance, String name, String beanName, RootBeanDefinition mbd) {
    if (!(beanInstance instanceof FactoryBean) || BeanFactoryUtils.isFactoryDereference(name)) {//name中是否包含&
        return beanInstance;
    }
    Object object = null;
    if (mbd == null) {
        //Object object = this.factoryBeanObjectCache.get(beanName);
        object = getCachedObjectForFactoryBean(beanName);
    }
    if (object == null) {
        // Return bean instance from factory.
        FactoryBean<?> factory = (FactoryBean<?>) beanInstance;
        // Caches object obtained from FactoryBean if it is a singleton.
        if (mbd == null && containsBeanDefinition(beanName)) {
            mbd = getMergedLocalBeanDefinition(beanName);
        }
        boolean synthetic = (mbd != null && mbd.isSynthetic());
        object = getObjectFromFactoryBean(factory, beanName, !synthetic);
    }
    return object;
}
```

首先判断如果没有实现FactoryBean直接返回已经获取的bean，如果传入的beanId带 `&`，直接返回Bean，这里获取的是注册在spring容器中的FactoryBean对象。其他情况下则去获取FactoryBean中getObject返回的对象

调用getObjectFromFactoryBean，从方法名可以看出，使用FactoryBean创建需要的对象，然后将对象缓存

```java
protected Object getObjectFromFactoryBean(FactoryBean<?> factory, String beanName, boolean shouldPostProcess) {
   if (factory.isSingleton() && containsSingleton(beanName)) {
      synchronized (getSingletonMutex()) {
         Object object = this.factoryBeanObjectCache.get(beanName);
         if (object == null) {
             //调用getObject方法
            object = doGetObjectFromFactoryBean(factory, beanName);
         	//再次检查缓存
            Object alreadyThere = this.factoryBeanObjectCache.get(beanName);
            if (alreadyThere != null) {
               object = alreadyThere;
            } else {
               if (object != null && shouldPostProcess) {
                  if (isSingletonCurrentlyInCreation(beanName)) {
                     return object;
                  }
                  beforeSingletonCreation(beanName);
                  try {//应用BeanPostProcessor
                     object = postProcessObjectFromFactoryBean(object, beanName);
                  } catch (Throwable ex) {
                     throw new BeanCreationException(beanName,
                           "Post-processing of FactoryBean's singleton object failed", ex);
                  } finally {
                     afterSingletonCreation(beanName);
                  }
               }
                //添加到缓存中
               if (containsSingleton(beanName)) {
                  this.factoryBeanObjectCache.put(beanName, (object != null ? object : NULL_OBJECT));
               }
            }
         }
         return (object != NULL_OBJECT ? object : null);
      }
   } else {//原型模式创建
      Object object = doGetObjectFromFactoryBean(factory, beanName);
      if (object != null && shouldPostProcess) {
         try {//应用BeanPostProcessor
            object = postProcessObjectFromFactoryBean(object, beanName);
         } catch (Throwable ex) {
            throw new BeanCreationException(beanName, "Post-processing of FactoryBean's object failed", ex);
         }
      }
      return object;
   }
}
```

在doGetObjectFromFactoryBean其实就是调用FactoryBean的getObject方法，创建对象

```java
private Object doGetObjectFromFactoryBean(final FactoryBean<?> factory, final String beanName) throws BeanCreationException {
   Object object = factory.getObject();
   if (object == null && isSingletonCurrentlyInCreation(beanName)) {
      throw new BeanCurrentlyInCreationException(
            beanName, "FactoryBean which is currently in creation returned null from ");
   }
   return object;
}
```