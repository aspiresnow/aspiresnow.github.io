---
title: java并发之ThreadLocal
date: 2017-11-13
tags:
- 多线程
categories:
- java基础
---

# java并发之ThreadLocal

## 知识导读

- ThreadLocal主要作用于线程的上下文，而不是线程安全，如果ThreadLocal中放一个共享对象，是无法保证线程安全的，如果是基本类型可以保证线程安全
- ThreadLocal是对**当前线程**的threadLocals(Map)变量的一种封装管理。提供了该map的get和set方法，在当前线程执行上下文中可以随时获取该值。
- ThreadLocal实例就是一个Map的key，每个线程都有一个私有的Map，在使用ThreadLocal时要有这个概念，使用起来就方便了
- ThreadLocalMap的Entry的key值是ThreadLocal实例，是一个弱引用。value是实际set的值，是一个强引用
- 线程不消亡时(线程池)，value值可能会导致内存泄露，良好的编程习惯是在finnaly代码块中调用ThreadLocal.remove()
- ThreadLocalMap的set方法，当发生hash冲突的时候，会尝试将值放到当前槽位的下一个槽位。
- ThreadLocalMap的get方法，先根据key的hash计算槽位，然后比对槽位上的key值，如果key不同会尝试下个槽位，该该过程中清除由于gc导致key为null的entry，直到找到key值相同的返回，否则返回null
- InheritableThreadLocal用于向子线程中传递父线程的InheritableThreadLocal存储的值，是一个浅拷贝。

## 原理

### 用途

- 保存线程上下文信息，在线程某个地方设置，在随后的任意地方都可以获取

- 线程私有，以空间换时间

  **注意：**如果线程ThreadLocal中保存的是一个引用类型的共享对象，当修改共享对象内部值时会出现并发安全问题

### 内部实现

java的Thread类有两个私有变量threadLocals和inheritableThreadLocals，类型是ThreadLocal.ThreadLocalMap，用于保存线程运行上下文的值，map的key是ThreadLocal对象，value是设置的值。

- 向ThreadLocal中设置值就是向这个线程私有的map中设置值，key为ThreadLocal实例，value为要设置的值
- 从ThreadLocal中获取值，就是以ThreadLocal实例为key，从这个线程私有的map中get值
- map中的key是弱引用，value是强引用

**注意：**这里的map内部结构是数组，一个槽位只存储一个元素，而不是HashMap中的数组+链表。

### 内存泄露

在使用不当的情况下，ThreadLocal会导致内存泄露问题。

下图展示了ThreadLocal的引用情况，java堆中有ThreadLocal实例、value实例、Map实例，可能发生内存泄露的就是这三个实例

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/sZGYmb.jpg)

- ThreadLocal实例由栈中变量指针强引用、线程的私有变量map的key弱引用
- value实例可能由栈中变量指针强引用、线程的私有变量map的value强引用
- 线程私有变量map由栈中的线程对象指针强引用

一般为了防止内存泄露，会将栈中变量指针设置null，**但是如果线程不消亡**，会存在线程到map的引用，从而导致ThreadLocal实例和value实例还会存在引用，无法被回收，从而导致内存泄露。

ThreadLocal针对这种问题作出了部分优化

1. 在线程私有变量map中key引用是弱引用类型，即当外部没有任何强引用指向ThreadLocal实例时，垃圾回收会回收ThreadLocal实例。
2. 每次调用ThreadLocal的get和set的时候，**如果查询不到值**，会将map中所有key为null的值移除，从而释放value。

**综上：**

- 如果线程能够消亡，线程到map的强引用断开，map到ThreadLocal实例和value实例的引用都会消失。将栈中各个实例的引用显示设置为null，ThreadLocal和value实例都可以被gc回收，不会发生内存泄露问题

