---
title: spring类型转换器(二)
date: 2018-11-22 15:49:11
tags:
- spring 
categories:
- spring

---

# spring类型转换器(二)

### Converter

除了使用PropertyEditor，spring自己还提供了一种类型转换器Converter，通过指定源数据类型和目标属性类型进行类型转换的接口。Converter支持泛型

```java
public interface Converter<S, T> {
   T convert(S source);
}
```

同时为了处理子类的类型转换器，提供了ConverterFactory用于获取类型转换器，用于用于处理枚举类型、Number类型
```java
public interface ConverterFactory<S, R> {
    //将S类型转换为T类型。
   <T extends R> Converter<S, T> getConverter(Class<T> targetType);
}
```

### ConversionService



Validator` `ValidationUtils`

`PropertyAccessorUtils`

he most manual approach, which is not normally convenient or recommended, is to simply use the `registerCustomEditor()` method of the `ConfigurableBeanFactory` interface, assuming you have a `BeanFactory`reference.

Another, slightly more convenient, mechanism is to use a special bean factory post-processor called `CustomEditorConfigurer`

Another mechanism for registering property editors with the Spring container is to create and use a `PropertyEditorRegistrar`

`GenericConverter` 用于处理复杂的converter  ArrayToCollectionConverter

`ConditionalGenericConverter`

`ConversionService`   `ConversionServiceFactory`

If no ConversionService is registered with Spring, the original PropertyEditor-based system is used.

```xml
<bean id="conversionService"
    class="org.springframework.context.support.ConversionServiceFactoryBean"/>
```

`FormattingConversionServiceFactoryBean`

`TypeDescriptor`

`Formatter`  `DateTimeFormatAnnotationFormatterFactory` `FormattingConversionServiceFactoryBean`

If you are using Spring MVC remember to explicitly configure the conversion service that is used. For Java based `@Configuration` this means extending the`WebMvcConfigurationSupport` class and overriding the `mvcConversionService()` method. For XML you should use the `'conversion-service'` attribute of the `mvc:annotation-driven` element





NumberUtils

WebUtils