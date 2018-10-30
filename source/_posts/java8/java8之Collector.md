---
title: java8之Collector
date: 2017-08-05 13:58:46
tags:
- java8
categories:
- java基础
---

# java8之Collector

Stream流的终端操作常常需要聚合，Collector就是对Stream流进行聚合的实现。jdk提供了Collectors工具类封装了一些常用的聚合操作。

<!--more-->

## Collector接口

Collector是一个接口，它是一个可变的汇聚操作，通过累加器将输入元素汇集到一个**可伸展**的结果容器中；如果是并行流会产生多个结果容器，还需将结果容器合并为一个，最后将累积的结果容器转换为一个最终想要的容器返回（这是一个可选操作）

```java
public interface Collector<T, A, R> {
    //用于提供一个可伸展结构的容器
    Supplier<A> supplier();   //容器
  	//用于将元素添加到提供的容器中
    BiConsumer<A, T> accumulator();//累加器
  	//把并行流产生的多个容易合并为一个
    BinaryOperator<A> combiner(); //合并器
	//将combiner返回的结果类型转换为其他类型，当characteristics选择IDENTITY_FINISH时，不需要转换类型，	   所以该方法不会被调用，其他情况下会被调用
    Function<A, R> finisher();
    //Collector约束属性set,不可变Collections.unmodifiableSet
    Set<Characteristics> characteristics();
}
```
Characteristics是Collector内的一个枚举类，用来约束Collector的属性。

- CONCURRENT：表示此收集器支持并发，意味着允许在多个线程中，累加器可以调用结果容器
- UNORDERED：表示收集器并不按照Stream中的元素输入顺序执行
- IDENTITY_FINISH：表示不需要转换结果类型，直接返回supplier创建的数据类型，finisher方法不执行。


如下就是一个简单的Collector的实现，将结果聚合到一个list当中

```java
List result = Stream.of(1, 2,3, 4,5).collect(
  () -> new ArrayList(), //创建一个可变容器
  (list, item) -> list.add(item),//将stream中元素添加到可变容器中
  (list1, list2) -> list1.addAll(list2)//合并多个可变容器
);
```

## Collectors工具类

Collectors本身提供了关于Collector的常见汇聚实现，Collectors的内部类CollectorImpl实现了Collector接口，Collectors本身就是一堆创建CollectorImpl对象的工具类。

### CollectorImpl

CollectorImpl是Collectors工具类中的内部类，实现了Collector接口，提供了构造器，方便构造Collector的具体实现类，Collector接口中可以设置一个Characteristics的集合，Collectors针对可能出现的组合定义好了几个类型集合。

```java
static final Set<Collector.Characteristics> CH_CONCURRENT_ID                                   
        = Collections.unmodifiableSet(EnumSet.of(Collector.Characteristics.CONCURRENT,         
                                                 Collector.Characteristics.UNORDERED,          
                                                 Collector.Characteristics.IDENTITY_FINISH));  
static final Set<Collector.Characteristics> CH_CONCURRENT_NOID                                 
        = Collections.unmodifiableSet(EnumSet.of(Collector.Characteristics.CONCURRENT,         
                                                 Collector.Characteristics.UNORDERED));        
static final Set<Collector.Characteristics> CH_ID                                              
        = Collections.unmodifiableSet(EnumSet.of(Collector.Characteristics.IDENTITY_FINISH));  
static final Set<Collector.Characteristics> CH_UNORDERED_ID                                    
        = Collections.unmodifiableSet(EnumSet.of(Collector.Characteristics.UNORDERED,          
                                                 Collector.Characteristics.IDENTITY_FINISH));  
static final Set<Collector.Characteristics> CH_NOID = Collections.emptySet();    

static class CollectorImpl<T, A, R> implements Collector<T, A, R> { 
     //构造函数，创建Collector的实现类对象
     CollectorImpl(Supplier<A> supplier,                             
                   BiConsumer<A, T> accumulator,                     
                   BinaryOperator<A> combiner,                       
                   Function<A,R> finisher,                           
                   Set<Characteristics> characteristics) {           
         this.supplier = supplier;                                   
         this.accumulator = accumulator;                             
         this.combiner = combiner;                                   
         this.finisher = finisher;                                   
         this.characteristics = characteristics;                     
     }                  
 }
```

### Collectors工具类型

#### 链接

mapping是在将元素添加到容器前进行一次映射处理、collectingAndThen是处理Collector的最终返回值问题，是额外给Collector添加一个Finisher方法

