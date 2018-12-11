---
title: spring类型转换器(二)
date: 2018-11-22 15:49:11
tags:
- spring 
categories:
- spring

---

# spring类型转换器(二)

## 类型转换器Converter

### Converter

除了使用PropertyEditor，spring自己还提供了另外一种类型转换器Converter，该接口声明了一个从源数据类型转换为目标数据类型的方法。只需要实现convert方法，该方法支持泛型

```java
public interface Converter<S, T> {
   T convert(S source);
}
```

ConverterFactory接口，作为Converter工厂类，支持从一个原类型转换为一个目标类型对应的子类型。例如处理枚举类型、Number类型
```java
public interface ConverterFactory<S, R> {
    //将S类型转换为T类型。
   <T extends R> Converter<S, T> getConverter(Class<T> targetType);
}
```

GenericConverter 用于支持多个类型对之间的转换。通过getConvertibleTypes声明所有支持转换的类型对。

```java
public interface GenericConverter {
    //声明 所有支持转换的 类型对
    public Set<ConvertiblePair> getConvertibleTypes();
    //类型转换
    Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType);
}
```

ConditionalGenericConverter 提供有条件的类型转换

```java
public interface ConditionalConverter {
    boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType);
}
public interface ConditionalGenericConverter extends GenericConverter, ConditionalConverter {
}
```

### ConversionService

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/spring/converterService%E7%BB%A7%E6%89%BF%E5%9B%BE.png)

ConversionService 是策略模式的一种实现，主要用于提供一个入口，让外界选择注册的Converter.类型转换的功能还是由具体的Converter来实现。

```java
public interface ConversionService {
    boolean canConvert(Class<?> sourceType, Class<?> targetType);
    <T> T convert(Object source, Class<T> targetType);
    boolean canConvert(TypeDescriptor sourceType, TypeDescriptor targetType);
    Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType);
}
```

ConverterRegistry接口 用于注册转换器

```java
public interface ConverterRegistry {
    //注册converter
    void addConverter(Converter<?, ?> converter);
    //注册converter，避免对同一个converter重复注册
    <S, T> void addConverter(Class<S> sourceType, Class<T> targetType, Converter<? super S, ? extends T> converter);
    //注册GenericConverter
    void addConverter(GenericConverter converter);
    //ConverterFactory
    void addConverterFactory(ConverterFactory<?, ?> factory);
    //移除注册
    void removeConvertible(Class<?> sourceType, Class<?> targetType);
}
```

GenericConversionService实现了注册转换器、查找转换器、类型转换的功能，并将功能细节委托给了内部类Converters具体实现。Converters只接收GenericConverter类型的转换器。所以在GenericConversionService提供了ConverterAdapter和ConverterFactoryAdapter来完成Converter到GenericConverter、ConverterFactory到GenericConverter的转换,这里使用包装模式和适配模式的概念

```java
//继承GenericConverter 并完成对Converter的包装
private final class ConverterAdapter implements ConditionalGenericConverter {
    private final Converter<Object, Object> converter;
    private final ConvertiblePair typeInfo;//封装源数据类型->目标数据类型
    private final ResolvableType targetType;

    public ConverterAdapter(Converter<?, ?> converter, ResolvableType sourceType, ResolvableType targetType) {
        this.converter = (Converter<Object, Object>) converter;
        this.typeInfo = new ConvertiblePair(sourceType.resolve(Object.class), targetType.resolve(Object.class));
        this.targetType = targetType;
    }
    @Override
    public Set<ConvertiblePair> getConvertibleTypes() {
        return Collections.singleton(this.typeInfo);
    }
    @Override //转换器的条件验证方法
    public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
        // 判断目标类型是否一致.
        if (this.typeInfo.getTargetType() != targetType.getObjectType()) {
            return false;
        }
        // Full check for complex generic type match required?
        ResolvableType rt = targetType.getResolvableType();
        if (!(rt.getType() instanceof Class) && !rt.isAssignableFrom(this.targetType) &&
            !this.targetType.hasUnresolvableGenerics()) {
            return false;
        }//如果被包装的Converter同时实现了ConditionalConverter，再次验证matches方法
        return !(this.converter instanceof ConditionalConverter) ||
            ((ConditionalConverter) this.converter).matches(sourceType, targetType);
    }
    @Override//调用被包装的converter进行类型转换
    public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
        if (source == null) {//处理控制，主要针对Optional处理
            return convertNullSource(sourceType, targetType);
        }//调用包装的converter进行转换
        return this.converter.convert(source);
    }
}
```

