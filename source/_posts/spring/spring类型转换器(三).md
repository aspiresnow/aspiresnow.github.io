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

格式化Formatter其实也是一种Converter，只是两个互转类型之间，**有一个固定是String类型**，Formatter实现了不同格式的String类型与其他类型的类型互转

Formatter主要针对的是Number类型和日期类型。Spring对这两种类型的子类和字符串之间的转换提供了格式化实现，下面以日期类型的转换为例说明。

### 例子

```java
public static void main(String[] args) throws NoSuchFieldException {
        String today = "2018-12-04 12:21:32";
        DefaultFormattingConversionService conversionService = new DefaultFormattingConversionService();
        Field longDateField = Person.class.getDeclaredField("longDate");
        Date longDate = (Date) conversionService.convert(today, new TypeDescriptor(longDateField));
        Field shortDateField = Person.class.getDeclaredField("shortDate");
        Date shortDate = (Date) conversionService.convert(today, new TypeDescriptor(shortDateField));
        Field localDateTimeField = Person.class.getDeclaredField("localDateTime");
        LocalDateTime localDateTime = (LocalDateTime) conversionService.convert(today, new TypeDescriptor(localDateTimeField));
        Field dateFormatField = Person.class.getDeclaredField("dateFormat");
        //日期到字符串的格式化转换，注意@DateTimeFormat注解一定要加在日期类型上，加在字符串类型上没有用
        String dateFormat = (String) conversionService.convert(LocalDateTime.now(), new TypeDescriptor(localDateTimeField), new TypeDescriptor(dateFormatField));
        System.out.println(dateFormat);
    }
    @Data
    static class Person{
        @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private Date longDate;
        @DateTimeFormat(pattern = "yyyy-MM-dd")
        private Date shortDate;
        @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private LocalDateTime localDateTime;

        private String dateFormat;
    }
```

## 原理分析

1. 首先需要明确的一点，格式化是完成指定类型和字符串类型的互转,那么就可以定性为使用Converter来完成，需要注册两个Converter，String到Class<?>和 Class<?>到String的转换，这样就可以借用Converter调用的壳子，内部的转换及格式化再具体实现
2. 格式化功能的实现是通过两个接口来实现，通过Printer接口`print()`方法实现指定类型到字符串的转换，通过Parser接口`parse()`方法完成字符串到指定类型的转换。Formater接口继承了这两个接口
3. 格式化可以转换为不同格式的字符串，并且可以用户自定义，那么就需要一个入口来让用户配置，所以提供了两个注解用于指定字段的格式类型
   -  `DateTimeFormat` 指定日期格式的注解，通过指定pattern或者style实现指定不同的格式字符串
   - `NumberFormat` 指定数字格式的注解，通过指定pattern或者style实现指定不同的格式字符串。
4. 那么通过什么来提供注解接入的入口呢，那就是AnnotationFormatterFactory<A extends Annotation>接口，这个接口集成了注解和Formater接口，将两者关联起来，然后注册到Converter中。同时这个接口的`getFieldTypes()`方法返回一个Set<Class<?>>，可以同时集成多个类型到字符串之间的转换。

## 源码

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

AnnotationFormatterFactory集成了注解和Formatter。可以创建带有Annotation性质的Printer和Parser对象。

```java
public interface AnnotationFormatterFactory<A extends Annotation> {
    //支持多个类型到字符串之间的转换
    Set<Class<?>> getFieldTypes();
    //格式化
    Printer<?> getPrinter(A annotation, Class<?> fieldType);
    //反格式化
    Parser<?> getParser(A annotation, Class<?> fieldType);
}
```

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

spring提供了FormattingConversionService的默认实现DefaultFormattingConversionService，使用的时候一般都是直接使用这个类。

首先来看DefaultFormattingConversionService，在BeanFactory中只接收一个ConversionService变量，所以只能给spring容易配置一个ConversionService。那么到底应该用DefaultFormattingConversionService还是用DefaultConversionService？让我们来看DefaultFormattingConversionService中的实现

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

