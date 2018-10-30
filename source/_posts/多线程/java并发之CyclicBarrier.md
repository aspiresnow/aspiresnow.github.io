---
title: java并发之CyclicBarrier
date: 2017-11-21 15:10:30
tags:
- 多线程
categories:
- java基础

---

# java并发之CyclicBarrier

CyclicBarrier初始化时规定一个数目，然后计算调用了CyclicBarrier.await()进入等待的线程数。当线程数达到了这个数目时，所有进入等待状态的线程被唤醒并继续。

当线程A调用Exchange对象的exchange()方法后，他会陷入阻塞状态，直到线程B也调用了exchange()方法，然后以线程安全的方式交换数据，之后线程A和B继续运行

调用await()方法计数加1，若加1后的值不等于构造方法的值，则线程阻塞

CyclicBarrier加计数方式 CountDownLatch是减计数方式,CyclicBarrier可以重复使用已经通过的障碍，而CountdownLatch不能重复使用。

<!--more-->

## 用例

```java
public class CyclicBarrierTest {

  public static void main(String[] args) {
    ExecutorService service = Executors.newCachedThreadPool();
    final  CyclicBarrier cb = new CyclicBarrier(3);
    for(int i=0;i<3;i++){
      Runnable runnable = new Runnable(){
        public void run(){
          try {
            Thread.sleep((long)(Math.random()*10000));	
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "即将到达集合地点1，当前已有" + (cb.getNumberWaiting()+1) + "个已经到达，" + (cb.getNumberWaiting()==2?"都到齐了，继续走啊":"正在等候"));						
            cb.await();

            Thread.sleep((long)(Math.random()*10000));	
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "即将到达集合地点2，当前已有" + (cb.getNumberWaiting()+1) + "个已经到达，" + (cb.getNumberWaiting()==2?"都到齐了，继续走啊":"正在等候"));
            cb.await();	
            Thread.sleep((long)(Math.random()*10000));	
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "即将到达集合地点3，当前已有" + (cb.getNumberWaiting() + 1) + "个已经到达，" + (cb.getNumberWaiting()==2?"都到齐了，继续走啊":"正在等候"));						
            cb.await();						
          } catch (Exception e) {
            e.printStackTrace();
          }				
        }
      };
      service.execute(runnable);
    }
    service.shutdown();
  }
}
/*
线程pool-1-thread-2即将到达集合地点1，当前已有1个已经到达，正在等候
线程pool-1-thread-3即将到达集合地点1，当前已有2个已经到达，正在等候
线程pool-1-thread-1即将到达集合地点1，当前已有3个已经到达，都到齐了，继续走啊
线程pool-1-thread-2即将到达集合地点2，当前已有1个已经到达，正在等候
线程pool-1-thread-1即将到达集合地点2，当前已有2个已经到达，正在等候
线程pool-1-thread-3即将到达集合地点2，当前已有3个已经到达，都到齐了，继续走啊
线程pool-1-thread-3即将到达集合地点3，当前已有1个已经到达，正在等候
线程pool-1-thread-1即将到达集合地点3，当前已有2个已经到达，正在等候
线程pool-1-thread-2即将到达集合地点3，当前已有3个已经到达，都到齐了，继续走啊
*/
```
## 实现原理

CyclicBarrier底层是基于ReentrantLock和它的一个Condition实现的。CyclicBarrier内部有个计数，每次调用await方法后先加锁，然后计数减1，减之后不为0,则调用Condition的await方法，让出执行权，当前线程进入阻塞状态；当计数减之后为0则signalAll，激活所有阻塞的线程。

```java
private int dowait(boolean timed, long nanos)
    throws InterruptedException, BrokenBarrierException,
           TimeoutException {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        final Generation g = generation;

        if (g.broken)
            throw new BrokenBarrierException();

        if (Thread.interrupted()) {
           // 损坏当前屏障，并且唤醒所有的线程，只有拥有锁的时候才会调用
            breakBarrier();
            throw new InterruptedException();
        }

        int index = --count;//减1
        if (index == 0) {  // tripped
            boolean ranAction = false;
            try {
                final Runnable command = barrierCommand;
                if (command != null)
                    command.run();
                ranAction = true;
                nextGeneration();//激活等待的线程
                return 0;
            } finally {
                if (!ranAction)   
                    breakBarrier();
            }
        }

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
                    Thread.currentThread().interrupt();
                }
            }

            if (g.broken)
                throw new BrokenBarrierException();

            if (g != generation)
                return index;

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