```java
public static <T, U, A, R>                                                                
Collector<T, ?, R> mapping(Function<? super T, ? extends U> mapper,                       
                           Collector<? super U, A, R> downstream) {                       
    BiConsumer<A, ? super U> downstreamAccumulator = downstream.accumulator();            
    return new CollectorImpl<>(downstream.supplier(),                                     
                               (r, t) -> downstreamAccumulator.accept(r, mapper.apply(t)),
                               downstream.combiner(), downstream.finisher(),              
                               downstream.characteristics());                             
}                                                                                         
```

```java
public static<T,A,R,RR> Collector<T,A,RR> collectingAndThen(Collector<T,A,R> downstream,  
                                                            Function<R,RR> finisher) {    
    Set<Collector.Characteristics> characteristics = downstream.characteristics();        
    if (characteristics.contains(Collector.Characteristics.IDENTITY_FINISH)) {            
        if (characteristics.size() == 1)                                                  
            characteristics = Collectors.CH_NOID;                                         
        else {                                                                            
            characteristics = EnumSet.copyOf(characteristics);                            
            characteristics.remove(Collector.Characteristics.IDENTITY_FINISH);            
            characteristics = Collections.unmodifiableSet(characteristics);               
        }                                                                                 
    }                                                                                     
    return new CollectorImpl<>(downstream.supplier(),                                     
                               downstream.accumulator(),                                  
                               downstream.combiner(),                                     
                               downstream.finisher().andThen(finisher),                   
                               characteristics);                                          
}                                                                                                                                                                                  
```



#### 构建集合类

toCollection、toList、toSet：创建集合-->将元素添加到集合-->合并集合—>返回集合类型。构建set的时候需要注意设置characteristics类型为无序的，不需要按照Stream顺序添加到集合中。

```java
public static <T> Collector<T, ?, Set<T>> toSet() {                                                    
    return new CollectorImpl<>((Supplier<Set<T>>) HashSet::new, Set::add,            
                               (left, right) -> { left.addAll(right); return left; },
                               CH_UNORDERED_ID);                                     
}                                                                                    
```

#### 聚合为字符串

提供了一个可变的字符存储容器StringJoiner，然后就是将Stream中的元素添加到StringJoiner，合并多个StringJoiner，最后toString返回字符串。

```java
public static Collector<CharSequence, ?, String> joining(CharSequence delimiter, 
                                                         CharSequence prefix,    
                                                         CharSequence suffix) {  
    return new CollectorImpl<>(                                                  
            () -> new StringJoiner(delimiter, prefix, suffix),                   
            StringJoiner::add, StringJoiner::merge,                              
            StringJoiner::toString, CH_NOID);                                    
}                                                                                
```

#### 聚合reduce

- 接受一个默认值和一个BinaryOperator参数，通过BinaryOperator将元素集合合并为一个元素
```java
public static <T> Collector<T, ?, T>                             
reducing(T identity, BinaryOperator<T> op) {                     
    return new CollectorImpl<>(                                  
            boxSupplier(identity),                               
            (a, t) -> { a[0] = op.apply(a[0], t); },             
            (a, b) -> { a[0] = op.apply(a[0], b[0]); return a; },
            a -> a[0],                                           
            CH_NOID);                                            
}  
//为了实现容器，使用数组来当存储对象的容器
private static <T> Supplier<T[]> boxSupplier(T identity) {
	return () -> (T[]) new Object[] { identity };
}
```
- 同上一样，只是多个一个mapper参数用于处理向容器添加前的映射处理
```java
public static <T, U>  Collector<T, ?, U> reducing(U identity,
                            Function<? super T, ? extends U> mapper,
                            BinaryOperator<U> op) {                 
    return new CollectorImpl<>(   
      		// boxSupplier == return () -> (T[]) new Object[] { identity }; 
            boxSupplier(identity), //转换为可伸缩数据结构，存储数据                            
            (a, t) -> { a[0] = op.apply(a[0], mapper.apply(t)); },  
            (a, b) -> { a[0] = op.apply(a[0], b[0]); return a; },   
            a -> a[0], CH_NOID);                                    
}    
```