**从源码可以看出，DefaultFormattingConversionService完全是对DefaultConversionService的扩展，在构造函数中调用了DefaultConversionService的addDefaultConverters完全拥有了DefaultConversionService所有的功能，所以只需要使用DefaultFormattingConversionService就可以**

DefaultFormattingConversionService创建完成之后除了添加Converters，还注册了一些Formatters，这些Formaters主要是spring提供的用于针对**日期类型**、**Number类型**、**货币金额**进行格式化转换

```java
public static void addDefaultFormatters(FormatterRegistry formatterRegistry) {
    //支持数字类型的字符串格式化转换
   formatterRegistry.addFormatterForFieldAnnotation(new NumberFormatAnnotationFormatterFactory());
  	//支持对 货币金额 格式转换
   if (jsr354Present) {
      formatterRegistry.addFormatter(new CurrencyUnitFormatter());
      formatterRegistry.addFormatter(new MonetaryAmountFormatter());
      formatterRegistry.addFormatterForFieldAnnotation(new Jsr354NumberFormatAnnotationFormatterFactory());
   }

   if (jsr310Present) {
      //对java8的日期类型 字符串格式化转换   LocalDateTime
      new DateTimeFormatterRegistrar().registerFormatters(formatterRegistry);
   }
   if (jodaTimePresent) {
      //对joda格式的日期 字符串格式化转换
      new JodaTimeFormatterRegistrar().registerFormatters(formatterRegistry);
   } else {
       //对普通的Date 、Calendar、时间戳 字符串格式化转换
      new DateFormatterRegistrar().registerFormatters(formatterRegistry);
   }
}
```

### Formater的注册和转换

#### 注册Formatter

接下来分析下Formater的注册功能。通过上述分析我们可以知道，Formater实质上是Class<?>和String之间的互转，所以在注册的时候，只需要提供Class<?\>、Printer和Parser。来看FormattingConversionService类中的实现

```java
//没有指定Class<?> 直接使用 Formater上的泛型作为和String互转的类型
public void addFormatter(Formatter<?> formatter) {
   addFormatterForFieldType(getFieldType(formatter), formatter);
}
//formatter同时继承了 Printer和Parser接口
public void addFormatterForFieldType(Class<?> fieldType, Formatter<?> formatter) {
   addConverter(new PrinterConverter(fieldType, formatter, this));
   addConverter(new ParserConverter(fieldType, formatter, this));
}
//注册Converter
public void addFormatterForFieldType(Class<?> fieldType, Printer<?> printer, Parser<?> parser) {
   addConverter(new PrinterConverter(fieldType, printer, this));
   addConverter(new ParserConverter(fieldType, parser, this));
}
```

可以看到的是注册Formater的过程，就是注册了一对Converter。注册Converter的过程已经在前文分析过，在这里我们来一起看下PrinterConverter和ParserConverter类。

```java
private static class PrinterConverter implements GenericConverter {
   private final Class<?> fieldType;
   private final TypeDescriptor printerObjectType;
   private final Printer printer;
   private final ConversionService conversionService;//this
   public PrinterConverter(Class<?> fieldType, Printer<?> printer, ConversionService conversionService) {
      this.fieldType = fieldType;
       //获取Printer上设置的泛型 即Class<?>
      this.printerObjectType = TypeDescriptor.valueOf(resolvePrinterObjectType(printer));
      this.printer = printer;
      this.conversionService = conversionService;//this
   }

   @Override //fieldType -> String 转换
   public Set<ConvertiblePair> getConvertibleTypes() {
      return Collections.singleton(new ConvertiblePair(this.fieldType, String.class));
   }
   @Override
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
      if (source == null) {
         return "";
      }//如果源数据类型和Printer支持的不一致，首先需要进行 源数据类型 -> Printer支持类型的转换
      if (!sourceType.isAssignableTo(this.printerObjectType)) {
         source = this.conversionService.convert(source, sourceType, this.printerObjectType);
      } //委托Printer 完成到 String类型的转换
      return this.printer.print(source, LocaleContextHolder.getLocale());
   }

   private Class<?> resolvePrinterObjectType(Printer<?> printer) {
      return GenericTypeResolver.resolveTypeArgument(printer.getClass(), Printer.class);
   }
}
```

