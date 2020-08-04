---
title: java并发之CyclicBarrier
date: 2020-08-03
tags:
- 多线程
categories:
- java基础

---

# java并发之CyclicBarrier

## 知识导读

- CyclicBarrier是一个阻塞器，当阻塞线程达到CyclicBarrier指定数量时，所有线程被唤醒执行，否则阻塞该线程
- CyclicBarrier可以循环使用
- CyclicBarrier是基于ReentrantLock和ReentrantLock的一个Condition实现，每次调用await方法后加锁，然后计数减1，减之后不为0,则调用Condition的await方法，当前线程进入阻塞等待状态；当计数减之后为0则signalAll，激活所有等待线程。
- CyclicBarrier上阻塞的线程，任意一个线程被中断、超时、执行异常都会导致CyclicBarrier被打破，从而导致所有阻塞线程被唤醒

## 原理

CyclicBarrier屏障初始化时规定一个数目，然后计算调用了CyclicBarrier.await()进入等待的线程数。

- 如果线程数未达到这个数量，则线程阻塞等待；
- 当线程数达到了这个数目时，所有进入等待状态的线程被唤醒并继续运行

CyclicBarrier中使用了一个ReentrantLock和该ReentrantLock的一个Condition。使用Condition.await方法进行线程阻塞。使用Condition.notifyAll方法唤醒所有阻塞线程。

CyclicBarrier使用了两个数来记录屏障允许通过的线程数阈值。parties值不变，count值用来记录剩余需阻塞的线程。当count=0的时候，屏障被打开，重置count=parties，实现CyclicBarrier的重复使用。

CyclicBarrier栅栏被放开分两种情况

- 线程数达到阈值: 打开栅栏，唤醒所有线程，栅栏重复使用
- 运行异常: 打破栅栏，唤醒所有线程，栅栏不可再用，包括任意线程被中断、超时、运行异常等导致的异常

## 源码分析

CyclicBarrier内部封装了一个ReentrantLock和一个Condition用于进行线程的阻塞和唤醒。

定义了parties变量用来记录线程数的阈值，初始化时赋值，count变量用来动态记录剩余需要进入的线程数

Generation变量可以用于区分CyclicBarrier是被正常打开还是异常后打破

barrierCommand变量是一个Runnable任务，当栅栏被正常打开的时候执行该任务。

```java
private final ReentrantLock lock = new ReentrantLock();
/** Condition to wait on until tripped */
private final Condition trip = lock.newCondition();
/** The number of parties */
private final int parties;
/* The command to run when tripped */
private final Runnable barrierCommand;
/** The current generation */
private Generation generation = new Generation();
public CyclicBarrier(int parties, Runnable barrierAction) {
    if (parties <= 0) throw new IllegalArgumentException();
    this.parties = parties;  //阻塞的阈值，不会变
    this.count = parties; //记录  还剩多少个阻塞会唤醒所有线程
    this.barrierCommand = barrierAction;
}
```

CyclicBarrier的await方法，用于实现在CyclicBarrier栅栏上进行阻塞线程。

```java
public int await() throws InterruptedException, BrokenBarrierException {
    try {
        return dowait(false, 0L);
    } catch (TimeoutException toe) {
        throw new Error(toe); // cannot happen
    }
}
```

await方法调用dowait方法，实现具体逻辑

1. 在进入方法前首先要获取ReentrantLock锁资源
2. 限制被打破的栅栏不能重复使用
3. 如果线程被中断，调用breakBarrier方法打破栅栏，栅栏不可再用
4. 每进来一个工作线程，count-1，当count值为0的时候，则调用nextGeneration方法打开栅栏
5. 如果count不为0，则自旋调用Condition的await方法，阻塞当前线程
6. 如果超时、中断、异常则调用breakBarrier方法打破栅栏

```java
private int dowait(boolean timed, long nanos)
    throws InterruptedException, BrokenBarrierException,
           TimeoutException {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        final Generation g = generation;
        if (g.broken)//被打破的栅栏不能再使用
            throw new BrokenBarrierException();

        if (Thread.interrupted()) {
            breakBarrier(); //被中断，则打破栅栏
            throw new InterruptedException();
        }

        int index = --count; //每次执行 count-1
        if (index == 0) {  //当index = 0 的时候，打开栅栏，唤醒所有等待线程
            boolean ranAction = false;
            try {
                final Runnable command = barrierCommand;
                if (command != null)
                    command.run();
                ranAction = true;
                nextGeneration();//正常结束，则唤醒所有线程，重置Generation
                return 0;
            } finally {
                if (!ranAction)
                    breakBarrier();// 唤醒所有等待的线程
            }
        }
        //自旋，直到线程被interrupted，或者超时或者被notifyAll唤醒
        // loop until tripped, broken, interrupted, or timed out
        for (;;) {
            try {
                if (!timed)
                    trip.await();
                else if (nanos > 0L)
                    nanos = trip.awaitNanos(nanos);
            } catch (InterruptedException ie) {
                if (g == generation && ! g.broken) {
                    breakBarrier();
                    throw ie;
                } else {
                  //标记中断信号
                    Thread.currentThread().interrupt();
                }
            }
            if (g.broken)
                throw new BrokenBarrierException();
            if (g != generation)
                return index;
            //超时 打破栅栏
            if (timed && nanos <= 0L) {
                breakBarrier();
                throw new TimeoutException();
            }
        }
    } finally {
        lock.unlock();
    }
}
```

正常结束调用nextGeneration方法打开栅栏，所有的线程被唤醒执行

1. 调用Condition的signalAll方法，唤醒等待的所有线程
2. 重置count为parties，这时CyclicBarrier可以重复使用的关键
3. 创建一个新的可用的Generation

```java
private void nextGeneration() {
    // signal completion of last generation
    trip.signalAll();
    // set up next generation
    count = parties;
    generation = new Generation();
}
```

非正常结束，调用breakBarrier方法打破栅栏，所有的线程被唤醒执行

1. 标记generation被打破。不能再用了
2. 重置count为parties，这时CyclicBarrier可以重复使用的关键
3. 调用Condition的signalAll方法，唤醒等待的所有线程

```java
private void breakBarrier() {
    generation.broken = true;
    count = parties;
    trip.signalAll();
}
```

CyclicBarrier对外提供了reset方法，可以不用等阻塞线程达到阈值，然后打开栅栏，激活所有的线程

1. 调用breakBarrier方法，唤醒所有线程
2. 创建一个新的Generation

```java
public void reset() {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        breakBarrier();   // break the current generation
        nextGeneration(); // start a new generation
    } finally {
        lock.unlock();
    }
}
```