- 接受一个BinaryOperator参数，通过BinaryOperator将元素集合合并为一个元素
```java
public static <T> Collector<T, ?, Optional<T>>                        
reducing(BinaryOperator<T> op) {         
	//匿名内部类提供一个容器
    class OptionalBox implements Consumer<T> {                        
        T value = null;                                               
        boolean present = false;                                      
                                                                      
        @Override                                                     
        public void accept(T t) {//容器添加元素，这里其实就是通过参数 BinaryOperator来决定是否用新的元素替代原有的元素                                 
            if (present) {                                            
                value = op.apply(value, t);                           
            }                                                         
            else {                                                    
                value = t;                                            
                present = true;                                       
            }                                                         
        }                                                             
    }                                                                 
                                                                      
    return new CollectorImpl<T, OptionalBox, Optional<T>>(            
            OptionalBox::new, OptionalBox::accept,                    
            (a, b) -> { if (b.present) a.accept(b.value); return a; },
            a -> Optional.ofNullable(a.value), CH_NOID);              
}   

//给出每个城市最高的人
Comparator<Person> byHeight = Comparator.comparing(Person::getHeight);
Map<City, Person> tallestByCity = people.stream().collect(groupingBy(Person::getCity,reducing(BinaryOperator.maxBy(byHeight))));
```

#### 聚合为值(reduce)

counting、minBy、maxBy：通过reduce将数据聚合为一个值

```java
public static <T> Collector<T, ?, Long> counting() {                                       
    return reducing(0L, e -> 1L, Long::sum);   //一个元素代表1，通过Long::sum 累加    
}                 
public static <T> Collector<T, ?, Optional<T>>        
minBy(Comparator<? super T> comparator) {             
    return reducing(BinaryOperator.minBy(comparator));
}                                                     
```

#### 累积求值

summingInt、averagingInt、summarizingInt等:返回总值、平均值、统计数据(和、平均值、最大值、最小值),注意到在针对基本数据类型创建可伸展数据结构的时候都选择了基本数据类型的数组类型。

```java
public static <T> Collector<T, ?, Integer> summingInt(ToIntFunction<? super T> mapper) {           
    return new CollectorImpl<>(                         
            () -> new int[1],                           
            (a, t) -> { a[0] += mapper.applyAsInt(t); },
            (a, b) -> { a[0] += b[0]; return a; },      
            a -> a[0], CH_NOID);                        
}      

public static <T> Collector<T, ?, Double> averagingInt(ToIntFunction<? super T> mapper) {                      
    return new CollectorImpl<>(                                      
            () -> new long[2],  //一个存储总值，一个存储总数                                    
            (a, t) -> { a[0] += mapper.applyAsInt(t); a[1]++; },     
            (a, b) -> { a[0] += b[0]; a[1] += b[1]; return a; },     
            a -> (a[1] == 0) ? 0.0d : (double) a[0] / a[1], CH_NOID);
}                                                                    
```

#### 转换为Map

toMap、toConcurrentMap：将Stream流转换为map或者concurrentMap

```java
public static <T, K, U>                                                      
Collector<T, ?, Map<K,U>> toMap(Function<? super T, ? extends K> keyMapper,  
                                Function<? super T, ? extends U> valueMapper,
                                BinaryOperator<U> mergeFunction) {           
    return toMap(keyMapper, valueMapper, mergeFunction, HashMap::new);       
}                                                                            
public static <T, K, U, M extends Map<K, U>>                                                
Collector<T, ?, M> toMap(Function<? super T, ? extends K> keyMapper,                        
                            Function<? super T, ? extends U> valueMapper,                   
                            BinaryOperator<U> mergeFunction,                                
                            Supplier<M> mapSupplier) { 
    //map提供的merge方法，用于合并两个map
    BiConsumer<M, T> accumulator                                                            
            = (map, element) -> map.merge(keyMapper.apply(element),                         
                                          valueMapper.apply(element), mergeFunction);       
    return new CollectorImpl<>(mapSupplier, accumulator, mapMerger(mergeFunction), CH_ID);  
}        
//用法 
Map<String, Student> studentIdToStudent = students.stream().collect(toMap(Student::getId,Function.identity());
```

#### 分组聚合

groupingBy、partitioningBy：默认会将value聚合为list，可以传递一个Collector对value进行聚合

- partitioningBy