可以看出PrinterConverter类型实现GenericConverter，用于实现传入类型到字符串的转换，具体的转换功能委托给参数Printer实现类对象实现。这里相当于是一个插件类保留。可以通过Printer实现任何类型到String类型的转换。

再来看ParserConverter

```java
private static class ParserConverter implements GenericConverter {
   private final Class<?> fieldType;
   private final Parser<?> parser;
   private final ConversionService conversionService;
   public ParserConverter(Class<?> fieldType, Parser<?> parser, ConversionService conversionService) {
      this.fieldType = fieldType;
      this.parser = parser;
      this.conversionService = conversionService;//this
   }
   @Override //String -> fieldType 转换
   public Set<ConvertiblePair> getConvertibleTypes() {
      return Collections.singleton(new ConvertiblePair(String.class, this.fieldType));
   }

   @Override
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
      String text = (String) source;
      if (!StringUtils.hasText(text)) {
         return null;
      }
      Object result;
      try { //调用parser 将String类型转换为 Parser中声明的泛型
         result = this.parser.parse(text, LocaleContextHolder.getLocale());
      }
	  //catch...
      if (result == null) {
         //throw ...
      }
      //如果通过Parser转换后的类型不是目标类型，调用相应的类型转换器继续转换
      TypeDescriptor resultType = TypeDescriptor.valueOf(result.getClass());
      if (!resultType.isAssignableTo(targetType)) {
         result = this.conversionService.convert(result, resultType, targetType);
      }
      return result;
   }
}
```

ParserConverter跟PrinterConverter实现了一个反方向的转换，至此注册通过一个Formater接口实现类，就可以完成Formater实现类中泛型到String类型之间的互转。

例如注册 LocalDateTime的转换器，实现LocalDateTime和String类型的互转

```java
registry.addFormatterForFieldType(LocalDateTime.class, new TemporalAccessorPrinter(
    dtf == DateTimeFormatter.ISO_DATE_TIME ? DateTimeFormatter.ISO_LOCAL_DATE_TIME : dtf),
      new TemporalAccessorParser(LocalDateTime.class, dtf));
```

可以看到使用一个类TemporalAccessorPrinter和TemporalAccessorParser，并都传入了一个参数DateTimeFormatter，众所周知LocalDateTime和String格式化就是通过DateTimeFormatter来实现。那么我们猜测TemporalAccessorParser其实就是对DateTimeFormatter的封装调用

```java
public final class TemporalAccessorPrinter implements Printer<TemporalAccessor> {
   private final DateTimeFormatter formatter;
   public TemporalAccessorPrinter(DateTimeFormatter formatter) {
      this.formatter = formatter;
   }
   @Override
   public String print(TemporalAccessor partial, Locale locale) {
       //调用formater的format转换为String
      return DateTimeContextHolder.getFormatter(this.formatter, locale).format(partial);
   }
}
```

可以看到TemporalAccessorPrinter就是调用的DateTimeFormatter完成格式化的，不过这里使用到了ThreadLocal，可以先不管，TemporalAccessorParser中同理也会使用DateTimeFormatter完成String到日期的转换

```java
public final class TemporalAccessorParser implements Parser<TemporalAccessor> {
   private final DateTimeFormatter formatter;
	//...
   @Override
   public TemporalAccessor parse(String text, Locale locale) throws ParseException {
      DateTimeFormatter formatterToUse = DateTimeContextHolder.getFormatter(this.formatter, locale);
      if (LocalDate.class == this.temporalAccessorType) {
         return LocalDate.parse(text, formatterToUse);
      } else if (LocalTime.class == this.temporalAccessorType) {
         return LocalTime.parse(text, formatterToUse);
      } else if (LocalDateTime.class == this.temporalAccessorType) {
         return LocalDateTime.parse(text, formatterToUse);
      }
      //...
   }
}
```

#### 格式化转换