```java
private final class ConverterFactoryAdapter implements ConditionalGenericConverter {
	//被包装的 ConverterFactory 类
   private final ConverterFactory<Object, Object> converterFactory;
   private final ConvertiblePair typeInfo;//封装 源数据类型->目标数据类型 对

   public ConverterFactoryAdapter(ConverterFactory<?, ?> converterFactory, ConvertiblePair typeInfo) {
      this.converterFactory = (ConverterFactory<Object, Object>) converterFactory;
      this.typeInfo = typeInfo;
   }
   @Override//返回支持的转换的 源数据类型->目标数据类型 对
   public Set<ConvertiblePair> getConvertibleTypes() {
      return Collections.singleton(this.typeInfo);
   }
   @Override//保证验证所有实现了 ConditionConverter接口的matches方法
   public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
      boolean matches = true;
      if (this.converterFactory instanceof ConditionalConverter) {
         matches = ((ConditionalConverter) this.converterFactory).matches(sourceType, targetType);
      }
      if (matches) {
         Converter<?, ?> converter = this.converterFactory.getConverter(targetType.getType());//工厂类创建转换器
         if (converter instanceof ConditionalConverter) {//
            matches = ((ConditionalConverter) converter).matches(sourceType, targetType);
         }
      }
      return matches;
   }
	//类型转换
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType){
      if (source == null) {
         return convertNullSource(sourceType, targetType);
      }//调用包装的工厂方法创建转换器，并进行类型转换
      return this.converterFactory.getConverter(targetType.getObjectType()).convert(source);
   }
}
```

ConvertiblePair封装了源数据类型和目标数据类型对，覆写了hashCode方法，主要用于做map的key

```java
final class ConvertiblePair {
   private final Class<?> sourceType;
   private final Class<?> targetType;
}
@Override
public int hashCode() {
    return (this.sourceType.hashCode() * 31 + this.targetType.hashCode());
}
```

使用ConvertersForPair封装map的value，用于对应的转换器 list ，主要用于做map的value。注意这里的addFirst很重要，因为会有些默认注册的转换器，使用addFirst保证自定义的同种类型转换器放到默认的之前，可以保证自定义的转换器可以覆盖默认创建的

```java
private static class ConvertersForPair {
    //类型可以对应多个转换器，所以这里用的是list
  private final LinkedList<GenericConverter> converters = new LinkedList<GenericConverter>();
    public void add(GenericConverter converter) {
        this.converters.addFirst(converter); //addFirst很重要
    }

  //获取converter的时候，再调用matches方法验证
 public GenericConverter getConverter(TypeDescriptor sourceType, TypeDescriptor targetType) {
        for (GenericConverter converter : this.converters) {
            if (!(converter instanceof ConditionalGenericConverter) ||
                ((ConditionalGenericConverter) converter).matches(sourceType, targetType)) {
                return converter;
            }
        }
        return null;
    }
}
```

### 注册

对于Optional的类型转换，无法直接声明带有泛型的类，所以需要在对象的字段类型上声明带泛型的Optional，实现类型转换

