---
title: java并发之Semaphore
date: 2017-11-21 18:36:58
tags:
- 多线程
categories:
- java基础
---

# java并发之Semaphore

Semaphore称为计数信号量，它允许n个任务同时访问某个资源，可以将信号量看做是在向外分发使用资源的许可证，只有成功获取许可证，才能使用资源。

当占有许可证的线程释放了许可证后，其他线程又可以获取许可证。

<!--more-->

## 用法

- 调用acquire方法获取许可证，获取成功后state会减1，获取失败，则线程加入等待队列阻塞
- release 释放许可证，调用release后state会加1

```java
public class SemaphoreTest {
  public static void main(String[] args) {
    ExecutorService service = Executors.newCachedThreadPool();
    final  Semaphore sp = new Semaphore(3);
    for(int i=0;i<10;i++){
      Runnable runnable = new Runnable(){
        public void run(){
          try {
            sp.acquire();
          } catch (InterruptedException e1) {
            e1.printStackTrace();
          }
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "进入，当前已有" + (3-sp.availablePermits()) + "个并发");
          try {
            Thread.sleep((long)(Math.random()*10000));
          } catch (InterruptedException e) {
            e.printStackTrace();
          }
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "即将离开");					
          sp.release();
          //下面代码有时候执行不准确，因为其没有和上面的代码合成原子单元
          System.out.println("线程" + Thread.currentThread().getName() + 
                             "已离开，当前已有" + (3-sp.availablePermits()) + "个并发");			
        }
      };
      service.execute(runnable);			
    }
  }
}
/*
线程pool-1-thread-2进入，当前已有3个并发
线程pool-1-thread-1进入，当前已有3个并发
线程pool-1-thread-3进入，当前已有3个并发
线程pool-1-thread-3即将离开
线程pool-1-thread-3已离开，当前已有2个并发
线程pool-1-thread-4进入，当前已有3个并发
线程pool-1-thread-4即将离开
线程pool-1-thread-5进入，当前已有3个并发
线程pool-1-thread-4已离开，当前已有3个并发
线程pool-1-thread-2即将离开
线程pool-1-thread-6进入，当前已有3个并发
线程pool-1-thread-2已离开，当前已有3个并发
线程pool-1-thread-1即将离开
线程pool-1-thread-7进入，当前已有3个并发
线程pool-1-thread-1已离开，当前已有3个并发
线程pool-1-thread-6即将离开
线程pool-1-thread-8进入，当前已有3个并发
线程pool-1-thread-6已离开，当前已有3个并发
线程pool-1-thread-5即将离开
线程pool-1-thread-5已离开，当前已有3个并发
线程pool-1-thread-9进入，当前已有3个并发
线程pool-1-thread-9即将离开
线程pool-1-thread-10进入，当前已有3个并发
线程pool-1-thread-9已离开，当前已有3个并发
线程pool-1-thread-10即将离开
线程pool-1-thread-10已离开，当前已有2个并发
线程pool-1-thread-7即将离开
线程pool-1-thread-7已离开，当前已有1个并发
线程pool-1-thread-8即将离开
线程pool-1-thread-8已离开，当前已有0个并发
*/
```
## 实现原理

- 创建Semaphore的时候，指定了许可证的数量n，其实就是将AQS的state设置为n
- 调用Semaphore的acquire方法的时候会尝试将state减一，减完之后如果state<0则获取许可证失败
- 如果是Semaphore的tryAcquire则直接返回false，如果是acquire方法，将调用AQS中的acquireShared进入等待队列进行阻塞，等待获取许可证的线程唤醒，自己被唤醒的时候传播性的唤醒队列中的下一个，跟CountDownLatch一样
- 调用release方法会将state加1，并唤醒等待队列的头节点

### 实现步骤

- 首先看下Sempaphore的构造方法，内部是基于实现AQS的Sync来实现的。提供了公平模式和非公平模式两种。

  ```java
  //非公平模式
  public Semaphore(int permits) {
      sync = new NonfairSync(permits);
  }
  //公平模式
  public Semaphore(int permits, boolean fair) {
  	sync = fair ? new FairSync(permits) : new NonfairSync(permits);
  }
  ```

