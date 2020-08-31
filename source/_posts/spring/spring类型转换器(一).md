---
title: spring类型转换器(一)
date: 2018-11-22 15:39:11
tags:
- spring 
categories:
- spring

---

# spring类型转换器(一)

在spring容器初始化的时候，BeanDefinition中配置的bean的属性值一般都为String类型，如何将String类型转换为Bean中属性对应的类型呢，在这个过程中就需要用到类型转换器了。spring实例化bean过程中对属性值的转换主要是使用BeanWrapperImpl实现的。


首先来看下BeanWrapperImpl的使用

```java
@Data
public class TestBean {
    private Date birthday;
    private Dog dog;
    private ESex sex;
}

@Data
public class Dog {
    private String name;
    private Map<String,String> props;
    public Dog(){
        log.info("创建新的dog对象");
    }
    public Dog(String name){
        log.info("创建新的dog对象");
        this.name = name;
    }
}

@AllArgsConstructor
@Getter
public static enum ESex{
    MAlE(1),
    FAMALE(2);
    private int code;
}
```

定义一个处理日期的转换器

```java
public class DatePropertyEditor extends PropertyEditorSupport {
    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        SimpleDateFormat sf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        try {
            Date date = null;
            if(text != null) {
                date = sf.parse(String.valueOf(text));
            }
            super.setValue(date);
        } catch (ParseException e) {}
    }
}
```

创建一个BeanWrapperImpl用于包装目标bean(这里来模拟spring的内部实现)。然后注册Date类型的转换器，将值使用DatePropertyEditor转换为Date类型。调用setPropertyValue的时候，给testBean的birthday字段设置一个字符串类型的时间，在实际赋值的过程中会调用到类型转换器将字符串转换为日期类型。

```java
TestBean testBean = new TestBean();
BeanWrapperImpl beanWrapper = new BeanWrapperImpl(testBean);
//注册 当遇到对象属性类型为Date的时候，使用DatePropertyEditor对属性值进行处理
beanWrapper.registerCustomEditor(Date.class,new DatePropertyEditor());
beanWrapper.setPropertyValue("birthday","2018-11-29 12:12:12");//设置值
beanWrapper.setAutoGrowNestedPaths(true);//设置嵌套属性自动创建
beanWrapper.setPropertyValue("sex","MAlE");//将值根据枚举名字转换为枚举
beanWrapper.setPropertyValue("dog","小黑子");//将值直接作为 Dog构造函数的参数反射创建对象
beanWrapper.setPropertyValue("dog.props[color]","白色");//嵌套属性设置值
System.out.println(testBean.getBirthday());//Thu Nov 29 12:12:12 CST 2018
```

同样可以实现一个String trim的转换器

```java
public class StringPropertyEditor extends PropertyEditorSupport {
    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if(text != null){
            text = text.trim();
        }
        super.setValue(text);
    }
}
//指定目标类型为String时，使用该转换器
beanWrapper.registerCustomEditor(String.class,new DatePropertyEditor());
```

BeanWrapper支持嵌套属性的赋值，当存在嵌套属性的时候需要设置 setAutoGrowNestedPaths=true。

| 表达式    | 含义                                                         |
| --------- | ------------------------------------------------------------ |
| name      | 给属性name赋值，如果name是对象，将值作为该对象构造器的参数创建对象 |
| bean.name | 属性bean是一个对象，给对象bean中的name赋值,需设置            |
| name[1]   | 属性类型为array、list，给第n个下标赋值                       |
| name{key} | 属性为一个Map，指定key赋值，默认会创建LinkedHashMap          |

接下来我们就来研究一下BeanWrapperImpl的实现过程

## 属性编辑PropertyEditor

java.beans包中声明了一个PropertyEditor接口，用于提供对属性的访问和赋值。

```java
public interface PropertyEditor {
    void setValue(Object value);//设置值
    Object getValue();//获取属性编辑器的值
    String getAsText();//获取转换为String类型的值
    void setAsText(String text) throws java.lang.IllegalArgumentException;//用于转换String类型
}
```

