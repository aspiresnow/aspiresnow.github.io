---
title: spring类型转换器(四)
date: 2018-11-22 17:39:11
tags:
- spring 
categories:
- spring


---

# spring类型转换器(四)

在spring实例化和spring mvc中涉及到了大量的属性注入。这个过程中不可避免的就是类型转换，这章将会详细说明spring中类型转换器的使用和源码。

## 使用

###  PropertyEditor

首先来看下如何在spring中注册自定义的 PropertyEditor 

```java
public class CustomPropertyEditorRegistrar implements PropertyEditorRegistrar {
    @Override
    public void registerCustomEditors(PropertyEditorRegistry registry) {
        registry.registerCustomEditor(Date.class,new DatePropertyEditor());
    }
}
```

```java
<bean class="org.springframework.beans.factory.config.CustomEditorConfigurer">
    <property name="customEditors">
        <map>
            <entry key="java.util.Date.class" value="cn.zlz.editors.DatePropertyEditor"/>
        </map>
    </property>
    <property name="propertyEditorRegistrars">
        <list>
            <ref bean="customPropertyEditorRegistrar"/>
        </list>
    </property>
</bean>
<bean id="customPropertyEditorRegistrar" class="cn.zlz.editors.CustomPropertyEditorRegistrar"/>
```

spring内部提供了一个 CustomEditorConfigurer 类，用于用户注册自定义类型转换器，可以通过customEditors注入自定义的PropertyEditor。也可以通过PropertyEditorRegistrar进行注册

PropertyEditor的注册是每个对象都创建一遍类型转换器，使用customEditors注册的是转换器的类型，然后每次都反射转换器对象。由于这样创建不够灵活，所以提供了PropertyEditorRegistrar接口，然后实现registerCustomEditors方法，通过这个方法可以灵活的注册自定义的类型转换器。

### ConversionService

```xml
<bean id="conversionService"
    class="org.springframework.context.support.ConversionServiceFactoryBean"/>

<bean id="conversionService"
        class="org.springframework.context.support.ConversionServiceFactoryBean">
    <property name="converters">
        <set>
            <bean class="example.MyCustomConverter"/>
        </set>
    </property>
</bean>
```

### FormattingConversionService

```xml
<bean id="conversionService"    class="org.springframework.format.support.FormattingConversionServiceFactoryBean"/>
```

## 源码

### ConversionService类型转换实现

ConversionServiceFactoryBean实现了FactoryBean接口，主要就是创建了DefaultConversionService对象并注入的spring容器中

```java
public class ConversionServiceFactoryBean implements FactoryBean<ConversionService>, InitializingBean {
   private Set<?> converters;
   private GenericConversionService conversionService;
   @Override
   public void afterPropertiesSet() {
      this.conversionService = createConversionService();
       //注册自定义类型转换器
      ConversionServiceFactory.registerConverters(this.converters, this.conversionService);
   }
   protected GenericConversionService createConversionService() {
      return new DefaultConversionService();
   }
   @Override
   public ConversionService getObject() {
      return this.conversionService;
   }
}
```

FormattingConversionServiceFactoryBean同样实现了FactoryBean接口，创建了DefaultFormattingConversionService对象注册到spring容器中。

```java
public class FormattingConversionServiceFactoryBean
    implements FactoryBean<FormattingConversionService>, EmbeddedValueResolverAware, InitializingBean {

    private Set<?> converters;

    private Set<?> formatters;

    private Set<FormatterRegistrar> formatterRegistrars;

    private boolean registerDefaultFormatters = true;

    private StringValueResolver embeddedValueResolver;

    private FormattingConversionService conversionService;
    @Override
    public void afterPropertiesSet() {
        //创建一个DefaultFormattingConversionService对象
        this.conversionService = new DefaultFormattingConversionService(this.embeddedValueResolver, this.registerDefaultFormatters);
        //注册自定义的converters
        ConversionServiceFactory.registerConverters(this.converters, this.conversionService);
        registerFormatters();//注册自定义的formatters
    }

    private void registerFormatters() {
        if (this.formatters != null) {
            for (Object formatter : this.formatters) {
                if (formatter instanceof Formatter<?>) {
                    this.conversionService.addFormatter((Formatter<?>) formatter);
                } else if (formatter instanceof AnnotationFormatterFactory<?>) {
                  this.conversionService.addFormatterForFieldAnnotation((AnnotationFormatterFactory<?>) formatter);
                } else {
                    throw new IllegalArgumentException("");
                }
            }
        }
        if (this.formatterRegistrars != null) {
            for (FormatterRegistrar registrar : this.formatterRegistrars) {
                registrar.registerFormatters(this.conversionService);
            }
        }
    }
}
```