- Sempaphore中的内部类Sync，实现了AQS的共享锁模式，重写了tryAcquireShared、tryReleaseShared方法

  ```java
  static final class NonfairSync extends Sync { //非公平模式实现
      private static final long serialVersionUID = -2694183684443567898L;
      NonfairSync(int permits) {//设置AQS中的state
          super(permits);
      }

      protected int tryAcquireShared(int acquires) {
          return nonfairTryAcquireShared(acquires);
      }
  }
  static final class FairSync extends Sync { //公平模式实现
      private static final long serialVersionUID = 2014338818796000944L;
      FairSync(int permits) {
          super(permits);
      }
      protected int tryAcquireShared(int acquires) {
        //判断state是否减到0，如果减到了返回负数会阻塞，否则返回正数，获的许可证
          for (;;) {
              if (hasQueuedPredecessors())//公平模式就是必须要保证当前线程在等待队列的头部才去获取锁
                  return -1;
              int available = getState();
              int remaining = available - acquires;
              if (remaining < 0 ||		
                  compareAndSetState(available, remaining))
                  return remaining;
          }
      }
  }
  ```

- Sync类中覆写了Sync中的acquire和release的同时，添加了额外操作state的方法

  ```java
  abstract static class Sync extends AbstractQueuedSynchronizer {
      private static final long serialVersionUID = 1192457210091910933L;

      Sync(int permits) {
          setState(permits);
      }

      final int getPermits() {
          return getState();
      }

      final int nonfairTryAcquireShared(int acquires) {
          for (;;) {
              int available = getState();
              int remaining = available - acquires;
              if (remaining < 0 ||
                  compareAndSetState(available, remaining))
                  return remaining;
          }
      }
    //释放资源，state+1
      protected final boolean tryReleaseShared(int releases) {
          for (;;) {
              int current = getState();
              int next = current + releases;
              if (next < current) // overflow
                  throw new Error("Maximum permit count exceeded");
              if (compareAndSetState(current, next))
                  return true;
          }
      }
    	//运行期间减少许可证的数量
      final void reducePermits(int reductions) {
          for (;;) {
              int current = getState();
              int next = current - reductions;
              if (next > current) // underflow
                  throw new Error("Permit count underflow");
              if (compareAndSetState(current, next))
                  return;
          }
      }
    //清空所有许可证
      final int drainPermits() {
          for (;;) {
              int current = getState();
              if (current == 0 || compareAndSetState(current, 0))
                  return current;
          }
      }
  }
  ```

- 获取许可证并运行

  ```java
  //获取许可证，如果失败，进入等待队列阻塞，阻塞期间允许中断
  public void acquire(int permits) throws InterruptedException {
  	if (permits < 0) throw new IllegalArgumentException();
          sync.acquireSharedInterruptibly(permits);
  }
  //获取许可证，如果失败，进入等待队列阻塞，阻塞期间不允许中断
  public void acquireUninterruptibly(int permits) {
  	if (permits < 0) throw new IllegalArgumentException();
  		sync.acquireShared(permits);
  }
  //获取许可证，如果失败，返回false
  public boolean tryAcquire(int permits) {
    if (permits < 0) throw new IllegalArgumentException();
          return sync.nonfairTryAcquireShared(permits) >= 0;
  }
  //指定超时时间
  public boolean tryAcquire(int permits, long timeout, TimeUnit unit)
  throws InterruptedException {
      if (permits < 0) throw new IllegalArgumentException();
      return sync.tryAcquireSharedNanos(permits, unit.toNanos(timeout));
  }
  ```

- 释放许可证

  ```java
  public void release(int permits) {
      if (permits < 0) throw new IllegalArgumentException();
      sync.releaseShared(permits);
  }
  ```

- 运行区间动态修改许可证的总数

  ```java
  protected void reducePermits(int reduction) {
      if (reduction < 0) throw new IllegalArgumentException();
      sync.reducePermits(reduction);
  }
  public int drainPermits() { //清空剩余的许可证
    return sync.drainPermits();
  }
  ```