PropertyEditor有个默认实现类PropertyEditorSupport,如果要自定义属性转换器，直接继承该类，然后覆写setAsText、getAsText、setValue、getValue方法。在类型转换的时候如果值是字符串会调用setAsText来赋值value，其他情况下会调用setValue来赋值value，然后再调用getValue获取改变后的value值完成类型转换。相当于将PropertyEditor当做一个加工作坊，传进去一个值，返回想要类型的值

```java
public class PropertyEditorSupport implements PropertyEditor {
    private Object value;
    public void setValue(Object value) {
        this.value = value;
        firePropertyChange();
    }
    public Object getValue() {
        return value;
    }
    public String getAsText() {
        return (this.value != null) ? this.value.toString() : null;
    }//覆盖实现
    public void setAsText(String text) throws java.lang.IllegalArgumentException {
        if (value instanceof String) {
            setValue(text);
            return;
        }
        throw new java.lang.IllegalArgumentException(text);
    }
}
```

**注意**：PropertyEditor是线程不安全的，有状态的，因此每次使用时都需要创建一个，不可重用；

## BeanWrapper

首先先看下BeanWrapperImpl的继承图。还有一个跟BeanWrapperImpl平级的实现类DirectFieldAccessor，用于处理getter和setter的字段访问

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/jq0yFa.jpg)

从图可以看出，BeanWrapperImpl实现了3个顶级接口，提供了对象属性访问、类型转换器的注册和查找、类型转换功能

- PropertyAccessor : 声明属性的访问功能的接口
- PropertyEditorRegistry: 声明类型转换器的注入和查找功能的接口
- TypeConverter : 声明类型转换功能的接口

### 注册\查找类型转换器

从继承图可以看到PropertyEditorRegistrySupport实现了PropertyEditorRegistry接口，该类默认实现了类型转换器的注册和查找功能

在PropertyEditorRegistrySupport声明了多个存储结构用于存储不同的类型转换器来源。这里需要注意的是PropertyEditor是存在在Map中的，目标类型作为key，所以对于一个类型只能注册一个PropertyEditor，后面注册的会覆盖前面注册的

```java
private ConversionService conversionService;//ConversionService转换器
private Map<Class<?>, PropertyEditor> defaultEditors;//自身默认创建的类型转换器
private Map<Class<?>, PropertyEditor> overriddenDefaultEditors;//
private Map<Class<?>, PropertyEditor> customEditors;//外界自定义添加的类型转换器
private Map<String, CustomEditorHolder> customEditorsForPath;//绑定字段名称的类型转换器
private Map<Class<?>, PropertyEditor> customEditorCache;//用于存储对应父类的类型转换器
```

同时还看到一个conversionService变量，spring提供了另一种类型转换接口Converter,通过conversionService调用对应的Converter进行类型转换，在PropertyEditorRegistrySupport同样可以注册进来conversionService，用于使用Converter进行类型转换。conversionService的详细使用会在下篇文章中讲到。

```java
public void setConversionService(ConversionService conversionService) {
   this.conversionService = conversionService;
}
```

接下来来看PropertyEditor的注册过程。

```java
public void registerCustomEditor(Class<?> requiredType, String propertyPath, PropertyEditor propertyEditor) {
   if (requiredType == null && propertyPath == null) {
      throw new IllegalArgumentException("Either requiredType or propertyPath is required");
   }
   //给属性名注册特定的类型转换器，添加到 customEditorsForPath
   if (propertyPath != null) {
      if (this.customEditorsForPath == null) {
         this.customEditorsForPath = new LinkedHashMap<String, CustomEditorHolder>(16);
      }//存储在customEditorsForPath
      this.customEditorsForPath.put(propertyPath, new CustomEditorHolder(propertyEditor, requiredType));
   } else { 注册自定义的类型转换器 添加到 customEditors
      if (this.customEditors == null) {
         this.customEditors = new LinkedHashMap<Class<?>, PropertyEditor>(16);
      }//存储在customEditors
      this.customEditors.put(requiredType, propertyEditor);
      this.customEditorCache = null;
   }
}
```