```java
public static void main(String[] args) {
    DefaultConversionService conversionService = new DefaultConversionService();
    TestBean.ESex sex = conversionService.convert(0, ESex.class);
    System.out.println(sex);
    conversionService.addConverterFactory(new String2EnumConverter());
    EStatus status = conversionService.convert("3", EStatus.class);
    System.out.println(status);

    conversionService.addConverter(new LocalDateTime2StringConverter());
    LocalDateTime now = LocalDateTime.now();
    String nowStr = conversionService.convert(now, String.class);
    System.out.println(nowStr);
    }
```

GenericConversionService实现了ConverterRegistry接口，提供了注册转换器的具体实现。

```java
//注册Converter
public void addConverter(Converter<?, ?> converter) {
    //获取类上的泛型信息
    ResolvableType[] typeInfo = getRequiredTypeInfo(converter.getClass(), Converter.class);
    if (typeInfo == null && converter instanceof DecoratingProxy) {
        typeInfo = getRequiredTypeInfo(((DecoratingProxy) converter).getDecoratedClass(), Converter.class);
    }//注册converter
    addConverter(new ConverterAdapter(converter, typeInfo[0], typeInfo[1]));
}
//注册ConverterFactory
public void addConverterFactory(ConverterFactory<?, ?> factory) {
    ResolvableType[] typeInfo = getRequiredTypeInfo(factory.getClass(), ConverterFactory.class); //获取类上的泛型信息
    //判断是否是代理类，如果是代理类 获取 被代理类上的泛型
    if (typeInfo == null && factory instanceof DecoratingProxy) {
        typeInfo = getRequiredTypeInfo(((DecoratingProxy) factory).getDecoratedClass(), ConverterFactory.class);
    } //使用 ConverterFactoryAdapter 包装 ConverterFactory
    addConverter(new ConverterFactoryAdapter(factory,
                                             new ConvertiblePair(typeInfo[0].resolve(), typeInfo[1].resolve())));
}
//调用Converters实现注册
public void addConverter(GenericConverter converter) {
    this.converters.add(converter);//调用内部类 Converters 的add方法实现注册转换器
    invalidateCache(); //清空缓存
}
```

在GenericConversionService中维护了一个内部类Converters对象。Converters中使用了一个Map<ConvertiblePair, ConvertersForPair>存储类型对和转换器之间的关系。注册类型转换器就是向这个map中put一条数据。GenericConverter .getConvertibleTypes方法申明的所有的类型对都会注册到map。

```java
private final Set<GenericConverter> globalConverters = new LinkedHashSet<GenericConverter>();
//维护类型(ConvertiblePair)到转换器(ConvertersForPair)之间的关系
private final Map<ConvertiblePair, ConvertersForPair> converters =
      new LinkedHashMap<ConvertiblePair, ConvertersForPair>(36);

//添加功能
public void add(GenericConverter converter) {
    //获取converter所有支持的 源数据类型到目标数据类型对 
   Set<ConvertiblePair> convertibleTypes = converter.getConvertibleTypes();
   if (convertibleTypes == null) {
      Assert.state(converter instanceof ConditionalConverter,
            "Only conditional converters may return null convertible types");
      this.globalConverters.add(converter);
   } else {//循环所有的类型对，添加到map中
      for (ConvertiblePair convertiblePair : convertibleTypes) {
          //建立map对应关系 添加到 converters中 完成注册
         ConvertersForPair convertersForPair = getMatchableConverters(convertiblePair);
         convertersForPair.add(converter);//向列表首部添加
      }
   }
}
//先get null->new  nonull->add 感觉应该在这里  convertersForPair.add(converter);
private ConvertersForPair getMatchableConverters(ConvertiblePair convertiblePair) {
    ConvertersForPair convertersForPair = this.converters.get(convertiblePair);
    if (convertersForPair == null) {
        convertersForPair = new ConvertersForPair();
        this.converters.put(convertiblePair, convertersForPair);
    }
    return convertersForPair;
}
```
### 查询

GenericConversionService 提供了根据源数据类型和目标数据类型查找类型转换器功能