Formatter的注册最终是注册了一对Converter，所以格式化转换完全就是Converter逻辑的实现，在前文已经分析过了，这里就不再赘述。

### AnnotationFormatterFactory的注册和转换

### 注册

分析完了Formatter的注册和转换过程，一起来看下FormatConversionService提供了另外一种注册。前文提到了可以通过在对象字段上声明一个注解，在注解中指定格式化后字符串格式。这个功能就是通过AnnotationFormatterFactory来实现的。来看FormatConversionService的`addFormatterForFieldAnnotation()`方法

```java
@Override
public void addFormatterForFieldAnnotation(AnnotationFormatterFactory<? extends Annotation> annotationFormatterFactory) {
    //获取注册AnnotationFormatterFactory上的注解
   Class<? extends Annotation> annotationType =getAnnotationType(annotationFormatterFactory);
   if (this.embeddedValueResolver != null && annotationFormatterFactory instanceof EmbeddedValueResolverAware) {
      ((EmbeddedValueResolverAware) annotationFormatterFactory).setEmbeddedValueResolver(this.embeddedValueResolver);
   }
    //AnnotationFormatterFactory中定义的支持转换的Class<?>集合
   Set<Class<?>> fieldTypes = annotationFormatterFactory.getFieldTypes();
    //该集合中所有的类型都需要完成到String的互转，所以循环封装Converter并注册
   for (Class<?> fieldType : fieldTypes) {
       //注册 fieldType --> String 的类型转换器
      addConverter(new AnnotationPrinterConverter(annotationType, annotationFormatterFactory, fieldType));
       //注册 String --> fieldType 的类型转换器
      addConverter(new AnnotationParserConverter(annotationType, annotationFormatterFactory, fieldType));
   }
}
```

AnnotationFormatterFactory的注册，首先需要获取的就是AnnotationFormatterFactory泛型中的注解类型。然后通过`getFieldTypes()`获取所有声明的可以进行转换类型集合，然后循环注册了两个类型转换器AnnotationPrinterConverter和AnnotationParserConverter。那么来看一下AnnotationPrinterConverter到底如何完成可配置的类型转换的

```java
private class AnnotationPrinterConverter implements ConditionalGenericConverter {
   private final Class<? extends Annotation> annotationType; //注解类型
   private final AnnotationFormatterFactory annotationFormatterFactory;
   private final Class<?> fieldType;
   public AnnotationPrinterConverter(Class<? extends Annotation> annotationType,
         AnnotationFormatterFactory<?> annotationFormatterFactory, Class<?> fieldType) {
      this.annotationType = annotationType;
      this.annotationFormatterFactory = annotationFormatterFactory;
      this.fieldType = fieldType;
   }
   @Override
   public Set<ConvertiblePair> getConvertibleTypes() {
       //声明为 fieldType -> String 之间的转换
      return Collections.singleton(new ConvertiblePair(this.fieldType, String.class));
   }
   @Override
   public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
       //转换器生效的条件时 源数据类型上有该注解
      return sourceType.hasAnnotation(this.annotationType);
   }
   @Override
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {		//获取源数据类型上的注解
      Annotation ann = sourceType.getAnnotation(this.annotationType);
      if (ann == null) { //使用该转换器的前提是添加了相同的注解
         throw new IllegalStateException("");
      }
      AnnotationConverterKey converterKey = new AnnotationConverterKey(ann, sourceType.getObjectType());
      //将创建PrinterConverter缓存起来，避免每次重复创建
      GenericConverter converter = cachedPrinters.get(converterKey);
      if (converter == null) {
          //从annotationFormatterFactory中获取Printer
         Printer<?> printer = this.annotationFormatterFactory.getPrinter(
               converterKey.getAnnotation(), converterKey.getFieldType());
          //在这个converter中又创建了PrinterConverter 
         converter = new PrinterConverter(this.fieldType, printer, FormattingConversionService.this);
         cachedPrinters.put(converterKey, converter);
      }
      //使用PrinterConverter 进行类型转换
      return converter.convert(source, sourceType, targetType);
   }
}
```