在上面提到过PropertyEditor存在在一个Map中，key是目标类型，那么这个参数propertyPath是干嘛的呢？这是为了给属性名指定专属的类型的转换器。因为一个目标类型只能有一个PropertyEditor的限制。但是有时候确实某个属性的类型转换比较特殊，这个时候就可以给这个属性名单独注册一个类型转换器，不会覆盖其他的哦。在类型转换的时候，会先根据属性名去customEditorsForPath中找可以用的PropertyEditor。

来看PropertyEditor的查找流程

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/tM8bJc.jpg)

首先根据属性名从customEditorsForPath查找特定的类型转换器

```java
public PropertyEditor findCustomEditor(Class<?> requiredType, String propertyPath) {
   Class<?> requiredTypeToUse = requiredType;
   if (propertyPath != null) {
      if (this.customEditorsForPath != null) {
         // Check property-specific editor first. 首先根据属性名称查找类型转换器
         PropertyEditor editor = getCustomEditor(propertyPath, requiredType);
         if (editor == null) {
            List<String> strippedPaths = new LinkedList<String>();
             //解析字段名， a.b[0]这种
            addStrippedPropertyPaths(strippedPaths, "", propertyPath);
            for (Iterator<String> it = strippedPaths.iterator(); it.hasNext() && editor == null;) {
               String strippedPath = it.next();
               editor = getCustomEditor(strippedPath, requiredType);
            }
         }
         if (editor != null) {
            return editor;
         }
      }
      if (requiredType == null) {//获取属性对应的类型 ，由子类实现
         requiredTypeToUse = getPropertyType(propertyPath);
      }
   }
   // No property-specific editor -> check type-specific editor.
   return getCustomEditor(requiredTypeToUse);
}
```

根据类型查找定义的类型转换器，如果没有对应的，则查找父类对应的类型转换器

```java
private PropertyEditor getCustomEditor(Class<?> requiredType) {
   if (requiredType == null || this.customEditors == null) {
      return null;
   }
   // Check directly registered editor for type.
   PropertyEditor editor = this.customEditors.get(requiredType);
   if (editor == null) {
      // Check cached editor for type, registered for superclass or interface.
      if (this.customEditorCache != null) {
         editor = this.customEditorCache.get(requiredType);
      }
      if (editor == null) {
         //遍历已有的类型转换器，如果类型是requiredType的父类则使用该类型转换器
         for (Iterator<Class<?>> it = this.customEditors.keySet().iterator(); it.hasNext() && editor == null;) {
            Class<?> key = it.next();
            if (key.isAssignableFrom(requiredType)) {
               editor = this.customEditors.get(key);
               if (this.customEditorCache == null) {//缓存起来
                  this.customEditorCache = new HashMap<Class<?>, PropertyEditor>();
               }
               this.customEditorCache.put(requiredType, editor);
            }
         }
      }
   }
   return editor;
}
```

PropertyEditorRegistrySupport 中默认添加了一些转换器，当调用 getDefaultEditor(requiredType)的时候会进行注册

```java
public PropertyEditor getDefaultEditor(Class<?> requiredType) {
   if (!this.defaultEditorsActive) {
      return null;
   }
   if (this.defaultEditors == null) {
      createDefaultEditors(); //先注册默认的转换器
   }
   return this.defaultEditors.get(requiredType);//获取默认注册的类型转换器
}
private void createDefaultEditors() {
    this.defaultEditors = new HashMap<Class<?>, PropertyEditor>(64);
    this.defaultEditors.put(Collection.class, new CustomCollectionEditor(Collection.class));
    this.defaultEditors.put(Set.class, new CustomCollectionEditor(Set.class));
    this.defaultEditors.put(SortedSet.class, new CustomCollectionEditor(SortedSet.class));
    this.defaultEditors.put(List.class, new CustomCollectionEditor(List.class));
    this.defaultEditors.put(SortedMap.class, new CustomMapEditor(SortedMap.class));
    this.defaultEditors.put(BigDecimal.class, new CustomNumberEditor(BigDecimal.class, true));
    //.....
}
```