- 如果线程不消亡，并且**每次调用ThreadLocal的get能获取到值或者以后再不调用ThreadLocal的get和set方法**，会导致内存泄露，
  - value实例一直被Thread中map的value强引用，无法被垃圾回收，发生内存泄露
  - ThreadLocal实例被Thread中map的key弱引用，可以被gc回收

**什么情况下线程不消亡呢？**

- 一个永久存活的线程，一直在循环执行
- 线程池中的线程，当设置了core线程不回收，线程池中的某些线程有可能一直存活

**如何解决**

良好的使用习惯是，当确定线程的后续执行流程不需要再用到ThreadLocal中的值、线程执行完毕前，显示调用ThreadLocal的remove方法清理内存中的ThreadLocal实例和value实例。一般都在finnaly代码块中调用 ThreadLocal.remove()

## 源码解析

### Thread类

Thread类中定义了threadLocals和inheritableThreadLocals变量，ThreadLocal.ThreadLocalMap类型。threadLocals变量的管理是在ThreadLocal中实现的。

```java
ThreadLocal.ThreadLocalMap threadLocals = null;
ThreadLocal.ThreadLocalMap inheritableThreadLocals = null;
```

### ThreadLocal类

Thread中只是定义threadLocals变量，并没有提供该变量的管理逻辑，ThreadLocal封装了对当前线程threadLocals变量的管理操作。

ThreadLocal中定义了ThreadLocalMap类型，map中的entry使用数组存储，一个槽位只存储一个entry，槽位由hash计算所得，当发生hash冲突时，会判断下一个槽位是否可以放

Entry的key为ThreadLocal类型，是个弱引用。value是调用ThreadLocal的set方法设置的值，是个强引用。

```java
static class ThreadLocalMap {
		
    static class Entry extends WeakReference<ThreadLocal<?>> {
        Object value;
        Entry(ThreadLocal<?> k, Object v) {
            super(k);//key是弱引用
            value = v;//value是强引用
        }
    }
    //数组 槽位
    private Entry[] table;
	  //长度
    private int size = 0;
}
```

#### set值

 ThreadLocal的set方法，获取当前线程的threadLocals变量

- 如果不为空，则以当前ThreadLocal实例为key，存储值
- 如果为空，初始化ThreadLocalMap实例，再向里面添加值

```java
public void set(T value) {
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);//获取当前线程的threadLocals
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
}
//如果没有map，则创建map，并存储变量
void createMap(Thread t, T firstValue) {
    t.threadLocals = new ThreadLocalMap(this, firstValue);
}
```
set值的时候，如果发生hash冲突，会尝试当前槽位的下一个槽位

- key值为空，清理gc导致的key为null的entry，然后将新值添加到该槽位
- key值相同，更新操作，直接覆盖
- key值不同，继续尝试下一个槽位

```java
private void set(ThreadLocal<?> key, Object value) {
    Entry[] tab = table;
    int len = tab.length;
    int i = key.threadLocalHashCode & (len-1);

    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        ThreadLocal<?> k = e.get();
        if (k == key) {
            e.value = value;
            return;
        }
        if (k == null) {//清除value值，并将新值放到该槽位
            replaceStaleEntry(key, value, i);
            return;
        }
    }
    tab[i] = new Entry(key, value);
    int sz = ++size;
    if (!cleanSomeSlots(i, sz) && sz >= threshold)
        rehash();
}
```

#### get值

ThreadLocal的get方法，先获取当前线程的ThreadLocalMap，然后以调用者threadLocal为key获取变量

```java
public T get() {
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);//t.threadLocals
    if (map != null) {
        ThreadLocalMap.Entry e = map.getEntry(this);
        if (e != null) {
            @SuppressWarnings("unchecked")
            T result = (T)e.value;
            return result;
        }
    }
    return setInitialValue();
}
//获取当前线程threadLocals变量的值
ThreadLocalMap getMap(Thread t) {
  return t.threadLocals;
}
```

从map中查询就是通过key的hash值计算出所在槽位，然后获取该槽位的值比对，如果查询不到再遍历所有的key比对

