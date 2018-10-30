---
title: java并发之ReentrantLock
date: 2017-10-29 09:35:30
tags:
- 多线程
categories:
- java基础
---

# java并发之ReentrantLock

ReentrantLock是基于AQS实现的可重入独享锁，内部提供了公平锁和非公平锁两种方式。

<!--more-->

## ReentrantLock和synchronized的区别

1. ReentrantLock在等待锁时可以使用lockInterruptibly()方法选择中断， 改为处理其他事情，而synchronized关键字，线程需要一直等待下去。同样的，tryLock()方法可以设置超时时间，用于在超时时间内一直获取不到锁时进行中断。
2. ReentrantLock可以实现公平锁，而synchronized的锁是非公平的。
3. ReentrantLock拥有方便的方法用于获取正在等待锁的线程。
4. ReentrantLock可以同时绑定多个Condition对象，而synchronized中，锁对象的wait()和notify()或notifyAll()方法可以实现一个隐含的条件，如果要和多于一个条件关联时，只能再加一个额外的锁，而ReentrantLock只需要多次调用newCondition方法即可。

## ReentrantLock的非公平/公平锁实现原理

### 非公平锁

由于线程在unlock的时候是先将status减去，然后再去激活队列头部的线程，所以在这两个操作之间如果有线程lock可以成功，队列头部被激活的线程再次尝试获取锁的时候会失败，然后再次进入阻塞状态

```java
static final class NonfairSync extends Sync {
  // 获得锁
  final void lock() {
    if (compareAndSetState(0, 1)) // 比较并设置状态成功，状态0表示锁没有被占用
      // 把当前线程设置独占了锁
      setExclusiveOwnerThread(Thread.currentThread());
    else // 锁已经被占用，或者set失败
      // 以独占模式获取对象，忽略中断
      acquire(1); 
  }

  protected final boolean tryAcquire(int acquires) {
    return nonfairTryAcquire(acquires);
  }
}

final boolean nonfairTryAcquire(int acquires) {
  final Thread current = Thread.currentThread();
  int c = getState();
  if (c == 0) {//直接获取锁
    if (compareAndSetState(0, acquires)) {
      setExclusiveOwnerThread(current);
      return true;
    }
  }
  else if (current == getExclusiveOwnerThread()) {
    int nextc = c + acquires;
    if (nextc < 0) // overflow
      throw new Error("Maximum lock count exceeded");
    setState(nextc);
    return true;
  }
  return false;
}
```

### 公平锁

公平锁的实现是控制获取锁的线程在操作status之前，首先判断等待队列是否存在等待线程，如果存在则当前线程放入队列，进入阻塞状态

- 在去加锁的时候，首先需要判断当前线程是否在首节点，如果不是则返回false；非公平锁是当一个线程新启动并且status为0的时候就可以获取资源，不能保证等待队列中的线程获取到锁

  ```java
  protected final boolean tryAcquire(int acquires) {
      final Thread current = Thread.currentThread();
      int c = getState();
      if (c == 0) {
          if (!hasQueuedPredecessors() &&
              compareAndSetState(0, acquires)) {
              setExclusiveOwnerThread(current);
              return true;
          }
      }
      else if (current == getExclusiveOwnerThread()) {//重入锁
          int nextc = c + acquires;
          if (nextc < 0)
              throw new Error("Maximum lock count exceeded");
          setState(nextc);
          return true;
      }
      return false;
  }
  ```

- 查询是否存在其他线程等待时间比当前线程长，当存在的时候返回true，当队列为空或者当前线程已经在head的时候返回false

  ```java
  public final boolean hasQueuedPredecessors() {
      Node t = tail; // Read fields in reverse initialization order
      Node h = head;
      Node s;
    //当前队列存在等待线程，并且该线程不是当前线程
      return h != t &&
          ((s = h.next) == null || s.thread != Thread.currentThread());
  }
  ```