### 类型转换

TypeConverter接口定义了将一个值转换为目标类型的值的功能。在继承图中可以看出TypeConverterSupport对类型转换提供了默认实现。

TypeConverterSupport将类型转换功能委托给typeConverterDelegate实现

```java
@Override
public <T> T convertIfNecessary(Object value, Class<T> requiredType) throws TypeMismatchException {
    return doConvert(value, requiredType, null, null);
}

private <T> T doConvert(Object value, Class<T> requiredType, MethodParameter methodParam, Field field) throws TypeMismatchException {
    if (field != null) {
        return this.typeConverterDelegate.convertIfNecessary(value, requiredType, field);
    }
    else {
        return this.typeConverterDelegate.convertIfNecessary(value, requiredType, methodParam);
    }
}
```

TypeConverterDelegate实现了类型转换的功能，创建TypeConverterDelegate的时候需要一个propertyEditorRegistry对象，用于查找匹配的类型转换器

```java
public TypeConverterDelegate(PropertyEditorRegistrySupport propertyEditorRegistry) {
   this(propertyEditorRegistry, null);
}
//转换功能
public <T> T convertIfNecessary(String propertyName, Object oldValue, Object newValue,
			Class<T> requiredType, TypeDescriptor typeDescriptor) throws IllegalArgumentException {
    //......
}
```

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/OoHBzf.jpg)

首先通过propertyEditorRegistry查找自定义的类型转换器PropertyEditor和ConversionService

```java
PropertyEditor editor = this.propertyEditorRegistry.findCustomEditor(requiredType, propertyName);
ConversionService conversionService = this.propertyEditorRegistry.getConversionService();
```

当该类型没有注册自定义的PropertyEditor，并且存在conversionService的时候，使用conversionService进行类型转换。如果conversionService中没有配置对应的converter，那么继续尝试使用默认注册的PropertyEditor。

```java
if (editor == null && conversionService != null && newValue != null && typeDescriptor != null) {
   TypeDescriptor sourceTypeDesc = TypeDescriptor.forObject(newValue);//获取value的类型
   //判断conversionService是否配置了指定类型的converter，没有直接跳过，继续向下执行
   if (conversionService.canConvert(sourceTypeDesc, typeDescriptor)) {//
      try {//使用conversionService完成类型转换
         return (T) conversionService.convert(newValue, sourceTypeDesc, typeDescriptor);
      }
      catch (ConversionFailedException ex) {
         // fallback to default conversion logic below
         conversionAttemptEx = ex;
      }
   }
}
```

如果目标类型存在自定义PropertyEditor 或者 目标类型和值类型不一样则需要进行类型转换(当没有找到ProperEditor的时候会尝试查找默认注册的PropertyEditor)

```java
if (editor != null || (requiredType != null && !ClassUtils.isAssignableValue(requiredType, convertedValue))) {
    //目标类型是Collection子类的时候，将String类型的值先根据 , 分割为字符串数组
   if (typeDescriptor != null && requiredType != null && Collection.class.isAssignableFrom(requiredType) &&
         convertedValue instanceof String) {
      TypeDescriptor elementTypeDesc = typeDescriptor.getElementTypeDescriptor();
      if (elementTypeDesc != null) {
         Class<?> elementType = elementTypeDesc.getType();
          //将值转换为String数组
         if (Class.class == elementType || Enum.class.isAssignableFrom(elementType)) {
            convertedValue = StringUtils.commaDelimitedListToStringArray((String) convertedValue);
         }
      }
   }//editor不存在，查找PropertyEditorRegistrySupport中默认注册的类型转换器
   if (editor == null) {
      editor = findDefaultEditor(requiredType);
   }//使用 PropertyEditor进行类型转换
   convertedValue = doConvertValue(oldValue, convertedValue, requiredType, editor);
}
```

