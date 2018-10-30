---
title: java8之Comparator
date: 2017-08-05 10:58:46
tags:
- java8
categories:
- java基础
---

# java8之Comparator

java8新提供了一个Comparator方法接口，通过实现Comparator接口可以实现对象的排序。Comparator接口中提供了一些默认方法来更加方便使用排序，通过静态方法提供了一些java8内部实现Comparator的实现类对象，比如正序Comparator，逆序Comparator，处理Null的NullComparator。

<!--more-->

## Comparator的使用

- 首先创建一个Person的list

  ```java
  Person p1 = new Person(1, "zhangsan", 1, 12);
  Person p2 = new Person(2, "lisi", 1, 10);
  Person p3 = new Person(3, "xiaohong", 2, 18);
  Person p4 = new Person(4, null, 2, 8);
  List<Person> list = Lists.newArrayList(p1,p2,p3,p4);
  ```

- 通过lambda表达式创建一个Comparator

  ```java
  List<Person> list1 = list.stream().sorted((s1, s2) -> s1.getAge() - s2.getAge()).collect(Collectors.toList());
  System.out.println(list1);
  ```

- Comparator提供了静态方法创建Comparator的实现类

  ```java
  List<Person> list2 = list.stream().sorted(Comparator.comparingInt(Person::getAge)).collect(Collectors.toList());
  System.out.println(list2);
  ```

- 可以通过reversed方法实现反序

  ```java
  List<Person> list3 = list.stream().sorted(Comparator.comparingInt(Person::getAge).reversed()).collect(Collectors.toList());
  System.out.println(list3);
  ```

- Comparator提供了静态方法 reverseOrder 和natureOrder用于创建比较器，创建的时候需要制定泛型

  ```java
  Comparator<Integer> tComparator = Comparator.reverseOrder();
  List<Integer> list4 = list.stream().map(Person::getAge).sorted(tComparator).collect(Collectors.toList());
  System.out.println(list4);
  ```

- 通过thenComparing 实现优先根据a排序，然后根据b排序

  ```java
  List<Person> list5 = list.stream().sorted(Comparator.comparingInt(Person::getAge).thenComparingInt(Person::getId).reversed()).collect(Collectors.toList());
  System.out.println(list5);
  ```

- 通过 nullsFirst 和 nullsLast 对空对象进行排序

  ```java
  List<String> list6 = list.stream().map(Person::getName).sorted(Comparator.nullsFirst(Comparator.comparing(s -> {return s;}))).collect(Collectors.toList());
  System.out.println(list6);
  ```

## 源码简析

- Comparator是个方法接口，只有一个compare方法是抽象的需要实现类去实现的,compare方法通过返回1、0、-1实现排序

  ```java
  @FunctionalInterface
  public interface Comparator<T> {
      int compare(T o1, T o2);
  }
  ```

- Comparator中有些默认方法**thenComparing**，接收一个Comparator对象，对排序后的集合再次排序。先用调用方Comparator进行排序，如果排序结果为0，即两个对象相等，就再用下一个比较器再次比较，如果前一个比较器已经分出大小，不再使用下一个比较器进行比较。

  ```java
  default Comparator<T> thenComparing(Comparator<? super T> other) {
      Objects.requireNonNull(other);
      return (Comparator<T> & Serializable) (c1, c2) -> {
          //先用前面一个Comparator排序
          int res = compare(c1, c2);
          //再用参数的Comparator排序
          return (res != 0) ? res : other.compare(c1, c2);
      };
  }
  ```

- thenComparing的重构方法，可以传递一个处理对象的function，然后针对处理后的结果进行排序

  ```java
  default <U> Comparator<T> thenComparing(Function<? super T, ? extends U> keyExtractor,
              Comparator<? super U> keyComparator)
  {
      return thenComparing(comparing(keyExtractor, keyComparator));
  }
  ```

- Comparator接口中静态方法创建Comparator对象。接受一个比较对象的处理器和Comparator比较器作为参数。

  ```java
  public static <T, U> Comparator<T> comparing(
              Function<? super T, ? extends U> keyExtractor,
              Comparator<? super U> keyComparator)
  {
      Objects.requireNonNull(keyExtractor);
      Objects.requireNonNull(keyComparator);
      return (Comparator<T> & Serializable)
          (c1, c2) -> keyComparator.compare(keyExtractor.apply(c1),
                                            keyExtractor.apply(c2));
  }
  ```