可以看到的是，AnnotationPrinterConverter实现了ConditionalGenericConverter接口，在`matches()`方法中声明了该转换器只会作用于Class<?>上有指定的注解的类型。在convert方法中最终创建了一个PrinterConverter对象，使用PrinterConverter完成格式化的功能，这个在上面已经分析过了。唯一的不同就是Printer的获取。使用annotationFormatterFactory获取printer，并将注解作为参数传递进去。所以可以我们可以实现AnnotationFormatterFactory的`getPrinter()`方法提供转换为字符串的功能即可，通过看以通过参数annotation获取用户配置的格式。实现格式的可配置。

同样在AnnotationParserConverter中实现String到Class<?>的转换，调用AnnotationFormatterFactory获取Parser然后创建一个ParserConverter来实现类型转化。需要注意的是 **注解只能添加在非String类型那一方上。**

```java
private class AnnotationParserConverter implements ConditionalGenericConverter {
   private final Class<? extends Annotation> annotationType;
   private final AnnotationFormatterFactory annotationFormatterFactory;
   private final Class<?> fieldType;
	//此处省略...

   @Override//String 到fieldType的转换
   public Set<ConvertiblePair> getConvertibleTypes() {
      return Collections.singleton(new ConvertiblePair(String.class, fieldType));
   }
   @Override //注意这里用的是targetType 还是要非String类上声明注解
   public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
      return targetType.hasAnnotation(this.annotationType);
   }
   @Override
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
      Annotation ann = targetType.getAnnotation(this.annotationType);
      if (ann == null) {
         //throw ...
      }
      AnnotationConverterKey converterKey = new AnnotationConverterKey(ann, targetType.getObjectType());
      GenericConverter converter = cachedParsers.get(converterKey);
      if (converter == null) {
          //获取parser
         Parser<?> parser = this.annotationFormatterFactory.getParser(
               converterKey.getAnnotation(), converterKey.getFieldType());
          //创建ParserConverter进行转换
         converter = new ParserConverter(this.fieldType, parser, FormattingConversionService.this);
         cachedParsers.put(converterKey, converter);
      }
      return converter.convert(source, sourceType, targetType);
   }
}
```

通过封装封装注册AnnotationPrinterConverter和AnnotationParserConverter，用户需要做的就只有是实现AnnotationFormatterFactory，在泛型中指定注解，然后实现了`getPrinter()`和`getParser()`来实现Class<?>和String之间的转换，其他的调用直接走Converter流程。来看Date类型格式化的实现

在DateFormatterRegistrar中，在注册Formatters之前，先注册了日期类型的一些converter，这里先不去管这个。最主要的是`addFormatterForFieldAnnotation`方法，通过这个方法完成对Formater的注册

```java
@Override
public void registerFormatters(FormatterRegistry registry) {
   addDateConverters(registry);
    //注册Formater FormatterFactory
   registry.addFormatterForFieldAnnotation(new DateTimeFormatAnnotationFormatterFactory());
   if (this.dateFormatter != null) {
       //添加对非注解 Date类型转换
      registry.addFormatter(this.dateFormatter);
      registry.addFormatterForFieldType(Calendar.class, this.dateFormatter);
   }
}
```

来看下DateTimeFormatAnnotationFormatterFactory实现了AnnotationFormatterFactory。并指定注解为DateTimeFormat。

