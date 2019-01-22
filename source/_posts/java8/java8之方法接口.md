---
title: java8之方法接口
date: 2017-08-05 07:58:46
tags:
- java8
categories:
- java基础
---

# java8之方法接口

## 方法接口

### 定义

一个只声明了一个抽象方法的接口，可以认定为一个方法接口，方法接口可以使用lambda表达式进行实现。在接口上添加**@FunctionalInterface**注解，可以显示的声明该接口为方法接口(非必须)。

### 默认方法

jdk8之前的接口只能有抽象方法，一旦给接口添加新的方法，所有的实现类都必须进行改动，这对整个系统的影响范围太大，jdk8允许在接口中声明**默认方法**，在方法前面显示声明**default**,所有的实现类都会默认继承接口中的默认方法，通过默认方法可以很友好的扩展接口的功能，而且不会破坏方法接口。

默认方法和抽象方法的区别是抽象方法必须要被实现，默认方法不需要，实现类会继承默认方法，同时可以覆盖默认方法。

### 静态方法

接口可以定义静态方法，一般可以通过接口中的静态方法中创建该接口的匿名实现，方便对接口的使用，jdk8之后有了lambda表达式，可以更加方便的操作接口的实现。

## 内置方法接口

**operation**运算符,**binary** 二元（就是数学里二元一次方程那个二元,代表2个的意思）,双重的

### Function

函数，接受一个参数,返回一个值

### Consumer

消费者，该接口对应的方法类型为接收一个参数，没有返回值

### Supplier

提供者,和上面的消费者相反，该接口对应的方法类型为不接受参数，但是提供一个返回值

### Predicate

预言，判断是否的接口，该接口对应的方法为接收一个参数，返回一个Boolean类型值，多用于判断与过滤，是一个特殊的Funcation

### Operator接口

一种特殊的function接口实现，参数类型和返回值类型相同。提供了UnaryOperator(一个参数)、BinaryOperator(两个参数)两个接口。

```java
@FunctionalInterface
public interface UnaryOperator<T> extends Function<T, T> {}
```

### 类型限制接口

**参数类型**

例如IntPredicate,LongPredicate, DoublePredicate，这几个接口，都是在基于Predicate接口的，不同的就是他们的泛型类型分别变成了Integer,Long,Double,IntConsumer,LongConsumer, DoubleConsumer比如这几个,对应的就是Consumer,Consumer,Consumer,其余的是一样的道理，就不再举例子了

**返回值类型**

和参数类型相似，通过限制返回值类型定义接口，例如IntToDoubleFunction,IntToLongFunction, 很明显就是对应的Funtion 与Fcuntion，只是命名的规则上多了一个To。参数限制与返回值限制的命名唯一不同就是To,**前面不带To的都是参数类型限制,带To的是返回值类型限制**

### 数量限制接口

有些接口需要接受两名参数,此类接口的所有名字前面都是附加上**Bi**,是Binary的缩写，例如BiConsumer、BiPredicate,BiFcuntion

## 默认方法

- 默认方法由default修饰符修饰
- 默认方法的引入，就是为了解决当需要改动接口时，导致所有的实现类都需要改动的不足之处。有了默认方法之后，所有的实现类都会有一个默认的实现。
- 默认方法两种情况 ：可选方法和行为的多继承
- 可选方法：实现类在不需要remove方法时候，不再需要去实现remove方法了，在接口的remove中抛异常，接口自身实现了默认适配，避免实现类去实现自己不关心的方法。

```java
interface Iterator<T> { 
  boolean hasNext();
  T next();
  default void remove() {
    throw new UnsupportedOperationException();
  }
}
```

默认方法带来了多继承问题，当遇到这个问题时，java遵循以下原则来选择继承方法

- 类优先于接口。 如果一个子类继承的父类和接口有相同的方法实现。 那么子类继承父类的方法
- 子类型中的方法优先于父类型中的方法。
- 如果以上条件都不满足， 则必须显示覆盖/实现其方法，或者声明成abstract。

## 函数式编程

函数式编程思想：

- 接受0个或多个参数，返回0个或多个结果，
- 不涉及修改其他共享变量
- 函数不会产生副作用(幂等)
- 函数式方法不可抛出任何异常
- 面向对象编程是对数据进行抽象，而函数式编程是对行为进行抽象
- 函数式编程:核心是在于思考问题时，**使用不可变值和函数，函数对一个值进行处理，映射成另一个值**

