---
title: equals和hashCode详解
date: 2019-06-16 10:02:24
tags:
- 基础
categories:
- java
---

# equals和hashCode详解

覆写equals方法的时候，一定要覆写hashCode方法，这是为什么呢？

经常有List<? super T>、Set<? extends T>的声明，是什么意思呢？<? super T>表示包括T在内的任何T的父类，<? extends T>表示包括T在内的任何T的子类。

equals和hashCode方法都是Object中的方法，首先来看Object中的实现

```java
public native int hashCode();//默认调用的是对象的内存地址

public boolean equals(Object obj) {
    return (this == obj);
}
```

```java
Object o = new Object();
System.out.println(o.hashCode() == System.identityHashCode(o));//true
```

通过测试可以看到Object类中的hashCode返回的是对象的地址，==比较的就是对象的地址，所以能够保证 hashCode相等的时候equals返回true，反之也同样成立。

看Object的文档注释，对hashCode方法有以下说明

- 主要用于基于hash tables的数据结构，例如HashMap，底层依赖对象的hashCode方法
- 在同一个应用中多次调用同一个对象的hashCode方法，每次返回的值一样，多个应用之间不保证
- 如果两个对象通过equals方法对比返回true，那么这两个对象调用hashCode返回的值必须一致
- 如果两个对象调用equals返回返回false，则两个对象调用hashCode返回的值可能一致，也可能不一致，如果能保证不一致是最好的，能高提供hash的辨识

为了保证hashCode的约束，所以在覆写equals方法的时候一定要覆写hashCode方法，从而保证当equals方法返回true的时候，调用hashCode返回的值一致

接下来又要问为什么hashCode要加这个约束呢，这要从hashCode的使用场景来说起，从文档中可以看出hashCode主要用于hash Tables数据结构的，HashMap是最常用的的hash table数据结构，回想HashMap的实现，数组+链表，添加元素的时候每次计算对象的hashCode用于判断放到哪个数组索引上，所以equals相同的对象一定要返回相同的hashCode。当hashCode相同的时候，如果equals返回false则开始构建链表，所以没有必要保证equals不同hashCode也一定不同

接下来来看下String的实现，String覆写了equals和hashCode方法。看下面例子及执行结果

```java
String s1 = new String("343");
String s2 = new String("343").intern();
String s3 = "343";
System.out.println(s1.hashCode());//50674
System.out.println(s2.hashCode());//50674
System.out.println(s3.hashCode());//50674
System.out.println(System.identityHashCode(s1));//2016447921
System.out.println(System.identityHashCode(s2));//666988784
System.out.println(System.identityHashCode(s3));//666988784
System.out.println(s1 == s2);//false 比较的是内存空间
System.out.println(s2 == s3);//true 比较的是内存空间 调用了intern方法
System.out.println(s1.equals(s2));//true
```



