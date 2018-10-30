---
title: java8之lambda表达式
date: 2017-08-05 08:58:46
tags:
- java8
categories:
- java基础
---

# java8之lambda表达式

为了使方法更加的灵活，可以将行为作为参数传递，这样就需要用到匿名内部类，为了简化匿名内部类的书写，jdk8推出了lambda表达式，lambda表达式基本上就是一个只有一个抽象方法的匿名内部类对象，通过使用lambda表达式能够使代码更加的简洁。

<!--more-->

## lambda语法

lambda表达式格式常见的有两种 **(parameters) -> expression**，**(parameters) -> { statements; }**主要包括三个方面

- 参数列表：有时可以省略参数的类型
- 箭头：用于分隔参数列表和方法体
- lambda主体(方法体)：当有返回值并且只有一行方法体的时候可以省略 return和{} (**必须同时省略return和{}**)

例如使用lambda表达式可以简化匿名内部类

```java
//传统的使用匿名内部类
Comparator<String> cpr1 = new Comparator<String>() {
  @Override
  public int compare(String o1, String o2) {
    return 0;
  }
};
//使用lambada表达式,当有返回值并且只有一行方法体的时候可以省略 return和{}
Comparator<String> cpr2 = (String o1,String o2) -> o1.compareTo(o2);
```

## 方法引用

方法引用语法格式有以下四种：

```java
objectName::instanceMethod//把lambda表达式的参数直接当成instanceMethod的参数来调用。比如System.out::println等同于x->System.out.println(x)
ClassName::staticMethod//把lambda表达式的参数直接当成staticMethod的参数来调用。比如Math::max等同于(x, y)->Math.max(x,y)
ClassName::instanceMethod //把lambda表达式的第一个参数当成instanceMethod的调用对象，其他剩余参数当成该方法的参数。比如String::toLowerCase等同于x->x.toLowerCase()
ClassName::new //把lambda表达式的参数当成ClassName构造器的参数 。例如BigDecimal::new等同于x->new BigDecimal(x)
```

## lambda与匿名内部类

匿名类和Lambda表达式中的this和super的含义是不同的。

- 在匿名类中，this代表的是匿名类自身，匿名类可以覆盖外部类的变量，匿名内部类只能访问final修改的变量
- 在Lambda中，this指的是声明lambda表达式的外部对象。Lambda表达式不能覆盖外部类的变量。lambda表达式隐式的将使用的外部变量定义为final。

