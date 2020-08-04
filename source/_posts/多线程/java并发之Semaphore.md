---
title: java并发之Semaphore
date: 2017-11-21 18:36:58
tags:
- 多线程
categories:
- java基础
---

# java并发之Semaphore

## 知识导读

- Semaphore相等于是一个电影院装3D眼镜的篮子，每个线程来会申请一定数量的眼镜，如果够就进去看电影，不够就排队等待;每个看完电影的线程会将眼镜放回篮子，并通知队列头部的人去再尝试去拿眼镜。
- Semaphore用于控制并发的数量
- Semaphore是AQS共享模式的一种实现。所以需要继承实现AQS的tryAcquireShared和tryReleaseShared方法
- Semaphore同ReentrantLock一样，提供了公平和非公平两种模式，实现原理一样
- Semaphore通过控制AQS的state来控制同步状态的获取，当(state-申请数量>=0)的时候可以获取同步状态，当(state-申请数量<0)时阻塞等待。初始化的时候指定state的初始值代表可并发线程的最大数量，线程获取同步状态后state-申请数量，线程执行完毕释放资源时state+申请数量

## 用例

Semaphore 称为计数信号量，它允许n个任务同时访问某个资源。Semaphore持有一定数量的执行许可证。

- 线程获取了执行许可证就可以获取执行权，同时Semaphore的许可证数量减1.
- 当占有许可证的线程释放了许可证后，Semaphore的许可证数量加1，其他线程又可以获取许可证
- 当线程无法获取许可证的时候，会阻塞等待获取许可证

acquire方法用于获取许可证，release方法用于释放许可证

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
```
## 源码解析

Sempaphore的构造方法，创建了内部类Sync的实现,提供了公平模式和非公平模式两种。

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

Sempaphore中的内部类Sync实现了AQS的共享锁模式，通过控制state来控制获取同步状态，当state>0的时候可以获取同步状态。所以初始化的时候指定了state的初始值。

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
   //将state设置为 许可证的最大数量
    Sync(int permits) {
        setState(permits);
    }

    final int getPermits() {
        return getState();
    }
}
```
### 公平模式

FairSync提供了公平模式的实现，覆写AQS的tryAcquireShared方法。
1. 先调用hasQueuedPredecessors判断AQS同步队列是否有排在当前线程之前的等待线程，如果有，直接返回复数表示获取同步状态失败，当前线程加入同步队列并阻塞
2. 如果当前线程是排名最靠前的，则CAS设置state减去申请的值

```java
static final class FairSync extends Sync {
    FairSync(int permits) {
        super(permits);
    }
    protected int tryAcquireShared(int acquires) {
        //判断state是否减到0，如果减到了返回负数会阻塞，否则返回正数，获的许可证
        for (;;) {
            if (hasQueuedPredecessors())
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

### 非公平模式

NonfairSync提供了非公平模式的实现，覆写AQS的tryAcquireShared方法。非公平模式比较简单，直接修改state值

1. 判断state是否大于需申请的许可证数量
2. 如果满足，CAS设置state值，将值修改为减去申请数量后的值

```java
static final class NonfairSync extends Sync {
    NonfairSync(int permits) {
        super(permits);
    }
    protected int tryAcquireShared(int acquires) {
        return nonfairTryAcquireShared(acquires);
    }
}
```

for循环+CAS保证并发安全

```java
final int nonfairTryAcquireShared(int acquires) {
    for (;;) {
        int available = getState();
        int remaining = available - acquires;
        if (remaining < 0 ||
            compareAndSetState(available, remaining))
            return remaining;
    }
}
```

### 释放许用于可证

Semaphore中release方法用于释放许可证，直接调用内部类Sync释放许可证

```java
public void release(int permits) {
    if (permits < 0) throw new IllegalArgumentException();
    sync.releaseShared(permits);
}
```

Sync继承了AQS，覆写了tryReleaseShared方法。由于是共享模式，所以在释放的时候会有多线程并发问题。这里使用for循环加CAS将state值加回去

```java
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
```