通过 ConversionServiceFactoryBean或者FormattingConversionServiceFactoryBean都是向spring中注册一个id为conversionService的对象，那么是如何使用这个对象进行类型转换的呢？首先来看ApplicationContext的refresh方法

在refresh方法流程中有这么一段代码

```java
protected void finishBeanFactoryInitialization(ConfigurableListableBeanFactory beanFactory) {
   // String CONVERSION_SERVICE_BEAN_NAME = "conversionService";
   if (beanFactory.containsBean(CONVERSION_SERVICE_BEAN_NAME) &&
         beanFactory.isTypeMatch(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class)) {
      beanFactory.setConversionService(
            beanFactory.getBean(CONVERSION_SERVICE_BEAN_NAME, ConversionService.class));
   }
   //....
}
```

可以看到，在ApplicationContext初始化的时候，会查询id为`conversionService`的ConversionService对象，然后调用BeanFactory的setConversionService方法，设置spring容器的类型转换器。BeanFactory只能配置一个ConversionService，通过上文我们知道DefaultFormattingConversionService是对DefaultConversionService的完全扩展，所以当需要格式化的时候直接使用FormattingConversionServiceFactoryBean就可以。

### PropertyEditor实现

在使用ApplicationContext的时候，spring并没有暴露BeanFactory给我们，但是提供了一个BeanFactoryPostProcessor接口，spring实例化bean之前应用所有注册的BeanFactoryPostProcessor的实现类，调用每个的postProcessBeanFactory方法完成对spring容器的扩展。

来看CustomEditorConfigurer的源码，该类实现了BeanFactoryPostProcessor和Ordered接口。主要目的是在postProcessBeanFactory方法中向beanFactory中注册自定义的类型转换器

```java
public class CustomEditorConfigurer implements BeanFactoryPostProcessor, Ordered {

   private int order = Ordered.LOWEST_PRECEDENCE;  // default: same as non-Ordered
   private PropertyEditorRegistrar[] propertyEditorRegistrars;
   private Map<Class<?>, Class<? extends PropertyEditor>> customEditors;

   @Override
   public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
       //向BeanFactory中注册propertyEditorRegistrars
      if (this.propertyEditorRegistrars != null) {
         for (PropertyEditorRegistrar propertyEditorRegistrar : this.propertyEditorRegistrars) {
            beanFactory.addPropertyEditorRegistrar(propertyEditorRegistrar);
         }
      }//向BeanFactory中注册customEditors
      if (this.customEditors != null) {
         for (Map.Entry<Class<?>, Class<? extends PropertyEditor>> entry : this.customEditors.entrySet()) {
            Class<?> requiredType = entry.getKey();
            Class<? extends PropertyEditor> propertyEditorClass = entry.getValue();
            beanFactory.registerCustomEditor(requiredType, propertyEditorClass);
         }
      }
   }
}
```

在BeanFactory中注册全局的类型转换器，实例化每个bean的时候都会根据BeanFactory中注册的类型转换器在BeanWrapper中创建一份类型转换器。类型转换的过程是在getBean的时候，所以最好是在调用getBean即实例化Bean之前向BeanFactory中注册自定义的类型转换器。所以这里使用BeanFactoryPostProcessor实现了自定义类型转换器的注入

### Bean实例化的属性注入

接下来我们来看一下bean实例化过程的属性注入是怎么实现的

调用BeanFactory的getBean方法会实例化Bean，第一步首先会反射创建一个目标对象，然后使用BeanWrapperImpll封装实例bean

```java
//反射创建对象
Object beanInstance = getInstantiationStrategy().instantiate(mbd, beanName, parent);
BeanWrapper bw = new BeanWrapperImpl(beanInstance);//使用BeanWrapper包装
this.beanFactory.initBeanWrapper(bw);//将BeanFactory中的类型转换器注册到BeanWrapper中
```