```java
public class DateTimeFormatAnnotationFormatterFactory  extends EmbeddedValueResolutionSupport
      implements AnnotationFormatterFactory<DateTimeFormat> {

   private static final Set<Class<?>> FIELD_TYPES;

   static {//定义支持的 格式化的类型，支持格式化 Date、Calendar、Long类型
      Set<Class<?>> fieldTypes = new HashSet<Class<?>>(4);
      fieldTypes.add(Date.class);
      fieldTypes.add(Calendar.class);
      fieldTypes.add(Long.class);
      FIELD_TYPES = Collections.unmodifiableSet(fieldTypes);
   }
   @Override //定义支持的 格式化的类型，支持格式化 Date、Calendar、Long类型
   public Set<Class<?>> getFieldTypes() {
      return FIELD_TYPES;
   }
   @Override
   public Printer<?> getPrinter(DateTimeFormat annotation, Class<?> fieldType) {
      return getFormatter(annotation, fieldType);
   }
   @Override
   public Parser<?> getParser(DateTimeFormat annotation, Class<?> fieldType) {
      return getFormatter(annotation, fieldType);
   }
   protected Formatter<Date> getFormatter(DateTimeFormat annotation, Class<?> fieldType) {
      DateFormatter formatter = new DateFormatter();
      //获取用户注解中写的格式
      formatter.setStylePattern(resolveEmbeddedValue(annotation.style()));
      formatter.setIso(annotation.iso()); //获取用户注解中写的格式
      formatter.setPattern(resolveEmbeddedValue(annotation.pattern())); //获取用户注解中写的格式
      return formatter;
   }
}
```

可以看到的是在`getFieldType()`声明了支持转换的有Date、Calendar、Long。可以看到`getPrinter()`和`getFormatter()`方法返回了一个DateFormatter对象，并将用户配置的注解信息注入到这个DateFormatter对象中

接下来就是最终的格式化实现就是这个DateFormatter对象了。大家想一下，一般针对Date类型的格式化都会用什么呢？想必大家都猜到了，没错就是SimpleDateFormat。在DateFormatter中就是创建了一个SimpleDateFormat来实现类型和字符串的转换的

```java
public class DateFormatter implements Formatter<Date> {
    //....此处省略
    @Override
    public String print(Date date, Locale locale) {
       return getDateFormat(locale).format(date);
    }
    @Override
    public Date parse(String text, Locale locale) throws ParseException {
       return getDateFormat(locale).parse(text);
    }
    protected DateFormat getDateFormat(Locale locale) {
       DateFormat dateFormat = createDateFormat(locale);
       if (this.timeZone != null) {
          dateFormat.setTimeZone(this.timeZone);
       }
       dateFormat.setLenient(this.lenient);
       return dateFormat;
    }
	//创建一个SimpleDateFormat,并使用 annotation传入的pattern
    private DateFormat createDateFormat(Locale locale) {
       if (StringUtils.hasLength(this.pattern)) {
          return new SimpleDateFormat(this.pattern, locale);
       }
       if (this.iso != null && this.iso != ISO.NONE) {
          String pattern = ISO_PATTERNS.get(this.iso);
          if (pattern == null) {
             throw new IllegalStateException("Unsupported ISO format " + this.iso);
          }
          SimpleDateFormat format = new SimpleDateFormat(pattern);
          format.setTimeZone(UTC);
          return format;
       }
       if (StringUtils.hasLength(this.stylePattern)) {
          int dateStyle = getStylePatternForChar(0);
          int timeStyle = getStylePatternForChar(1);
          if (dateStyle != -1 && timeStyle != -1) {
             return DateFormat.getDateTimeInstance(dateStyle, timeStyle, locale);
          }
          if (dateStyle != -1) {
             return DateFormat.getDateInstance(dateStyle, locale);
          }
          if (timeStyle != -1) {
             return DateFormat.getTimeInstance(timeStyle, locale);
          }
          throw new IllegalStateException("Unsupported style pattern");

       }
       return DateFormat.getDateInstance(this.style, locale);
    }
}
```

至此就实现了Formatter的注册和使用。那么在spring中是如何使用的呢？

## spring中的使用

```xml
<bean id="conversionService"    class="org.springframework.format.support.FormattingConversionServiceFactoryBean">
    <converters>
        <set>
            <bean class="example.MyCustomConverter"/>
        </set>
    </converters>
    <formatters>
        <set>
            <bean class="example.MyCustomFormatters"/>
        </set>
    </formatters>
    <formatterRegistrars>
        <set>
        </set>
    </formatterRegistrars>
</bean>
```

没错就注册一个id为conversionService的FormattingConversionServiceFactoryBean对象。使用这个就可以了，不需要再注册ConversionServiceFactoryBean了。