类型转换，主要分三种情况处理，值类型不是字符串，值类型是字符串数组，值类型是字符串

```java
private Object doConvertValue(Object oldValue, Object newValue, Class<?> requiredType, PropertyEditor editor) {
    Object convertedValue = newValue;
    //当值不是String类型的时候，使用PropertyEditor的 setValue 和 getValue进行转换
    if (editor != null && !(convertedValue instanceof String)) {
        try {
            editor.setValue(convertedValue);
            Object newConvertedValue = editor.getValue();
            if (newConvertedValue != convertedValue) {
                convertedValue = newConvertedValue;
                //已完成类型转换，置为空，防止最后一步进行类型转换
                editor = null;
            }
        } catch (Exception ex) {
            //throw....
        }
    }

    Object returnValue = convertedValue;
    //当值为字符串数组，但是目标类型不是数组的时候，将值用,连接为字符串
    if (requiredType != null && !requiredType.isArray() && convertedValue instanceof String[])     {
        convertedValue = StringUtils.arrayToCommaDelimitedString((String[]) convertedValue);
    }
	//值为String类型，调用PropertyEditor的 setAsText进行转换
    if (convertedValue instanceof String) {
        if (editor != null) {
            // Use PropertyEditor's setAsText in case of a String value.
            String newTextValue = (String) convertedValue;
            return doConvertTextValue(oldValue, newTextValue, editor);
        } else if (String.class == requiredType) {
            returnValue = convertedValue;
        }
    }
    return returnValue;
}
//转换String类型的值，这里使用了oldValue触发属性改变事件并将原值传递给监听器。然后再设置新值
private Object doConvertTextValue(Object oldValue, String newTextValue, PropertyEditor editor) {
    try {
        editor.setValue(oldValue); //这里使用oldValue，用于触发属性改变事件
    } catch (Exception ex) {
        // Swallow and proceed.
    }//使用 setAsText 处理字符串类型的属性转换
    editor.setAsText(newTextValue);
    return editor.getValue();
}
```

最后，需要对转换后的值和目标类型进行判断，是否符合要求，如果不符合继续处理。这里主要处理了集合类型还有Number类型、基本类型转String、枚举类型。

```java
if (requiredType != null) {
    if (convertedValue != null) {
        if (Object.class == requiredType) {
            return (T) convertedValue;
        } else if (requiredType.isArray()) {
            // Array required -> apply appropriate conversion of elements.
            if (convertedValue instanceof String && Enum.class.isAssignableFrom(requiredType.getComponentType())) {
                convertedValue = StringUtils.commaDelimitedListToStringArray((String) convertedValue);
            }
            return (T) convertToTypedArray(convertedValue, propertyName, requiredType.getComponentType());
        } else if (convertedValue instanceof Collection) {
            // Convert elements to target type, if determined.
            convertedValue = convertToTypedCollection(
                (Collection<?>) convertedValue, propertyName, requiredType, typeDescriptor);
            standardConversion = true;
        }else if (convertedValue instanceof Map) {//值是map的时候，转换为 目标类型的map 
            convertedValue = convertToTypedMap(
                (Map<?, ?>) convertedValue, propertyName, requiredType, typeDescriptor);
            standardConversion = true;
        }
        if (convertedValue.getClass().isArray() && Array.getLength(convertedValue) == 1) {
            convertedValue = Array.get(convertedValue, 0);
            standardConversion = true;
        }//将基本类型 直接转换为String
        if (String.class == requiredType && ClassUtils.isPrimitiveOrWrapper(convertedValue.getClass())) {
            // We can stringify any primitive value...
            return (T) convertedValue.toString();
        } else if (convertedValue instanceof String && !requiredType.isInstance(convertedValue)) {
            if (conversionAttemptEx == null && !requiredType.isInterface() && !requiredType.isEnum()) {
                	//直接把值当做类型的构造函数的参数 反射创建目标类型对象
                    Constructor<T> strCtor = requiredType.getConstructor(String.class);
            }
            String trimmedValue = ((String) convertedValue).trim();
            if (requiredType.isEnum() && "".equals(trimmedValue)) {
                // It's an empty enum identifier: reset the enum value to null.
                return null;
            }//根据枚举名字 转换为枚举对象
            convertedValue = attemptToConvertStringToEnum(requiredType, trimmedValue, convertedValue);
            standardConversion = true;
        } else if (convertedValue instanceof Number && Number.class.isAssignableFrom(requiredType)) {//转换number类型
            convertedValue = NumberUtils.convertNumberToTargetClass(
                (Number) convertedValue, (Class<Number>) requiredType);
            standardConversion = true;
        }
    }
	//如果使用editor转换失败，再次尝试使用conversionService进行转换
    if (!ClassUtils.isAssignableValue(requiredType, convertedValue)) {
        TypeDescriptor sourceTypeDesc = TypeDescriptor.forObject(newValue);
            if (conversionService.canConvert(sourceTypeDesc, typeDescriptor)) {
                return (T) conversionService.convert(newValue, sourceTypeDesc, typeDescriptor);
            }
    }
}
```