- 上面方法的重构方法，要求要比较的对象必须实现了**Comparable**接口，这样就不用传递比较器了，直接使用对象的**compareTo**方法进行比较

  ```java
  public static <T, U extends Comparable<? super U>> Comparator<T> comparing(
              Function<? super T, ? extends U> keyExtractor)
  {
      Objects.requireNonNull(keyExtractor);
      return (Comparator<T> & Serializable)
          (c1, c2) -> keyExtractor.apply(c1).compareTo(keyExtractor.apply(c2));
  }
  ```

- 针对基本类型，提供了单独处理基本类型的方法,内部其实就是指定将比较对象转换为对应的基本类型，然后调用compare方法进行实现的

  ```java
  public static <T> Comparator<T> comparingInt(ToIntFunction<? super T> keyExtractor) {
          Objects.requireNonNull(keyExtractor);
          return (Comparator<T> & Serializable)
              (c1, c2) -> Integer.compare(keyExtractor.applyAsInt(c1), keyExtractor.applyAsInt(c2));
      }
  ```

## jdk Comparator实现

- 正序的Comparator

  ```java
  public static <T extends Comparable<? super T>> Comparator<T> naturalOrder() {
      return (Comparator<T>) Comparators.NaturalOrderComparator.INSTANCE;
  }
  ```

  Comparators的内部枚举类，实现了Comparator接口

  ```java
  enum NaturalOrderComparator implements Comparator<Comparable<Object>> {
      //枚举实现饿汉式
      INSTANCE;
      @Override
      public int compare(Comparable<Object> c1, Comparable<Object> c2) {
          return c1.compareTo(c2);
      }
      @Override
      public Comparator<Comparable<Object>> reversed() {
          return Comparator.reverseOrder();
      }
  }
  ```

- 反序的Comparator，实现接口的 **compare**方法，覆写了接口的**reversed**方法

  ```java
  private static class ReverseComparator
      implements Comparator<Comparable<Object>>, Serializable {
      //饿汉式实现
      static final ReverseComparator REVERSE_ORDER = new ReverseComparator();
      public int compare(Comparable<Object> c1, Comparable<Object> c2) {
          //c2在前实现逆序
          return c2.compareTo(c1);
      }
      private Object readResolve() { return Collections.reverseOrder(); }
      @Override
      public Comparator<Comparable<Object>> reversed() {
          //返回正序
          return Comparator.naturalOrder();
      }
  }
  ```

- 空对象比较器NullComparator,通过一个变量**nullFirst**来决定空对象放在首部还是尾部。包装一个比较器，在创建NullComparator的时候需要传入一个比较器和空对象的位置

  ```java
  final static class NullComparator<T> implements Comparator<T>, Serializable {
      private final boolean nullFirst;
      // if null, non-null Ts are considered equal
      private final Comparator<T> real;
      @SuppressWarnings("unchecked")
      //创建的时候必须要决定空对象的位置，传入一个比较器
      NullComparator(boolean nullFirst, Comparator<? super T> real) {
          this.nullFirst = nullFirst;
          this.real = (Comparator<T>) real;
      }
      //处理空对象的比较，非空对象之间的比较依赖传入的比较器进行处理
      @Override
      public int compare(T a, T b) {
          //对null进行比大小
          if (a == null) {
              return (b == null) ? 0 : (nullFirst ? -1 : 1);
          } else if (b == null) {
              return nullFirst ? 1: -1;
          } else {
              return (real == null) ? 0 : real.compare(a, b);
          }
      }
      @Override
      public Comparator<T> thenComparing(Comparator<? super T> other) {
          Objects.requireNonNull(other);
          return new NullComparator<>(nullFirst, real == null ? other : real.thenComparing(other));
      }
  
      @Override
      public Comparator<T> reversed() {
          //覆写 reversed的方法，创建一个NullComparator 单独处理下空对象
          return new NullComparator<>(!nullFirst, real == null ? null : real.reversed());
      }
  }
  ```