```java
public boolean canConvert(Class<?> sourceType, Class<?> targetType) {
   return canConvert((sourceType != null ? TypeDescriptor.valueOf(sourceType) : null),
         TypeDescriptor.valueOf(targetType));
}

public boolean canConvert(TypeDescriptor sourceType, TypeDescriptor targetType) {
   if (sourceType == null) {
      return true;
   }
   GenericConverter converter = getConverter(sourceType, targetType);
   return (converter != null);
}
```

在getConverter方法中调用 Converters查询map中维护的类型转换器，并将结果缓存起来

```java
protected GenericConverter getConverter(TypeDescriptor sourceType, TypeDescriptor targetType) {	 //先从缓存中查询
   ConverterCacheKey key = new ConverterCacheKey(sourceType, targetType);
   GenericConverter converter = this.converterCache.get(key);
   if (converter != null) {
      return (converter != NO_MATCH ? converter : null);
   }
   //调用Converters查询
   converter = this.converters.find(sourceType, targetType);
   if (converter == null) { //返回 NoOpConverter
      converter = getDefaultConverter(sourceType, targetType);
   }//缓存
   if (converter != null) {
      this.converterCache.put(key, converter);
      return converter;
   }  //缓存空值，避免缓存穿透
   //private static final GenericConverter NO_MATCH = new NoOpConverter("NO_MATCH");
   this.converterCache.put(key, NO_MATCH);
   return null;
}
//NoOpConverter 不进行转换，直接返回
private static class NoOpConverter implements GenericConverter {
		@Override
		public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
			return source;
		}
}
```

调用内部类Converters的find方法查询匹配的类型转换器，先根据源数据类型和目标数据类型查询，如果没有再循环父类和接口查询转换器

```java
public GenericConverter find(TypeDescriptor sourceType, TypeDescriptor targetType) {
   //获取源数据类型和目标数据类型的继承线上的类和接口
   List<Class<?>> sourceCandidates = getClassHierarchy(sourceType.getType());
   List<Class<?>> targetCandidates = getClassHierarchy(targetType.getType());
   for (Class<?> sourceCandidate : sourceCandidates) {
      for (Class<?> targetCandidate : targetCandidates) {
         ConvertiblePair convertiblePair = new ConvertiblePair(sourceCandidate, targetCandidate);
         GenericConverter converter = getRegisteredConverter(sourceType, targetType, convertiblePair);
         if (converter != null) {
            return converter;
         }
      }
   }
   return null;
}
private GenericConverter getRegisteredConverter(TypeDescriptor sourceType,
                              TypeDescriptor targetType, ConvertiblePair convertiblePair) {
    //从注册的map中 根据 convertiblePair查询转换器
    ConvertersForPair convertersForPair = this.converters.get(convertiblePair);
    if (convertersForPair != null) { //验证实现了ConditionalConverter的matches方法
        GenericConverter converter = convertersForPair.getConverter(sourceType, targetType);
        if (converter != null) {
            return converter;
        }
    }
    // Check ConditionalConverters for a dynamic match
    for (GenericConverter globalConverter : this.globalConverters) {
        if (((ConditionalConverter) globalConverter).matches(sourceType, targetType)) {
            return globalConverter;
        }
    }
    return null;
}
//验证matches方法 找到第一个匹配的Converter，由于添加的时候是addFirst，自定义的添加的转换器一定在前面，所以这里能保证优先使用自定义添加的转换器，matches不过再查找默认注册的
public GenericConverter getConverter(TypeDescriptor sourceType, TypeDescriptor targetType) {
    for (GenericConverter converter : this.converters) {
        if (!(converter instanceof ConditionalGenericConverter) ||
            ((ConditionalGenericConverter) converter).matches(sourceType, targetType)) {
            return converter;
        }
    }
    return null;
}
```

### 类型转换

