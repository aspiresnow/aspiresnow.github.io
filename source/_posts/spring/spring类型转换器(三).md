---
title: spring类型转换器(三)
date: 2018-11-22 16:39:11
tags:
- spring 
categories:
- spring

---

# spring类型转换器(三)

## 格式化Formatter

Converter用来将源数据类型转换目标数据类型，不过有时候一个数据类型会对应不同格式的字符串，如日期类型在不同国家显示的字符是不一样的，需要根据Locale进行转换，或者需要将日期类型转换为不同格式化的字符串，spring针对这种情况提供了Formatter接口来针对格式化进行处理。

### Formatter

Formatter接口继承了Printer和Parser接口，一个用于将对象格式化为本地化的字符串，一个将字符串转换为对象。

```java
public interface Formatter<T> extends Printer<T>, Parser<T> {
}
public interface Printer<T> {
	String print(T object, Locale locale);
}
public interface Parser<T> {
	T parse(String text, Locale locale) throws ParseException;
}
```

可以通过在字段上面添加注解来实现对字段值的格式化。通过实现AnnotationFormatterFactory指定自定义的注解用以实现格式化。

```java
public interface AnnotationFormatterFactory<A extends Annotation> {
    //声明允许添加format注解的字段类型
    Set<Class<?>> getFieldTypes();
    //格式化
    Printer<?> getPrinter(A annotation, Class<?> fieldType);
    //反格式化
    Parser<?> getParser(A annotation, Class<?> fieldType);
}
```

###FormattingConversionService

在上章节的继承图中可以看到FormattingConversionService继承了GenericConversionService。同时实现了FormatterRegistry和ConverterRegistry接口

FormatterRegistry扩展了ConverterRegistry接口，额外提供了注册Formatter、AnnotationFormatterFactory的功能

```java
public interface FormatterRegistry extends ConverterRegistry {
   void addFormatter(Formatter<?> formatter);
   void addFormatterForFieldType(Class<?> fieldType, Formatter<?> formatter);
   void addFormatterForFieldType(Class<?> fieldType, Printer<?> printer, Parser<?> parser);
   void addFormatterForFieldAnnotation(AnnotationFormatterFactory<? extends Annotation> annotationFormatterFactory);
}
```

FormatterRegistrar接口用于批量注册Formatter的接口

```java
public interface FormatterRegistrar {
  //批量注册
   void registerFormatters(FormatterRegistry registry);
}
```

FormattingConversionService



### 例子

```java
public static void main(String[] args) throws NoSuchFieldException {
    String today = "2018-12-04 12:21:32";
    DefaultFormattingConversionService conversionService = new DefaultFormattingConversionService();
	//获取field
    Field longDateField = Person.class.getDeclaredField("longDate");
    Field shortDateField = Person.class.getDeclaredField("shortDate");
    Field localDateTimeField = Person.class.getDeclaredField("localDateTime");
    Object longDate = conversionService.convert(today, new TypeDescriptor(longDateField));
    System.out.println(longDate);
    Object shortDate = conversionService.convert(today, new TypeDescriptor(shortDateField));
    System.out.println(shortDate);
    Object localDateTime = conversionService.convert(today, new TypeDescriptor(localDateTimeField));
    System.out.println(localDateTime);
}

@Data
static class Person{
    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date longDate;
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private Date shortDate;
    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date localDateTime;

}
```

## 源码

首先来看DefaultFormattingConversionService，这个类是FormattingConversionService的默认实现类，FormattingConversionService实现了ConversionService接口，在BeanFactory中只有一个ConversionService变量，所以只能给spring容易配置一个ConversionService。那么到底应该用DefaultFormattingConversionService还是用DefaultConversionService？让我们来看DefaultFormattingConversionService的源码

```java
public DefaultFormattingConversionService(StringValueResolver embeddedValueResolver, boolean registerDefaultFormatters) {
   setEmbeddedValueResolver(embeddedValueResolver);
    //注册DefaultConversionService中的默认转换器
   DefaultConversionService.addDefaultConverters(this);
   if (registerDefaultFormatters) {
      addDefaultFormatters(this);
   }
}
```

从源码可以看出，DefaultFormattingConversionService完全是对DefaultConversionService的扩展，在构造函数中调用了DefaultConversionService的addDefaultConverters完全拥有了DefaultConversionService所有的功能，所以只需要使用DefaultFormattingConversionService就可以