在attemptToConvertStringToEnum方法中自动根据枚举的名称转换为枚举的对象

```java
Field enumField = requiredType.getField(trimmedValue);
ReflectionUtils.makeAccessible(enumField);
convertedValue = enumField.get(null);
```

### 属性访问

PropertyAccessor接口定义了属性访问的功能。通过实现setPropertyValue 和 getPropertyValue方法实现对象属性的赋值和访问。

AbstractPropertyAccessor实现了PropertyAccessor接口，不过没有对setPropertyValue和getPropertyValue进行实现，而是单独提供了一个 setPropertyValues的方法， 用于批量设置属性值，同时可以通过 ignoreUnknown和ignoreInvalid参数忽略未知的属性

```java
public void setPropertyValues(PropertyValues pvs, boolean ignoreUnknown, boolean ignoreInvalid) throws BeansException {
    List<PropertyAccessException> propertyAccessExceptions = null;
    List<PropertyValue> propertyValues = pvs instanceof MutablePropertyValues ? ((MutablePropertyValues)pvs).getPropertyValueList() : Arrays.asList(pvs.getPropertyValues());
    Iterator var6 = propertyValues.iterator();
    while(var6.hasNext()) {
        PropertyValue pv = (PropertyValue)var6.next();
        try {
            this.setPropertyValue(pv);//调用子类实现的setPropertyValue方法
        } catch (NotWritablePropertyException var9) {
            if (!ignoreUnknown) {
                throw var9;
            }
        } catch (NullValueInNestedPathException var10) {
            if (!ignoreInvalid) {
                throw var10;
            }
        }
    }
}
```

在AbstractNestablePropertyAccessor类中实现了setPropertyValue和getPropertyValue功能。

```java
@Override
public void setPropertyValue(String propertyName, Object value) throws BeansException {
   AbstractNestablePropertyAccessor nestedPa;
   //用于解决 name.map[key] 类型的属性注入
   nestedPa = getPropertyAccessorForPropertyPath(propertyName);
   PropertyTokenHolder tokens = getPropertyNameTokens(getFinalPath(nestedPa, propertyName));
   //为属性赋值
    nestedPa.setPropertyValue(tokens, new PropertyValue(propertyName, value));
}
```

由于存在嵌套属性赋值的情况,对于嵌套的处理，其实只需要对嵌套的最底层进行类型转换，上层每一层就创建默认的值然后set到再上层对象的属性中。在这里spring使用了递归解决这个问题，创建每一层属性的对象值，使用BeanWrapper包装该对象，那么又是一个BeanWrapperImpl的赋值流程。

