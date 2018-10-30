---
title: java8之Stream流
date: 2017-08-05 09:58:46
tags:
- java8
categories:
- java基础
---

# java8之Stream流

Stream是java8的新特性之一，为了方便操作集合类数据结构，结合lambda表达式能够更好的处理集合的遍历、查询、映射、聚合等操作。

<!--more-->

## 原理

### 流的工作过程

- 一个数据源(如集合)来执行一个查询;
- 多个中间操作链，形成一条流的流水线;
- 一个终端操作，执行流水线，并能生成结果。

### 特点

- 数据源可以是无限，但是不存储任何数据
- 流只能遍历一次，遍历完后，流就被关闭了，如果要再次遍历，需要重新获取一下
- 支持并行，充分利用计算机多核CPU的特性

### 操作类型：

- **Intermediate**：一个流可以后面跟随零个或多个 intermediate 操作。其目的主要是打开流，做出某种程度的数据映射/过滤，然后返回一个新的流，交给下一个操作使用。这类操作都是**惰性化**的，就是说，仅仅调用到这类方法，并没有真正开始流的遍历。
- **Terminal**：一个流只能有一个 terminal 操作，当这个操作执行后，流就关闭了，无法再被操作。所以这必定是流的最后一个操作。Terminal 操作的执行，才会真正开始流的遍历，并且会生成一个结果。

注意:**流是从一串中间操作到一个终端操作为一个循环执行，然后再从第一个中间操作开始循环流中的元素，而不是每个中间操作遍历完后再遍历下一个中间操作。**

### 并行(paralleStream)

- jdk8可以充分利用多核CPU的特性，实现并行处理。在使用流的时候调用**.paralle()**就可以获取一个并行流
- 并行流内部默认使用**ForkJoinPool**，默认的线程数量就是处理器的数量，这个值由Runtime.getRuntime().availableProcessors()得到的。**可 以 通 过 java.util.concurrent.ForkJoinPool.common. parallelism来改变线程大小**
- 在使用并行流的时候，一定要保证操作是无状态的，不然会遇到一些不可知的问题
- 影响并行流性能的五要素是：数据大小、源数据结构、值是否装箱、可用的 CPU 核数量，以及处理每个元素所花的时间 

### 基本类型流

在对包装类型操作时，存在着大量的拆箱和装箱操作，为了避免拆装箱的成本，jdk8提供了一些专门处理基本类型的流，如IntStream、DoubleStream、LongStream，可以通过Stream的**mapToInt()**、**mapToDouble()**、**mapToLong()**方法得到，再操作完基本类型后，可以调用基本类型流的 **boxed()** 方法转换为对象流

## 创建流

```Java
1. 由值创建流：Stream.of("a","b");
2. 由数组创建流：int[] numbers = {1,2,3};Arrays.stream(numbers);
3. 由文件创建流：java.io.BufferedReader.lines()
4. Stream.iterate(0, n -> n + 2).limit(10)  
5. 通过接收一个supplier创建：Stream.generate(Math::random).limit(10)  
6. 通过集合创建: list.stream()
7. 基本类型范围创建：IntStream evenNumbers = IntStream.rangeClosed(1, 100)//从1到100
IntStream evenNumbers = IntStream.range(1, 100)//从1到99
```

### 语句例子

- Peek可以使用peek来进行调试

  ```java
  List<Integer> result =numbers.stream() 
       .peek(x ->System.out.println("from stream: " + x))
       .map(x -> x + 17)
       .peek(x -> System.out.println("after map: " + x))
       .filter(x -> x % 2 == 0)
       .peek(x -> System.out.println("after filter: " + x))
       .limit(3)
       .peek(x -> System.out.println("after limit: " + x))
       .collect(toList());
  ```


- 双层for循环 (flatMap 用于将映射后的多个流合并成一个流,即扁平化流,用于处理返回值是Stream的东东)

  ```java
  List<Integer> numbers1 = Arrays.asList(1, 2);
  List<Integer> numbers2 = Arrays.asList(3, 4);
  List<int[]> pairs =numbers1.stream().flatMap(
    i ->numbers2.stream().map(j -> new int[]{i, j})
  ).collect(Collectors.toList());
   //其结果是[(1, 3),(1, 4),(2,3),(2,4)]。
  ```

- 聚合

  ```java
  List<Integer> list = new ArrayList<Integer>();
  List<Integer> reduce = Stream.of(1, 2, 3, 4).reduce(list, (List<Integer> a, Integer x) -> {
    a.add(x);
    return a;
  }, new BinaryOperator<List<Integer>>() {
    @Override
    public List<Integer> apply(List<Integer> integers, List<Integer> integers2) {
      //				integers.addAll(integers2);
      return integers;
    }
  });
  System.out.println(reduce);//[1, 2, 3, 4]

  int reduce = IntStream.range(1, 10).reduce(0, (s1, s2) -> s1 + s2);//45
  ```

- 根据对象中的某个属性去重,

  ```java
  List<Person> list = Lists.newArrayList(p1,p2,p3,p4,p5);
  List<Person> uniqueList = list.stream().collect(Collectors.collectingAndThen(
                  Collectors.toCollection(() -> new TreeSet<>((s1,s2)->{
                    	//名称相同的时候 数量+1
                      if(s1.getName().equals(s2.getName())&&s1!=s2){
                          s2.setCount(s1.getCount()+s2.getCount());
                      }
                    	//根据Person对象中的name去重
                      return s1.getName().compareTo(s2.getName());
                  })), ArrayList::new));
  ```

- list和array之间的互转

  ```java
  List<String> l = Lists.newArrayList("a","b","c");
  String[] array = l.stream().toArray(String[]::new);
  List<String> l2 = Stream.of(array).collect(Collectors.toList());
  ```

- 排序、取最大、最小值

  ```java
  Stream<String> sortedStream = stream.sorted(String::compareTo);
  Optional maxOptionnal = stream.min(String::compareTo);
  IntStream.range(1,10).max();
  ```

- 过滤

  ```java
  List<String> ll = Lists.newArrayList("a","","b");
  ll.stream().filter(StringUtils::isNotBlank).collect(Collectors.toList());
  ```

- anyMatch、allMatch、noneMatch

  ```java
  boolean b = IntStream.of(1, 3, 5, 8, 10).anyMatch((s) -> s % 3 == 0);
  ```


## 参考

[Java 8 中的 Streams API 详解](https://www.ibm.com/developerworks/cn/java/j-lo-java8streamapi/)