GenericConversionService实现了ConversionService接口，提供了类型转换的具体实现，集中为所有Converter、GenericConverter、ConverterFactory的类型转换功能提供了一个入口，在这里体现了策略模式，GenericConversionService相当于是策略模式中的Context，用于选择策略

```java
public <T> T convert(Object source, Class<T> targetType) {
    return (T) convert(source, TypeDescriptor.forObject(source), TypeDescriptor.valueOf(targetType));
}
public Object convert(Object source, TypeDescriptor targetType) {
    return convert(source, TypeDescriptor.forObject(source), targetType);
}
public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
	//获取converter
    GenericConverter converter = getConverter(sourceType, targetType);
    if (converter != null) {//调用Converter的convert方法类型转换
        Object result = ConversionUtils.invokeConverter(converter, source, sourceType, targetType);
        return handleResult(sourceType, targetType, result);
    }
    return handleConverterNotFound(source, sourceType, targetType);
}
//调用converter的convert方法进行类型转换
public static Object invokeConverter(GenericConverter converter, Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
    return converter.convert(source, sourceType, targetType);
}
```

### ConversionServiceFactoryBean

在spring中使用ConversionServiceFactoryBean完成了集成ConversionService的功能，下面来看ConversionServiceFactoryBean的具体实现

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
	//....
}
```

从代码可以看出ConversionServiceFactoryBean实现了FactoryBean和InitializingBean，在初始化完成后创建了一个DefaultConversionService对象，然后调用ConversionServiceFactory的registerConverters注册自定义的类型转换器

```java
public static void registerConverters(Set<?> converters, ConverterRegistry registry) {
   if (converters != null) {
      for (Object converter : converters) {
         if (converter instanceof GenericConverter) {
            registry.addConverter((GenericConverter) converter);
         } else if (converter instanceof Converter<?, ?>) {
            registry.addConverter((Converter<?, ?>) converter);
         } else if (converter instanceof ConverterFactory<?, ?>) {
            registry.addConverterFactory((ConverterFactory<?, ?>) converter);
         } else {
            throw new IllegalArgumentException("...");
         }
      }
   }
}
```

注册、查找和转换的功能都是在GenericConversionService中实现，那么DefaultConversionService继承自GenericConversionService，又做了什么扩展或者具体实现呢

```java
public class DefaultConversionService extends GenericConversionService {
    
	private static volatile DefaultConversionService sharedInstance;
	public DefaultConversionService() {
		addDefaultConverters(this);
	}

	public static ConversionService getSharedInstance() {
		if (sharedInstance == null) {
			synchronized (DefaultConversionService.class) {
				if (sharedInstance == null) {
					sharedInstance = new DefaultConversionService();
				}
			}
		}
		return sharedInstance;
	}
    public static void addDefaultConverters(ConverterRegistry converterRegistry) {
        addScalarConverters(converterRegistry);
        addCollectionConverters(converterRegistry);
        converterRegistry.addConverter(new ByteBufferConverter((ConversionService) converterRegistry));
        if (jsr310Available) {
            Jsr310ConverterRegistrar.registerJsr310Converters(converterRegistry);
        }
        converterRegistry.addConverter(new ObjectToObjectConverter());
        converterRegistry.addConverter(new IdToEntityConverter((ConversionService) converterRegistry));
        converterRegistry.addConverter(new FallbackObjectToStringConverter());
        if (javaUtilOptionalClassAvailable) {
            converterRegistry.addConverter(new ObjectToOptionalConverter((ConversionService) converterRegistry));
        }
    }
}
```

看源码发现，DefaultConversionService提供了普通创建和单例创建两种模式，在ConversionServiceFactoryBean使用的是new，DefaultConversionService主要是在创建的时候注册了一系列的类型转换器

### 使用

实现LocalDateTime到String的转换

```java
public class LocalDateTime2StringConverter implements Converter<LocalDateTime, String> {
    @Override
    public String convert(LocalDateTime source) {
        if(source == null){
            return "";
        }
        return source.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }
}
```

针对枚举中有getCode方法的，使用 code值转换到枚举实例

```java
public class String2EnumConverter implements ConverterFactory<String, Enum>, ConditionalConverter {