```java
/**
* 例如 处理 beanWrapper.setPropertyValue("dog.props[color]","白色");
*/
protected AbstractNestablePropertyAccessor getPropertyAccessorForPropertyPath(String propertyPath) {
   int pos = PropertyAccessorUtils.getFirstNestedPropertySeparatorIndex(propertyPath);
  //递归发生在这里
   if (pos > -1) {
       //解析出最上层的属性名。
      String nestedProperty = propertyPath.substring(0, pos);//dog
      String nestedPath = propertyPath.substring(pos + 1);//剩下的属性路径 props[color]
       //针对最上层的属性 创建AbstractNestablePropertyAccessor 包装该对象并赋值
      AbstractNestablePropertyAccessor nestedPa = getNestedPropertyAccessor(nestedProperty);
      //递归调用 直到完成 testBean注入了dog 返回对dog的包装，后续对dog的props属性处理
       return nestedPa.getPropertyAccessorForPropertyPath(nestedPath); //处理props属性注入
   } else {//不存在嵌套属性，直接返回自己，只需要对自己本身依赖的属性赋值
      return this;
   }
}
```
来看这个递归的内部实现，在getNestedPropertyAccessor完成对外层属性的初始化和将该值赋值到所依赖的对象中。然后使用BeanWrapper封装属性对象，后续走属性对象的赋值流程
```java
private AbstractNestablePropertyAccessor getNestedPropertyAccessor(String nestedProperty) {
   if (this.nestedPropertyAccessors == null) {
      this.nestedPropertyAccessors = new HashMap<String, AbstractNestablePropertyAccessor>();
   }
   // Get value of bean property.
   PropertyTokenHolder tokens = getPropertyNameTokens(nestedProperty);
   String canonicalName = tokens.canonicalName;
   Object value = getPropertyValue(tokens);//获取对象中该属性的值
   if (value == null || (value.getClass() == javaUtilOptionalClass && OptionalUnwrapper.isEmpty(value))) {
      if (isAutoGrowNestedPaths()) {//设置允许自动创建嵌套属性
          //值为空，嵌套的都是对象，这里就是反射创建属性对象，并将该对象set到宿主对象中
         value = setDefaultValue(tokens);
      } else {//不允许的情况下 抛出异常 结束
         throw new NullValueInNestedPathException(getRootClass(), this.nestedPath + canonicalName);
      }
   }
   // Lookup cached sub-PropertyAccessor, create new one if not found.
   AbstractNestablePropertyAccessor nestedPa = this.nestedPropertyAccessors.get(canonicalName);
   if (nestedPa == null || nestedPa.getWrappedInstance() !=
         (value.getClass() == javaUtilOptionalClass ? OptionalUnwrapper.unwrap(value) : value)) {
   	//再次使用BeanWrapper包装 该属性对象，接下来就是对属性对象的递归赋值
      nestedPa = newNestedPropertyAccessor(value, this.nestedPath + canonicalName + NESTED_PROPERTY_SEPARATOR);
      // 继承外层对象的类型转换器
      copyDefaultEditorsTo(nestedPa);
      copyCustomEditorsTo(nestedPa, canonicalName);
      this.nestedPropertyAccessors.put(canonicalName, nestedPa);
   }
   return nestedPa;
}
```

创建属性对象，并将该对象set到宿主对象。因为对象是指针引用的，所以在这步已经完成对宿主对象的属性赋值，接下来的流程只要对属性对象中的依赖属性进行赋值。

```java
private Object setDefaultValue(PropertyTokenHolder tokens) {
   PropertyValue pv = createDefaultPropertyValue(tokens);//创建对应类型的默认值
   setPropertyValue(tokens, pv);
    //这里先set 然后再get 为了应用宿主对象中的类型转换器对值进行转换
   return getPropertyValue(tokens);
}
```

使用递归解决了嵌套赋值的问题，那么接下来就是针对最底层BeanWrapperImpl的属性赋值流程