在initBeanWrapper方法将BeanFactory中定义的全局类型转换器注册到每个BeanWraper中，BeanWraper实现了PropertyEditorRegistry接口，本身带有注册转换器功能。

```java
protected void initBeanWrapper(BeanWrapper bw) {
    //将BeanFactory中的conversionService 添加到BeanWrapper中
   bw.setConversionService(getConversionService());
   registerCustomEditors(bw);
}
```

将BeanFactory中注册的 propertyEditorRegistrars和customEditors中的类型转换器添加BeanWrapper中。BeanWrapper实现了PropertyEditorRegistry接口

```java
protected void registerCustomEditors(PropertyEditorRegistry registry) {
   PropertyEditorRegistrySupport registrySupport =
         (registry instanceof PropertyEditorRegistrySupport ? (PropertyEditorRegistrySupport) registry : null);
   if (registrySupport != null) {
      registrySupport.useConfigValueEditors();
   }//注册 propertyEditorRegistrars 中注册的类型转换器
   if (!this.propertyEditorRegistrars.isEmpty()) {
      for (PropertyEditorRegistrar registrar : this.propertyEditorRegistrars) {
         try {
            registrar.registerCustomEditors(registry);
         } catch (BeanCreationException ex) {
           //...
         }
      }
   }//注册 customEditors 添加的类型转换器
   if (!this.customEditors.isEmpty()) {
      for (Map.Entry<Class<?>, Class<? extends PropertyEditor>> entry : this.customEditors.entrySet()) {
         Class<?> requiredType = entry.getKey();
         Class<? extends PropertyEditor> editorClass = entry.getValue();
         registry.registerCustomEditor(requiredType, BeanUtils.instantiateClass(editorClass));
      }
   }
}
```

创建完BeanWrapperImpl并完成类型转换器的注册后，接下来我们直接来看对Bean对象的属性赋值代码。在设置值的时候会首先获取类型转换器，如果没有设置TypeConverter，那么类型转化的功能就由BeanWrapper来实现。

```java
protected void applyPropertyValues(String beanName, BeanDefinition mbd, BeanWrapper bw, PropertyValues pvs) {
    //.....
    TypeConverter converter = getCustomTypeConverter();//获取BeanFactory中的 typeConverter
    if (converter == null) {//如果没有配置 使用BeanWrapper作为类型转换器
        converter = bw;
    }
}
```

循环BeanDefinition中定义的属性值，然后将值转换为目标类型

```java
BeanDefinitionValueResolver valueResolver = new BeanDefinitionValueResolver(this, beanName, mbd, converter);
for (PropertyValue pv : original) {
    //....
    String propertyName = pv.getName();
    Object originalValue = pv.getValue();
    //解析el表达式 beanExpressionResolver，如果指定了属性的type直接在这转换
    Object resolvedValue = valueResolver.resolveValueIfNecessary(pv, originalValue);
    Object convertedValue = resolvedValue;
    boolean convertible = bw.isWritableProperty(propertyName) &&
        !PropertyAccessorUtils.isNestedOrIndexedProperty(propertyName);
    if (convertible) {//进行类型转换
        convertedValue = convertForProperty(resolvedValue, propertyName, bw, converter);
    }
}
```

调用BeanWrapper中的convertForProperty将属性值的类型转换为bean中属性的类型，这里会使用到TypeConverter和ConverterService进行类型转换

```java
private Object convertForProperty(Object value, String propertyName, BeanWrapper bw, TypeConverter converter) {
    if (converter instanceof BeanWrapperImpl) {
        return ((BeanWrapperImpl) converter).convertForProperty(value, propertyName);
    } else { //如果有指定的的TyepConverter使用自定义的
        PropertyDescriptor pd = bw.getPropertyDescriptor(propertyName);
        MethodParameter methodParam = BeanUtils.getWriteMethodParameter(pd);
        return converter.convertIfNecessary(value, pd.getPropertyType(), methodParam);
    }
}
```

完成类型转换后，将属性值包装了MutablePropertyValues 类型，BeanWrapperImpl提供了属性的访问功能，调用BeanWrapperImpl的setPropertyValues对bean中的属性值进行设置,至此就完成了bean的属性注入

```java
bw.setPropertyValues(new MutablePropertyValues(deepCopy));//在这个过程中也可进行类型转换
```
