---
title: spring类型转换器(三)
date: 2018-11-22 16:39:11
tags:
- spring 
categories:
- spring

---

# spring类型转换器(三)

## Bean实例化的属性注入

调用BeanFactory的getBean方法会实例化Bean，第一步首先会反射创建一个目标对象，然后使用BeanWrapperImpll封装实例bean

```java
//反射创建对象
Object beanInstance = getInstantiationStrategy().instantiate(mbd, beanName, parent);
BeanWrapper bw = new BeanWrapperImpl(beanInstance);//使用BeanWrapper包装
this.beanFactory.initBeanWrapper(bw);//将BeanFactory中的类型转换器注册到BeanWrapper中
```

初始化BeanWrapper就是将BeanFactory中定义的全局类型转换器注册到每个BeanWraper中，用于进行属性的类型转换

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

创建完BeanWrapperImpl并完成类型转换器的注册后，后续就是对值类型转换和属性注入了。调用applyPropertyValues 给对象的属性赋值。在设置值的时候会首先获取类型转换器，如果没有设置TypeConverter，那么类型转化的功能就由BeanWrapper来实现。

```java
protected void applyPropertyValues(String beanName, BeanDefinition mbd, BeanWrapper bw, PropertyValues pvs) {
    //.....
    TypeConverter converter = getCustomTypeConverter();//获取BeanFactory中的 typeConverter
    if (converter == null) {//如果没有配置 使用BeanWrapper作为类型转换器
        converter = bw;
    }
}
```

循环BeanDefinition中定义的属性值，然后根据匹配的Bean的属性类型进行类型转换

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
bw.setPropertyValues(new MutablePropertyValues(deepCopy));
```

## ApplicationContext中的类型转换器

通过以上流程可以知道，在BeanFactory中注册全局的类型转换器，实例化每个bean的时候都会根据BeanFactory中注册的类型转换器在BeanWrapper中创建一份类型转换器。类型转换的过程是在getBean的时候，所以最好是在调用getBean即实例化Bean之前向BeanFactory中注册自定义的类型转换器

在使用ApplicationContext的时候，spring并没有暴露BeanFactory给我们，但是提供了一个BeanFactoryPostProcessor接口用于实现，spring会保证在实例化bean之前调用所有注册的BeanFactoryPostProcessor的实现类的postProcessBeanFactory方法。

spring内部提供了一个 CustomEditorConfigurer 类，用于用户注册自定义类型转换器

```java
<bean class="org.springframework.beans.factory.config.CustomEditorConfigurer">
    <property name="customEditors">
        <map>
            <entry key="example.ExoticType" value="example.ExoticTypeEditor"/>
        </map>
    </property>
    <property name="propertyEditorRegistrars">
        <list>
            <ref bean="customPropertyEditorRegistrar"/>
        </list>
    </property>
</bean>
<bean id="customPropertyEditorRegistrar"
    class="com.foo.editors.spring.CustomPropertyEditorRegistrar"/>
```

来看CustomEditorConfigurer的源码，实现了BeanFactoryPostProcessor和Ordered接口。在postProcessBeanFactory方法中向beanFactory中注册了自定义的类型转换器

```java
public class CustomEditorConfigurer implements BeanFactoryPostProcessor, Ordered {

   private int order = Ordered.LOWEST_PRECEDENCE;  // default: same as non-Ordered
   private PropertyEditorRegistrar[] propertyEditorRegistrars;
   private Map<Class<?>, Class<? extends PropertyEditor>> customEditors;

   @Override
   public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
       //注册propertyEditorRegistrars
      if (this.propertyEditorRegistrars != null) {
         for (PropertyEditorRegistrar propertyEditorRegistrar : this.propertyEditorRegistrars) {
            beanFactory.addPropertyEditorRegistrar(propertyEditorRegistrar);
         }
      }//注册customEditors
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



Validator` `ValidationUtils`

`PropertyAccessorUtils`

he most manual approach, which is not normally convenient or recommended, is to simply use the `registerCustomEditor()` method of the `ConfigurableBeanFactory` interface, assuming you have a `BeanFactory`reference.

Another, slightly more convenient, mechanism is to use a special bean factory post-processor called `CustomEditorConfigurer`

Another mechanism for registering property editors with the Spring container is to create and use a `PropertyEditorRegistrar`

`GenericConverter` 用于处理复杂的converter  ArrayToCollectionConverter

`ConditionalGenericConverter`

`ConversionService`   `ConversionServiceFactory`

If no ConversionService is registered with Spring, the original PropertyEditor-based system is used.

```java
<bean id="conversionService"
    class="org.springframework.context.support.ConversionServiceFactoryBean"/>
```

`FormattingConversionServiceFactoryBean`

`TypeDescriptor`

`Formatter`  `DateTimeFormatAnnotationFormatterFactory` `FormattingConversionServiceFactoryBean`

If you are using Spring MVC remember to explicitly configure the conversion service that is used. For Java based `@Configuration` this means extending the`WebMvcConfigurationSupport` class and overriding the `mvcConversionService()` method. For XML you should use the `'conversion-service'` attribute of the `mvc:annotation-driven` element





NumberUtils

WebUtils