```java
protected void setPropertyValue(PropertyTokenHolder tokens, PropertyValue pv) throws BeansException {
    if (tokens.keys != null) {//解决集合 map类型的赋值
        processKeyedProperty(tokens, pv);//解决 map[key]的情况
    } else {
        processLocalProperty(tokens, pv);//赋值
    }
}
```

在processLocalProperty方法中，首先通过子类获取属性处理器，通过PropertyHandler对属性赋值。在赋值之前再次判断属性是否已经进行了类型转换，如果没有再次调用类型转换器进行转换，如果已经完成类型转换，使用ConvertedValue

```java
PropertyHandler ph = getLocalPropertyHandler(tokens.actualName);//子类提供的钩子方法
Object originalValue = pv.getValue();
Object valueToApply = originalValue;
if (!Boolean.FALSE.equals(pv.conversionNecessary)) {
    if (pv.isConverted()) {//如果已经完成类型转换，取类型转换后的值
        valueToApply = pv.getConvertedValue();
    } else {//未完成类型转换的，再次调用类型转换器进行转换
        valueToApply = convertForProperty(
            tokens.canonicalName, oldValue, originalValue, ph.toTypeDescriptor());
    }
    pv.getOriginalPropertyValue().conversionNecessary = (valueToApply != originalValue);
}
ph.setValue(this.wrappedObject, valueToApply);
```

对属性的访问和设置spring进行了更小粒度的封装。提供了 PropertyHandler抽象类。为什么在这里进行抽象，看PropertyHandler的两个实现，可以看到一个是BeanPropertyHandler，一个是FieldPropertyHandler，不难想象，属性一种是由getter和setter方法进行访问，一种是没有getter和setter直接反射字段进行的。

如果要对map进行控制，我们可以再提供一个专门处理map的实现了类handler

```java
//定义在父类中的内部抽象类
protected abstract static class PropertyHandler {
    private final Class<?> propertyType;
    private final boolean readable;
    private final boolean writable;
    public abstract Object getValue() throws Exception;
    public abstract void setValue(Object object, Object value) throws Exception;
}
```
BeanWrapperImpl提供了BeanPropertyHandler，将setter和getter传入
```java
@Override
protected BeanPropertyHandler getLocalPropertyHandler(String propertyName) {
    //反射获取
   PropertyDescriptor pd = getCachedIntrospectionResults().getPropertyDescriptor(propertyName);
   return (pd != null ? new BeanPropertyHandler(pd) : null);
}
```

BeanPropertyHandler提供对setter和getter的访问

```java
private class BeanPropertyHandler extends PropertyHandler {
   private final PropertyDescriptor pd;
   @Override
   public ResolvableType getResolvableType() {
      return ResolvableType.forMethodReturnType(this.pd.getReadMethod());
   }

   @Override
   public Object getValue() throws Exception {
      final Method readMethod = this.pd.getReadMethod();
      return readMethod.invoke(getWrappedInstance(), (Object[]) null);
   }
   @Override
   public void setValue(final Object object, Object valueToApply) throws Exception {
       final Method writeMethod = (this.pd instanceof GenericTypeAwarePropertyDescriptor ?
                                   ((GenericTypeAwarePropertyDescriptor) this.pd).getWriteMethodForActualAccess() :
                                   this.pd.getWriteMethod());

       writeMethod.invoke(getWrappedInstance(), value);
   }
}
```

AbstractNestablePropertyAccessor的另一个实现类DirectFieldAccessor，专门用于给字段赋值，不依赖setter和getter，那么这个是怎么实现的，看源码发现是DirectFieldAccessor中提供了一个PropertyHandler的实现类，通过Field的反射实现了setValue和getValue

```java
private class FieldPropertyHandler extends PropertyHandler {
   private final Field field;

   public FieldPropertyHandler(Field field) {
      super(field.getType(), true, true);
      this.field = field;
   }
   @Override
   public Object getValue() throws Exception {
       return this.field.get(getWrappedInstance());
   }
   @Override
   public void setValue(Object object, Object value) throws Exception {
            this.field.set(object, value);
   }
}
```

