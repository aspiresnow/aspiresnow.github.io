---
title: 泛型
date: 2017-10-16 10:02:24
tags:
- 反射
categories:
- java
---

# 泛型

### Java 泛型中? super T和? extends T的区别

​	经常有List<? super T>、Set<? extends T>的声明，是什么意思呢？<? super T>表示包括T在内的任何T的父类，<? extends T>表示包括T在内的任何T的子类。

<!--more-->

####  super

​	List<? super Integer> foo3的通配符声明，意味着以下赋值是合法的，所以对List的操作必须要满足下面三个语法检查通过才行。

```java
// Integer is a "superclass" of Integer (in this context)
List<? super Integer> foo3 = new ArrayList<Integer>();
// Number is a superclass of Integer
List<? super Integer> foo3 = new ArrayList<Number>();
// Object is a superclass of Integer
List<? super Integer> foo3 = new ArrayList<Object>();
```

- 读取List<? super Integer> foo3，可能读取到Integer、Number、Object
- 向List<? super Integer> foo3 add元素的时候只能添加Integer

####  extends

​	List<? extends Number> foo3的通配符声明，意味着以下的赋值是合法的,以对List的操作必须要满足下面三个语法检查通过才行。

```java
// Number "extends" Number (in this context)
List<? extends Number> foo3 = new ArrayList<Number>(); 
// Integer extends Number
List<? extends Number> foo3 = new ArrayList<Integer>();
// Double extends Number
List<? extends Number> foo3 = new ArrayList<Double>();
```

- 读取List<? extends Number> foo3 可能读取到Number、Integer、Double等，所以只能使用父类(Number)来接收返回值
- 向List<? extendsInteger> foo3 add元素的时候既不能添加Number也不能添加Number的子类，存任何一种都可能冲突，只能存入NULL值

#### 总结

PECS原则：生产者（Producer）使用extends，消费者（Consumer）使用super。

- **生产者使用extends**

  如果你需要一个列表提供T类型的元素（即你想从列表中读取T类型的元素），你需要把这个列表声明成<? extends T>，比如List<? extends Integer>，因此你不能往该列表中添加任何元素。

- **消费者使用super**  

  如果需要一个列表使用T类型的元素（即你想把T类型的元素加入到列表中），你需要把这个列表声明成<? super T>，比如List<? super Integer>，因此你不能保证从中读取到的元素的类型。

- **即是生产者，也是消费者**

  如果一个列表即要生产，又要消费，你不能使用泛型通配符声明列表，比如List<Integer>。

- **例子**

```java
public static <T> void copy(List<? super T> dest, List<? extends T> src) {
  int srcSize = src.size();
  if (srcSize > dest.size())
    throw new IndexOutOfBoundsException("Source does not fit in dest");

  if (srcSize < COPY_THRESHOLD ||
      (src instanceof RandomAccess && dest instanceof RandomAccess)) {
    for (int i=0; i<srcSize; i++)
      dest.set(i, src.get(i));
  } else {
    ListIterator<? super T> di=dest.listIterator();
    ListIterator<? extends T> si=src.listIterator();
    for (int i=0; i<srcSize; i++) {
      di.next();
      di.set(si.next());
    }
  }
}
```

## 参考

[Java 泛型中? super T和? extends T的区别](http://www.codeceo.com/article/java-super-t-extends-t.html)	