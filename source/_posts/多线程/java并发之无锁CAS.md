---
title: java并发之无锁CAS
date: 2017-10-29
tags:
- 多线程
categories:
- java基础
---

# java并发之无锁CAS

## CAS思想

CAS是乐观锁思想的一种实现，无锁。

乐观锁总是假设不存在竞争，线程可以正常执行，无需加锁或者等待。一旦发生竞争导致操作失败，然后会不停的重试直到成功为止

乐观锁更好的用在读多写少、竞争比较低的场景，如果竞争激烈，线程会浪费很多CPU资源，并且最后还失败。

CAS算法涉及到三个操作数：

- 需要修改的内存值 V

- 进行比较的值 A

- 要写入的新值 B

当且仅当 V 的值等于 A 时，CAS通过原子方式用新值B来更新V的值，否则不会执行任何操作，返回失败

### 无锁优点

1. 避免线程被阻塞，线程的阻塞和恢复是非常耗费性能的，cpu 需要在内核态和用户态切换
2. 避免死锁和锁饥饿问题
3. 当获取所有权失败后可以选择下一步操作，而不是只能被阻塞

### 无锁缺点

1. ABA问题，解决思路是使用AtomicStampedReference，该类多为了一个一个时间戳字段，通过给变量加上时间戳作为版本号解决ABA问题
2. 自旋长时间不成功会占用大量CPU资源，解决思路是让JVM支持处理器提供的pause指令，可以让CPU睡眠一小段时间后继续自旋
3. 只能保证一个共享变量的原子操作，可以通过使用AtomicReference实现对象的原子操作

## Java实现

为了保证内存可见性，要修改的变量需要使用volatile修饰，CAS操作基于unsafe类实现。

unsafe类中的方法都是native方法，具体实现与操作系统好CPU相关，通过内存地址直接修改

```java
private volatile int value;
public final boolean compareAndSet(int expect, int update) {   
	return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
}
```

CAS操作允许失败，失败一般会不断重试，在一个循环中不停的重试去CAS操作，直到成功

```java
public final int getAndUpdate(IntUnaryOperator updateFunction) {
    int prev, next;
    do {
        prev = get();
        next = updateFunction.applyAsInt(prev);
    } while (!compareAndSet(prev, next));
    return prev;
}
```

## CAS工具类介绍

### 常量类原子操作

#### AtomicInteger

#### AtomicBoolean

#### AtomicLong

#### LongAdder

#### DoubleAdder

### 对象类原子操作

#### AtomicReference

使用AutomicReference 的时候，修改时会拷贝一个对象，然后修改拷贝后的对象，CAS设置变量指针指向新的对象，当对象很大的时候，会浪费很多cpu 时间周期进行对象的拷贝

#### AtomicStampedReference

一种特殊的AtomicReference，用于解决ABA问题。维护了一个内部类，内部类维护一个变量和stamp时间戳字段

#### 对象字段原子操作

### 数组类原子操作

#### AtomicIntegerArray

#### AtomicLongArray

#### AtomicReferenceArray