    @Override
    public <T extends Enum> Converter<String, T> getConverter(Class<T> targetType) {
        return new String2EnumConverter.String2Enum(getEnumType(targetType));
    }

    @Override
    public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
        //限定该类型转换器 只针对有getCode方法的枚举
        try {
            Method getCodeMethod = targetType.getType().getMethod("getCode");
            if(getCodeMethod != null){
                return true;
            }
        } catch (NoSuchMethodException e) {
            return false;
        }
        return false;
    }

    private class String2Enum<T extends Enum> implements Converter<String, T> {
        private final Class<T> enumType;
        public String2Enum(Class<T> enumType) {
            this.enumType = enumType;
        }
        @Override
        public T convert(String source) {
            if (source.isEmpty()) {
                return null;
            }
            T[] enumConstants = enumType.getEnumConstants();
            try {//获取getCode方法
                Method getCode = enumType.getMethod("getCode");
                for(T obj : enumConstants){
                    //循环枚举中所有实例，并反射调用getCode方法获取code值，然后比较
                    if(source.trim().equals(getCode.invoke(obj))){
                        return obj;
                    }
                }
            } catch (Exception e) {
                return null;
            }
            return null;
        }
    }

    public Class<?> getEnumType(Class<?> targetType) {
        Class<?> enumType = targetType;
        while (enumType != null && !enumType.isEnum()) {
            enumType = enumType.getSuperclass();
        }
        if (enumType == null) {
            throw new RuntimeException("");
        }
        return enumType;
    }
}
```

Object转换到Optional，使用DefaultConversionService默认注册的。因为Optional是一个包装类型，所以转换是要转换为被Optional包装的内部类型。依赖conversionService根据Optional中的泛型类型转换。

```java
@UsesJava8
final class ObjectToOptionalConverter implements ConditionalGenericConverter {

   private final ConversionService conversionService;

   public ObjectToOptionalConverter(ConversionService conversionService) {
      this.conversionService = conversionService;
   }
	
   @Override//声明支持Collection->Optional ,Object[] -> Optional, Object -> Optional的转换
   public Set<ConvertiblePair> getConvertibleTypes() {
      Set<ConvertiblePair> convertibleTypes = new LinkedHashSet<ConvertiblePair>(4);
      convertibleTypes.add(new ConvertiblePair(Collection.class, Optional.class));
      convertibleTypes.add(new ConvertiblePair(Object[].class, Optional.class));
      convertibleTypes.add(new ConvertiblePair(Object.class, Optional.class));
      return convertibleTypes;
   }

   @Override
   public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
      if (targetType.getResolvableType() != null) {
         return this.conversionService.canConvert(sourceType, new GenericTypeDescriptor(targetType));
      }
      else {
         return true;
      }
   }

   @Override
   public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
      if (source == null) {
         return Optional.empty();
      } else if (source instanceof Optional) {
         return source;
      } else if (targetType.getResolvableType() != null) {
         Object target = this.conversionService.convert(source, sourceType, new GenericTypeDescriptor(targetType)); //转换为泛型
         if (target == null || (target.getClass().isArray() && Array.getLength(target) == 0) ||
                  (target instanceof Collection && ((Collection) target).isEmpty())) {
            return Optional.empty();
         }
         return Optional.of(target);
      } else {
         return Optional.of(source);
      }
   }
   @SuppressWarnings("serial")
   private static class GenericTypeDescriptor extends TypeDescriptor {
		//使用Optional中的泛型进行转换
      public GenericTypeDescriptor(TypeDescriptor typeDescriptor) {
         super(typeDescriptor.getResolvableType().getGeneric(), null, typeDescriptor.getAnnotations());
      }
   }

}
```