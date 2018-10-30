---
title: java8之Optional
date: 2017-08-05 11:58:46
tags:
- java8
categories:
- java基础
---

#  java8之Optional

开发过程中最常遇到的是空指针异常，jdk8对空指针进行了再次处理，Optional类就是一个简单的容器，可以通过`isPresent()`方法判断是否为空，然后通过`get()`方法返回容器中对象，但是这样用跟判断空没什么区别，Optional提供了一些其他的方法，可以避免这种判断

<!--more-->

## Optional实现

Optional是一个值容器。在Optional对象中维护了一个泛型类型的值

```java
public final class Optional<T> {
    /**
     * Common instance for {@code empty()}.
     */
    private static final Optional<?> EMPTY = new Optional<>();

    /**
     * If non-null, the value; if null, indicates no value is present
     */
    private final T value;

    private Optional() {
        this.value = null;
    }
  	private Optional(T value) {
        this.value = Objects.requireNonNull(value);
    }
}

```

## Optional用法

以下列出了Optional中的API用法

```java
//创建Optional实例，of方法必须不能为空
Optional<String> name = Optional.of("Sanaulla");

//创建没有值的Optional实例，例如值为'null'
Optional empty = Optional.ofNullable(null);
//创建空的Optional
//Optional empty = Optional.empty();

//isPresent方法用来检查Optional实例是否有值。
if (name.isPresent()) {
  //调用get()返回Optional值。
  System.out.println(name.get());
}

try {
  //在Optional实例上调用get()抛出NoSuchElementException。
  System.out.println(empty.get());
} catch (NoSuchElementException ex) {
  System.out.println(ex.getMessage());
}

//ifPresent方法接受lambda表达式参数。
//如果Optional值不为空，lambda表达式会处理并在其上执行操作。
name.ifPresent((value) -> {
  System.out.println("The length of the value is: " + value.length());
});

//如果有值orElse方法会返回Optional实例，否则返回传入的错误信息。
System.out.println(empty.orElse("There is no value present!"));
System.out.println(name.orElse("There is some value!"));

//orElseGet与orElse类似，区别在于传入的默认值。orElseGet接受lambda表达式生成默认值。只有当option中值真正为空的时候才会调用，是orElse的一种延迟实现
System.out.println(empty.orElseGet(() -> "Default Value"));
System.out.println(name.orElseGet(() -> "Default Value"));

try {
  //orElseThrow与orElse方法类似，区别在于返回值。
  //orElseThrow抛出由传入的lambda表达式/方法生成异常。
  empty.orElseThrow(RuntimeException::new);
} catch (Throwable ex) {
  System.out.println(ex.getMessage());
}

//map方法通过传入的lambda表达式修改Optonal实例默认值。
//lambda表达式返回值会包装为Optional实例。
Optional<String> upperName = name.map((value) -> value.toUpperCase());
System.out.println(upperName.orElse("No value found"));

//flatMap与map（Funtion）非常相似，区别在于lambda表达式的返回值。
//map方法的lambda表达式返回值可以是任何类型，但是返回值会包装成Optional实例。
//但是flatMap方法的lambda返回值总是Optional类型。
//如果值存在，就对该值执行提供的 mapping 函数调用， 返回一个 Optional 类型的值 ， 则就返回一个空的 Optional 对象
upperName = name.flatMap((value) -> Optional.of(value.toUpperCase()));
System.out.println(upperName.orElse("No value found"));

//filter方法检查Optiona值是否满足给定条件。
//如果满足返回Optional实例值，否则返回空Optional。
Optional<String> longName = name.filter((value) -> value.length() > 6);
System.out.println(longName.orElse("The name is less than 6 characters"));

//另一个示例，Optional值不满足给定条件。
Optional<String> anotherName = Optional.of("Sana");
Optional<String> shortName = anotherName.filter((value) -> value.length() > 6);
System.out.println(shortName.orElse("The name is less than 6 characters"));

//Optional的map方法接收一个function作为参数，修改Optional的值
Optional<Integer> mapValue = Optional.of(-1);
Optional<Integer> expectValue = mapValue.map(s -> Math.abs(s));
System.out.println(expectValue.get());
```