```java
public static <T, D, A>                                                                              
Collector<T, ?, Map<Boolean, D>> partitioningBy(Predicate<? super T> predicate,                      
                                                Collector<? super T, A, D> downstream) {             
    BiConsumer<A, ? super T> downstreamAccumulator = downstream.accumulator();
    //将元素根据true和false分别添加到包装后的Partition容器中
    BiConsumer<Partition<A>, T> accumulator = (result, t) ->                                         
            downstreamAccumulator.accept(predicate.test(t) ? result.forTrue : result.forFalse, t);   
    BinaryOperator<A> op = downstream.combiner();                                                    
    BinaryOperator<Partition<A>> merger = (left, right) ->                                           
            new Partition<>(op.apply(left.forTrue, right.forTrue),                                   
                            op.apply(left.forFalse, right.forFalse));  
    //元素容器，使用Partition，包装原有的Collector的容器
    Supplier<Partition<A>> supplier = () ->                                                          
            new Partition<>(downstream.supplier().get(),                                             
                            downstream.supplier().get());                                            
    if (downstream.characteristics().contains(Collector.Characteristics.IDENTITY_FINISH)) {          
        return new CollectorImpl<>(supplier, accumulator, merger, CH_ID);                            
    }                                                                                                
    else {                                                                                           
        Function<Partition<A>, Map<Boolean, D>> finisher = par ->                                    
                new Partition<>(downstream.finisher().apply(par.forTrue),                            
                                downstream.finisher().apply(par.forFalse));                          
        return new CollectorImpl<>(supplier, accumulator, merger, finisher, CH_NOID);                
    }                                                                                                
}    

//私有类提供容器
private static final class Partition<T> extends AbstractMap<Boolean, T> implements Map<Boolean, T> {
    final T forTrue;
    final T forFalse;
	//包装两个被包装容器 一个用于存储true的情况，一种存储false的情况
    Partition(T forTrue, T forFalse) {//使用被包装的Collector的容器类型
        this.forTrue = forTrue;
        this.forFalse = forFalse;
    }

    @Override
    public Set<Map.Entry<Boolean, T>> entrySet() {
        return new AbstractSet<Map.Entry<Boolean, T>>() {
            @Override
            public Iterator<Map.Entry<Boolean, T>> iterator() {
                Map.Entry<Boolean, T> falseEntry = new SimpleImmutableEntry<>(false, forFalse);
                Map.Entry<Boolean, T> trueEntry = new SimpleImmutableEntry<>(true, forTrue);
                return Arrays.asList(falseEntry, trueEntry).iterator();
            }

            @Override
            public int size() {
                return 2;
            }
        };
    }
}
```
- groupingBy  要求容器是一个Map的实现类型。
```java
//classifier   mapFactory 
public static <T, K, D, A, M extends Map<K, D>>                                                            
Collector<T, ?, M> groupingBy(Function<? super T, ? extends K> classifier, //提供map的key值函数                                    
                              Supplier<M> mapFactory,//提供容器                                                          
                              Collector<? super T, A, D> downstream) {                                         
    Supplier<A> downstreamSupplier = downstream.supplier();                                                    
    BiConsumer<A, ? super T> downstreamAccumulator = downstream.accumulator();                                 
    BiConsumer<Map<K, A>, T> accumulator = (m, t) -> { //m为容器，即Map
    	//获取key值
        K key = Objects.requireNonNull(classifier.apply(t), "element cannot be mapped to a null key");
        //以Collectors.toList为例，这里将被包装Collector的容器放入map中，并返回被包装Collector的容器
        A container = m.computeIfAbsent(key, k -> downstreamSupplier.get());   
        //再使用被包装Collector的类加器向被包装Collector的容器中添加元素
        downstreamAccumulator.accept(container, t);                                                            
    };                                                                                                         
    BinaryOperator<Map<K, A>> merger = Collectors.<K, A, Map<K, A>>mapMerger(downstream.combiner());     
    //容器 ，一般使用 HashMap
    @SuppressWarnings("unchecked")                                                                             
    Supplier<Map<K, A>> mangledFactory = (Supplier<Map<K, A>>) mapFactory;                                     
                                                                                                               
    if (downstream.characteristics().contains(Collector.Characteristics.IDENTITY_FINISH)) {                    
        return new CollectorImpl<>(mangledFactory, accumulator, merger, CH_ID);                                
    }                                                                                                          
    else {                                                                                                     
        @SuppressWarnings("unchecked")                                                                         
        Function<A, A> downstreamFinisher = (Function<A, A>) downstream.finisher();                            
        Function<Map<K, A>, M> finisher = intermediate -> {                                                    
            intermediate.replaceAll((k, v) -> downstreamFinisher.apply(v));                                    
            @SuppressWarnings("unchecked")                                                                     
            M castResult = (M) intermediate;                                                                   
            return castResult;                                                                                 
        };                                                                                                     
        return new CollectorImpl<>(mangledFactory, accumulator, merger, finisher, CH_NOID);                    
    }                                                                                                          
}                                                                                                              

groupingBy(classifier, HashMap::new, toList());
```


