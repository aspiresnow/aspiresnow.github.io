---
title: java并发之CountDownLatch
date: 2017-11-21 15:11:30
tags:
- 多线程
categories:
- java基础

---

# java并发之CountDownLatch

## 知识导读

- CountDownLatch相等于是一个加了n个锁的门，只要有一个锁没有打开，所有的调用await方法的线程都阻塞排队等待。每次调用countDown方法会打开一把锁，当所有的锁被打开时，会通知队首的人可以过去了，然后队首的人再一个个告诉队尾的人可以过了。
- CountDownLatch基于AQS的共享模式实现。
- 调用await时，只需要判断state的值，如果等于0则获取执行权，如果大于0则阻塞。
- 覆写的tryAcquireShared方法只查询state值，不会修改，所以state值只会通过countDown方法减，一旦等于0，所有的阻塞线程都可以获取到同步状态，都会被唤醒。
- 调用countDown，每次调用将state-1，当state=0的时候tryReleaseShared返回true触发唤醒同步队列中第一个阻塞线程，然后一直传播唤醒所有的阻塞线程
- 应用场景,如依赖资源还未准备后，所有访问线程全部阻塞，当依赖的资源全部准备好，其他地调用CountDownLatch.countDown方法，建为0的时候，等待全部一起同时往后处理

## 原理

CountDownLatch通过控制AQS的state来控制同步状态的获取。

1. 创建CountDownLatch初始时，将state设置为一个大于0的值
2. 调用await，则当前线程尝试获取同步状态，state=0获取成功，state>0则加入同步队列阻塞
3. 调用countDown方法，将state-1。当state=0的时候，该线程激活同步队列中所有的阻塞线程

### CyclicBarrier和CountDownLatch的区别

- CyclicBarrier的某个线程运行到某个点上之后，该线程阻塞，直到所有的线程都到达了这个点，所有线程才重新运行；
- CyclicBarrier只能唤起一个任务，CountDownLatch可以唤起多个任务

- CyclicBarrier可重用，CountDownLatch不可重用，计数值为0该CountDownLatch就不可再用了

## 源码分析

构造方法需要传递一个int类型的数，创建内部类Sync

```java
public CountDownLatch(int count) {
    if (count < 0) throw new IllegalArgumentException("count < 0");
    this.sync = new Sync(count);
}
```

Sync继承了AQS，是AQS的共享模式的一种实现，覆写tryAcquireShared和tryReleaseShared方法

- tryAcquireShared方法中不修改state的值，只需要判断state值是否为0
- tryReleaseShared方法中每次将state-1，当state=0的时候返回true，资源释放成功

```java
private static final class Sync extends AbstractQueuedSynchronizer {
    Sync(int count) {
        setState(count);
    }
    int getCount() {
        return getState();
    }
    protected int tryAcquireShared(int acquires) {
      //当state不为0的时候，线程无法获取到锁，返回-1
      //当阻塞的线程可以获取锁，则返回1，可以唤醒阻塞的线程
        return (getState() == 0) ? 1 : -1;
    }
    protected boolean tryReleaseShared(int releases) {
      //for循环+CAS设置state值
        for (;;) {
            int c = getState();
            if (c == 0)
                return false;
            int nextc = c-1;
            if (compareAndSetState(c, nextc))
                return nextc == 0;
        }
    }
}
```

CountDownLatch中所有方法都是调用Sync的方法，await方法用于获取共享锁资源

```java
//获取一个资源，允许中断
public void await() throws InterruptedException {
    sync.acquireSharedInterruptibly(1);//可中断模式获取1个资源
}
//设置等待超时时间
public boolean await(long timeout, TimeUnit unit) throws InterruptedException {
   return sync.tryAcquireSharedNanos(1, unit.toNanos(timeout));//可中断模式获取1个资源
}
```

调用countDown方法释放锁资源

```java
public void countDown() {
    sync.releaseShared(1);
}
```