```java
private Entry getEntry(ThreadLocal<?> key) {
    int i = key.threadLocalHashCode & (table.length - 1);
    Entry e = table[i];
    if (e != null && e.get() == key)
        return e;
    else
        return getEntryAfterMiss(key, i, e);
}
```

根据key查询不到值的时候，会触发遍历map中所有的key，如果遇到gc导致key为空的entry移除，直到找到值或者返回null

```java
private Entry getEntryAfterMiss(ThreadLocal<?> key, int i, Entry e) {
    Entry[] tab = table;
    int len = tab.length;

    while (e != null) {
        ThreadLocal<?> k = e.get();
        if (k == key)
            return e;
        if (k == null)
            expungeStaleEntry(i); //清除由于gc导致key为空的entry
        else
            i = nextIndex(i, len);//当前槽位的下一个槽位
        e = tab[i];
    }
    return null;
}
```

查询不到值的时候，会调用setInitialValue设置初始值,子类可以覆写initialValue提供为空时的默认值

```java
private T setInitialValue() {
    T value = initialValue();
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
    return value;
}
```

#### remove值

ThreadLocal的remove方法，移除以当前ThreadLocal实例为key的值

```java
public void remove() {
    ThreadLocalMap m = getMap(Thread.currentThread());
    if (m != null)
        m.remove(this);
}
```

## InheritableThreadLocal

InheritableThreadLocal继承ThreadLocal，覆写了getMap方法，ThreadLocal的getMap方法返回的是当前线程的threadLocals。

```java
public class InheritableThreadLocal<T> extends ThreadLocal<T> {
   //为子线程传递变量
    protected T childValue(T parentValue) {
        return parentValue;
    }
	//覆写 getMap 返回 inheritableThreadLocals
    ThreadLocalMap getMap(Thread t) {
       return t.inheritableThreadLocals;
    }
	//覆写 createMap 创建ThreadLocalMap并为inheritableThreadLocals赋值
    void createMap(Thread t, T firstValue) {
        t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
    }
}
```

Thread类中定义了inheritableThreadLocals遍历，用于接收父线程给子线程传递的运行上下文信息

```java
ThreadLocal.ThreadLocalMap inheritableThreadLocals = null;
```


线程的父线程是当前创建子线程的线程，新创建的子线程的构造方法中会调用init方法，复制当前线程(父线程)的inheritableThreadLocals,将值保存到子线程的inheritableThreadLocals变量中，从而实现继承的效果

```java
private void init(ThreadGroup g, Runnable target, String name,
                  long stackSize, AccessControlContext acc) {
  //...
  Thread parent = currentThread();
  //...
    if (parent.inheritableThreadLocals != null)
      this.inheritableThreadLocals = ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
  //...
}
```

ThreadLocal中对父线程中的inheritableThreadLocals属性进行了浅拷贝，key和value都是原来的引用地址，这样子线程通过InheritableThreadLocal的get方法就能获取到父线程中定义的引用，通过引用访问变量z

```java
static ThreadLocalMap createInheritedMap(ThreadLocalMap parentMap) {
    return new ThreadLocalMap(parentMap);
}
private ThreadLocalMap(ThreadLocalMap parentMap) {
  Entry[] parentTable = parentMap.table;
  int len = parentTable.length;
  setThreshold(len);
  table = new Entry[len];

  for (int j = 0; j < len; j++) {
    Entry e = parentTable[j];
    if (e != null) {
      @SuppressWarnings("unchecked")
      ThreadLocal<Object> key = (ThreadLocal<Object>) e.get();
      if (key != null) {
        Object value = key.childValue(e.value);
        Entry c = new Entry(key, value);
        int h = key.threadLocalHashCode & (len - 1);
        while (table[h] != null)
          h = nextIndex(h, len);
        table[h] = c;
        size++;
      }
    }
  }
}
```